<template>
  <div class="agentConversation">
    <chat-list class="messageList" :clearHistory="false">
      <chat-item v-if="!messages.length && !disabled" role="assistant" variant="text">
        <template #content>
          <section class="welcomeMessage" aria-label="开始新对话">
            <div class="welcomeHeader">
              <span class="welcomeIcon" aria-hidden="true"><span class="welcomeLogo" :style="{ maskImage: `url(${logoUrl})` }" /></span>
              <div>
                <p class="welcomeLabel">{{ welcomeContent.label }}</p>
                <h3>{{ welcomeContent.title }}</h3>
              </div>
            </div>
            <p class="welcomeDescription">{{ welcomeContent.description }}</p>
            <div class="welcomeSuggestions">
              <el-button v-for="item in welcomeSuggestions" :key="item.label" class="welcomeSuggestion" text bg :disabled="locked" :aria-label="`填入提示：${item.label}`" @click="fillPrompt(item.prompt)">
                <component :is="item.icon" :size="19" aria-hidden="true" />
                <span class="suggestionContent"><strong>{{ item.label }}</strong><span>{{ item.description }}</span></span>
                <icon-arrow-up-right class="suggestionArrow" :size="15" aria-hidden="true" />
              </el-button>
            </div>
            <p class="welcomeHint">点击填入提示，也可以直接输入，或粘贴图片、视频。</p>
          </section>
        </template>
      </chat-item>
      <div v-for="item in messages" :key="item.id" class="messageRow" :class="{ userMessage: item.role === 'user', editingMessage: editingId === item.id }">
        <chat-item :role="item.role" :variant="item.role === 'user' ? 'base' : 'text'" :textLoading="!!item.streaming && !compacting && !item.parts?.some(part => part.type === 'tool' || part.content)" animation="moving">
          <template #content>
            <div class="messageContent">
              <div v-if="item.report && props.mode === 'advanced'" class="reportHeader"><icon-users-group :size="14" />{{ item.report.name }} 上报</div>
              <template v-for="part in item.parts" :key="part.id">
                <div v-if="part.type === 'thinking' && part.content" class="messageReasoning" role="status">
                  {{ item.streaming ? "正在整理创作内容…" : `已完成思考${part.duration !== undefined ? ` · ${part.duration.toFixed(1)} 秒` : ""}` }}
                </div>
                <toolMessage v-else-if="part.type === 'tool' && props.mode === 'advanced'" :tool="part.tool" :projectId="projectId" @copy="copyMessage" />
                <div v-else-if="part.type === 'tool'" class="guidedToolStatus" :data-status="part.tool.status" role="status">
                  {{ guidedToolText(part.tool) }}
                </div>
                <messageMarkdown v-else-if="part.type === 'text' && part.content" :content="part.content" :streaming="!!item.streaming" :projectId="projectId" />
              </template>
              <attachmentList v-if="item.attachments?.length" :attachments="item.attachments" :projectId="projectId" />
              <el-input v-if="item.role === 'user' && editingId === item.id" v-model="editingText" type="textarea" :autosize="{ minRows: 2, maxRows: 10 }" :disabled="locked" aria-label="编辑消息" @keydown.esc.prevent="cancelEdit" />
              <div v-else-if="item.role === 'user'" class="messageText">{{ item.content }}</div>
              <div v-if="item.error" class="messageError" role="alert">{{ item.error }}</div>
            </div>
          </template>
        </chat-item>
        <div v-if="!item.streaming" class="messageActions">
          <template v-if="editingId === item.id">
            <el-button text size="small" :disabled="busy || deletingId !== undefined" @click="cancelEdit"><icon-x :size="14" />取消</el-button>
            <el-button type="primary" size="small" :loading="busy" :disabled="locked || (!editingText.trim() && !item.attachments?.length)" @click="sendMessage(item)"><icon-arrow-up v-if="!busy" :size="14" />重发</el-button>
          </template>
          <template v-else>
            <el-button v-if="item.content" class="messageAction" text circle aria-label="复制消息" title="复制消息" @click="copyMessage(item.content)"><icon-copy :size="14" /></el-button>
            <template v-if="item.role === 'user'">
              <el-button class="messageAction" text circle :disabled="locked || remoteRunning" aria-label="编辑消息" title="编辑消息" @click="editMessage(item)"><icon-pencil :size="14" /></el-button>
            </template>
            <el-button v-if="item.role === 'assistant' && item.error" type="primary" text size="small" :disabled="locked || remoteRunning" @click="retryMessage(item)">重试</el-button>
            <el-button v-if="!item.report" class="messageAction" text circle :loading="deletingId === item.id" :disabled="locked || remoteRunning" aria-label="删除消息" title="删除消息" @click="deleteMessage(item)"><icon-trash v-if="deletingId !== item.id" :size="14" /></el-button>
          </template>
        </div>
      </div>
    </chat-list>
    <div v-if="compacting" class="compactionStatus" role="status">
      <el-icon class="is-loading" aria-hidden="true"><icon-loader-2 :size="14" /></el-icon>
      <span>正在压缩上下文…</span>
    </div>
    <div class="messageInput">
      <div
        class="senderResizeHandle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整输入框高度"
        aria-valuemin="44"
        :aria-valuemax="senderMaxHeight"
        :aria-valuenow="senderHeight"
        tabindex="0"
        title="拖动调整输入框高度"
        @focus="senderHeight = sender?.chatElement.rollBox.clientHeight ?? 44"
        @pointerdown="startSenderResize"
        @pointermove="moveSenderResize"
        @pointerup="stopSenderResize"
        @pointercancel="stopSenderResize"
        @lostpointercapture="stopSenderResize"
        @keydown.up.prevent="setSenderHeight((sender?.chatElement.rollBox.clientHeight ?? 44) + 16)"
        @keydown.down.prevent="setSenderHeight((sender?.chatElement.rollBox.clientHeight ?? 44) - 16)" />
      <attachmentList v-if="draftAttachments.length" class="draftAttachments" :attachments="draftAttachments" :projectId="projectId" removable @remove="draftAttachments.splice($event, 1)" />
      <div ref="senderElement" class="senderEditor" @keydown.capture="props.mode === 'advanced' && skillMenuRef?.handleKeydown($event)"></div>
      <div class="senderActions">
        <modelPopover v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" :active="active" :disabled="disabled" />
        <skillMenu v-if="props.mode === 'advanced'" ref="skillMenuRef" :projectId="projectId" :active="active" :disabled="locked || editingId !== undefined || !projectId" :query="skillQuery" :editor="senderElement" @select="selectSkill" @dismiss="skillQuery = undefined" />
        <el-popover
          v-if="props.mode === 'advanced'"
          v-model:visible="contextMenuVisible"
          trigger="click"
          placement="top"
          :width="280"
          :offset="10"
          :showArrow="false"
          popperClass="agentContextPopover">
          <template #reference>
            <el-button class="contextButton" text circle aria-label="查看上下文用量" title="查看上下文用量">
              <icon-circle-dashed :size="14" />
            </el-button>
          </template>
          <div class="contextUsage">
            <div class="contextHeader"><span>上下文用量</span><span class="contextHint">估算</span></div>
            <template v-if="contextUsage?.tokens != null">
              <div class="contextTokens">
                <span>{{ contextUsage.tokens.toLocaleString() }} / {{ contextWindow.toLocaleString() }} tok</span>
                <span>{{ contextPercent.toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="Math.min(100, contextPercent)" :showText="false" />
            </template>
            <span v-else class="contextHint">{{ contextUsage ? "等待下一次回复更新用量" : "尚无用量数据" }}</span>
            <div v-if="stats" class="contextStats">
              <div class="contextHeader">对话累计用量</div>
              <div class="contextTokens"><span>输入</span><span>{{ inputTokens.toLocaleString() }} tok</span></div>
              <div class="contextTokens"><span>输出</span><span>{{ stats.tokens.output.toLocaleString() }} tok</span></div>
              <div v-if="inputTokens > 0" class="contextTokens"><span>缓存命中</span><span>{{ (stats.tokens.cacheRead / inputTokens * 100).toFixed(1) }}%</span></div>
              <div v-if="stats.tokensPerSecond !== undefined" class="contextTokens"><span>生成速度</span><span>{{ stats.tokensPerSecond.toFixed(1) }} tok/s</span></div>
            </div>
          </div>
        </el-popover>
        <el-button class="sendButton" type="primary" circle :disabled="!busy && (locked || editingId !== undefined)" :aria-label="busy ? '停止生成' : '发送消息'" :title="busy ? '停止生成' : '发送消息'" @click="busy ? stopMessage() : sendMessage()">
          <icon-player-stop-filled v-if="busy" :size="14" />
          <icon-arrow-up v-else :size="16" />
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref, watch } from "vue";
import axios from "axios";
import {
  IconArrowUp, IconCopy,
  IconCircleDashed, IconPencil, IconPlayerStopFilled, IconX, IconLoader2,
  IconTrash, IconLayoutGrid, IconMovie, IconPhoto, IconArrowUpRight, IconUsersGroup,
} from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import logoUrl from "@minifeel/assets/logo.svg";
import modelPopover from "@/components/modelPopover.vue";
import skillMenu from "./skillMenu.vue";
import toolMessage from "./toolMessage.vue";
import attachmentList from "./attachmentList.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { writeClipboardText } from "@/lib/clipboard";
import { modelChoices } from "@/stores/settings";
import { getProjectModel, setProjectModel } from "@/lib/projectMode";
import { useWorkspaceStore } from "@/stores/workspace";
import type { AgentAttachment, AgentConversation, AgentMessage } from "./types";
import type { AgentEvent, AgentToolCall } from "@minifeel/server/agent/types";
import { createConversationStream, readAgentEvents } from "./replyStream";
import type { CanvasContext } from "@minifeel/tool-canvas/runtime";
import chatList from "@tdesign-vue-next/chat/es/chat-list";
import chatItem from "@tdesign-vue-next/chat/es/chat-item";
import messageMarkdown from "@/components/messageMarkdown.vue";
import xSender from "x-sender";
import "tdesign-vue-next/es/style/index.css";
import "@tdesign-vue-next/chat/es/style/index.css";
import "x-sender/lib/XSender.css";

const props = withDefaults(defineProps<{ active: boolean; initialSession: AgentConversation | null; sessionFile?: string; disabled: boolean; mode?: "advanced" | "guided" }>(), { mode: "advanced" });
const emit = defineEmits<{ session: [file: string]; sent: [prompt: string]; event: [event: AgentEvent] }>();
const workspaceStore = useWorkspaceStore();
const projectId = workspaceStore.project?.id;
const draftAttachments = ref<AgentAttachment[]>([]);
const createCanvasContext = inject<(() => CanvasContext | undefined) | undefined>("canvas", undefined);
const messages = ref<AgentMessage[]>((props.initialSession?.messages ?? []).map(message => ({ ...message })));
const stream = createConversationStream(messages);
const remoteRunning = ref(props.initialSession?.running ?? false);
const stats = ref(props.initialSession?.stats);
const contextUsage = ref(props.initialSession?.contextUsage);
const busy = ref(false);
const compacting = ref(false);
const deletingId = ref<string>();
const locked = computed(() => props.disabled || busy.value || deletingId.value !== undefined);
const editingId = ref<string>();
const editingText = ref("");
let sender: xSender | undefined;
let controller: AbortController | undefined;
const senderElement = ref<HTMLElement>();
const skillMenuRef = ref<InstanceType<typeof skillMenu>>();
const skillQuery = ref<string>();
const senderHeight = ref(44);
const senderMaxHeight = ref(Math.max(44, window.innerHeight / 2));
let senderResize: { pointerId: number; y: number; height: number } | undefined;
const pendingMessage = props.initialSession?.parentFile ? undefined : workspaceStore.pendingAgentMessage;
const selectedModel = ref(pendingMessage?.model ?? (props.initialSession?.providerId && props.initialSession.modelId
  ? JSON.stringify([props.initialSession.providerId, props.initialSession.modelId]) : projectId ? getProjectModel(projectId) : ""));
const contextMenuVisible = ref(false);
const reasoningEffort = ref(pendingMessage?.reasoningEffort ?? (props.initialSession?.thinkingLevel === "off" ? "" : props.initialSession?.thinkingLevel ?? ""));
const selectedModelChoice = computed(() => modelChoices.value.find(item => item.value === selectedModel.value));
watch(selectedModel, model => { if (projectId) setProjectModel(projectId, model); });
const contextWindow = computed(() => contextUsage.value?.contextWindow ?? selectedModelChoice.value?.contextWindow ?? 262144);
const contextPercent = computed(() => (contextUsage.value?.tokens ?? 0) / contextWindow.value * 100);
const inputTokens = computed(() => stats.value ? stats.value.tokens.input + stats.value.tokens.cacheRead + stats.value.tokens.cacheWrite : 0);
const advancedWelcomeSuggestions = [
  { label: "搭建创作画布", description: "把创意串成清晰的节点流程", icon: IconLayoutGrid, prompt: "帮我搭建一个创作画布，先和我确认需要的节点与流程。" },
  { label: "梳理故事分镜", description: "拆解故事，安排画面与镜头", icon: IconMovie, prompt: "帮我把故事整理成分镜，先和我确认故事内容、时长和画面风格。" },
  { label: "生成图片素材", description: "为角色和场景寻找视觉方向", icon: IconPhoto, prompt: "帮我生成图片素材，先和我确认画面内容、风格和使用的模型。" },
];
const guidedWelcomeSuggestions = [
  { label: "完善故事", description: "补充人物、冲突和结局", icon: IconLayoutGrid, prompt: "帮我完善这个故事，先指出最需要补充的情节。" },
  { label: "梳理分镜", description: "安排画面与镜头节奏", icon: IconMovie, prompt: "帮我把当前故事整理成适合短剧的分镜。" },
  { label: "确定视觉方向", description: "统一角色和场景风格", icon: IconPhoto, prompt: "帮我为当前故事确定角色和场景的视觉方向。" },
];
const welcomeContent = computed(() => props.mode === "guided" ? {
  label: "你好，我是你的短剧导演助手",
  title: "一起把故事拍出来",
  description: "告诉我你想调整的剧情、角色或镜头，我会直接更新这个项目。",
} : {
  label: "你好，我是 Minifeel 助手",
  title: "从一个想法开始",
  description: "聊聊你的故事、画面或镜头，让我们一起把想法落到画布上。",
});
const welcomeSuggestions = computed(() => props.mode === "guided" ? guidedWelcomeSuggestions : advancedWelcomeSuggestions);
watch([locked, editingId, () => props.active], ([locked, editingId, active]) => {
  if (!active || locked || editingId !== undefined) sender?.disable();
  else sender?.enable();
});
watch(() => props.active, active => {
  if (!active) contextMenuVisible.value = false;
});

function applyEvent(event: AgentEvent) {
  switch (event.type) {
    case "subAgent":
    case "subAgentEvent": emit("event", event); break;
    case "report":
      if (event.parentFile !== props.sessionFile) { emit("event", event); break; }
      if (!messages.value.some(message => message.id === event.id)) messages.value.push({
        id: event.id, role: "assistant", content: event.content,
        parts: [{ id: event.id, type: "text", content: event.content }], report: { file: event.file, name: event.name },
      });
      break;
    case "compaction": compacting.value = event.active; break;
    case "session": emit("session", event.file); break;
    case "stats": stats.value = event.stats; contextUsage.value = event.contextUsage; break;
    default: stream.receive(event);
  }
}

function receiveEvent(event: AgentEvent) {
  if (event.type === "done" || event.type === "error") {
    remoteRunning.value = false;
    compacting.value = false;
  } else if (["userMessage", "text", "thinking", "tool"].includes(event.type)) remoteRunning.value = true;
  applyEvent(event);
}

function guidedToolText(tool: AgentToolCall) {
  if (tool.status === "running") return "正在更新项目…";
  if (tool.status === "success") return "项目内容已更新";
  if (tool.status === "interrupted") return "项目更新已停止";
  let detail = "请重试或调整要求";
  if (typeof tool.result === "string") {
    try {
      const result = JSON.parse(tool.result) as { error?: unknown; message?: unknown };
      const message = result.error ?? result.message;
      if (typeof message === "string" && message.trim()) detail = message.trim().slice(0, 160);
    } catch {
      if (tool.result.trim()) detail = tool.result.trim().slice(0, 160);
    }
  }
  return `项目更新失败：${detail}`;
}

defineExpose({ receiveEvent });

async function selectSkill(name: string) {
  const instance = sender;
  if (!instance || locked.value || editingId.value !== undefined) return;
  const draft = instance.getText().replace(skillQuery.value !== undefined ? /^\/\S*/ : /^\s*\/skill:\S+(?:\s+|$)/, "");
  skillQuery.value = undefined;
  const text = `/skill:${name} ${draft}`;
  await instance.reset({ clearHistory: false, chatNode: text.split("\n").map(text => [{ type: "Write", text }]) });
  if (sender === instance) instance.focus("last");
}

async function fillPrompt(prompt: string) {
  const instance = sender;
  if (!instance || locked.value) return;
  await instance.reset({ clearHistory: false, chatNode: [[{ type: "Write", text: prompt }]] });
  if (sender === instance) instance.focus("last");
}

async function copyMessage(content: string) {
  try {
    await writeClipboardText(content);
    ElMessage.success("已复制");
  } catch {
    ElMessage.error("复制失败，请重试");
  }
}

function editMessage(item: AgentMessage) {
  if (locked.value || remoteRunning.value || item.role !== "user") return;
  editingId.value = item.id;
  editingText.value = item.content;
}

function cancelEdit() {
  if (busy.value || deletingId.value !== undefined) return;
  editingId.value = undefined;
  editingText.value = "";
}

async function deleteMessage(item: AgentMessage) {
  if (locked.value || remoteRunning.value || item.streaming || item.report) return;
  deletingId.value = item.id;
  try {
    if (item.entryId || item.replyTo) {
      if (!projectId || !props.sessionFile) throw new Error("请重新打开对话后再删除");
      const { data } = await axios.delete<{ code: number; data: AgentConversation; message?: string }>("/api/agent/message", {
        data: {
          projectId, sessionFile: props.sessionFile,
          ...(item.replyTo ? { replyTo: item.replyTo } : { entryIds: [item.entryId!] }),
        },
        headers: { "x-minifeel-workspace": "1" },
      });
      if (data.code !== 200) throw new Error(data.message || "删除消息失败");
      stats.value = data.data.stats;
      contextUsage.value = data.data.contextUsage;
    }
    messages.value = messages.value.filter(message => message.id !== item.id);
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
    ElMessage.error(message || (error instanceof Error ? error.message : "删除消息失败"));
  } finally {
    deletingId.value = undefined;
  }
}

function setSenderHeight(height: number) {
  if (!sender) return;
  senderMaxHeight.value = Math.max(44, window.innerHeight / 2);
  senderHeight.value = Math.max(44, Math.min(senderMaxHeight.value, Math.round(height)));
  sender.chatElement.rollBox.style.height = `${senderHeight.value}px`;
}

function startSenderResize(event: PointerEvent) {
  if (event.button !== 0 || senderResize || !sender) return;
  event.preventDefault();
  senderResize = { pointerId: event.pointerId, y: event.clientY, height: sender.chatElement.rollBox.getBoundingClientRect().height };
  senderHeight.value = senderResize.height;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId !== event.pointerId) return;
  setSenderHeight(senderResize.height + senderResize.y - event.clientY);
}

function stopSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId === event.pointerId) senderResize = undefined;
}

function stopMessage() {
  controller?.abort(new DOMException("用户已停止生成", "AbortError"));
}

function retryMessage(item: AgentMessage) {
  const index = messages.value.findIndex(message => message.id === item.id);
  const source = messages.value.slice(0, index).findLast(message => message.role === "user");
  if (source) void sendMessage(source);
}

async function uploadAttachments(attachments: AgentAttachment[], projectId: string, signal: AbortSignal) {
  if (!attachments.some(item => item.file)) return;
  const files = useWorkspaceFiles(projectId);
  for (const path of ["assets", "assets/chat"]) {
    await files.mkdir(path).catch(error => {
      if (error?.response?.data?.data?.code !== "EEXIST") throw error;
    });
    signal.throwIfAborted();
  }
  for (const attachment of attachments) {
    if (!attachment.file) continue;
    const extension = attachment.name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";
    const path = `assets/chat/${crypto.randomUUID()}${extension}`;
    await files.write(path, attachment.file, true, signal);
    attachment.path = path;
    attachment.file = undefined;
    signal.throwIfAborted();
  }
}

async function sendCanvasResult(event: Extract<AgentEvent, { type: "canvasCall" }>, canvasContext: CanvasContext | undefined, signal: AbortSignal) {
  let payload: { result?: unknown; error?: string };
  try {
    if (!canvasContext) throw new Error("当前页面没有激活的画布");
    const result = await canvasContext.call(event, signal);
    payload = { result: JSON.parse(JSON.stringify(result ?? null)) };
  } catch (error) {
    payload = { error: (error instanceof Error && error.message ? error.message : "画布操作失败").slice(0, 8000) };
  }
  const cancelled = signal.aborted;
  if (cancelled) payload = { error: "画布操作已取消" };
  const response = await fetch("/api/agent/canvasResult", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-minifeel-workspace": "1" },
    body: JSON.stringify({ projectId, callId: event.callId, ...payload }),
    keepalive: cancelled,
    signal: cancelled ? AbortSignal.timeout(5000) : signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "画布操作结果回传失败");
  }
}

