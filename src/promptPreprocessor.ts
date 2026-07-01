import {
  text,
  type Chat,
  type ChatMessage,
  type FileHandle,
  type LLMDynamicHandle,
  type PredictionProcessStatusController,
  type PromptPreprocessorController,
} from "@lmstudio/sdk";
import * as os from "os";
import { readFile, writeFile, mkdir, access, stat } from "fs/promises";
import { dirname, join, resolve } from "path";
import { pluginConfigSchematics } from "./config";
import { TOOLS_DOCUMENTATION, TOOLS_DOCUMENTATION_LITE } from "./toolsDocumentation";
import { getPersistedState, savePersistedState } from "./stateManager";
import { getDict } from "./locales/i18n";
import { loadSkillsCached, getSkillsDirCandidates, renderDispatcherCompact, matchTriggers, decideWorkflowInjection, type InjectionAction, type Skill } from "./skills";
import { appendRoutingEvent } from "./routingLog";
import { semanticMatch, buildEmbeddingText, QUERY_PREFIX, DOC_PREFIX, type SkillEmbedding } from "./semanticRouter";
import { parseProjectCommand, resolveMemoryPath, type MemoryScope } from "./projectBoundary";
import { parseMemory, serializeMemory, renderForInjection, upsertMemory, stringSimilarityMatch, extractRememberDirective, inferMemoryType, type MemoryEntry } from "./memory";
import { buildProtectedGlobs, isProtectedPath } from "./protectedPaths";

// Cache of skill embeddings (recomputed only when the skill set changes). C1 semantic router.
let cachedSkillEmbeddings: { key: string; embeddings: SkillEmbedding[] } | null = null;

// Embedding fallback: when the keyword triggers miss, match the message to a workflow by meaning.
async function semanticRoute(
  ctl: PromptPreprocessorController,
  skills: Skill[],
  userPrompt: string,
  threshold: number,
  margin: number,
  modelId: string,
): Promise<string | null> {
  try {
    const model = await ctl.client.embedding.model(modelId, { signal: ctl.abortSignal });
    // Key on the actual embed text + model, not just names — so a hot-reloaded description/examples
    // (G2) or a changed embedding model busts the cache instead of serving stale vectors.
    const key = [modelId, ...skills.map(s => s.name + " :: " + buildEmbeddingText(s))].join(" || ");
    if (!cachedSkillEmbeddings || cachedSkillEmbeddings.key !== key) {
      const embs = await model.embed(skills.map(s => DOC_PREFIX + buildEmbeddingText(s)));
      cachedSkillEmbeddings = { key, embeddings: skills.map((s, i) => ({ name: s.name, vector: embs[i].embedding })) };
    }
    const [q] = await model.embed([QUERY_PREFIX + userPrompt]);
    const hit = semanticMatch(q.embedding, cachedSkillEmbeddings.embeddings, threshold, margin);
    return hit ? hit.name : null;
  } catch (e) {
    ctl.debug("Semantic router unavailable; falling back to keyword-only.", e);
    return null;
  }
}

type DocumentContextInjectionStrategy = "none" | "inject-full-content" | "retrieval";

/**
 * Ambient current date (D3). A 12B won't reliably call get_current_datetime, so any time-relative
 * question ("when is the NEXT…", "the LATEST…", "is X out yet") is unanswerable — it has no anchor for
 * "now". Injecting the date every turn is deterministic and ~8 tokens. Uses LOCAL date (the plugin runs
 * on the user's machine); local construction + local getters make it timezone-stable in tests.
 */
export function currentDateLine(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `Today's date is ${y}-${m}-${d}.`;
}

/**
 * Delegation-hint selector (bugfix). The hint must only appear when the secondary-agent tools are
 * actually registered — they're gated on `enableSecondaryAgent`, so hinting while the feature is OFF
 * (the default) nudges a 12B toward a capability it doesn't have: wasted tokens + confused half-turns.
 * Pure + testable. Returns "" when delegation is disabled or no frequency matches.
 */
export function buildDelegationHint(
  enableSecondaryAgent: boolean,
  frequency: string,
  debugMode: boolean,
  rt: {
    delegationHintAlways: string;
    delegationHintWhenUseful: string;
    delegationHintWhenUsefulDebug: string;
    delegationHintHardTasks: string;
  },
): string {
  if (!enableSecondaryAgent) return "";
  if (frequency === "always") return rt.delegationHintAlways;
  if (frequency === "when_useful") return rt.delegationHintWhenUseful + (debugMode ? rt.delegationHintWhenUsefulDebug : "");
  if (frequency === "hard_tasks") return rt.delegationHintHardTasks;
  return "";
}

