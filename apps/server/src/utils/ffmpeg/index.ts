import { createFfmpeg, getToolStatus } from "@minifeel/ffmpeg";

export { executeRemoteFfmpeg } from "@minifeel/ffmpeg";

const unavailableMessage = "当前操作需要 FFmpeg。请在服务器安装 FFmpeg 和 FFprobe，并确保它们已加入 PATH。";

export async function createWorkspaceFfmpeg(cwd: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const tools = await getToolStatus();
  signal?.throwIfAborted();
  if (!tools.ffmpeg.path || tools.ffmpeg.error || !tools.ffprobe.path || tools.ffprobe.error) {
    throw Object.assign(new Error(unavailableMessage), {
      name: "FfmpegRequiredError", code: "FFMPEG_REQUIRED", status: 424,
    });
  }
  const ffmpeg = createFfmpeg(cwd);
  ffmpeg.setFfmpegPath(tools.ffmpeg.path);
  ffmpeg.setFfprobePath(tools.ffprobe.path);
  return ffmpeg;
}

export async function getStatus() {
  const tools = await getToolStatus();
  const errors = [tools.ffmpeg.error, tools.ffprobe.error].filter((value): value is string => !!value);
  return {
    available: errors.length === 0,
    error: errors.length ? `${unavailableMessage} ${errors.join("；")}` : "",
    tools,
  };
}
