export type ProjectMode = "guided" | "advanced";

const projectModeKey = "minifeel.projectMode";
const projectModelKey = "minifeel.projectModel";

export function getProjectMode(): ProjectMode {
  return localStorage.getItem(projectModeKey) === "advanced" ? "advanced" : "guided";
}

export function setProjectMode(mode: ProjectMode) {
  localStorage.setItem(projectModeKey, mode);
}

export function getProjectModel(projectId: string) {
  return localStorage.getItem(`${projectModelKey}.${projectId}`) ?? "";
}

export function setProjectModel(projectId: string, model: string) {
  if (model) localStorage.setItem(`${projectModelKey}.${projectId}`, model);
  else localStorage.removeItem(`${projectModelKey}.${projectId}`);
}
