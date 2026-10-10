import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { FfmpegCommand, FfmpegFactory, FfprobeData } from "@minifeel/ffmpeg";
import { getDatabase } from "@/utils/database";
import { indexProjectAsset } from "@/utils/projects";
import { createWorkspaceFfmpeg } from "@/utils/ffmpeg";
import { resolveProjectWorkspaceFile } from "@/utils/workspace/files";
import { redactErrorMessage } from "@/utils/providers/redact";
import type { RenderClip } from "./index";

type RenderTaskRow = {
  id: string;
  userId: string;
  projectId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  inputSnapshot: { clips: RenderClip[] };
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

type ActiveTask = { controller: AbortController; promise: Promise<void> };
const activeTasks = new Map<string, ActiveTask>();
let workerStarted = false;
let pumping: Promise<void> | undefined;
let recovering: Promise<number> | undefined;
let pollingTimer: ReturnType<typeof setInterval> | undefined;
let recoveryTimer: ReturnType<typeof setInterval> | undefined;

function renderConcurrency() {
  const value = Number(process.env.MINIFEEL_RENDER_CONCURRENCY ?? 1);
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 1;
}

function staleSeconds() {
  const value = Number(process.env.MINIFEEL_RENDER_STALE_SECONDS ?? 300);
  return Number.isInteger(value) && value >= 60 && value <= 3600 ? value : 300;
}

function runCommand(command: FfmpegCommand, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { try { command.ffmpegProc?.kill("SIGKILL"); } catch { /* 忽略进程已退出 */ } };
    signal?.addEventListener("abort", abort, { once: true });
    command.on("end", () => { signal?.removeEventListener("abort", abort); resolve(); });
    command.on("error", (error) => { signal?.removeEventListener("abort", abort); reject(error); });
    command.run();
  });
}

function probe(ffmpeg: FfmpegFactory, path: string) {
  return new Promise<FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(path, (error, data) => error ? reject(error) : resolve(data));
  });
}

type ClipProbe = { path: string; width: number; height: number; fps: number; hasAudio: boolean; duration: number };

function parseFps(value: unknown) {
  if (typeof value !== "string") return 0;
  const [numerator, denominator] = value.split("/").map(Number);
  return denominator ? numerator / denominator : numerator;
}

async function probeClips(ffmpeg: FfmpegFactory, clips: Array<{ absolutePath: string }>, signal?: AbortSignal): Promise<ClipProbe[]> {
  const results: ClipProbe[] = [];
  for (const clip of clips) {
    signal?.throwIfAborted();
    const data = await probe(ffmpeg, clip.absolutePath);
    const video = data.streams.find(stream => stream.codec_type === "video");
    if (!video || !video.width || !video.height) throw Object.assign(new Error(`片段 ${clip.absolutePath} 缺少有效的视频流`), { status: 422 });
    const duration = Number(video.duration ?? data.format.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) throw Object.assign(new Error(`片段 ${clip.absolutePath} 时长无效`), { status: 422 });
    const fps = parseFps(video.r_frame_rate ?? video.avg_frame_rate) || parseFps(video.avg_frame_rate);
    if (!Number.isFinite(fps) || fps <= 0) throw Object.assign(new Error(`片段 ${clip.absolutePath} 帧率无效`), { status: 422 });
    results.push({ path: clip.absolutePath, width: video.width, height: video.height, fps, hasAudio: data.streams.some(stream => stream.codec_type === "audio"), duration });
  }
  return results;
}

