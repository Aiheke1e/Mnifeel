import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { getConfiguredModel, streamAi } from "@/utils/ai";
import { beginExternalGenerationTask, completeGenerationTask, createGenerationTask, failGenerationTask } from "@/utils/generation";

export async function createAgentModel(
  userId: string,
  projectId: string,
  providerId: string,
  modelId: string,
  thinkingLevel = "off",
) {
  const configured = await getConfiguredModel(providerId, modelId);
  const { provider, model, baseUrl, billingMaxOutputTokens } = configured;
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
  runtime.registerProvider(configured.providerId, {
    api: provider.protocol,
    baseUrl,
    streamSimple: (_model, context, options) => streamAi(configured, context, options?.signal, [], options),
    models: [{
      id: modelId, name: model.label, reasoning: thinkingLevel !== "off",
      // ACT: 保留图片输入，由实际供应方判断该模型是否支持。
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow, maxTokens: Math.min(model.maxOutputTokens, billingMaxOutputTokens),
    }],
  });
  await runtime.setRuntimeApiKey(configured.providerId, provider.apiKey);
  const settlements = new Set<Promise<void>>();
  const batchId = crypto.randomUUID();
  let billed = false;
  let settlementError: unknown;
  const billStream = (streamFunction: StreamFn): StreamFn => async (requestModel, context, options) => {
    const billable = !billed;
    const created = await createGenerationTask(userId, {
      projectId,
      modelId,
      idempotencyKey: crypto.randomUUID(),
      request: {
        providerId,
        maxTokens: requestModel.maxTokens,
        batchId,
      },
    }, {
      external: true,
      billable,
      estimatedUsage: {
        inputTokens: new TextEncoder().encode(JSON.stringify(context)).byteLength,
        outputTokens: requestModel.maxTokens,
      },
    });
    billed = true;
    let execution: Awaited<ReturnType<typeof beginExternalGenerationTask>>;
    try {
      execution = await beginExternalGenerationTask(created.task.id, options?.signal);
    } catch (error) {
      await failGenerationTask(created.task.id, error);
      throw error;
    }
    try {
      const stream = await streamFunction(requestModel, context, { ...options, signal: execution.signal });
      const settlement = (async () => {
        try {
          const message = await stream.result();
          if (message.stopReason === "error" || message.stopReason === "aborted") {
            await failGenerationTask(created.task.id, new Error(message.errorMessage || "模型请求失败"));
            return;
          }
          await completeGenerationTask(created.task.id, {
            result: { message },
            usage: { inputTokens: message.usage.input, outputTokens: message.usage.output },
          });
        } catch (error) {
          try { await failGenerationTask(created.task.id, error); }
          catch (failure) { throw new AggregateError([error, failure], "Agent 任务结算失败"); }
          throw error;
        } finally {
          execution.release();
        }
      })();
      settlements.add(settlement);
      void settlement.then(
        () => settlements.delete(settlement),
        error => {
          settlementError ??= error;
          settlements.delete(settlement);
        },
      );
      return stream;
    } catch (error) {
      try { await failGenerationTask(created.task.id, error); }
      finally { execution.release(); }
      throw error;
    }
  };
  const waitForBilling = async () => {
    await Promise.all([...settlements]);
    if (settlementError) throw settlementError;
  };
  return { ...configured, runtime, billStream, waitForBilling };
}
