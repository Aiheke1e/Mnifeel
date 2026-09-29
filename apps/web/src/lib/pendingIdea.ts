const pendingIdeaKey = "minifeelPendingIdea";

export function readPendingIdea() {
  return sessionStorage.getItem(pendingIdeaKey)?.trim() ?? "";
}

export function savePendingIdea(idea: string) {
  sessionStorage.setItem(pendingIdeaKey, idea.trim());
}

export function clearPendingIdea() {
  sessionStorage.removeItem(pendingIdeaKey);
}
