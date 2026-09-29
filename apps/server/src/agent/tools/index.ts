import { listMediaModels } from "@/utils/media/generation";
import { createWorkspaceFfmpeg } from "@/utils/ffmpeg";
import { dirname, join, relative, resolve } from "node:path";
import {
  defineTool, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition,
  detectSupportedImageMimeTypeFromFile, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { CanvasContext, QuestionContext, ToolContext } from "@minifeel/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { isWithin, resolveWorkspacePath, writeWorkspaceFile, lockWorkspaceFiles } from "@/utils/workspace/files";
import { listTools, loadTool, validateToolConfig } from "@/utils/plugins/tools";
import { createSkillContext } from "@/agent/skills";
import { runGenerationTask } from "@/utils/generation";

type GenerationContext = { userId: string; projectId: string };

export function createAgentToolContext(
  cwd: string,
  config: Record<string, unknown> = {},
  canvas?: CanvasContext,
  question?: QuestionContext,
  generation?: GenerationContext,
): ToolContext {
  const skillsDirectory = join(dirname(conf.path), "skills");
  const resolvePath = async (path: string, readOnly = false) => {
    const absolute = resolve(cwd, path);
    const root = readOnly && isWithin(skillsDirectory, absolute) ? skillsDirectory : cwd;
    return (await resolveWorkspacePath(root, relative(root, absolute), true)).path;
  };
  const writeFile = async (path: string, content: string) => {
    const target = await resolvePath(path);
    const release = lockWorkspaceFiles([target]);
    try { await writeWorkspaceFile(target, content); }
    finally { release(); }
  };
  return {
    cwd, config, resolvePath, writeFile, canvas, question, skills: createSkillContext(cwd),
    ffmpeg: signal => createWorkspaceFfmpeg(cwd, signal),
    media: {
      listModels: listMediaModels,
      generateImage: async (request, signal) => {
        if (!generation) throw new Error("生成媒体需要已认证的项目上下文");
        const task = await runGenerationTask(generation.userId, {
          projectId: generation.projectId, modelId: request.modelId, taskType: "image", request: { ...request },
        }, signal);
        return (task.result as { files: Awaited<ReturnType<NonNullable<ToolContext["media"]>["generateImage"]>> }).files;
      },
      generateVideo: async (request, signal) => {
        if (!generation) throw new Error("生成媒体需要已认证的项目上下文");
        const task = await runGenerationTask(generation.userId, {
          projectId: generation.projectId, modelId: request.modelId, taskType: "video", request: { ...request },
        }, signal);
        return (task.result as { files: Awaited<ReturnType<NonNullable<ToolContext["media"]>["generateVideo"]>> }).files;
      },
      generateAudio: async () => { throw new Error("当前没有启用音频生成模型"); },
    },
    sdk: { defineTool, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition, detectSupportedImageMimeTypeFromFile },
  };
}

export async function createAgentTools(cwd: string, canvas?: CanvasContext, question?: QuestionContext, generation?: GenerationContext): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  const names = new Set<string>();
  const context = createAgentToolContext(cwd, {}, canvas, question, generation);
  for (const item of await listTools()) {
    if (!item.enabled) continue;
    if (item.loadError) throw new Error(`${item.displayName}：${item.loadError}`);
    const { plugin, metadata } = await loadTool(item.name);
    const config = validateToolConfig(plugin, item.config);
    const definitions = await plugin.createTools({ ...context, config });
    for (const tool of definitions) {
      if (!tool.name || typeof tool.execute !== "function") throw new Error(`${item.displayName} 返回了无效的工具`);
      if (names.has(tool.name)) throw new Error(`工具名称重复：${tool.name}`);
      names.add(tool.name);
      tools.push({
        ...tool,
        promptGuidelines: [
          ...(metadata.prompt ? [metadata.prompt] : []),
          ...(tool.promptGuidelines ?? []),
        ],
      });
    }
  }
  return tools;
}