async function sendMessage(source?: AgentMessage, direct?: { prompt: string; displayPrompt: string }) {
  const instance = sender;
  const prompt = (direct?.prompt ?? (source ? editingId.value === source.id ? editingText.value : source.content : instance?.getText()))?.trim() ?? "";
  const attachments = reactive((source ? source.attachments ?? [] : direct ? [] : draftAttachments.value).map(item => ({ ...item })));
  if (!source && editingId.value !== undefined) return;
  const resendIndex = source ? messages.value.findIndex(item => item.id === source.id) : -1;
  if (source && (source.role !== "user" || resendIndex < 0)) return;
  const resendFrom = source ? source.entryId ?? messages.value.slice(resendIndex + 1).find(item => item.role === "user" && item.entryId)?.entryId : undefined;
  if (locked.value || !instance || (!prompt && !attachments.length)) return;
  const model = selectedModelChoice.value;
  if (!projectId) return ElMessage.warning("请先打开项目");
  if (!model) return ElMessage.warning("请先选择模型");

  const requestController = new AbortController();
  const canvasContext = createCanvasContext?.();
  controller = requestController;
  busy.value = true;
  compacting.value = false;
  instance.disable();
  const reply = reactive<AgentMessage>({ id: crypto.randomUUID(), role: "assistant", content: "", parts: [], streaming: true });
  const userMessage = reactive<AgentMessage>({ id: crypto.randomUUID(), role: "user", content: direct?.displayPrompt ?? prompt, attachments });
  let ownsStream = !remoteRunning.value;
  let forwarded = false;
  if (!source) {
    messages.value.push(userMessage);
    if (ownsStream) messages.value.push(reply);
    draftAttachments.value = [];
  }
  let accepted = false;
  if (ownsStream) stream.begin(reply);
  const handledCanvasCalls = new Set<string>();
  const pendingQuestions = new Map<string, string>();
  const activeChildFiles = new Set<string>();
  try {
    // ACT: xSender 清空时等待浏览器绘制帧；后台页面可能暂停绘制，不能让它阻塞消息请求。
    if (!source && !direct) void instance.reset().catch(error => {
      console.error("清空消息输入框失败", error);
      ElMessage.warning("输入框未能清空，消息已正常发送");
    });
    requestController.signal.throwIfAborted();
    await uploadAttachments(attachments, projectId, requestController.signal);
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-minifeel-workspace": "1" },
      body: JSON.stringify({ prompt, attachments: attachments.map(({ name, path, mimeType }) => ({ name, path, mimeType })), projectId, providerId: model.providerId, modelId: model.modelId, thinkingLevel: reasoningEffort.value || undefined, sessionFile: props.sessionFile, resendFrom, canvas: canvasContext ? { id: canvasContext.id, tools: canvasContext.tools } : undefined }),
      signal: requestController.signal,
    });
    for await (const event of readAgentEvents(response, requestController.signal)) {
      // 子任务复用发起委派时的画布与取消通道，界面切换不改变工具执行目标。
      let toolEvent: AgentEvent = event;
      let scope = "";
      while (toolEvent.type === "subAgentEvent") {
        if (toolEvent.event.type === "done" || toolEvent.event.type === "error") activeChildFiles.delete(toolEvent.file);
        else activeChildFiles.add(toolEvent.file);
        scope += `${toolEvent.file}/`;
        toolEvent = toolEvent.event;
      }
      if (toolEvent.type === "question") pendingQuestions.set(`${scope}${toolEvent.toolCallId}`, toolEvent.callId);
      if (toolEvent.type === "tool" && toolEvent.tool.status !== "running") pendingQuestions.delete(`${scope}${toolEvent.tool.id}`);
      if (toolEvent.type === "canvasCall") {
        if (handledCanvasCalls.has(toolEvent.callId)) throw new Error("收到重复的画布调用");
        handledCanvasCalls.add(toolEvent.callId);
        await sendCanvasResult(toolEvent, canvasContext, requestController.signal);
        continue;
      }
      switch (event.type) {
        case "accepted":
          forwarded = true;
          if (ownsStream) {
            stream.finish();
            messages.value = messages.value.filter(message => message !== reply);
          }
          break;
        case "userMessage":
          if (!ownsStream) {
            messages.value.push(reply);
            stream.begin(reply);
          }
          userMessage.entryId = event.id;
          reply.replyTo = event.id;
          if (source && !accepted) {
            messages.value.splice(resendIndex, messages.value.length - resendIndex, userMessage, reply);
            stats.value = undefined;
            contextUsage.value = undefined;
            editingId.value = undefined;
            editingText.value = "";
          }
          accepted = true;
          ownsStream = true;
          applyEvent(event);
          break;
        case "stats":
          if (source && !accepted) break;
          applyEvent(event);
          break;
        default: applyEvent(event);
      }
    }
    if (source && !accepted) throw new Error("服务端未确认重发，请重新打开对话后重试");
    emit("sent", direct?.displayPrompt || prompt || attachments[0]?.name || "新对话");
  } catch (error) {
    const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    const message = requestController.signal.aborted
      ? requestController.signal.reason instanceof Error ? requestController.signal.reason.message : "生成已停止"
      : responseMessage || (error instanceof Error ? error.message : "发送失败，请重试");
    if ((source && !accepted) || !ownsStream) { userMessage.error = message; ElMessage.error(message); }
    else reply.error = message;
    if (ownsStream && props.initialSession?.parentFile && props.sessionFile) {
      emit("event", { type: "subAgentEvent", file: props.sessionFile, event: { type: "error", message } });
    }
  } finally {
    for (const file of activeChildFiles) emit("event", { type: "subAgentEvent", file, event: { type: "error", message: "委派连接已结束，请重新打开子会话查看结果" } });
    // ACT: Bun 的流断开事件可能不触发；主动结束仍在等待的提问，不依赖断开通知。
    for (const callId of pendingQuestions.values()) {
      void fetch("/api/agent/answer", {
        method: "POST", headers: { "Content-Type": "application/json", "x-minifeel-workspace": "1" },
        body: JSON.stringify({ projectId, callId, cancelled: true }), keepalive: true,
      }).catch(() => {});
    }
    if (ownsStream && !forwarded) stream.finish();
    compacting.value = false;
    busy.value = false;
    controller = undefined;
  }
}

