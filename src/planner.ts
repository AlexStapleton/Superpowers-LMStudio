import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { mkdir } from "fs/promises";

/**
 * Represents a single task in a decomposed plan.
 */
export interface PlanTask {
  id: string;
  description: string;
  files: string[];
  step: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

/**
 * The main planner class for decomposing high-level goals into actionable tasks.
 */
export class Planner {
  /**
   * Decomposes a high-level goal into a structured list of tasks.
   * This is the core of the "Building a Plan" architecture.
   */
  async decomposeGoal(goal: string): Promise<PlanTask[]> {
    // In a production environment, this would call an LLM with a specific system prompt
    // designed for goal decomposition and DAG construction.
    // For now, we provide a mock implementation that can be swapped with a real call.
    
    return [
      {
        id: "1",
        description: "Analyze codebase and identify core components",
        files: [],
        step: "Write a discovery script to map project structure",
        status: "pending",
      },
      {
        id: "2",
        description: "Establish data models and schemas",
        files: ["src/models.ts", "src/types.ts"],
        step: "Write failing test for model validation",
        status: "pending",
      },
      {
        id: "3",
        description: "Implement core business logic",
        files: ["src/services/core.ts", "src/services/auth.ts"],
        step: "Write minimal implementation of service logic",
        status: "pending",
      },
      {
        id: "4",
        description: "Integration testing and verification",
        files: ["tests/integration.test.ts"],
        step: "Run integration test suite",
        status: "pending",
      },
    ];
  }

  /**
   * Persists the plan to a Markdown file in the project workspace.
   */
  async savePlan(goal: string, tasks: PlanTask[]): Promise<string> {
    const date = new Date().toISOString().split("T")[0];
    const featureName = goal.split(" ")[0].replace(/[^a-zA-Z0-9]/g, "");
    const planPath = `docs/superpowers/plans/${date}-${featureName}.md`;
    
    const planContent = `
# ${featureName} Implementation Plan
> **For agentic workers:** Use subagent-driven or inline execution to implement task-by-task. Steps use checkbox (- [ ]) syntax.
**Goal:** ${goal}
**Architecture:** Decomposition via Planner.
**Tech Stack:** Node.js, LM Studio SDK, Markdown-based Plan Persistence.
---
${tasks.map(t => `- [ ] ${t.id}: ${t.description} (Files: ${t.files.join(", ")})`).join("\n")}
    `;

    await mkdir(join(process.cwd(), "docs", "superpowers", "plans"), { recursive: true });
    await writeFile(planPath, planContent, "utf-8");
    
    return planPath;
  }
}

export const planner = new Planner();
