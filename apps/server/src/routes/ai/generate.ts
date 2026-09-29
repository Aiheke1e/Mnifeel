import { Router } from "express";
import { z } from "zod";
import type { AssistantMessage, Context, Message } from "@earendil-works/pi-ai";
import { getAuth, validateFields } from "@/lib/middleware";
import u from "@/utils";

const textPart = z.object({ type: z.literal("text"), text: z.string(), textSignature: z.string().optional() });
const imagePart = z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string().startsWith("image/") });
const messageSchema: z.ZodType<Message> = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"), content: z.union([z.string(), z.array(z.union([textPart, imagePart])).max(1000)]),
    timestamp: z.number().nonnegative(),
  }),
  z.looseObject({
    role: z.literal("assistant"),
    content: z.array(z.discriminatedUnion("type", [
      textPart,
      z.object({ type: z.literal("thinking"), thinking: z.string(), thinkingSignature: z.string().optional(), redacted: z.boolean().optional() }),
      z.object({
        type: z.literal("toolCall"), id: z.string().min(1), name: z.string().min(1), arguments: z.record(z.string(), z.json()),
        thoughtSignature: z.string().optional(), namespace: z.string().optional(),
      }),
    ])).max(1000),
    api: z.string().min(1), provider: z.string().min(1), model: z.string().min(1), timestamp: z.number().nonnegative(),
    stopReason: z.enum(["pending", "stop", "length", "toolUse", "error", "aborted", "deferred"]),
    usage: z.looseObject({
      input: z.number().nonnegative(), output: z.number().nonnegative(), cacheRead: z.number().nonnegative(), cacheWrite: z.number().nonnegative(),
      totalTokens: z.number().nonnegative(),
      cost: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(), total: z.number() }),
    }),
  }),
  z.looseObject({
    role: z.literal("toolResult"), toolCallId: z.string().min(1), toolName: z.string().min(1),
    content: z.array(z.union([textPart, imagePart])).max(1000), isError: z.boolean(), timestamp: z.number().nonnegative(),
  }),
]);

const contextSchema: z.ZodType<Context> = z.object({
  systemPrompt: z.string().max(100000).optional(),
  messages: z.array(messageSchema).min(1).max(2000),
  tools: z.array(z.object({
    name: z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/),
    description: z.string().min(1).max(10000),
    parameters: z.record(z.string(), z.json()).refine(value => value.type === "object" && JSON.stringify(value).length <= 100000, "工具参数必须是 JSON 对象结构，且不超过 100 KB"),
    constrainedSampling: z.union([
      z.literal(false),
      z.object({ type: z.literal("json_schema"), strict: z.enum(["prefer", "require"]) }),
      z.object({ type: z.literal("grammar"), variants: z.object({ openai_lark: z.string().optional(), openai_regex: z.string().optional() }) }),
    ]).optional(),
  })).max(32).refine(tools => new Set(tools.map(tool => tool.name)).size === tools.length, "工具名称不能重复").optional(),
}).refine(context => Buffer.byteLength(JSON.stringify(context)) <= 8000000, "模型上下文不能超过 8 MB");

const inputSchema = z.object({
  providerId: z.literal("deepSeek"), modelId: z.uuid(),
  context: contextSchema,
  projectId: z.uuid(),
  requestId: z.string().trim().min(8).max(150).optional(),
  references: z.array(u.ai.aiReferenceSchema).max(32).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const auth = getAuth(res);
  const created = await u.generation.createGenerationTask(auth.user.id, {
    projectId: input.projectId,
    modelId: input.modelId,
    idempotencyKey: input.requestId ? `ai:${input.requestId}` : crypto.randomUUID(),
    request: {
      providerId: input.providerId,
      context: input.context,
      references: input.references ?? [],
    },
  }, { external: true, expectedTaskType: "text" });
  res.set("X-Minifeel-Task-Id", created.task.id);
  res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const send = (event: object) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  const close = () => unsubscribe();
  const unsubscribe = u.generation.subscribeGenerationEvent(created.task.id, event => {
    if (event.output) send(event.output);
  });
  res.once("close", close);
  if (created.created) void u.generation.executeGenerationTask(created.task.id).catch(error => {
    void u.generation.failGenerationTask(created.task.id, error);
  });
  try {
    try {
      const task = await u.generation.waitGenerationTask(auth.user.id, auth.user.role, created.task.id);
      if (task.status !== "succeeded") throw new Error(task.errorMessage || "模型请求失败");
      const result = task.result as { message?: AssistantMessage } | null;
      if (!result?.message) throw new Error("模型任务结果不完整");
      send({
        type: "done", taskId: task.id, message: result.message,
        usage: { inputTokens: result.message.usage.input, outputTokens: result.message.usage.output },
      });
    } catch (error) {
      send({ type: "error", message: u.providers.redactErrorMessage(error, "模型请求失败") });
    } finally {
      res.end();
    }
  } finally {
    res.off("close", close);
    unsubscribe();
  }
});
