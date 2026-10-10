import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { GenerationTask } from "@/stores/userApp";
import type { ProjectStage, ProjectStageStatus } from "./components/projectStages.vue";

export const creativeLabels = {
  script: "Minifeel/剧本",
  character: "Minifeel/角色/",
  scene: "Minifeel/场景/",
  prop: "Minifeel/道具/",
  style: "Minifeel/风格/",
  storyboard: "Minifeel/分镜/",
  clip: "Minifeel/片段/",
  legacyFilm: "Minifeel/成片/",
  finalFilm: "Minifeel/成片",
} as const;

export type CreativeAssetType = "character" | "scene" | "prop" | "style";

export const assetTypeLabels: Record<CreativeAssetType, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
  style: "风格",
};

type CreativeLabel = {
  type: "script" | "asset" | "storyboard" | "video" | "finalFilm";
  title: string;
  order: number;
  confirmed: boolean;
  draftLabel: string;
  confirmedLabel: string;
  labelPrefix: string;
  assetType?: CreativeAssetType;
  legacy?: boolean;
};

type CanvasNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

type CanvasEdge = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  data: Record<string, unknown>;
};

export type CreativeAssetReference = {
  nodeId: string;
  title: string;
  assetType: CreativeAssetType;
  edgeId: string;
  managedByGuided: boolean;
  referenceKey: string;
};

export type CreativeAccepted = {
  taskId: string;
  path: string;
  mimeType: string;
  requestFingerprint: string;
  acceptedAt: string;
};

export type CreativeMediaCard = {
  nodeId: string;
  /** 画布节点类型，用于判断是否可复用节点工具（例如成片节点须为 remote-videoNode 才有 node:setVideo）。 */
  nodeType: string;
  title: string;
  order: number;
  prompt: string;
  confirmed: boolean;
  draftLabel: string;
  confirmedLabel: string;
  labelPrefix: string;
  assetType?: CreativeAssetType;
  legacy?: boolean;
  /** 节点当前选择的模型（JSON.stringify([providerId, modelId])），用于判断请求是否变化。 */
  model: string;
  assetReferences: CreativeAssetReference[];
  referenceOrder: string[];
  output?: { path: string; mimeType: string };
  outputPersisted: boolean;
  accepted?: CreativeAccepted;
  /** 上游已采用输出或本镜参数变化后，本镜已采用版本需要更新。 */
  stale?: boolean;
  /** 当前上游引用（分镜首帧 + 资产），采用时据此计算创意指纹；仅视频片段有值。 */
  upstreamRefs?: Array<{ key: string; nodeId: string; path: string }>;
  /** 最新成功任务产出的候选输出；与 output 不同表示存在可采用的新候选。 */
  latestCandidate?: { taskId: string; path: string; mimeType: string };
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
  assets: CreativeMediaCard[];
  storyboard: CreativeMediaCard[];
  films: CreativeMediaCard[];
  finalFilm?: CreativeMediaCard;
  statuses: Record<ProjectStage, ProjectStageStatus>;
  warnings: string[];
};

export type CreativeGapCandidate = {
  nodeId: string;
  title: string;
  assetType: CreativeAssetType;
  suggested: boolean;
};

export type CreativeConnectionGap = {
  shotNodeId: string;
  shotTitle: string;
  currentNodeIds: string[];
  candidates: CreativeGapCandidate[];
};

export type RenderClip = { order: number; path: string; fingerprint: string };

export type RenderTaskStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type RenderTask = {
  id: string;
  projectId: string;
  status: RenderTaskStatus;
  inputSnapshot: { clips: RenderClip[] };
  outputPath: string | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  cancelRequestedAt: string | null;
};

const assetPrefixes: Array<{ prefix: string; assetType: CreativeAssetType }> = [
  { prefix: creativeLabels.character, assetType: "character" },
  { prefix: creativeLabels.scene, assetType: "scene" },
  { prefix: creativeLabels.prop, assetType: "prop" },
  { prefix: creativeLabels.style, assetType: "style" },
];

