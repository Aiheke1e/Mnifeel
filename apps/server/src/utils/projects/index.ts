import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import conf from "@/utils/conf";
import { getDatabase, withTransaction } from "@/utils/database";

type ProjectRow = {
  id: string;
  userId: string;
  name: string;
  description: string;
  templateId: string | null;
  status: "active" | "archived";
  directoryPath: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  templateId: string | null;
  updatedAt: string;
};

export type LegacyProjectSummary = {
  id: string;
  name: string;
};

const maxLegacyFiles = 10_000;
const maxLegacyBytes = 10 * 1024 * 1024 * 1024;

function projectSummary(project: ProjectRow): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    templateId: project.templateId,
    updatedAt: project.updatedAt.toISOString(),
  };
}

function getWorkspacesRoot() {
  return resolve(dirname(conf.path), "workspaces");
}

function projectRelativePath(userId: string, projectId: string) {
  return `${userId}/${projectId}`;
}

function isWithin(root: string, path: string) {
  const offset = relative(root, path);
  return offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

function legacyProjectId(root: string, name: string) {
  return createHash("sha256").update(`${root}\0${name}`).digest("base64url");
}

async function getLegacyRoot() {
  const configured = process.env.MINIFEEL_LEGACY_WORKSPACE_DIR?.trim();
  if (!configured) return null;
  if (!isAbsolute(configured)) throw Object.assign(new Error("MINIFEEL_LEGACY_WORKSPACE_DIR 必须是绝对路径"), { status: 500 });
  const root = await realpath(configured).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw Object.assign(new Error("旧项目目录不存在或不是文件夹"), { status: 503 });
    }
    throw error;
  });
  if (!(await lstat(root)).isDirectory()) throw Object.assign(new Error("旧项目目录不是文件夹"), { status: 503 });
  return root;
}

async function legacyEntries(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink());
}

async function resolveLegacyProject(id: string) {
  const root = await getLegacyRoot();
  if (!root) throw Object.assign(new Error("尚未配置旧项目目录"), { status: 503 });
  const entry = (await legacyEntries(root)).find(item => legacyProjectId(root, item.name) === id);
  if (!entry) throw Object.assign(new Error("旧项目不存在或已被移动"), { status: 404 });
  const source = await realpath(resolve(root, entry.name));
  if (!isWithin(root, source) || source === root || !(await lstat(source)).isDirectory()) {
    throw Object.assign(new Error("旧项目目录无效"), { status: 403 });
  }
  return { root, source, name: entry.name };
}

async function copyLegacyFiles(source: string, target: string, signal?: AbortSignal) {
  const files: Array<{ relativePath: string; sizeBytes: number }> = [];
  let totalBytes = 0;
  await mkdir(target);
  const directories = [{ source, target, relativePath: "" }];
  while (directories.length) {
    signal?.throwIfAborted();
    const current = directories.pop()!;
    for (const entry of await readdir(current.source, { withFileTypes: true })) {
      signal?.throwIfAborted();
      if (entry.isSymbolicLink()) continue;
      const sourcePath = resolve(current.source, entry.name);
      const targetPath = resolve(current.target, entry.name);
      const relativePath = current.relativePath ? `${current.relativePath}/${entry.name}` : entry.name;
      const info = await lstat(sourcePath);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        const actual = await realpath(sourcePath);
        if (!isWithin(source, actual)) throw Object.assign(new Error("旧项目包含越界目录"), { status: 403 });
        await mkdir(targetPath);
        directories.push({ source: actual, target: targetPath, relativePath });
        continue;
      }
      if (!info.isFile()) continue;
      if (files.length >= maxLegacyFiles) throw Object.assign(new Error(`旧项目文件数不能超过 ${maxLegacyFiles} 个`), { status: 413 });
      if (totalBytes + info.size > maxLegacyBytes) throw Object.assign(new Error("旧项目总大小不能超过 10 GB"), { status: 413 });
      const actual = await realpath(sourcePath);
      if (!isWithin(source, actual)) throw Object.assign(new Error("旧项目包含越界文件"), { status: 403 });
      await copyFile(actual, targetPath);
      const copied = await stat(targetPath);
      totalBytes += copied.size;
      if (totalBytes > maxLegacyBytes) throw Object.assign(new Error("旧项目总大小不能超过 10 GB"), { status: 413 });
      files.push({ relativePath, sizeBytes: copied.size });
    }
  }
  return files;
}