function pasteAttachments(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (locked.value || editingId.value !== undefined) return;
  for (const file of files) {
    if (!/^(image|video)\//.test(file.type)) {
      ElMessage.warning("只支持图片和视频文件");
      continue;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      ElMessage.warning("附件不能为空且不能超过 100 MB");
      continue;
    }
    if (draftAttachments.value.length >= 20) {
      ElMessage.warning("每条消息最多添加 20 个附件");
      break;
    }
    draftAttachments.value.push({ name: file.name, path: "", mimeType: file.type, file });
  }
}

watch(senderElement, (element, _previous, onCleanup) => {
  if (!element) return;
  const instance = new xSender(element, {
    autoFocus: props.active,
    placeholder: "输入消息…",
    chatStyle: { minHeight: "44px", maxHeight: "50vh", fontSize: "14px", lineHeight: "24px" },
    keyboardSendFun: event => event.key === "Enter" && !event.shiftKey && !event.isComposing,
    keyboardWrapFun: event => event.key === "Enter" && event.shiftKey && !event.isComposing,
  });
  sender = instance;
  if (!props.active || locked.value || editingId.value !== undefined) instance.disable();
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_SEND, () => void sendMessage());
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_CHANGE, () => {
    skillQuery.value = props.mode === "advanced" ? /^\/([^\s/]*)$/.exec(instance.getText())?.[1] : undefined;
  });
  const editor = instance.chatElement.richText;
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "消息");
  editor.setAttribute("aria-multiline", "true");
  element.addEventListener("paste", pasteAttachments, true);
  onCleanup(() => {
    controller?.abort();
    sender = undefined;
    senderResize = undefined;
    element.removeEventListener("paste", pasteAttachments, true);
    instance.destroy();
  });
});