export function getSubAgentDocsCandidatePaths(currentWorkingDirectory: string): string[] {
  return [
    join(dirname(__dirname), "subagent_docs.md"),
    join(dirname(__dirname), "instructions", "subagent_docs.md"),
    join(currentWorkingDirectory, "instructions", "subagent_docs.md"),
    join(currentWorkingDirectory, "subagent_docs.md"),
  ];
}

/**
 * Deterministic /project command handling. The state change happens entirely in code here — the
 * model's only job (via the returned instruction string) is to echo a one-line confirmation, the
 * lowest-risk task for a 12B. .plugin_state.json is the single source of truth other callers re-read.
 */
async function handleProjectCommand(
  ctl: PromptPreprocessorController,
  cmd: { kind: "set"; path: string } | { kind: "clear" } | { kind: "show" },
  defaultWorkspacePath: string,
  memoryScope: MemoryScope,
  protectedPathsConfig: string,
): Promise<string> {
  const toolboxHome = join(os.homedir(), ".beledarians-llm-toolbox");
  const state = await getPersistedState(defaultWorkspacePath);

  if (cmd.kind === "show") {
    const mp = resolveMemoryPath(memoryScope, state.projectDirectory ?? null, toolboxHome);
    const proj = state.projectDirectory ?? "(none — open reads, global memory)";
    try { ctl.createStatus({ status: "done", text: `Project: ${proj} — memory: ${mp}` }); } catch { /* best-effort */ }
    return `Tell the user, briefly: the active project directory is ${proj} and memories are stored at ${mp}.`;
  }

  if (cmd.kind === "clear") {
    state.projectDirectory = null;
    await savePersistedState(state);
    try { ctl.createStatus({ status: "done", text: "Project cleared — open reads, global memory" }); } catch { /* best-effort */ }
    return "Tell the user, briefly: the project directory has been cleared; reads are open and memory is global now.";
  }

  // set
  const resolved = resolve(state.currentWorkingDirectory, cmd.path);
  const protectedGlobs = buildProtectedGlobs(protectedPathsConfig);
  if (isProtectedPath(resolved, protectedGlobs)) {
    return `Tell the user the path '${resolved}' is a protected location and cannot be used as a project directory.`;
  }
  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) return `Tell the user that '${resolved}' is not a directory, so the project was not changed.`;
  } catch {
    return `Tell the user that the directory '${resolved}' was not found, so the project was not changed.`;
  }
  state.projectDirectory = resolved;
  state.currentWorkingDirectory = resolved;
  await savePersistedState(state);
  const mp = resolveMemoryPath(memoryScope, resolved, toolboxHome);
  try {
    await mkdir(dirname(mp), { recursive: true });
    await access(mp).catch(async () => { await writeFile(mp, "# Memory\n", "utf-8"); });
  } catch { /* best-effort */ }
  try { ctl.createStatus({ status: "done", text: `Project set to ${resolved} — memory: ${mp}` }); } catch { /* best-effort */ }
  return `Tell the user, briefly: the project directory is now ${resolved}; reads are confined there and memories are saved at ${mp}.`;
}

/**
 * Deterministic memory capture. When the user explicitly states a fact to remember ("remember that…",
 * "note that…"), CODE writes it — no reliance on the 12B deciding to call the `remember` tool (which it
 * does unreliably, and the call can leak on the chat template). Returns a short ack note to prepend so
 * the model confirms; null when nothing was captured. Dedup uses string similarity (no embedding call
 * on the hot path). Mirrors the /project command's "code acts, model just acknowledges" pattern.
 */
async function autoCaptureMemory(
  ctl: PromptPreprocessorController,
  userPrompt: string,
  defaultWorkspacePath: string,
  memoryScope: MemoryScope,
  enableMemory: boolean,
): Promise<string | null> {
  if (!enableMemory) return null;
  const fact = extractRememberDirective(userPrompt);
  if (!fact) return null;
  try {
    const toolboxHome = join(os.homedir(), ".beledarians-llm-toolbox");
    const state = await getPersistedState(defaultWorkspacePath);
    const memPath = resolveMemoryPath(memoryScope, state.projectDirectory ?? null, toolboxHome);
    let parsed = { preamble: "", entries: [] as MemoryEntry[] };
    try { parsed = parseMemory(await readFile(memPath, "utf-8")); } catch { /* missing = empty */ }
    const matchId = stringSimilarityMatch(fact, parsed.entries);
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { next, action } = upsertMemory(parsed, { fact, type: inferMemoryType(fact), date, matchId: matchId ?? undefined });
    await mkdir(dirname(memPath), { recursive: true });
    await writeFile(memPath, serializeMemory(next), "utf-8");
    try { ctl.createStatus({ status: "done", text: `Memory ${action}: ${fact}` }); } catch { /* best-effort */ }
    return `[Memory ${action} — you saved: "${fact}". Acknowledge this to the user in one short sentence.]`;
  } catch (e) {
    ctl.debug("Auto memory capture failed.", e);
    return null;
  }
}

