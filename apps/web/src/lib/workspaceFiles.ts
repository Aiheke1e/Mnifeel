import { toValue, type MaybeRefOrGetter } from "vue";
import axios from "axios";
import api from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace";

type WorkspaceEntry = { name: string; path: string; type: "file" | "directory" };
const fileUrls = new Map<string, { projectId: string; path: string; url: Promise<string>; users: number }>();

function cachePath(path: string) {
  return path.replaceAll("\\", "/").split("/").filter(part => part && part !== ".").join("/").toLowerCase();
}

function invalidateUrls(projectId: string, path: string) {
  path = cachePath(path);
  for (const [key, entry] of fileUrls) {
    const entryPath = cachePath(entry.path);
    if (entry.projectId === projectId && (entryPath === path || entryPath.startsWith(`${path}/`))) fileUrls.delete(key);
  }
}

export default function useWorkspaceFiles(projectId?: MaybeRefOrGetter<string | undefined>) {
  const workspace = projectId === undefined ? useWorkspaceStore() : undefined;
  function getProjectId() {
    const id = projectId === undefined ? workspace?.project?.id : toValue(projectId);
    if (!id) throw new Error("请先选择项目");
    return id;
  }

  async function list(path = "") {
    const { data } = await api.get<{ data: { projectId: string; empty: boolean; entries: WorkspaceEntry[] } }>("/workspaces/files/list", { params: { projectId: getProjectId(), path } });
    return data.data;
  }

  async function read(path: string) {
    const { data } = await api.get<ArrayBuffer>("/workspaces/files/read", { params: { projectId: getProjectId(), path }, responseType: "arraybuffer" });
    return data;
  }

  function acquireUrl(path: string, mimeType?: string) {
    const projectId = getProjectId();
    const key = JSON.stringify([projectId, path, mimeType]);
    let entry = fileUrls.get(key);
    if (!entry) {
      const url = api.get<Blob>("/workspaces/files/read", { params: { projectId, path }, responseType: "blob" })
        .then(({ data }) => URL.createObjectURL(mimeType ? new Blob([data], { type: mimeType }) : data));
      entry = { projectId, path, url, users: 0 };
      fileUrls.set(key, entry);
      const current = entry;
      void url.catch(() => { if (fileUrls.get(key) === current) fileUrls.delete(key); });
    }
    const current = entry;
    current.users++;
    let released = false;
    return {
      url: current.url,
      release() {
        if (released) return;
        released = true;
        if (--current.users) return;
        if (fileUrls.get(key) === current) fileUrls.delete(key);
        void current.url.then(url => URL.revokeObjectURL(url), () => {});
      },
    };
  }

  async function readText(path: string, maxBytes?: number) {
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) throw new Error("读取字节数必须为正整数");
    try {
      const { data } = await api.get<string>("/workspaces/files/read", {
        params: { projectId: getProjectId(), path }, responseType: "text", transformResponse: [],
        headers: maxBytes === undefined ? undefined : { Range: `bytes=0-${maxBytes - 1}` },
      });
      return data;
    } catch (error) {
      if (maxBytes !== undefined && axios.isAxiosError(error) && error.response?.status === 416 && error.response.headers["content-range"] === "bytes */0") return "";
      throw error;
    }
  }

  async function readJson<T = unknown>(path: string): Promise<T> {
    return JSON.parse(await readText(path));
  }

  async function write(path: string, content: string | Blob | ArrayBuffer, exclusive = false, signal?: AbortSignal) {
    const projectId = getProjectId();
    await api.put("/workspaces/files/write", content, { params: { projectId, path, exclusive }, signal, headers: { "Content-Type": "application/octet-stream" } });
    invalidateUrls(projectId, path);
  }

  function writeJson(path: string, data: unknown, exclusive = false) {
    return write(path, `${JSON.stringify(data, null, 2)}\n`, exclusive);
  }

  async function rename(path: string, target: string) {
    const projectId = getProjectId();
    await api.post("/workspaces/files/rename", { projectId, path, target });
    invalidateUrls(projectId, path);
    invalidateUrls(projectId, target);
  }

  async function remove(path: string, recursive = false) {
    const projectId = getProjectId();
    await api.delete("/workspaces/files/remove", { data: { projectId, path, recursive } });
    invalidateUrls(projectId, path);
  }

  async function mkdir(path: string) {
    await api.post("/workspaces/files/mkdir", { projectId: getProjectId(), path });
  }

  return { list, read, acquireUrl, readText, readJson, write, writeJson, rename, remove, mkdir };
}