export function parseCreativeLabel(label: unknown): CreativeLabel | undefined {
  if (typeof label !== "string") return;
  const confirmed = label.endsWith("/已确认");
  const draftLabel = confirmed ? label.slice(0, -4) : label;
  const confirmedLabel = `${draftLabel}/已确认`;
  if (draftLabel === creativeLabels.script) {
    return { type: "script", title: "剧本", order: 0, confirmed, draftLabel, confirmedLabel, labelPrefix: creativeLabels.script };
  }
  if (draftLabel === creativeLabels.finalFilm) {
    return { type: "finalFilm", title: "成片", order: 0, confirmed, draftLabel, confirmedLabel, labelPrefix: creativeLabels.finalFilm };
  }
  for (const { prefix, assetType } of assetPrefixes) {
    if (!draftLabel.startsWith(prefix)) continue;
    const title = draftLabel.slice(prefix.length);
    if (title && !title.includes("/")) return { type: "asset", title, order: 0, confirmed, draftLabel, confirmedLabel, labelPrefix: prefix, assetType };
    return;
  }
  for (const [type, prefix, legacy] of [["storyboard", creativeLabels.storyboard, false], ["video", creativeLabels.clip, false], ["video", creativeLabels.legacyFilm, true]] as const) {
    if (!draftLabel.startsWith(prefix)) continue;
    const suffix = draftLabel.slice(prefix.length);
    if (!/^\d{3}$/.test(suffix)) return;
    const order = Number(suffix);
    if (order > 0) return { type, title: suffix, order, confirmed, draftLabel, confirmedLabel, labelPrefix: prefix, legacy };
  }
}