export async function promptPreprocessor(ctl: PromptPreprocessorController, userMessage: ChatMessage) {
  const userPrompt = userMessage.getText();

  // /project command: deterministic, no model involvement in the state change. Intercepted before any
  // history/RAG processing so it never depends on document context or workflow routing.
  const earlyConfig = ctl.getPluginConfig(pluginConfigSchematics);
  const projCmd = parseProjectCommand(userPrompt);
  if (projCmd.kind !== "none") {
    return await handleProjectCommand(
      ctl,
      projCmd,
      earlyConfig.get("defaultWorkspacePath"),
      (earlyConfig.get("memoryScope") as MemoryScope) || "auto",
      earlyConfig.get("protectedPaths"),
    );
  }

  // Deterministic memory capture for explicit "remember that…" phrasing (writes now; model just acks).
  const memoryEnabled = earlyConfig.get("enableMemory");
  const autoMemNote = await autoCaptureMemory(
    ctl,
    userPrompt,
    earlyConfig.get("defaultWorkspacePath"),
    (earlyConfig.get("memoryScope") as MemoryScope) || "auto",
    memoryEnabled,
  );

  // 1. RAG / Context Injection Logic
  const history = await ctl.pullHistory();

  // Check if this is the first turn (history is empty) before appending
  let isFirstTurn = false;
  if (Array.isArray(history)) {
    isFirstTurn = history.length === 0;
  } else if ("messages" in history && Array.isArray((history as any).messages)) {
    isFirstTurn = (history as any).messages.length === 0;
  } else if ("length" in history && typeof (history as any).length === "number") {
    isFirstTurn = (history as any).length === 0;
  } else {
    // Fallback: If we can't verify, we default to assuming it's the first turn 
    // to ensure docs are loaded at least once, but this may cause the "always load" issue
    // if the object structure is unexpected. 
    // However, moving this check before append() makes it much more likely to be correct.
    isFirstTurn = true; 
  }

  history.append(userMessage);
  
  const newFiles = userMessage.getFiles(ctl.client).filter(f => f.type !== "image");
  const files = history.getAllFiles(ctl.client).filter(f => f.type !== "image");

  let processingResult: string | ChatMessage | null = null;

  if (newFiles.length > 0) {
    const strategy = await chooseContextInjectionStrategy(ctl, userPrompt, newFiles);
    if (strategy === "inject-full-content") {
      processingResult = await prepareDocumentContextInjection(ctl, userMessage);
    } else if (strategy === "retrieval") {
      processingResult = await prepareRetrievalResultsContextInjection(ctl, userPrompt, files);
    }
  } else if (files.length > 0) {
    processingResult = await prepareRetrievalResultsContextInjection(ctl, userPrompt, files);
  }

  // Determine the current content after RAG processing
  let currentContent: string;
  if (processingResult) {
      if (typeof processingResult === 'string') {
          currentContent = processingResult;
      } else {
          // It's a ChatMessage
          currentContent = processingResult.getText();
      }
  } else {
      currentContent = userPrompt;
  }

  // --- Per-Turn Setup ---
  const pluginConfig = ctl.getPluginConfig(pluginConfigSchematics);
  const defaultWorkspacePath = pluginConfig.get("defaultWorkspacePath");
  const frequency = pluginConfig.get("subAgentFrequency");
  const debugMode = pluginConfig.get("enableDebugMode");

  // Layer 2: resolve runtime dictionary from user-selected language
  const messageLanguage = pluginConfig.get("messageLanguage");
  const rt = getDict(messageLanguage).runtime;

  // Load state once — reused by i18n persist, sub-agent docs, and first-turn injection below
  const state = await getPersistedState(defaultWorkspacePath);

  // Persist uiLanguageOverride to state file so i18n.ts can read it synchronously on next boot.
  const uiLanguageOverride = pluginConfig.get("uiLanguageOverride");
  try {
    if (state.uiLanguageOverride !== uiLanguageOverride) {
      state.uiLanguageOverride = uiLanguageOverride;
      await savePersistedState(state);
      ctl.debug(`[i18n] uiLanguageOverride saved: "${uiLanguageOverride}". Restart the plugin to apply the new UI language.`);
    }
  } catch (e) {
    ctl.debug("[i18n] Failed to persist uiLanguageOverride.", e);
  }

  // --- Workflow Dispatcher (Every Turn) ---
  // Inject the live dispatcher table built from the skill registry, fixing the prior
  // "dangling pointer" where the reminder referenced a table only present on turn 1.
  const skillCandidates = getSkillsDirCandidates(dirname(__dirname), state.currentWorkingDirectory);
  const skills = await loadSkillsCached(skillCandidates);
  if (skills.length > 0) {
    // --- Code-side router backstop: keyword + semantic fallback (C1); observability A1/A2 ---
    // Decide routing FIRST so the dispatcher form can adapt (E1): when we auto-load a workflow body,
    // the full table is redundant noise that invites small-model overthinking.
    const routerEnabled = pluginConfig.get("enableWorkflowRouter");
    const keywordMatch = matchTriggers(skills, userPrompt);
    let routedName: string | null = keywordMatch;
    let routedVia: "keyword" | "semantic" | "none" = keywordMatch ? "keyword" : "none";
    if (!routedName && routerEnabled && pluginConfig.get("enableSemanticRouter")) {
      const threshold = parseFloat(pluginConfig.get("semanticRouterThreshold")) || 0.35;
      const margin = parseFloat(pluginConfig.get("semanticRouterMargin")) || 0.05;
      const embeddingModelId = pluginConfig.get("embeddingModelId") || "nomic-ai/nomic-embed-text-v1.5-GGUF";
      const semName = await semanticRoute(ctl, skills, userPrompt, threshold, margin, embeddingModelId);
      if (semName) { routedName = semName; routedVia = "semantic"; }
    }

    let routerAction: InjectionAction | "disabled";
    let bodyInjected = false;
    if (!routerEnabled) {
      routerAction = "disabled";
    } else {
      // Re-inject the active procedure every N turns so it doesn't scroll out of context (C4).
      const reinjectInterval = parseInt(pluginConfig.get("workflowReinjectInterval"), 10);
      const stickyTurns = parseInt(pluginConfig.get("workflowStickyTurns"), 10);
      const decision = decideWorkflowInjection(
        routedName,
        {
          lastInjectedWorkflow: state.lastInjectedWorkflow,
          turnsSinceWorkflowInject: state.turnsSinceWorkflowInject,
          noMatchStreak: state.workflowNoMatchStreak,
        },
        Number.isFinite(reinjectInterval) ? reinjectInterval : 4,
        Number.isFinite(stickyTurns) ? stickyTurns : 3,
      );
      routerAction = decision.action;
      if (decision.action === "injected" || decision.action === "reinjected") {
        const skill = skills.find(s => s.name === decision.nextState.lastInjectedWorkflow);
        if (skill) {
          currentContent = `[Workflow auto-loaded — follow this procedure now]\n${skill.body}\n\n` + currentContent;
          bodyInjected = true;
          // Surface the announcement deterministically rather than relying on the small model to narrate
          // it (a 12B frequently acts silently). The user sees which workflow is active regardless.
          try {
            ctl.createStatus({ status: "done", text: `Using ${skill.announce} —` });
          } catch (e) {
            ctl.debug("Failed to surface workflow announce status.", e);
          }
        }
      }
      if (
        decision.nextState.lastInjectedWorkflow !== state.lastInjectedWorkflow ||
        decision.nextState.turnsSinceWorkflowInject !== state.turnsSinceWorkflowInject ||
        decision.nextState.noMatchStreak !== state.workflowNoMatchStreak
      ) {
        state.lastInjectedWorkflow = decision.nextState.lastInjectedWorkflow;
        state.turnsSinceWorkflowInject = decision.nextState.turnsSinceWorkflowInject;
        state.workflowNoMatchStreak = decision.nextState.noMatchStreak;
        await savePersistedState(state);
      }
    }

    // --- Workflow Dispatcher (Every Turn) ---
    // When a body was auto-loaded, a one-liner suffices — the procedure is already in context, and the
    // full table here only invites second-guessing. Otherwise inject the compact list so the model can
    // still self-route via use_workflow. (Fixes the prior "dangling pointer" + cuts per-turn tokens.)
    const dispatcher = bodyInjected
      ? "[Workflow routing — a matching workflow procedure has been loaded above; follow it. Do NOT search files for it.]\n\n"
      : "[Workflow routing — this is inline guidance, NOT a task. The list is right here; do "
        + "NOT search files or directories for it.] If the user's request matches one of the "
        + "workflows below, FIRST call the `use_workflow` tool with that workflow name and "
        + "follow what it returns, opening your reply with \"Using <workflow> —\". If nothing "
        + "clearly matches (simple commands like cd, questions, small edits), ignore this entirely "
        + "and just respond normally.\n\n"
        + renderDispatcherCompact(skills) + "\n\n";
    currentContent = dispatcher + currentContent;

    await appendRoutingEvent(pluginConfig.get("enableRoutingLog"), {
      kind: "router",
      matched: routedName,
      via: routedVia,
      action: routerAction,
      promptPreview: userPrompt.slice(0, 200),
    });
  }

  // --- Plan Mode & Delegation Hints (Every Turn) ---
  const planMode = pluginConfig.get("planMode");

  let planHint = "";
  if (planMode === "always") {
      planHint = rt.planHintAlways;
  } else if (planMode === "when_useful") {
      planHint = rt.planHintWhenUseful;
  }

  // Gate on enableSecondaryAgent: the delegation tools are only registered when it's on, so the hint
  // must be too — otherwise we nudge the model toward a tool it doesn't have.
  const delegationHint = buildDelegationHint(
    pluginConfig.get("enableSecondaryAgent"), frequency, debugMode, rt,
  );

  if (delegationHint) {
      currentContent += delegationHint;
  }
  if (planHint) {
      currentContent += planHint;
  }

  // --- Sub-Agent Documentation Injection (Startup OR On-Enable) ---
  const enableSecondary = pluginConfig.get("enableSecondaryAgent");

  // Reset the injection flag on the first turn of a new conversation
  if (isFirstTurn) {
      state.subAgentDocsInjected = false;
      await savePersistedState(state);
  }

  if (enableSecondary && !state.subAgentDocsInjected) {
      const { currentWorkingDirectory } = state;
      const candidatePaths = getSubAgentDocsCandidatePaths(currentWorkingDirectory);

      let docsInjected = false;
      for (const subAgentDocsPath of candidatePaths) {
          try {
              const docsContent = await readFile(subAgentDocsPath, "utf-8");
              if (docsContent && docsContent.trim().length > 0) {
                  // Prepend or Append? Append to ensure it's fresh context.
                  currentContent += `\n\n---\n\n${docsContent}\n\n---\n\n`;
                  ctl.debug(`subagent_docs.md injected into context from: ${subAgentDocsPath}`);

                  // Update state so we don't inject again for this session/workspace
                  state.subAgentDocsInjected = true;
                  await savePersistedState(state);
                  docsInjected = true;
                  break;
              }
          } catch (e) {
              // Keep trying fallback paths.
          }
      }

      if (!docsInjected) {
          ctl.debug("subagent_docs.md not found or failed to load from plugin/workspace paths. Skipping injection.");
      }
  }

  // 2. Tools Documentation & Memory Injection (Startup Only)
  if (isFirstTurn) {
    const simpleSystemPrompt = pluginConfig.get("simpleSystemPrompt");
    let injectionContent = simpleSystemPrompt ? TOOLS_DOCUMENTATION_LITE : TOOLS_DOCUMENTATION;

    try {
        const { currentWorkingDirectory } = state;
        const candidateStartupPaths = [
            join(currentWorkingDirectory, ".beledarian", "startup.md"),
            join(currentWorkingDirectory, "instructions", "startup.md"),
            join(currentWorkingDirectory, "startup.md"),
        ];

        let startupContent = "";
        let usedStartupPath = "";
        for (const startupPath of candidateStartupPaths) {
            try {
                startupContent = await readFile(startupPath, "utf-8");
                usedStartupPath = dirname(startupPath);
                ctl.debug(`startup.md loaded from: ${startupPath}`);
                break;
            } catch (e) {
                // Keep trying
            }
        }

        if (startupContent) {
            const filesToRead = startupContent.split('\n').map(f => f.trim()).filter(f => f);

            for (const file of filesToRead) {
                // Try relative to startup.md folder first, then relative to CWD
                const candidateFilePaths = [
                    join(usedStartupPath, file),
                    join(currentWorkingDirectory, file),
                ];

                let loaded = false;
                for (const filePath of candidateFilePaths) {
                    try {
                        const fileContent = await readFile(filePath, "utf-8");
                        if (fileContent.trim().length > 0) {
                            injectionContent = `\n\n---\n\n${fileContent}\n\n---\n\n${injectionContent}`;
                            ctl.debug(`${file} loaded and injected into context from ${filePath}.`);
                            loaded = true;
                            break;
                        }
                    } catch (e) {
                        // Keep trying
                    }
                }
                if (!loaded) {
                    ctl.debug(`Failed to load ${file} from startup.md.`);
                }
            }
        }
    } catch (e) {
        ctl.debug("No startup.md file found or failed to load.");
    }

    // Deterministic always-on memory recall (code-owned memory.md), replacing reliance on
    // startup.md → memory.md (which read from a CWD that could drift across projects).
    try {
      const memScope = (pluginConfig.get("memoryScope") as MemoryScope) || "auto";
      const home = join(os.homedir(), ".beledarians-llm-toolbox");
      const memPath = resolveMemoryPath(memScope, state.projectDirectory ?? null, home);
      const memRaw = await readFile(memPath, "utf-8");
      const rendered = renderForInjection(parseMemory(memRaw), { maxChars: 4000 });
      if (rendered) injectionContent = `${rendered}\n\n---\n\n${injectionContent}`;
    } catch (e) {
      ctl.debug("No memory file to inject or failed to load.");
    }

    currentContent = `${injectionContent}\n\n---\n\n${currentContent}`;
  }

  // Soft nudge (when memory is on): guide the model to save INFERRED durable facts via the `remember`
  // tool. Explicit "remember that…" is already captured deterministically above; this covers the rest.
  // Clarifies that `remember` is NOT limited to user-stated facts — tool-usage conventions the user has
  // approved are valid too — while keeping the guard against autonomously banking unconfirmed guesses.
  if (memoryEnabled) {
    currentContent += "\n\n[Memory is ON. Use the `remember` tool to save any durable fact worth keeping across conversations — about the user (name, role, location, language), a lasting preference (answer length/style, tools to use or avoid), a project rule, or a tool-usage convention the user has approved (e.g. \"always X before Y\"). `remember` accepts any such fact, not only ones the user explicitly stated; but only save conventions the user has confirmed — never bank unconfirmed guesses. Skip ephemeral task details and anything already in the code.]";
  }

  // Ambient date (D3) + active project (if pinned): prepend on EVERY turn so the model can anchor
  // "next/latest/current" questions and always knows its read/write boundary. Done last so it lands
  // at the very top of the assembled context. The auto-capture ack (if any) rides at the very top so
  // the model reliably confirms the save.
  let ambientPrefix = currentDateLine(new Date());
  if (state.projectDirectory) ambientPrefix += `\nActive project: ${state.projectDirectory}`;
  if (autoMemNote) ambientPrefix += `\n${autoMemNote}`;
  currentContent = ambientPrefix + "\n\n" + currentContent;

  // Return the final content string if it changed, otherwise the original message
  // (The SDK expects a string to replace content, or the message object)
  if (currentContent !== userPrompt) {
      return currentContent;
  }

  // Update message count and memory
  try {
    state.messageCount++;
    await savePersistedState(state);

    // Auto-summary disabled due to SDK type mismatch
    // if (state.messageCount % 10 === 0) { ... }
  } catch (e) {
    ctl.debug("Failed to update message count or memory.", e);
  }
  
  return userMessage;
}

