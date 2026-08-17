import { normalizeProject } from "./project";
import type { Project } from "./types";

const STORAGE_KEY = "sequencer.project.v1";

export function saveProjectToStorage(project: Project) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // Storage can be full or blocked; autosave is a convenience, not a contract.
  }
}

export function loadProjectFromStorage(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}