export function referenceKey(nodeId: string, handleId = "image") {
  return encodeURIComponent(JSON.stringify([nodeId, handleId]));
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
  const warnings = new Set<string>();
  const parsedNodes = nodes.map(node => ({ node, label: parseCreativeLabel(node.data.label) }));
  const unmatchedCount = parsedNodes.filter(item => !item.label).length;
  if (unmatchedCount) warnings.add(`有 ${unmatchedCount} 个画布节点尚未整理到创作流程，可进入高级画布查看。`);
  const edges = Array.isArray(canvas.edges) ? canvas.edges.flatMap((value, index) => {
    const edge = readEdge(value);
    if (!edge) warnings.add(`有 ${index + 1} 条画布连线格式无效，已在普通创作页忽略。`);
    return edge ? [edge] : [];
  }) : [];

  let script: CreativeScript | undefined;
  const assets: CreativeMediaCard[] = [];
  const storyboard: CreativeMediaCard[] = [];
  const films: CreativeMediaCard[] = [];
  let finalFilm: CreativeMediaCard | undefined;
  const assetNodes = new Map<string, CreativeMediaCard>();

  for (const { node, label } of parsedNodes) {
    if (!label) continue;
    if (label.type === "script") {
      if (script) {
        warnings.add("检测到多个剧本节点，当前展示画布中的第一个。可进入高级画布整理重复节点。");
        continue;
      }
      if (node.type !== "remote-textNode") throw new Error("项目画布读取失败：Minifeel/剧本 必须是文本节点");
      const textPath = safeWorkspacePath(node.data.textPath);
      if (!textPath) throw new Error("项目画布读取失败：剧本节点缺少有效的文本文件路径");
      script = { nodeId: node.id, text: await files.readText(textPath), confirmed: label.confirmed, draftLabel: label.draftLabel, confirmedLabel: label.confirmedLabel };
      continue;
    }
    const expectedTypes = label.type === "finalFilm"
      ? ["remote-videoGenerationNode", "remote-videoNode"]
      : [label.type === "video" ? "remote-videoGenerationNode" : "remote-imageGenerationNode"];
    if (!expectedTypes.includes(node.type)) throw new Error(`项目画布读取失败：${String(node.data.label)} 的节点类型无效`);
    const mediaType = label.type === "video" || label.type === "finalFilm" ? "video" : "image";
    const persistedOutput = readMediaOutput(node.data.outputs, mediaType === "video" ? "VIDEO" : "IMAGE");
    const card: CreativeMediaCard = {
      nodeId: node.id,
      nodeType: node.type,
      title: label.title,
      order: label.order,
      prompt: typeof node.data.prompt === "string" ? node.data.prompt : "",
      confirmed: label.confirmed,
      draftLabel: label.draftLabel,
      confirmedLabel: label.confirmedLabel,
      labelPrefix: label.labelPrefix,
      assetType: label.assetType,
      legacy: label.legacy,
      model: typeof node.data.model === "string" ? node.data.model : "",
      assetReferences: [],
      referenceOrder: readReferenceOrder(node.data.referenceOrder),
      outputPersisted: !!persistedOutput,
      accepted: readAccepted(node.data.accepted),
      task: findNodeTask(tasks, node.id),
    };
    card.output = persistedOutput ?? readTaskOutput(card.task, mediaType);
    card.latestCandidate = readTaskCandidate(card.task, mediaType);
    if (label.type === "asset") {
      assets.push(card);
      assetNodes.set(node.id, card);
    } else if (label.type === "storyboard") storyboard.push(card);
    else if (label.type === "video") films.push(card);
    else if (!finalFilm) finalFilm = card;
    else warnings.add("检测到多个最终成片节点，当前展示画布中的第一个。可进入高级画布整理重复节点。");
    if (label.legacy) warnings.add("检测到旧版 Minifeel/成片/编号 标签，当前按视频片段兼容读取，不会自动改名。");
  }

  const knownNodeIds = new Set(nodes.map(node => node.id));
  const incomingEdges = new Map<string, CanvasEdge[]>();
  for (const edge of edges) {
    if (!knownNodeIds.has(edge.source) || !knownNodeIds.has(edge.target)) {
      warnings.add("检测到指向未知节点的画布连线，普通创作页不会修改它。");
      continue;
    }
    const list = incomingEdges.get(edge.target) ?? [];
    list.push(edge);
    incomingEdges.set(edge.target, list);
  }
  for (const card of [...storyboard, ...films]) {
    const references = (incomingEdges.get(card.nodeId) ?? []).flatMap(edge => {
      const asset = assetNodes.get(edge.source);
      if (!asset || !asset.assetType || edge.sourceHandle !== "image" || edge.targetHandle !== "in") return [];
      return [{
        nodeId: asset.nodeId,
        title: asset.title,
        assetType: asset.assetType,
        edgeId: edge.id,
        managedByGuided: edge.data.minifeelRelationship === "assetReference",
        referenceKey: referenceKey(edge.source, edge.sourceHandle),
      } satisfies CreativeAssetReference];
    });
    card.assetReferences = sortReferences(references, card.referenceOrder);
    if (new Set(card.assetReferences.map(item => item.nodeId)).size !== card.assetReferences.length) warnings.add(`镜头 ${card.title} 存在重复资产引用，可在高级画布核对连线。`);
  }
  // ACT: 视频片段按当前上游已采用输出与自身参数记录上游引用，并在已采用时重算指纹只标记需更新，不改写下游、不删文件、不自动重生成。
  const cardsByNodeId = new Map([...assets, ...storyboard, ...films].map(card => [card.nodeId, card]));
  for (const film of films) {
    const upstream = (incomingEdges.get(film.nodeId) ?? []).flatMap(edge => {
      const source = cardsByNodeId.get(edge.source);
      if (!source || edge.sourceHandle !== "image" || edge.targetHandle !== "in") return [];
      return [{ key: referenceKey(edge.source, edge.sourceHandle), nodeId: source.nodeId, path: source.accepted?.path ?? source.output?.path ?? "" }];
    });
    film.upstreamRefs = upstream;
    if (film.accepted) film.stale = computeCreativeFingerprint(film, upstream) !== film.accepted.requestFingerprint;
  }
  if (assets.length) {
    for (const shot of storyboard) {
      if (!shot.assetReferences.length) warnings.add(`镜头 ${shot.title} 尚未选择资产，可在分镜阶段补充。`);
    }
  }
  addDuplicateOrderWarnings(storyboard, "分镜", warnings);
  addDuplicateOrderWarnings(films, "视频片段", warnings);
  storyboard.sort((left, right) => left.order - right.order);
  films.sort((left, right) => left.order - right.order);
  return {
    script,
    assets,
    storyboard,
    films,
    finalFilm,
    statuses: {
      script: script ? script.confirmed ? "complete" : "review" : "notStarted",
      characters: mediaStatus(assets),
      storyboard: mediaStatus(storyboard),
      video: filmStatus(storyboard, films),
      final: finalStatus(storyboard, films, finalFilm),
    },
    warnings: [...warnings],
  };
}