// ACT: 归一化目标取第一个片段的画幅与帧率；createWorkspaceFfmpeg 仅接受工作区文件输入、不支持 lavfi 源，
// 无法为无音轨片段补静音轨，故统一输出无音轨（-an）以保证 concat demuxer 流结构一致可硬切。
// 配音与背景音乐由后续任务单独合成，不在此阶段处理。
async function renderClips(ffmpeg: FfmpegFactory, clips: ClipProbe[], workDir: string, outputPath: string, signal?: AbortSignal) {
  const target = clips[0]!;
  const normalizedPaths: string[] = [];
  const videoFilters = [
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease`,
    `pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1",
    `fps=${target.fps}`,
    "format=yuv420p",
  ];
  for (let index = 0; index < clips.length; index++) {
    signal?.throwIfAborted();
    const clip = clips[index]!;
    const normalized = join(workDir, `clip-${index}.mp4`);
    const command = ffmpeg(clip.path);
    command.noAudio();
    command.videoFilters(videoFilters);
    command.videoCodec("libx264");
    command.outputOptions(["-preset", "veryfast", "-crf", "23"]);
    command.format("mp4");
    command.output(normalized);
    await runCommand(command, signal);
    normalizedPaths.push(normalized);
  }
  signal?.throwIfAborted();
  const concat = ffmpeg();
  for (const path of normalizedPaths) concat.input(path);
  concat.concat(outputPath);
  await runCommand(concat, signal);
}

async function completeRenderTask(taskId: string, outputPath: string) {
  const rows = await getDatabase()<RenderTaskRow[]>`
    update "projectRenderTasks"
    set "status" = 'succeeded', "outputPath" = ${outputPath}, "progress" = 100,
      "heartbeatAt" = now(), "completedAt" = now(), "errorCode" = null, "errorMessage" = null
    where "id" = ${taskId} and "status" = 'running'
    returning *
  `;
  return rows[0]?.status;
}

async function failRenderTask(taskId: string, reason: unknown, code = "renderFailed") {
  await getDatabase()`
    update "projectRenderTasks"
    set "status" = 'failed', "heartbeatAt" = now(), "completedAt" = now(),
      "errorCode" = ${code.slice(0, 120)}, "errorMessage" = ${redactErrorMessage(reason, "成片合成失败").slice(0, 2000)}
    where "id" = ${taskId} and "status" = 'running'
  `;
}

