import { join } from "path";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { os } from "os";

export interface ProjectState {
  projectDirectory: string | null;
  currentWorkingDirectory: string | null;
  uiLanguageOverride: string | null;
  lastInjectedWorkflow: string | null;
  turnsSinceWorkflowInject: number;
  workflowNoMatchStreak: number;
  subAgentDocsInjected: boolean;
  stateMap: Record<string, any>; // Generic state storage
  currentPlanRef: string | null; // Path to the current PLAN.md
}

export async function getPersistedState(defaultWorkspacePath: string): Promise<ProjectState> {
  const toolboxHome = join(os.homedir(), ".beledarians-llm-toolbox");
  const statePath = join(toolboxHome, ".beledarians-llm-toolbox_state.json");

  try {
    const content = await readFile(statePath, "utf-8");
    return JSON.parse(content);
  } catch {
    const initialState: ProjectState = {
      projectDirectory: defaultWorkspacePath || null,
      currentWorkingDirectory: defaultWorkspacePath || null,
      uiLanguageOverride: null,
      lastInjectedWorkflow: null,
      turnsSinceWorkflowInject: 0,
      workflowNoMatchStreak: 0,
      subAgentDocsInjected: false,
      stateMap: {},
      currentPlanRef: null,
    };
    await savePersistedState(initialState);
    return initialState;
  }
}

export async function savePersistedState(state: ProjectState): Promise<void> {
  const toolboxHome = join(os.homedir(), ".beledarians-llm-toolbox");
  const statePath = join(toolboxHome, ".beledarians-llm-toolbox_state.json");
  
  // Ensure directory exists
  await mkdir(dirname(statePath), { recursive: true });
  
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Helper to resolve the path to the memory file based on the current project context.
 * This is used by the memory system to ensure memories are isolated per project.
 */
export function resolveMemoryPath(memoryScope: string, projectDirectory: string | null, toolboxHome: string): string {
  if (!projectDirectory) return join(toolboxHome, "global_memory.json");
  
  const projectMemoryDir = join(toolboxHome, "memories", projectDirectory.replace(/\\/g, "_"));
  return join(projectMemoryDir, "memory.json");
}