watch(() => !props.initialSession?.parentFile && !!workspaceStore.pendingAgentMessage && props.active && !locked.value && !!senderElement.value && !!createCanvasContext?.(), ready => {
  const message = workspaceStore.pendingAgentMessage;
  const instance = sender;
  if (!ready || !message || !instance || message.projectId !== projectId) return;
  workspaceStore.pendingAgentMessage = null;
  if (sender === instance && props.active) void sendMessage(undefined, { prompt: message.prompt, displayPrompt: message.displayPrompt });
}, { flush: "post" });
</script>

<style lang="scss">
.agentConversation {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  .messageList {
    flex: 1;
    min-height: 0;

    .t-chat__list {
      padding: 12px;
    }

    .welcomeMessage {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 28px 4px 16px;
      color: var(--el-text-color-primary);

      .welcomeHeader {
        display: flex;
        align-items: center;
        gap: 12px;

        .welcomeIcon {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          border-radius: var(--ui-radius-large);
          background: var(--el-color-primary-light-9);
          color: var(--el-color-primary);

          .welcomeLogo {
            width: 28px;
            height: 28px;
            background: currentColor;
            mask-size: contain;
            mask-position: center;
            mask-repeat: no-repeat;
          }
        }

        .welcomeLabel { margin: 0 0 4px; font-size: 12px; color: var(--el-text-color-secondary); }
        h3 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
      }

      .welcomeDescription { margin: 0; font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }

      .welcomeSuggestions {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .welcomeSuggestion {
          height: auto;
          margin: 0;
          padding: 12px;
          text-align: left;
          white-space: normal;
          line-height: 1.5;

          > span { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; }
          svg { flex-shrink: 0; color: var(--el-text-color-secondary); }
          .suggestionContent {
            display: flex;
            flex: 1;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
            strong { font-size: 13px; font-weight: 500; }
            span { font-size: 12px; color: var(--el-text-color-secondary); }
          }
          .suggestionArrow { color: var(--el-text-color-placeholder); }
        }
      }

      .welcomeHint { margin: 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
    }

    .messageRow {
      margin-bottom: 12px;

      .messageActions {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;

        .el-button {
          margin: 0;

          .tabler-icon {
            flex-shrink: 0;
          }
        }

        .messageAction {
          width: 24px;
          height: 24px;
          padding: 0;
          color: var(--el-text-color-secondary);
        }
      }

      &.userMessage .messageActions {
        justify-content: flex-end;
      }

      &.editingMessage .t-chat__inner.user .t-chat__content .t-chat__detail {
        width: 100%;
        max-width: 100%;
        padding: 0;
        background: transparent;
      }
    }

    .t-chat__inner {
      margin-bottom: 0;

      .t-chat__content {
        min-width: 0;
        padding-top: 0;

        .t-chat__detail {
          width: 100%;
          max-width: 100%;
          padding: 0;
        }
      }

      &.user .t-chat__content .t-chat__detail {
        width: auto;
        max-width: 80%;
        padding: 6px 10px;
        border-radius: calc(var(--ui-radius) * 1.25);
        background: color-mix(in srgb, var(--el-text-color-secondary) 12%, var(--el-bg-color));
      }
    }

    .messageContent {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--el-text-color-primary);

      .messageReasoning {
        padding-top: 0;

        .t-collapse-panel__wrapper {
          background: transparent;

          .t-collapse-panel__header {
            padding: 2px 0;
            font-size: 13px;
            line-height: 20px;
          }

          .t-collapse-panel__icon {
            width: 16px;
            height: 20px;
            margin-right: 6px;

            .t-fake-arrow {
              transform: rotate(-90deg);
            }

            &.t-collapse-panel__icon--active .t-fake-arrow {
              transform: rotate(0deg);
            }
          }

          .t-collapse-panel__body {
            background: transparent;

            .t-collapse-panel__content {
              padding: 4px 0 4px 22px;
              background: transparent;
              color: var(--el-text-color-secondary);
            }
          }
        }
      }

      .reasoningHeader {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);

        .thinkingDuration {
          font-variant-numeric: tabular-nums;
        }
      }

      .messageText {
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.6;
      }

      .messageError {
        color: var(--el-color-danger);
        font-size: 12px;
      }

      .guidedToolStatus {
        padding: 8px 10px;
        border-radius: var(--ui-radius);
        background: var(--el-fill-color-light);
        color: var(--el-text-color-secondary);
        font-size: 12px;
        &[data-status="success"] { color: var(--el-color-success); }
        &[data-status="error"] { color: var(--el-color-danger); }
      }

      .reportHeader {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }

      .messageMarkdown {
        display: block;
        min-width: 0;
        max-width: 100%;
        font-size: 13px;
        line-height: 1.6;
      }
    }
  }

  .compactionStatus {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    margin: 0 12px 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .messageInput {
    --chat-text: var(--el-text-color-primary);
    --chat-text-placeholder: var(--el-text-color-placeholder);
    --chat-rect-padding: 12px;
    position: relative;
    flex-shrink: 0;
    margin: 0 12px 8px;
    border: 1px solid var(--el-border-color-light);
    border-radius: calc(var(--ui-radius) * 2.75);
    background: var(--el-bg-color);
    box-shadow: 0 4px 16px rgb(0 0 0 / 8%);

    &:focus-within {
      border-color: var(--el-color-primary-light-5);
    }

    .senderResizeHandle {
      position: absolute;
      z-index: 12;
      top: -4px;
      right: 12px;
      left: 12px;
      height: 8px;
      border-radius: 4px;
      cursor: ns-resize;
      touch-action: none;
      user-select: none;

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
      }
    }

    .draftAttachments {
      padding: 12px 12px 0;
    }

    .senderEditor .chat-placeholder-wrap {
      font-size: 14px;
      font-style: normal;
      line-height: 24px;
    }

    .senderActions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      padding: 2px 8px 6px;

      > .el-button {
        margin-left: 0;
      }

      .modelPopover {
        flex: 1;
        margin-right: auto;
      }

      .contextButton {
        width: 24px;
        height: 24px;
        margin: 0;
        padding: 0;

        &.is-text {
          background-color: transparent;
        }
      }

      .sendButton {
        width: 34px;
        height: 34px;
        border: none;
        transform: translateY(-2px);
      }
    }
  }

}
.agentContextPopover {
  .contextUsage {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .contextStats {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .contextHeader,
    .contextTokens {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .contextHeader {
      color: var(--el-text-color-primary);
    }

    .contextTokens {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .contextHint {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }
}
</style>
