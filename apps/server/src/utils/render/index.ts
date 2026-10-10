import type postgres from "postgres";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/utils/database";
import type { TaskStatus, UserRole } from "@/utils/database/types";
import { resolveProjectWorkspaceFile } from "@/utils/workspace/files";
import { abortRenderTask, wakeRenderWorker } from "./worker";

export type RenderClip = { order: number; path: string; fingerprint: string };
export type RenderInputSnapshot = { clips: RenderClip[] };

type RenderTaskRow = {
  id: string;
  userId: string;
  projectId: string;
  status: TaskStatus;
  inputSnapshot: RenderInputSnapshot;
  outputPath: string | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  heartbeatAt: Date | null;
  completedAt: Date | null;
  cancelRequestedAt: Date | null;
};

const maxClips = 200;

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function dateValue(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function publicRenderTask(task: RenderTaskRow) {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    startedAt: dateValue(task.startedAt),
    heartbeatAt: dateValue(task.heartbeatAt),
    completedAt: dateValue(task.completedAt),
    cancelRequestedAt: dateValue(task.cancelRequestedAt),
  };
}

async function validateClips(userId: string, projectId: string, clips: unknown): Promise<RenderClip[]> {
  if (!Array.isArray(clips) || !clips.length) invalid("至少需要一个已采用的镜头片段");
  if (clips.length > maxClips) invalid(`镜头片段不能超过 ${maxClips} 个`, 413);
  const normalized: RenderClip[] = [];
  for (const item of clips) {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid("镜头片段格式无效");
    const clip = item as Record<string, unknown>;
    const order = Number(clip.order);
    if (!Number.isInteger(order) || order < 1 || order > 9999) invalid("镜头片段顺序无效");
    if (typeof clip.path !== "string" || !clip.path) invalid("镜头片段路径无效");
    if (typeof clip.fingerprint !== "string" || clip.fingerprint.length < 8 || clip.fingerprint.length > 200) invalid("镜头片段指纹无效");
    const resolved = await resolveProjectWorkspaceFile(userId, projectId, clip.path);
    normalized.push({ order, path: resolved.relativePath, fingerprint: clip.fingerprint });
  }
  if (new Set(normalized.map(clip => clip.order)).size !== normalized.length) invalid("镜头片段顺序重复");
  return normalized.sort((left, right) => left.order - right.order);
}

export async function createRenderTask(userId: string, projectId: string, clips: unknown) {
  const normalized = await validateClips(userId, projectId, clips);
  const id = randomUUID();
  const rows = await getDatabase()<RenderTaskRow[]>`
    insert into "projectRenderTasks" ("id", "userId", "projectId", "inputSnapshot")
    values (${id}, ${userId}, ${projectId}, ${getDatabase().json({ clips: normalized } as postgres.JSONValue)})
    returning *
  `;
  wakeRenderWorker();
  return publicRenderTask(rows[0]!);
}

export async function getRenderTask(userId: string, role: UserRole, taskId: string) {
  const rows = await getDatabase()<RenderTaskRow[]>`
    select * from "projectRenderTasks"
    where "id" = ${taskId} and ("userId" = ${userId} or ${role} = 'admin')
    limit 1
  `;
  const task = rows[0] ?? invalid("成片任务不存在", 404);
  return publicRenderTask(task);
}

export async function listRenderTasks(userId: string, input: { projectId?: string; limit: number; offset: number }) {
  const projectId = input.projectId ?? null;
  const rows = await getDatabase()<RenderTaskRow[]>`
    select * from "projectRenderTasks"
    where "userId" = ${userId}
      and (${projectId}::uuid is null or "projectId" = ${projectId})
    order by "createdAt" desc, "id" desc
    limit ${input.limit} offset ${input.offset}
  `;
  return rows.map(publicRenderTask);
}

export async function cancelRenderTask(userId: string, role: UserRole, taskId: string) {
  const rows = await getDatabase()<RenderTaskRow[]>`
    select * from "projectRenderTasks"
    where "id" = ${taskId} and ("userId" = ${userId} or ${role} = 'admin')
    limit 1
  `;
  const task = rows[0] ?? invalid("成片任务不存在", 404);
  if (task.status !== "pending" && task.status !== "running") return publicRenderTask(task);
  const [updated] = await getDatabase()<RenderTaskRow[]>`
    update "projectRenderTasks"
    set "status" = 'cancelled', "completedAt" = now(), "cancelRequestedAt" = coalesce("cancelRequestedAt", now())
    where "id" = ${taskId} and "status" in ('pending', 'running')
    returning *
  `;
  abortRenderTask(taskId);
  return publicRenderTask(updated ?? task);
}
