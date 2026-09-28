import { mkdir, realpath, rmdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
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
