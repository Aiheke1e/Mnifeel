export { default as nodeSkeleton } from "./nodeSkeleton.vue";
// ACT: 生成引用摘要由工具契约定义，节点侧经 nodes-scaffold 转出，避免节点直接依赖工具包。
export type { GenerationReference, NodeGenerationPlan } from "@minifeel/tools-scaffold/runtime";
export { useNode, type NodeOptions } from "./useNode";
export { useNodeReferences, nodeReferenceKey } from "./useNodeReferences";
export { useNodeGeneration } from "./useNodeGeneration";
export * from "./connection";
export * from "./values";
export * from "./nodeInputs";
export * from "./nodeEvent";
export * from "./nodeTools";
export * from "./workspaceFiles";

export * from "./nodeAi";
export * from "./nodeFfmpeg";
