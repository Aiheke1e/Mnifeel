import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { GenerationTask } from "@/stores/userApp";
import type { ProjectStage, ProjectStageStatus } from "./components/projectStages.vue";

export const creativeLabels = {
  script: "Minifeel/剧本",
  character: "Minifeel/角色/",
  storyboard: "Minifeel/分镜/",
  film: "Minifeel/成片/",
} as const;

type CreativeLabel = {
  type: ProjectStage;
  title: string;
  order: number;
  confirmed: boolean;
  draftLabel: string;
  confirmedLabel: string;
};

export type CreativeMediaCard = {
  nodeId: string;
  title: string;
  order: number;
  prompt: string;
  confirmed: boolean;
  draftLabel: string;
  confirmedLabel: string;
  output?: { path: string; mimeType: string };
  outputPersisted: boolean;
  task?: GenerationTask;
};

export type CreativeScript = {
  nodeId: string;
  text: string;
  confirmed: boolean;
  draftLabel: string;
  confirmedLabel: string;
};

export type CreativeView = {
  script?: CreativeScript;
  characters: CreativeMediaCard[];
  storyboard: CreativeMediaCard[];
  films: CreativeMediaCard[];
  statuses: Record<ProjectStage, ProjectStageStatus>;
  warnings: string[];
};

type CanvasNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export function parseCreativeLabel(label: unknown): CreativeLabel | undefined {
  if (typeof label !== "string") return;
  const confirmed = label.endsWith("/已确认");
  const draftLabel = confirmed ? label.slice(0, -4) : label;
  const confirmedLabel = `${draftLabel}/已确认`;
  if (draftLabel === creativeLabels.script) {
    return { type: "script", title: "剧本", order: 0, confirmed, draftLabel, confirmedLabel };
  }
  if (draftLabel.startsWith(creativeLabels.character)) {
    const title = draftLabel.slice(creativeLabels.character.length);
    if (title && !title.includes("/")) return { type: "characters", title, order: 0, confirmed, draftLabel, confirmedLabel };
    return;
  }
  for (const [type, prefix] of [["storyboard", creativeLabels.storyboard], ["video", creativeLabels.film]] as const) {
    if (!draftLabel.startsWith(prefix)) continue;
    const suffix = draftLabel.slice(prefix.length);
    if (!/^\d{3}$/.test(suffix)) return;
    const order = Number(suffix);
    if (order > 0) return { type, title: suffix, order, confirmed, draftLabel, confirmedLabel };
  }
}

export async function readCreativeView(projectId: string, tasks: GenerationTask[]): Promise<CreativeView> {
  const files = useWorkspaceFiles(projectId);
  let canvas: unknown;
  try {
    canvas = await files.readJson("画布1.json");
  } catch (error) {
    throw new Error(`项目画布读取失败：${error instanceof SyntaxError ? "画布 JSON 格式无效" : error instanceof Error ? error.message : "未知错误"}`);
  }
  if (!isRecord(canvas) || canvas.minifeelCanvas !== true || !Array.isArray(canvas.nodes)) throw new Error("项目画布读取失败：文件不是有效的 Minifeel 画布");
  const nodes = canvas.nodes.map((value, index) => readNode(value, index));
  const warnings: string[] = [];
  const unmatchedCount = nodes.filter(node => !parseCreativeLabel(node.data.label)).length;
  if (unmatchedCount) warnings.push(`有 ${unmatchedCount} 个画布节点尚未整理到创作流程，可进入高级画布查看。`);

  let script: CreativeScript | undefined;
  const characters: CreativeMediaCard[] = [];
  const storyboard: CreativeMediaCard[] = [];
  const films: CreativeMediaCard[] = [];
  for (const node of nodes) {
    const parsed = parseCreativeLabel(node.data.label);
    if (!parsed) continue;
    if (parsed.type === "script") {
      if (script) {
        warnings.push("检测到多个剧本节点，当前展示画布中的第一个。可进入高级画布整理重复节点。");
        continue;
      }
      if (node.type !== "remote-textNode") throw new Error("项目画布读取失败：Minifeel/剧本 必须是文本节点");
      const textPath = safeWorkspacePath(node.data.textPath);
      if (!textPath) throw new Error("项目画布读取失败：剧本节点缺少有效的文本文件路径");
      script = { nodeId: node.id, text: await files.readText(textPath), confirmed: parsed.confirmed, draftLabel: parsed.draftLabel, confirmedLabel: parsed.confirmedLabel };
      continue;
    }
    const expectedType = parsed.type === "video" ? "remote-videoGenerationNode" : "remote-imageGenerationNode";
    if (node.type !== expectedType) throw new Error(`项目画布读取失败：${String(node.data.label)} 的节点类型无效`);
    const persistedOutput = readMediaOutput(node.data.outputs, parsed.type === "video" ? "VIDEO" : "IMAGE");
    const card: CreativeMediaCard = {
      nodeId: node.id,
      title: parsed.title,
      order: parsed.order,
      prompt: typeof node.data.prompt === "string" ? node.data.prompt : "",
      confirmed: parsed.confirmed,
      draftLabel: parsed.draftLabel,
      confirmedLabel: parsed.confirmedLabel,
      outputPersisted: !!persistedOutput,
      task: findNodeTask(tasks, node.id),
    };
    card.output = persistedOutput ?? readTaskOutput(card.task, parsed.type === "video" ? "video" : "image");
    if (parsed.type === "characters") characters.push(card);
    else if (parsed.type === "storyboard") storyboard.push(card);
    else films.push(card);
  }
  storyboard.sort((left, right) => left.order - right.order);
  films.sort((left, right) => left.order - right.order);
  return {
    script,
    characters,
    storyboard,
    films,
    statuses: {
      script: script ? script.confirmed ? "complete" : "review" : "notStarted",
      characters: mediaStatus(characters),
      storyboard: mediaStatus(storyboard),
      video: filmStatus(storyboard, films),
    },
    warnings,
  };
}