export function readConnectionGaps(view: CreativeView): CreativeConnectionGap[] {
  if (!view.assets.length) return [];
  return view.storyboard
    .filter(shot => !shot.assetReferences.length)
    .map(shot => {
      const text = `${shot.title} ${shot.prompt}`;
      return {
        shotNodeId: shot.nodeId,
        shotTitle: shot.title,
        currentNodeIds: shot.assetReferences.map(reference => reference.nodeId),
        candidates: view.assets.flatMap(asset => asset.assetType
          ? [{ nodeId: asset.nodeId, title: asset.title, assetType: asset.assetType, suggested: !!asset.title && text.includes(asset.title) } satisfies CreativeGapCandidate]
          : []),
      };
    });
}

/**
 * 普通创作页在采用时与读取时各算一次的「创意请求指纹」：由本镜提示词、模型，以及上游节点已采用输出的相对路径与顺序组成。
 * 与 Task 18 的服务端估价指纹（sha256）相互独立：服务端指纹用于估价与执行一致性，这里的前端指纹用于判断上游采用版变化后本镜是否需要更新。
 */
export function computeCreativeFingerprint(card: { prompt: string; model: string; referenceOrder: string[] }, upstream: Array<{ key: string; nodeId: string; path: string }>) {
  const orderMap = new Map(card.referenceOrder.map((key, index) => [key, index]));
  const ordered = upstream.toSorted((left, right) => (orderMap.get(left.key) ?? card.referenceOrder.length) - (orderMap.get(right.key) ?? card.referenceOrder.length));
  return JSON.stringify({
    prompt: card.prompt,
    model: card.model,
    references: ordered.map(item => `${item.nodeId}:${item.path}`),
  });
}

function addDuplicateOrderWarnings(cards: CreativeMediaCard[], title: string, warnings: Set<string>) {
  if (new Set(cards.map(card => card.order)).size !== cards.length) warnings.add(`${title}编号存在重复，普通创作页不会自动重排，请进入高级画布整理。`);
}

function sortReferences(references: CreativeAssetReference[], order: string[]) {
  const orderMap = new Map(order.map((key, index) => [key, index]));
  return references.toSorted((left, right) => (orderMap.get(left.referenceKey) ?? order.length) - (orderMap.get(right.referenceKey) ?? order.length));
}

function readNode(value: unknown, index: number): CanvasNode {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || typeof value.type !== "string" || !value.type) {
    throw new Error(`项目画布读取失败：第 ${index + 1} 个节点缺少有效的 id 或 type`);
  }
  if (!isRecord(value.data)) throw new Error(`项目画布读取失败：节点 ${value.id} 的 data 无效`);
  return { id: value.id, type: value.type, data: value.data };
}

function readEdge(value: unknown): CanvasEdge | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.source !== "string" || typeof value.sourceHandle !== "string" || typeof value.target !== "string" || typeof value.targetHandle !== "string") return;
  return { id: value.id, source: value.source, sourceHandle: value.sourceHandle, target: value.target, targetHandle: value.targetHandle, data: isRecord(value.data) ? value.data : {} };
}

function readReferenceOrder(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.in)) return [];
  return value.in.filter(item => typeof item === "string");
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

function readAccepted(value: unknown): CreativeAccepted | undefined {
  if (!isRecord(value) || typeof value.taskId !== "string" || !value.taskId || typeof value.path !== "string" || !value.path
    || typeof value.mimeType !== "string" || !value.mimeType || typeof value.requestFingerprint !== "string" || !value.requestFingerprint
    || typeof value.acceptedAt !== "string" || !value.acceptedAt) return;
  return { taskId: value.taskId, path: value.path, mimeType: value.mimeType, requestFingerprint: value.requestFingerprint, acceptedAt: value.acceptedAt };
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

function readTaskCandidate(task: GenerationTask | undefined, mediaType: "image" | "video") {
  const file = task?.status === "succeeded" ? task.result?.files?.find(item => item.mimeType.startsWith(`${mediaType}/`)) : undefined;
  const path = safeWorkspacePath(file?.path);
  return task && path && file?.mimeType ? { taskId: task.id, path, mimeType: file.mimeType } : undefined;
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

// ACT: 成片阶段不产生任务，只有画布上的最终成片节点；已确认分镜全部采用后进入可合成状态。
function finalStatus(storyboard: CreativeMediaCard[], films: CreativeMediaCard[], finalFilm: CreativeMediaCard | undefined): ProjectStageStatus {
  if (finalFilm?.output) return "complete";
  const readyShots = storyboard.filter(shot => shot.confirmed && shot.output);
  if (readyShots.length && readyShots.every(shot => films.some(film => film.order === shot.order && film.accepted))) return "review";
  return "notStarted";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
