import { copyFile, mkdir, realpath, unlink } from "node:fs/promises";
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
