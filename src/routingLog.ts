import { appendFile } from "fs/promises";
import { join } from "path";
import * as os from "os";

/**
 * Routing observability (backlog A1/A2).
 *
 * Two event kinds are appended to a JSONL log, gated by `enableDebugMode`:
 *  - `router`: one per user turn — what the keyword router matched and what it did.
 *  - `tool`:   one per `use_workflow` call — which workflow the model loaded itself.
 *
 * `summarizeRoutingLog` aggregates the log so we can measure tool-path vs router-path
 * usage (A2) — i.e. how often a 12B actually invokes the tool vs relying on the backstop.
 */

export type RoutingEvent =
  | {
      ts: string;
      kind: "router";
      /** Skill matched by triggers this turn, or null. */
      matched: string | null;
      action: "injected" | "deduped" | "disabled" | "no-match";
      /** Truncated user message for context (local-only log). */
      promptPreview: string;
    }
  | {
      ts: string;
      kind: "tool";
      /** Workflow the model loaded via the use_workflow tool. */
      workflow: string;
    };

type RoutingEventInput =
  | Omit<Extract<RoutingEvent, { kind: "router" }>, "ts">
  | Omit<Extract<RoutingEvent, { kind: "tool" }>, "ts">;

export function getRoutingLogPath(): string {
  return join(os.homedir(), ".beledarians-llm-toolbox", "routing-log.jsonl");
}

/**
 * Append one event as a JSONL line. No-op when `enabled` is false. Never throws —
 * logging must not break the request path.
 */
export async function appendRoutingEvent(enabled: boolean, event: RoutingEventInput): Promise<void> {
  if (!enabled) return;
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
    await appendFile(getRoutingLogPath(), line, "utf-8");
  } catch {
    // Observability is best-effort; swallow any I/O error.
  }
}

export interface RoutingSummary {
  totalEvents: number;
  routerTurns: number;
  toolCalls: number;
  router: { injected: number; deduped: number; disabled: number; noMatch: number };
  /** Workflows loaded via the code-side router (matched & injected). */
  byWorkflowRouter: Record<string, number>;
  /** Workflows loaded via the model calling use_workflow. */
  byWorkflowTool: Record<string, number>;
  parseErrors: number;
}

export function summarizeRoutingLog(jsonl: string): RoutingSummary {
  const summary: RoutingSummary = {
    totalEvents: 0,
    routerTurns: 0,
    toolCalls: 0,
    router: { injected: 0, deduped: 0, disabled: 0, noMatch: 0 },
    byWorkflowRouter: {},
    byWorkflowTool: {},
    parseErrors: 0,
  };

  for (const raw of jsonl.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      summary.parseErrors++;
      continue;
    }
    summary.totalEvents++;
    if (e.kind === "tool") {
      summary.toolCalls++;
      if (e.workflow) summary.byWorkflowTool[e.workflow] = (summary.byWorkflowTool[e.workflow] ?? 0) + 1;
    } else if (e.kind === "router") {
      summary.routerTurns++;
      switch (e.action) {
        case "injected":
          summary.router.injected++;
          if (e.matched) summary.byWorkflowRouter[e.matched] = (summary.byWorkflowRouter[e.matched] ?? 0) + 1;
          break;
        case "deduped":
          summary.router.deduped++;
          break;
        case "disabled":
          summary.router.disabled++;
          break;
        default:
          summary.router.noMatch++;
      }
    }
  }
  return summary;
}
