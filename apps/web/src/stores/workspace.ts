import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/lib/api";

export type Project = {
  id: string;
  name: string;
  updatedAt: string;
};

type ApiResponse<T> = { code: number; data: T; message: string };

export const useWorkspaceStore = defineStore("workspace", () => {
  const project = ref<Project | null>(null);
  const projectList = ref<Project[]>([]);
  const pendingAgentMessage = ref<{ projectId: string; prompt: string; model: string; reasoningEffort: string } | null>(null);

  async function loadProjects(signal?: AbortSignal) {
    const { data } = await api.get<ApiResponse<Project[]>>("/projects/list", { signal });
    signal?.throwIfAborted();
    projectList.value = data.data;
    project.value = data.data.find(item => item.id === project.value?.id) ?? null;
  }

  async function createProject(name: string, signal?: AbortSignal) {
    const { data } = await api.post<ApiResponse<Project>>("/projects/create", { name }, { signal });
    signal?.throwIfAborted();
    pendingAgentMessage.value = null;
    project.value = data.data;
    projectList.value = [data.data, ...projectList.value.filter(item => item.id !== data.data.id)];
    return data.data;
  }

  async function openProject(projectId: string, signal?: AbortSignal) {
    const { data } = await api.get<ApiResponse<Project>>("/workspaces/check", { params: { projectId }, signal });
    signal?.throwIfAborted();
    pendingAgentMessage.value = null;
    project.value = data.data;
    projectList.value = [data.data, ...projectList.value.filter(item => item.id !== data.data.id)];
  }

  async function renameProject(projectId: string, name: string) {
    name = name.trim();
    if (!name) return;
    const { data } = await api.put<ApiResponse<Project>>("/projects/update", { projectId, name });
    projectList.value = projectList.value.map(item => item.id === projectId ? data.data : item);
    if (project.value?.id === projectId) project.value = data.data;
  }

  async function removeProject(projectId: string) {
    await api.post("/projects/archive", { projectId });
    projectList.value = projectList.value.filter(item => item.id !== projectId);
    if (project.value?.id === projectId) project.value = null;
  }

  return { project, projectList, pendingAgentMessage, loadProjects, createProject, openProject, renameProject, removeProject };
}, {
  persist: {
    key: "minifeel.projectList",
    pick: ["project", "projectList"],
  },
});
