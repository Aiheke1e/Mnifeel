import { unlink } from "node:fs/promises";
import type { Context } from "@earendil-works/pi-ai";
import { imageGenerationSchema, videoGenerationSchema } from "@minifeel/tool-media-generation/runtime";
import { z } from "zod";
import { aiReferenceSchema, getConfiguredModel, readAiReferences, streamAi } from "@/utils/ai";
import { removeUserAsset, saveGeneratedImage } from "@/utils/assets";
import { generateMedia } from "@/utils/media/generation";
import { indexProjectAsset, removeProjectAssets, resolveProjectWorkspace } from "@/utils/projects";
import { resolveWorkspacePath } from "@/utils/workspace/files";
import { registerGenerationExecutor } from "@/utils/generation/worker";

const textInputSchema = z.object({
  providerId: z.string().min(1),
  context: z.custom<Context>(value => !!value && typeof value === "object"),
  references: z.array(aiReferenceSchema).max(32).optional(),
});

export function registerGenerationExecutors() {
  registerGenerationExecutor("text", async (task, execution) => {
    const input = textInputSchema.parse(task.input);
    const cwd = input.references?.some(item => item.dataType !== "STRING")
      ? await resolveProjectWorkspace(task.userId, task.projectId) : undefined;
    const references = await readAiReferences(cwd, input.references ?? [], execution.signal);
    const configured = await getConfiguredModel(input.providerId, task.modelId);
    configured.model.maxOutputTokens = Math.min(configured.model.maxOutputTokens, task.estimatedUsage.outputTokens ?? 8192);
    const stream = streamAi(configured, input.context, execution.signal, references);
    for await (const event of stream) {
      if (event.type === "text_delta" || event.type === "thinking_delta") {
        execution.publishOutput({
          type: event.type === "text_delta" ? "text" : "reasoning",
          delta: event.delta,
        });
      }
    }
    const message = await stream.result();
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      throw new Error(message.errorMessage || "模型请求失败");
    }
    return {
      result: { message },
      usage: { inputTokens: message.usage.input, outputTokens: message.usage.output },
    };
  });

  for (const mediaType of ["image", "video"] as const) {
    registerGenerationExecutor(mediaType, async (task, execution) => {
      const request = (mediaType === "image" ? imageGenerationSchema : videoGenerationSchema).parse(task.input);
      if (request.providerId !== "managed") throw Object.assign(new Error("所选媒体模型与供应商不匹配"), { status: 400 });
      const cwd = await resolveProjectWorkspace(task.userId, task.projectId);
      let files: Awaited<ReturnType<typeof generateMedia>> = [];
      const userAssets: string[] = [];
      let rolledBack = false;
      let rollbackPromise: Promise<void> | undefined;
      const rollback = async () => {
        if (rolledBack) return;
        rollbackPromise ??= (async () => {
          const cleanup = await Promise.allSettled([
            ...files.flatMap(file => [
              removeProjectAssets(task.projectId, file.path),
              resolveWorkspacePath(cwd, file.path).then(value => unlink(value.path)).catch(error => {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
              }),
            ]),
            ...userAssets.map(path => removeUserAsset(task.userId, path).catch(error => {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            })),
          ]);
          const failures = cleanup.filter(result => result.status === "rejected").map(result => result.reason);
          if (failures.length) throw new AggregateError(failures, "媒体文件回滚失败");
          rolledBack = true;
        })();
        try { await rollbackPromise; }
        finally { if (!rolledBack) rollbackPromise = undefined; }
      };
      try {
        files = await generateMedia(cwd, mediaType, { ...request, modelId: task.modelId }, execution.signal, {
          setProviderTaskId: execution.setProviderTaskId,
          updateProgress: execution.updateProgress,
        });
        await Promise.all(files.map(async file => {
          const path = await resolveWorkspacePath(cwd, file.path);
          await indexProjectAsset(task.projectId, file.path, path.path);
          if (mediaType === "image") userAssets.push(await saveGeneratedImage(task.userId, path.path, request.prompt));
        }));
        execution.signal.throwIfAborted();
        return {
          result: { files },
          usage: mediaType === "image"
            ? { imageCount: files.length }
            : { durationSeconds: (request as z.infer<typeof videoGenerationSchema>).duration ?? 1 },
          rollback,
        };
      } catch (error) {
        try { await rollback(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "媒体生成失败且文件回滚未完成"); }
        throw error;
      }
    });
  }
}
