// Minimal OpenAI-compatible client for the behavioral eval (B1). No deps — Node 18+ fetch.
const { buildWorkflowToolResult } = require("../dist/skills.js");
const { isTestFile, evaluateTddGuardrail } = require("../dist/guardrails.js");

// LM Studio servers can require a Bearer token. Set EVAL_API_KEY (or OPENAI_API_KEY) to send it.
const API_KEY = process.env.EVAL_API_KEY || process.env.OPENAI_API_KEY || "";
function authHeaders(extra = {}) {
  return API_KEY ? { ...extra, Authorization: `Bearer ${API_KEY}` } : extra;
}

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
    const data = await fetchJson(`${baseUrl}/models`, { method: "GET", headers: authHeaders() }, 4000);
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

// Stub tools the model can 'act' with. Read tools serve from an in-memory sandbox (B8) so
// explain/debug cases have real files to read instead of hallucinating.
const STUB_TOOLS = [
  { type: "function", function: { name: "save_file", description: "Create or overwrite a file.", parameters: { type: "object", properties: { file_name: { type: "string" }, content: { type: "string" } }, required: ["file_name"] } } },
  { type: "function", function: { name: "run_test_command", description: "Run the test suite.", parameters: { type: "object", properties: { command: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "list_directory", description: "List files in the project.", parameters: { type: "object", properties: { path: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "read_file", description: "Read a file's contents.", parameters: { type: "object", properties: { file_name: { type: "string" } }, required: ["file_name"] } } },
  { type: "function", function: { name: "search_directory", description: "Search files for a pattern.", parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] } } },
];

// A small but realistic project so the model can actually explore instead of inventing one.
const DEFAULT_SANDBOX = {
  "package.json": '{\n  "name": "widget-store",\n  "scripts": { "start": "node src/index.js", "test": "node --test" },\n  "dependencies": { "express": "^4.18.0" }\n}\n',
  "README.md": "# Widget Store\n\nA small Express API for managing widgets (list, add, remove).\n",
  "src/index.js": "const express = require('express');\nconst { widgetRouter } = require('./routes/widgets');\nconst app = express();\napp.use(express.json());\napp.use('/widgets', widgetRouter);\napp.listen(3000, () => console.log('up on 3000'));\n",
  "src/routes/widgets.js": "const { Router } = require('express');\nconst { getWidgets, addWidget } = require('../db');\nconst widgetRouter = Router();\nwidgetRouter.get('/', (req, res) => res.json(getWidgets()));\nwidgetRouter.post('/', (req, res) => { addWidget(req.body); res.status(201).end(); });\nmodule.exports = { widgetRouter };\n",
  "src/db.js": "// in-memory widget store\nlet widgets = [];\nfunction getWidgets() { return widgets; }\nfunction addWidget(w) { widgets.push(w); }\nmodule.exports = { getWidgets, addWidget };\n",
};

// Stateful per conversation: tracks the active workflow + whether a test has been written/run, so the
// D1 TDD guardrail can be exercised. opts: { guardrailMode: "off"|"warn"|"block", ambientWorkflow }.
function makeStubExecutor(skills, opts = {}) {
  const mode = opts.guardrailMode || "off";
  let activeWorkflow = opts.ambientWorkflow || null;
  let testSeen = false;
  const sandbox = { ...(opts.sandbox || DEFAULT_SANDBOX) }; // per-executor copy so writes don't leak
  return async (name, args) => {
    if (name === "use_workflow") {
      activeWorkflow = args.workflow;
      if (args.workflow === "tdd") testSeen = false;
      const skill = skills.find(s => s.name === args.workflow);
      if (!skill) return JSON.stringify({ error: `unknown workflow '${args.workflow}'` });
      return JSON.stringify(buildWorkflowToolResult(skill));
    }
    if (name === "run_test_command") {
      testSeen = true;
      return JSON.stringify({ ok: true, output: "ran 1 test, 1 failed (expected — no implementation yet)" });
    }
    if (name === "list_directory") {
      return JSON.stringify({ files: Object.keys(sandbox) });
    }
    if (name === "read_file") {
      const fn = args.file_name || "";
      return JSON.stringify(fn in sandbox ? { content: sandbox[fn] } : { error: `not found: ${fn}` });
    }
    if (name === "search_directory") {
      const pat = String(args.pattern || "");
      const hits = [];
      for (const [f, content] of Object.entries(sandbox)) {
        content.split("\n").forEach((line, i) => {
          if (pat && line.includes(pat)) hits.push({ file: f, line: i + 1, text: line.trim() });
        });
      }
      return JSON.stringify({ matches: hits.slice(0, 25) });
    }
    if (name === "save_file") {
      const fileName = args.file_name || (Array.isArray(args.files) && args.files[0] && args.files[0].file_name) || "";
      if (isTestFile(fileName)) testSeen = true;
      const g = evaluateTddGuardrail({ active: activeWorkflow, testSeen, fileName, mode });
      if (g.block) return JSON.stringify({ blocked: true, error: g.warning });
      if (fileName) sandbox[fileName] = args.content || "";
      return JSON.stringify(g.warning ? { ok: true, warning: g.warning } : { ok: true });
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
        headers: authHeaders({ "Content-Type": "application/json" }),
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

// Single completion, no tools — used by the adherence judge. Longer default timeout: a 12B reading a
// long trajectory + procedure can be slow, and a timeout here must not be mistaken for non-adherence.
async function chatOnce({ baseUrl, model, messages, temperature = 0, timeoutMs = 300000 }) {
  const data = await fetchJson(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ model, messages, temperature, stream: false, max_tokens: 800 }),
    },
    timeoutMs,
  );
  return data?.choices?.[0]?.message?.content || "";
}

// Embeddings via the OpenAI-compatible endpoint (for the semantic router, C1). Returns an array of
// vectors, or null if the endpoint has no embedding model (graceful — semantic routing just skips).
async function embed(baseUrl, model, texts) {
  try {
    const data = await fetchJson(
      `${baseUrl}/embeddings`,
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ model, input: texts }),
      },
      60000,
    );
    const vecs = (data?.data || []).map(d => d.embedding);
    return vecs.length ? vecs : null;
  } catch {
    return null;
  }
}

// Diagnostic: probe the embeddings endpoint and return the actual reason on failure (instead of the
// silent null embed() returns), so the runner can tell the user exactly what's wrong.
async function probeEmbeddings(baseUrl, model) {
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ model, input: "test" }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const j = await res.json();
    const dim = j?.data?.[0]?.embedding?.length;
    return dim ? { ok: true, dim } : { ok: false, error: "no embedding array in response" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { probeEndpoint, runConversation, makeStubExecutor, chatOnce, embed, probeEmbeddings, USE_WORKFLOW_TOOL, STUB_TOOLS };