async function prepareRetrievalResultsContextInjection(
  ctl: PromptPreprocessorController,
  originalUserPrompt: string,
  files: Array<FileHandle>,
): Promise<string> {
  const pluginConfig = ctl.getPluginConfig(pluginConfigSchematics);
  const retrievalLimit = pluginConfig.get("retrievalLimit");
  const retrievalAffinityThreshold = pluginConfig.get("retrievalAffinityThreshold");

  // process files if necessary

  const statusSteps = new Map<FileHandle, PredictionProcessStatusController>();

  // Layer 2: resolve runtime dict for status messages
  const rtRetrieve = getDict(
    ctl.getPluginConfig(pluginConfigSchematics).get("messageLanguage")
  ).runtime;

  const retrievingStatus = ctl.createStatus({
    status: "loading",
    text: rtRetrieve.statusLoadingEmbeddingModel,
  });
  const model = await ctl.client.embedding.model(
    pluginConfig.get("embeddingModelId") || "nomic-ai/nomic-embed-text-v1.5-GGUF",
    { signal: ctl.abortSignal },
  );
  retrievingStatus.setState({
    status: "loading",
    text: rtRetrieve.statusRetrievingCitations,
  });
  const result = await ctl.client.files.retrieve(originalUserPrompt, files, {
    embeddingModel: model,
    // Affinity threshold: 0.6 not implemented in SDK retrieve options directly usually, 
    // but we filter below.
    limit: retrievalLimit,
    signal: ctl.abortSignal,
    onFileProcessList(filesToProcess) {
      for (const file of filesToProcess) {
        statusSteps.set(
          file,
          retrievingStatus.addSubStatus({
            status: "waiting",
            text: `Process ${file.name} for retrieval`,
          }),
        );
      }
    },
    onFileProcessingStart(file) {
      statusSteps
        .get(file)!
        .setState({ status: "loading", text: `Processing ${file.name} for retrieval` });
    },
    onFileProcessingEnd(file) {
      statusSteps
        .get(file)!
        .setState({ status: "done", text: `Processed ${file.name} for retrieval` });
    },
    onFileProcessingStepProgress(file, step, progressInStep) {
      const verb = step === "loading" ? "Loading" : step === "chunking" ? "Chunking" : "Embedding";
      statusSteps.get(file)!.setState({
        status: "loading",
        text: `${verb} ${file.name} for retrieval (${(progressInStep * 100).toFixed(1)}%)`,
      });
    },
  });

  result.entries = result.entries.filter(entry => entry.score > retrievalAffinityThreshold);

  // inject retrieval result into the "processed" content
  let processedContent = "";
  const numRetrievals = result.entries.length;
  if (numRetrievals > 0) {
    // retrieval occured and got results
    // show status
    retrievingStatus.setState({
      status: "done",
      text: rtRetrieve.statusRetrievedCitations(numRetrievals),
    });
    ctl.debug("Retrieval results", result);
    // add results to prompt
    processedContent += rtRetrieve.citationPrefix;
    let citationNumber = 1;
    result.entries.forEach(result => {
      const completeText = result.content;
      processedContent += rtRetrieve.citationEntry(citationNumber, completeText);
      citationNumber++;
    });
    await ctl.addCitations(result);
    processedContent += rtRetrieve.citationSuffix(originalUserPrompt);
  } else {
    // retrieval occured but no relevant citations found
    retrievingStatus.setState({
      status: "canceled",
      text: rtRetrieve.statusNoRelevantCitations,
    });
    ctl.debug("No relevant citations found for user query");
    processedContent =
      rtRetrieve.noRelevantCitationsNote + `\n\nUser Query:\n\n${originalUserPrompt}`;
  }
  ctl.debug("Processed content", processedContent);

  return processedContent;
}

