import { copyFile, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import conf from "@/utils/conf";
import { resolveWorkspacePath } from "@/utils/workspace/files";

export async function getAssetsDirectory() {
  const directory = join(dirname(conf.path), "assets");
  await mkdir(directory, { recursive: true });
  return realpath(directory);
}

export async function getUserAssetsDirectory(userId: string) {
  const directory = join(await getAssetsDirectory(), "users", userId);
  await mkdir(directory, { recursive: true });
  return realpath(directory);
}

export async function saveGeneratedImage(userId: string, sourcePath: string, prompt: string) {
  const root = await getUserAssetsDirectory(userId);
  const group = join(root, "自动生成");
  await mkdir(group, { recursive: true });
  const name = prompt.split(/[。！？!?\n]/)[0]!.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 36) || "生成图片";
  const relativePath = `自动生成/${name}-${crypto.randomUUID().slice(0, 8)}${extname(sourcePath)}`;
  await copyFile(sourcePath, join(root, ...relativePath.split("/")));
  return relativePath;
}

export async function removeUserAsset(userId: string, relativePath: string) {
  const root = await getUserAssetsDirectory(userId);
  const asset = await resolveWorkspacePath(root, relativePath);
  await unlink(asset.path);
}

export type AssetMetadata = {
  characterName: string;
  version: string;
  status: "selected" | "alternative" | "unset";
  appearance: string;
  episodes: string;
};

const metadataFileName = ".metadata.json";

export async function readAssetMetadata(userId: string) {
  const root = await getUserAssetsDirectory(userId);
  try {
    return JSON.parse(await readFile(join(root, metadataFileName), "utf8")) as Record<string, AssetMetadata>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeAssetMetadata(userId: string, metadata: Record<string, AssetMetadata>) {
  const root = await getUserAssetsDirectory(userId);
  const path = join(root, metadataFileName);
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(metadata, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

export async function moveAssetMetadata(userId: string, path: string, target?: string) {
  const metadata = await readAssetMetadata(userId);
  let changed = false;
  for (const [key, value] of Object.entries(metadata)) {
    if (key !== path && !key.startsWith(`${path}/`)) continue;
    delete metadata[key];
    if (target) metadata[`${target}${key.slice(path.length)}`] = value;
    changed = true;
  }
  if (changed) await writeAssetMetadata(userId, metadata);
}