function readNode(value: unknown, index: number): CanvasNode {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.type !== "string" || !value.type) {
    throw new Error(`项目画布读取失败：第 ${index + 1} 个节点缺少有效的 id 或 type`);
  }
  if (!isRecord(value.data)) throw new Error(`项目画布读取失败：节点 ${value.id} 的 data 无效`);
  return { id: value.id, type: value.type, data: value.data };
}

function safeWorkspacePath(value: unknown) {
  if (typeof value !== "string" || !value.trim() || /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(value) || value.includes("\0") || value.split(/[\\/]/).includes("..")) return;
  return value;
}

function readMediaOutput(value: unknown, dataType: "IMAGE" | "VIDEO") {
  if (!isRecord(value)) return;
  for (const output of Object.values(value)) {
    if (!isRecord(output) || output.dataType !== dataType || !isRecord(output.value)) continue;
    const path = safeWorkspacePath(output.value.url);
    const mimeType = output.value.mimeType;
    if (path && typeof mimeType === "string" && mimeType) return { path, mimeType };
  }
}

function findNodeTask(tasks: GenerationTask[], nodeId: string) {
  return tasks
    .filter(task => task.requestSummary?.input?.outputDirectory === `assets/${nodeId}`)
    .toSorted((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

function readTaskOutput(task: GenerationTask | undefined, mediaType: "image" | "video") {
  const file = task?.status === "succeeded" ? task.result?.files?.find(item => item.mimeType.startsWith(`${mediaType}/`)) : undefined;
  const path = safeWorkspacePath(file?.path);
  return path && file?.mimeType ? { path, mimeType: file.mimeType } : undefined;
}

function mediaStatus(cards: CreativeMediaCard[], requireConfirmation = true): ProjectStageStatus {
  if (!cards.length) return "notStarted";
  if (cards.some(card => card.task?.status === "pending" || card.task?.status === "running")) return "running";
  if (cards.some(card => card.task?.status === "failed")) return "failed";
  if (cards.every(card => (!requireConfirmation || card.confirmed) && card.output)) return "complete";
  return "review";
}

function filmStatus(storyboard: CreativeMediaCard[], films: CreativeMediaCard[]): ProjectStageStatus {
  if (!films.length) return "notStarted";
  if (films.some(card => card.task?.status === "pending" || card.task?.status === "running")) return "running";
  if (films.some(card => card.task?.status === "failed")) return "failed";
  if (storyboard.length && storyboard.every(shot => films.some(film => film.order === shot.order && film.output))) return "complete";
  return "review";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