function mediaType(path: string) {
  return ({
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  } as Record<string, string>)[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export async function listLegacyProjects() {
  const root = await getLegacyRoot();
  if (!root) return { configured: false, projects: [] as LegacyProjectSummary[] };
  const projects = (await legacyEntries(root)).map(entry => ({ id: legacyProjectId(root, entry.name), name: entry.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
  return { configured: true, projects };
}

export async function importLegacyProject(userId: string, legacyId: string, name: string, signal?: AbortSignal) {
  const { source, name: legacyName } = await resolveLegacyProject(legacyId);
  const workspacesRoot = getWorkspacesRoot();
  await mkdir(workspacesRoot, { recursive: true });
  const managedRoot = await realpath(workspacesRoot);
  if (isWithin(source, managedRoot) || isWithin(managedRoot, source)) {
    throw Object.assign(new Error("旧项目目录不能与当前项目目录重叠"), { status: 400 });
  }
  const database = getDatabase();
  const duplicate = await database`select "id" from "projects" where "userId" = ${userId} and "status" = 'active' and "name" = ${name} limit 1`;
  if (duplicate.length) throw Object.assign(new Error("已存在同名项目，请更换名称"), { status: 409 });

  const id = crypto.randomUUID();
  const directoryPath = projectRelativePath(userId, id);
  const userDirectory = resolve(managedRoot, userId);
  const directory = resolve(userDirectory, id);
  const staging = resolve(userDirectory, `.legacyImport${id}`);
  await mkdir(userDirectory, { recursive: true });
  let directoryCreated = false;
  try {
    const files = await copyLegacyFiles(source, staging, signal);
    signal?.throwIfAborted();
    const project = await withTransaction(async transaction => {
      await transaction`select pg_advisory_xact_lock(hashtext(${`legacyProject:${userId}:${name}`}))`;
      const existing = await transaction`select "id" from "projects" where "userId" = ${userId} and "status" = 'active' and "name" = ${name} limit 1`;
      if (existing.length) throw Object.assign(new Error("已存在同名项目，请更换名称"), { status: 409 });
      const [created] = await transaction<ProjectRow[]>`
        insert into "projects" ("id", "userId", "name", "description", "directoryPath")
        values (${id}, ${userId}, ${name}, ${`从旧项目“${legacyName}”复制导入`}, ${directoryPath})
        returning *
      `;
      for (const file of files) {
        await transaction`
          insert into "projectAssets" ("id", "projectId", "relativePath", "mediaType", "sizeBytes")
          values (${crypto.randomUUID()}, ${id}, ${file.relativePath}, ${mediaType(file.relativePath)}, ${file.sizeBytes})
        `;
      }
      signal?.throwIfAborted();
      await rename(staging, directory);
      directoryCreated = true;
      return created!;
    });
    return projectSummary(project);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (directoryCreated) await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function createProject(userId: string, name: string, description = "", templateId?: string) {
  const id = crypto.randomUUID();
  const directoryPath = projectRelativePath(userId, id);
  const directory = resolve(getWorkspacesRoot(), ...directoryPath.split("/"));
  let directoryCreated = false;
  try {
    const project = await withTransaction(async transaction => {
      const [created] = await transaction<ProjectRow[]>`
        insert into "projects" ("id", "userId", "name", "description", "templateId", "directoryPath")
        values (${id}, ${userId}, ${name}, ${description}, ${templateId ?? null}, ${directoryPath})
        returning *
      `;
      await mkdir(resolve(getWorkspacesRoot(), userId), { recursive: true });
      await mkdir(directory);
      directoryCreated = true;
      return created!;
    });
    return projectSummary(project);
  } catch (error) {
    if (directoryCreated) await rmdir(directory).catch((cleanupError: NodeJS.ErrnoException) => {
      if (cleanupError.code !== "ENOENT" && cleanupError.code !== "ENOTEMPTY") throw cleanupError;
    });
    throw error;
  }
}

export async function listProjects(userId: string) {
  const projects = await getDatabase()<ProjectRow[]>`
    select * from "projects"
    where "userId" = ${userId} and "status" = 'active'
    order by "updatedAt" desc
  `;
  return projects.map(projectSummary);
}

export async function getProject(userId: string, projectId: string, includeArchived = false) {
  const [project] = await getDatabase()<ProjectRow[]>`
    select * from "projects"
    where "id" = ${projectId} and "userId" = ${userId}
      and (${includeArchived} or "status" = 'active')
    limit 1
  `;
  if (!project) throw Object.assign(new Error("项目不存在"), { status: 404 });
  return project;
}

export async function getProjectSummary(userId: string, projectId: string) {
  return projectSummary(await getProject(userId, projectId));
}

export async function updateProject(userId: string, projectId: string, name: string) {
  const [project] = await getDatabase()<ProjectRow[]>`
    update "projects"
    set "name" = ${name}, "updatedAt" = now()
    where "id" = ${projectId} and "userId" = ${userId} and "status" = 'active'
    returning *
  `;
  if (!project) throw Object.assign(new Error("项目不存在"), { status: 404 });
  return projectSummary(project);
}

export async function archiveProject(userId: string, projectId: string) {
  const [project] = await getDatabase()<ProjectRow[]>`
    update "projects"
    set "status" = 'archived', "updatedAt" = now()
    where "id" = ${projectId} and "userId" = ${userId} and "status" = 'active'
    returning *
  `;
  if (!project) throw Object.assign(new Error("项目不存在"), { status: 404 });
}

export async function resolveProjectWorkspace(userId: string, projectId: string) {
  const project = await getProject(userId, projectId);
  const expectedPath = projectRelativePath(userId, projectId);
  if (project.directoryPath !== expectedPath) throw Object.assign(new Error("项目目录配置无效"), { status: 500 });
  const root = await realpath(getWorkspacesRoot());
  const expectedDirectory = resolve(root, ...expectedPath.split("/"));
  const directory = await realpath(expectedDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw Object.assign(new Error("项目目录不存在"), { status: 404 });
    throw error;
  });
  const info = await stat(directory);
  if (!info.isDirectory()) throw Object.assign(new Error("项目目录无效"), { status: 404 });
  const offset = relative(root, directory);
  if (offset === ".." || offset.startsWith(`..${sep}`)) throw Object.assign(new Error("项目目录配置无效"), { status: 500 });
  return directory;
}

export async function touchProject(projectId: string) {
  await getDatabase()`update "projects" set "updatedAt" = now() where "id" = ${projectId}`;
}

export async function indexProjectAsset(projectId: string, relativePath: string, fullPath: string) {
  const info = await stat(fullPath);
  if (!info.isFile()) return;
  await getDatabase()`
    insert into "projectAssets" ("id", "projectId", "relativePath", "mediaType", "sizeBytes")
    values (${crypto.randomUUID()}, ${projectId}, ${relativePath}, ${mediaType(relativePath)}, ${info.size})
    on conflict ("projectId", "relativePath") do update
    set "mediaType" = excluded."mediaType", "sizeBytes" = excluded."sizeBytes", "updatedAt" = now()
  `;
  await touchProject(projectId);
}

export async function renameProjectAssets(projectId: string, source: string, target: string) {
  const rows = await getDatabase()<Array<{ id: string; relativePath: string }>>`
    select "id", "relativePath" from "projectAssets"
    where "projectId" = ${projectId}
      and ("relativePath" = ${source} or left("relativePath", ${source.length + 1}) = ${`${source}/`})
    order by length("relativePath")
  `;
  await withTransaction(async transaction => {
    for (const row of rows) {
      const nextPath = row.relativePath === source ? target : `${target}${row.relativePath.slice(source.length)}`;
      await transaction`update "projectAssets" set "relativePath" = ${nextPath}, "updatedAt" = now() where "id" = ${row.id}`;
    }
    await transaction`update "projects" set "updatedAt" = now() where "id" = ${projectId}`;
  });
}

export async function removeProjectAssets(projectId: string, path: string) {
  await withTransaction(async transaction => {
    await transaction`
      delete from "projectAssets"
      where "projectId" = ${projectId}
        and ("relativePath" = ${path} or left("relativePath", ${path.length + 1}) = ${`${path}/`})
    `;
    await transaction`update "projects" set "updatedAt" = now() where "id" = ${projectId}`;
  });
}
