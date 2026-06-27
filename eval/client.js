// Minimal OpenAI-compatible client for the behavioral eval (B1). No deps — Node 18+ fetch.
const { buildWorkflowToolResult } = require("../dist/skills.js");

async function fetchJson(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Returns the first model id the endpoint advertises, or null if unreachable.
async function probeEndpoint(baseUrl) {
  try {
    const data = await fetchJson(`${baseUrl}/models`, { method: "GET" }, 4000);
    return data?.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

const USE_WORKFLOW_TOOL = {
  type: "function",
  function: {
    name: "use_workflow",
    description:
      "Load the full procedure for a development workflow. Call this and follow what it returns BEFORE acting on a matching task.",
    parameters: {
      type: "object",
      properties: { workflow: { type: "string", description: "the workflow name to load" } },
      required: ["workflow"],
    },
  },
};

// Inert stubs so the model can 'act' and we can observe ordering without touching disk.
const STUB_TOOLS = [
  { type: "function", function: { name: "save_file", description: "Create or overwrite a file.", parameters: { type: "object", properties: { file_name: { type: "string" }, content: { type: "string" } }, required: ["file_name"] } } },
  { type: "function", function: { name: "run_test_command", description: "Run the test suite.", parameters: { type: "object", properties: { command: { type: "string" } }, required: [] } } },
];

function makeStubExecutor(skills) {
  return async (name, args) => {
    if (name === "use_workflow") {
      const skill = skills.find(s => s.name === args.workflow);
      if (!skill) return JSON.stringify({ error: `unknown workflow '${args.workflow}'` });
      return JSON.stringify(buildWorkflowToolResult(skill));
    }
    return JSON.stringify({ ok: true });
  };
}

// Drives a bounded tool-calling loop. Returns { finalText, toolCalls } in call order.
async function runConversation({ baseUrl, model, messages, tools, executeTool, maxTurns = 4 }) {
  const convo = [...messages];
  const toolCalls = [];
  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const data = await fetchJson(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: convo, tools, temperature: 0.3, stream: false }),
      },
      120000,
    );
    const msg = data?.choices?.[0]?.message;
    if (!msg) break;
    convo.push(msg);
    if (msg.content) finalText += (finalText ? "\n" : "") + msg.content;

    const calls = msg.tool_calls || [];
    if (calls.length === 0) break;
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* leave {} */ }
      toolCalls.push({ name: call.function?.name, args });
      const result = await executeTool(call.function?.name, args);
      convo.push({ role: "tool", tool_call_id: call.id, content: typeof result === "string" ? result : JSON.stringify(result) });
    }
  }
  return { finalText, toolCalls };
}

module.exports = { probeEndpoint, runConversation, makeStubExecutor, USE_WORKFLOW_TOOL, STUB_TOOLS };