async function prepareDocumentContextInjection(
  ctl: PromptPreprocessorController,
  input: ChatMessage,
): Promise<ChatMessage> {
  const documentInjectionSnippets: Map<FileHandle, string> = new Map();
  const files = input.consumeFiles(ctl.client, file => file.type !== "image");
  for (const file of files) {
    // This should take no time as the result is already in the cache
    const { content } = await ctl.client.files.parseDocument(file, {
      signal: ctl.abortSignal,
    });

    ctl.debug(text`
      Strategy: inject-full-content. Injecting full content of file '${file}' into the
      context. Length: ${content.length}.
    `);
    documentInjectionSnippets.set(file, content);
  }

  let formattedFinalUserPrompt = "";

  // Layer 2: resolve runtime dict for document injection strings
  const rtDoc = getDict(
    ctl.getPluginConfig(pluginConfigSchematics).get("messageLanguage")
  ).runtime;

  if (documentInjectionSnippets.size > 0) {
    formattedFinalUserPrompt += rtDoc.documentInjectionHeader;

    for (const [fileHandle, snippet] of documentInjectionSnippets) {
      formattedFinalUserPrompt += rtDoc.documentInjectionFileBlock(fileHandle.name, snippet);
    }

    formattedFinalUserPrompt += rtDoc.documentInjectionSuffix(input.getText());
  }

  input.replaceText(formattedFinalUserPrompt);
  return input;
}