async function executeRenderTask(task: RenderTaskRow, signal: AbortSignal) {
  const clips = task.inputSnapshot.clips ?? [];
  if (!clips.length) throw new Error("成片任务缺少片段快照");
  const resolved: Array<{ absolutePath: string; relativePath: string }> = [];
  let workspaceRoot = "";
  for (const clip of clips) {
    signal.throwIfAborted();
    const file = await resolveProjectWorkspaceFile(task.userId, task.projectId, clip.path);
    if (!workspaceRoot) workspaceRoot = file.directory;
    resolved.push({ absolutePath: file.path, relativePath: file.relativePath });
  }
  const ffmpeg = await createWorkspaceFfmpeg(workspaceRoot, signal);
  const probed = await probeClips(ffmpeg, resolved.map(item => ({ absolutePath: item.absolutePath })), signal);
  const workDir = join(workspaceRoot, `.render-${task.id}`);
  const outputRelative = `assets/final/${task.id}.mp4`;
  const outputAbsolute = join(workspaceRoot, "assets", "final", `${task.id}.mp4`);
  await mkdir(join(workspaceRoot, "assets", "final"), { recursive: true });
  await mkdir(workDir, { recursive: true });
  try {
    signal.throwIfAborted();
    await renderClips(ffmpeg, probed, workDir, outputAbsolute, signal);
    signal.throwIfAborted();
    await indexProjectAsset(task.projectId, outputRelative, outputAbsolute);
    await completeRenderTask(task.id, outputRelative);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function claimTask() {
  return getDatabase().begin(async transaction => {
    const rows = await transaction<RenderTaskRow[]>`
      select * from "projectRenderTasks"
      where "status" = 'pending'
      order by "createdAt", "id"
      limit 1 for update skip locked
    `;
    const task = rows[0];
    if (!task) return;
    const claimed = await transaction<RenderTaskRow[]>`
      update "projectRenderTasks" set
        "status" = 'running', "startedAt" = coalesce("startedAt", now()),
        "heartbeatAt" = now(), "progress" = greatest("progress", 1)
      where "id" = ${task.id} and "status" = 'pending'
      returning *
    `;
    return claimed[0];
  });
}

async function updateProgress(taskId: string, progress: number) {
  await getDatabase()`
    update "projectRenderTasks" set "progress" = ${Math.max(1, Math.min(99, Math.floor(progress)))}, "heartbeatAt" = now()
    where "id" = ${taskId} and "status" = 'running'
  `;
}

async function runTask(task: RenderTaskRow, controller: AbortController) {
  const heartbeat = setInterval(() => {
    void getDatabase()`
      update "projectRenderTasks" set "heartbeatAt" = now()
      where "id" = ${task.id} and "status" = 'running'
    `.catch(() => undefined);
  }, 10_000);
  heartbeat.unref?.();
  try {
    await executeRenderTask(task, controller.signal);
  } catch (reason) {
    await failRenderTask(task.id, reason, controller.signal.aborted ? "renderAborted" : "renderFailed");
  } finally {
    clearInterval(heartbeat);
  }
}

function reserveSlot(taskId: string, signal?: AbortSignal) {
  if (activeTasks.has(taskId) || activeTasks.size >= renderConcurrency()) return;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) forwardAbort();
  let finish!: () => void;
  const active: ActiveTask = { controller, promise: new Promise(resolve => { finish = resolve; }) };
  activeTasks.set(taskId, active);
  return {
    controller,
    rename(nextTaskId: string) {
      if (activeTasks.get(taskId) === active) activeTasks.delete(taskId);
      activeTasks.set(nextTaskId, active);
    },
    release() {
      signal?.removeEventListener("abort", forwardAbort);
      if (activeTasks.get(taskId) === active) activeTasks.delete(taskId);
      finish();
      void pump();
    },
  };
}

function pump() {
  if (!workerStarted) return Promise.resolve();
  if (pumping) return pumping;
  pumping = (async () => {
    while (workerStarted) {
      const slot = reserveSlot(`claim:${crypto.randomUUID()}`);
      if (!slot) break;
      const task = await claimTask();
      if (!task) {
        slot.release();
        break;
      }
      slot.rename(task.id);
      void runTask(task, slot.controller).finally(slot.release);
    }
  })().finally(() => { pumping = undefined; });
  return pumping;
}

export function abortRenderTask(taskId: string) {
  activeTasks.get(taskId)?.controller.abort(new DOMException("任务已取消", "AbortError"));
}

export function wakeRenderWorker() {
  void pump();
}

export async function recoverStaleRenderTasks() {
  if (recovering) return recovering;
  recovering = (async () => {
    const rows = await getDatabase().begin(async transaction => {
      const stale = await transaction<RenderTaskRow[]>`
        select * from "projectRenderTasks"
        where "status" = 'running'
          and ("heartbeatAt" is null or "heartbeatAt" < now() - ${staleSeconds()} * interval '1 second')
        order by "createdAt" for update skip locked
      `;
      const recovered: RenderTaskRow[] = [];
      for (const current of stale) {
        if (activeTasks.has(current.id)) continue;
        const updated = await transaction<RenderTaskRow[]>`
          update "projectRenderTasks"
          set "status" = 'failed', "completedAt" = now(), "errorCode" = 'renderHeartbeatTimeout',
            "errorMessage" = '成片合成因服务中断未完成，请重新合成'
          where "id" = ${current.id} and "status" = 'running'
          returning *
        `;
        if (updated[0]) recovered.push(updated[0]);
      }
      return recovered;
    });
    return rows.length;
  })().finally(() => { recovering = undefined; });
  return recovering;
}

export async function startRenderWorker() {
  if (workerStarted) return;
  await recoverStaleRenderTasks();
  workerStarted = true;
  pollingTimer = setInterval(() => void pump(), 500);
  pollingTimer.unref?.();
  recoveryTimer = setInterval(() => {
    void recoverStaleRenderTasks().catch(error => console.error("恢复失联成片任务失败：", error));
  }, Math.min(30_000, staleSeconds() * 500));
  recoveryTimer.unref?.();
  await pump();
}
