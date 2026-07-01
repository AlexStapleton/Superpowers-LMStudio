import { createConfigSchematics } from "@lmstudio/sdk";
import { getSystemDict } from "./locales/i18n";

// ─────────────────────────────────────────────────────────────
// Layer 1: Detect system locale once at plugin boot.
// The dictionary is loaded synchronously here so that
// withConfigSchematics() — which can only be called once — uses
// the correct translated strings immediately.
// ─────────────────────────────────────────────────────────────
const { dict: t, resolvedLocale } = getSystemDict();
const c = t.config;

export const pluginConfigSchematics = createConfigSchematics()
  // ── Layer 2: Message Language (dynamic runtime language selector) ──────────
  .field("messageLanguage", "string", {
    displayName: c.messageLanguage.displayName,
    subtitle: c.messageLanguage.subtitle,
  }, resolvedLocale)

  // ── UI Language Override (persisted; takes effect on next restart) ──────────
  .field("uiLanguageOverride", "string", {
    displayName: c.uiLanguageOverride.displayName,
    subtitle: c.uiLanguageOverride.subtitle,
  }, "auto")

  // ── Planning ───────────────────────────────────────────────────────────────
  .field("planMode", "string", {
    displayName: c.planMode.displayName,
    subtitle: c.planMode.subtitle,
  }, "when_useful")

  // ── Retrieval ──────────────────────────────────────────────────────────────
  .field("retrievalLimit", "numeric", {
    int: true,
    min: 1,
    displayName: c.retrievalLimit.displayName,
    subtitle: c.retrievalLimit.subtitle,
    slider: { min: 1, max: 10, step: 1 },
  }, 3)
  .field("retrievalAffinityThreshold", "numeric", {
    min: 0.0,
    max: 1.0,
    displayName: c.retrievalAffinityThreshold.displayName,
    subtitle: c.retrievalAffinityThreshold.subtitle,
    slider: { min: 0.0, max: 1.0, step: 0.01 },
  }, 0.5)

  // ── Execution Permissions ──────────────────────────────────────────────────
  .field("allowJavascriptExecution", "boolean", {
    displayName: c.allowJavascriptExecution.displayName,
    subtitle: c.allowJavascriptExecution.subtitle,
  }, false)
  .field("allowPythonExecution", "boolean", {
    displayName: c.allowPythonExecution.displayName,
    subtitle: c.allowPythonExecution.subtitle,
  }, false)
  .field("allowTerminalExecution", "boolean", {
    displayName: c.allowTerminalExecution.displayName,
    subtitle: c.allowTerminalExecution.subtitle,
  }, false)
  .field("allowShellCommandExecution", "boolean", {
    displayName: c.allowShellCommandExecution.displayName,
    subtitle: c.allowShellCommandExecution.subtitle,
  }, false)
  .field("allowBrowserControl", "boolean", {
    displayName: c.allowBrowserControl.displayName,
    subtitle: c.allowBrowserControl.subtitle,
  }, false)
  .field("allowGitOperations", "boolean", {
    displayName: c.allowGitOperations.displayName,
    subtitle: c.allowGitOperations.subtitle,
  }, true)
  .field("allowGitHubTools", "boolean", {
    displayName: c.allowGitHubTools.displayName,
    subtitle: c.allowGitHubTools.subtitle,
  }, true)
  .field("allowDatabaseInspection", "boolean", {
    displayName: c.allowDatabaseInspection.displayName,
    subtitle: c.allowDatabaseInspection.subtitle,
  }, false)
  .field("allowSystemNotifications", "boolean", {
    displayName: c.allowSystemNotifications.displayName,
    subtitle: c.allowSystemNotifications.subtitle,
  }, true)
  .field("allowAllCode", "boolean", {
    displayName: c.allowAllCode.displayName,
    subtitle: c.allowAllCode.subtitle,
  }, false)

  // ── Safety: Protected Paths ─────────────────────────────────────────────────
  .field("protectedPaths", "string", {
    displayName: c.protectedPaths.displayName,
    subtitle: c.protectedPaths.subtitle,
  }, "")

  // ── Search / Embedding ─────────────────────────────────────────────────────
  .field("searchApiKey", "string", {
    displayName: c.searchApiKey.displayName,
    subtitle: c.searchApiKey.subtitle,
  }, "")
  .field("embeddingModel", "string", {
    displayName: c.embeddingModel.displayName,
    subtitle: c.embeddingModel.subtitle,
  }, "nomic-ai/nomic-embed-text-v1.5-GGUF")

  // ── Workspace ──────────────────────────────────────────────────────────────
  .field("defaultWorkspacePath", "string", {
    displayName: c.defaultWorkspacePath.displayName,
    subtitle: c.defaultWorkspacePath.subtitle,
  }, "")

  // ── Features ───────────────────────────────────────────────────────────────
  .field("enableMemory", "boolean", {
    displayName: c.enableMemory.displayName,
    subtitle: c.enableMemory.subtitle,
  }, false)
  .field("enableWikipediaTool", "boolean", {
    displayName: c.enableWikipediaTool.displayName,
    subtitle: c.enableWikipediaTool.subtitle,
  }, true)
  .field("enableLocalRag", "boolean", {
    displayName: c.enableLocalRag.displayName,
    subtitle: c.enableLocalRag.subtitle,
  }, true)

  // ── Secondary Agent ────────────────────────────────────────────────────────
  .field("enableSecondaryAgent", "boolean", {
    displayName: c.enableSecondaryAgent.displayName,
    subtitle: c.enableSecondaryAgent.subtitle,
  }, false)
  .field("useMainModelForSubAgent", "boolean", {
    displayName: c.useMainModelForSubAgent.displayName,
    subtitle: c.useMainModelForSubAgent.subtitle,
  }, true)
  .field("secondaryAgentEndpoint", "string", {
    displayName: c.secondaryAgentEndpoint.displayName,
    subtitle: c.secondaryAgentEndpoint.subtitle,
  }, "http://localhost:1234/v1")
  .field("secondaryModelId", "string", {
    displayName: c.secondaryModelId.displayName,
    subtitle: c.secondaryModelId.subtitle,
  }, "local-model")

  // ── Sub-Agent Configuration ────────────────────────────────────────────────
  .field("subAgentProfiles", "string", {
    displayName: c.subAgentProfiles.displayName,
    subtitle: c.subAgentProfiles.subtitle,
  }, '{"summarizer": "You are a summarization expert. Summarize the content concisely.", "coder": "You are a software engineer. Write efficient and safe code."}')
  .field("subAgentFrequency", "string", {
    displayName: c.subAgentFrequency.displayName,
    subtitle: c.subAgentFrequency.subtitle,
  }, "when_useful")
  .field("subAgentAllowFileSystem", "boolean", {
    displayName: c.subAgentAllowFileSystem.displayName,
    subtitle: c.subAgentAllowFileSystem.subtitle,
  }, true)
  .field("subAgentAllowWeb", "boolean", {
    displayName: c.subAgentAllowWeb.displayName,
    subtitle: c.subAgentAllowWeb.subtitle,
  }, true)
  .field("subAgentAllowCode", "boolean", {
    displayName: c.subAgentAllowCode.displayName,
    subtitle: c.subAgentAllowCode.subtitle,
  }, false)
  .field("subAgentAllowBrowserControl", "boolean", {
    displayName: c.subAgentAllowBrowserControl.displayName,
    subtitle: c.subAgentAllowBrowserControl.subtitle,
  }, false)
  .field("subAgentTimeLimit", "numeric", {
    int: true,
    min: 30,
    max: 3600,
    displayName: c.subAgentTimeLimit.displayName,
    subtitle: c.subAgentTimeLimit.subtitle,
  }, 600)

  // ── Debug / Output ─────────────────────────────────────────────────────────
  .field("enableDebugMode", "boolean", {
    displayName: c.enableDebugMode.displayName,
    subtitle: c.enableDebugMode.subtitle,
  }, false)
  .field("enableSubAgentDebugLogging", "boolean", {
    displayName: c.enableSubAgentDebugLogging.displayName,
    subtitle: c.enableSubAgentDebugLogging.subtitle,
  }, false)
  .field("subAgentAutoSave", "boolean", {
    displayName: c.subAgentAutoSave.displayName,
    subtitle: c.subAgentAutoSave.subtitle,
  }, true)
  .field("showFullCodeOutput", "boolean", {
    displayName: c.showFullCodeOutput.displayName,
    subtitle: c.showFullCodeOutput.subtitle,
  }, false)
  .field("simpleSystemPrompt", "boolean", {
    displayName: c.simpleSystemPrompt.displayName,
    subtitle: c.simpleSystemPrompt.subtitle,
  }, false)
  .field("enableWorkflowRouter", "boolean", {
    displayName: "Auto-load matching workflow",
    subtitle: "When a message clearly matches a workflow (e.g. a bug report), inject that workflow's procedure automatically as a backstop to the use_workflow tool.",
  }, true)
  .field("enableRoutingLog", "boolean", {
    displayName: "Log workflow routing decisions",
    subtitle: "Append each routing decision (matched workflow, router vs use_workflow tool) to ~/.beledarians-llm-toolbox/routing-log.jsonl. View a summary with `npm run routing-stats`.",
  }, false)
  .field("tddGuardrail", "string", {
    displayName: "Workflow code guardrail",
    subtitle: "Code-enforces workflow gates: 'off', 'warn' (save but warn), or 'block' (refuse). When TDD is active, blocks source code before a test exists; when Brainstorming is active, blocks source code during the design phase (docs are fine).",
  }, "block")
  .field("enableSemanticRouter", "boolean", {
    displayName: "Semantic workflow routing",
    subtitle: "When the keyword triggers miss, match the message to a workflow by meaning (embeddings) — catches naturally-phrased requests the keywords can't. Requires the embedding model.",
  }, true)
  .field("semanticRouterThreshold", "string", {
    displayName: "Semantic routing threshold (0–1)",
    subtitle: "Minimum cosine similarity for semantic routing. Higher = stricter / fewer false matches. Default 0.35.",
  }, "0.35")
  .field("semanticRouterMargin", "string", {
    displayName: "Semantic routing confidence margin",
    subtitle: "The best-matching workflow must beat the runner-up by at least this much, or no route (avoids guessing between overlapping workflows). Default 0.05.",
  }, "0.05")
  .field("workflowReinjectInterval", "string", {
    displayName: "Workflow re-injection interval (turns)",
    subtitle: "On a long session the loaded workflow procedure scrolls out of context. Re-inject it after this many turns while the same workflow still matches. 0 = never re-inject. Default 4.",
  }, "4")
  .field("workflowStickyTurns", "string", {
    displayName: "Workflow stickiness (turns)",
    subtitle: "Keep an auto-loaded workflow active for this many follow-up turns that don't re-match a trigger, so a multi-turn task keeps its procedure + code guardrail. 0 = drop it as soon as a turn doesn't match. Default 3.",
  }, "3")
  .field("embeddingModelId", "string", {
    displayName: "Embedding model (semantic routing / RAG)",
    subtitle: "Model identifier used for semantic routing and local RAG. Set this to an embedding model you have loaded in LM Studio (e.g. 'text-embedding-nomic-embed-text-v2-moe'). If it can't load, semantic routing falls back to keyword-only.",
  }, "nomic-ai/nomic-embed-text-v1.5-GGUF")

  // ── Project Directory & Memory ────────────────────────────────────────────
  .field("defaultProjectPath", "string", {
    displayName: "Default Project Directory",
    subtitle: "Optional. A folder to pin as the project root at startup: it becomes a hard read boundary and the anchor for that project's memory.md (.beledarian/memory.md). Supports %ENV% vars. Empty = no boundary, global memory. Override per-session with the /project command or set_project_directory tool.",
  }, "")
  .field("memoryScope", "string", {
    displayName: "Memory Scope",
    subtitle: "Where remembered facts are stored: 'auto' (project file when a project directory is set, else a global file), 'global' (always one shared file), or 'project'. Default 'auto'.",
  }, "auto")
  .field("memoryDedupeThreshold", "string", {
    displayName: "Memory Dedupe Threshold (0–1)",
    subtitle: "When saving a fact, if it is at least this similar (cosine) to an existing memory, that memory is UPDATED instead of adding a duplicate. Higher = stricter. Default 0.85.",
  }, "0.85")
  .field("memoryMaxEntries", "numeric", {
    int: true,
    min: 1,
    displayName: "Memory Soft Cap (entries)",
    subtitle: "Above this many memories, saves still succeed but return a warning suggesting review. No memory is ever silently dropped. Default 100.",
  }, 100)
  .build();