async function measureContextWindow(ctx: Chat, model: LLMDynamicHandle) {
  const currentContextFormatted = await model.applyPromptTemplate(ctx);
  const totalTokensInContext = await model.countTokens(currentContextFormatted);
  const modelContextLength = await model.getContextLength();
  const modelRemainingContextLength = modelContextLength - totalTokensInContext;
  const contextOccupiedPercent = (totalTokensInContext / modelContextLength) * 100;
  return {
    totalTokensInContext,
    modelContextLength,
    modelRemainingContextLength,
    contextOccupiedPercent,
  };
}

async function chooseContextInjectionStrategy(
  ctl: PromptPreprocessorController,
  originalUserPrompt: string,
  files: Array<FileHandle>,
): Promise<DocumentContextInjectionStrategy> {
  // Layer 2: runtime dict for strategy-choice status messages
  const rtStrategy = getDict(
    ctl.getPluginConfig(pluginConfigSchematics).get("messageLanguage")
  ).runtime;

  const status = ctl.createStatus({
    status: "loading",
    text: rtStrategy.statusDecidingStrategy,
  });

  const model = await ctl.client.llm.model();
  const ctx = await ctl.pullHistory();

  // Measure the context window
  const {
    totalTokensInContext,
    modelContextLength,
    modelRemainingContextLength,
    contextOccupiedPercent,
  } = await measureContextWindow(ctx, model);

  ctl.debug(
    `Context measurement result:\n\n` +
      `\tTotal tokens in context: ${totalTokensInContext}\n` +
      `\tModel context length: ${modelContextLength}\n` +
      `\tModel remaining context length: ${modelRemainingContextLength}\n` +
      `\tContext occupied percent: ${contextOccupiedPercent.toFixed(2)}%\n`,
  );

  // Get token count of provided files
  let totalFileTokenCount = 0;
  let totalReadTime = 0;
  let totalTokenizeTime = 0;
  for (const file of files) {
    const startTime = performance.now();

    const loadingStatus = status.addSubStatus({
      status: "loading",
      text: rtStrategy.statusLoadingParser(file.name),
    });
    let actionProgressing = "Reading";
    let parserIndicator = "";

    const { content } = await ctl.client.files.parseDocument(file, {
      signal: ctl.abortSignal,
      onParserLoaded: parser => {
        loadingStatus.setState({
          status: "loading",
          text: `${parser.library} loaded for ${file.name}...`,
        });
        if (parser.library !== "builtIn") {
          actionProgressing = "Parsing";
          parserIndicator = ` with ${parser.library}`;
        }
      },
      onProgress: progress => {
        loadingStatus.setState({
          status: "loading",
          text: `${actionProgressing} file ${file.name}${parserIndicator}... (${(
            progress * 100
          ).toFixed(2)}%)`,
        });
      },
    });
    loadingStatus.remove();

    totalReadTime += performance.now() - startTime;

    // tokenize file content
    const startTokenizeTime = performance.now();
    totalFileTokenCount += await model.countTokens(content);
    totalTokenizeTime += performance.now() - startTokenizeTime;
    if (totalFileTokenCount > modelRemainingContextLength) {
      break;
    }
  }
  ctl.debug(`Total file read time: ${totalReadTime.toFixed(2)} ms`);
  ctl.debug(`Total tokenize time: ${totalTokenizeTime.toFixed(2)} ms`);

  // Calculate total token count of files + user prompt
  ctl.debug(`Original User Prompt: ${originalUserPrompt}`);
  const userPromptTokenCount = (await model.tokenize(originalUserPrompt)).length;
  const totalFilePlusPromptTokenCount = totalFileTokenCount + userPromptTokenCount;

  // Calculate the available context tokens
  const contextOccupiedFraction = contextOccupiedPercent / 100;
  const targetContextUsePercent = 0.7;
  const targetContextUsage = targetContextUsePercent * (1 - contextOccupiedFraction);
  const availableContextTokens = Math.floor(modelRemainingContextLength * targetContextUsage);

  // Debug log
  ctl.debug("Strategy Calculation:");
  ctl.debug(`\tTotal Tokens in All Files: ${totalFileTokenCount}`);
  ctl.debug(`\tTotal Tokens in User Prompt: ${userPromptTokenCount}`);
  ctl.debug(`\tModel Context Remaining: ${modelRemainingContextLength} tokens`);
  ctl.debug(`\tContext Occupied: ${contextOccupiedPercent.toFixed(2)}%`);
  ctl.debug(`\tAvailable Tokens: ${availableContextTokens}\n`);

  if (totalFilePlusPromptTokenCount > availableContextTokens) {
    const chosenStrategy = "retrieval";
    ctl.debug(
      `Chosen context injection strategy: '${chosenStrategy}'. Total file + prompt token count: ` +
        `${totalFilePlusPromptTokenCount} > ${
          targetContextUsage * 100
        }% * available context tokens: ${availableContextTokens}`,
    );
    status.setState({
      status: "done",
      text: rtStrategy.statusStrategyChosen(chosenStrategy, "Retrieval is optimal for the size of content provided"),
    });
    return chosenStrategy;
  }

  const chosenStrategy = "inject-full-content";
  status.setState({
    status: "done",
    text: rtStrategy.statusStrategyChosen(chosenStrategy, "All content can fit into the context"),
  });
  return chosenStrategy;
}
