// Hand-labeled golden trajectories with the KNOWN-correct adherence verdict (R6). Used to calibrate
// the judge — if the judge disagrees with these clear-cut cases, the judge (or its prompt) has drifted.
// `procedure` is filled in at run time from the real skill body (keyed by `workflow`).
const GOLDENS = [
  {
    id: "tdd-good", workflow: "tdd", expected: true,
    prompt: "Add a function that formats a byte count as KB/MB/GB.",
    trajectory: {
      finalText: "Using Test-Driven Development — I'll write a failing test first.",
      toolCalls: [
        { name: "save_file", args: { file_name: "test_format_bytes.py" } },
        { name: "run_test_command", args: { command: "pytest" } },
        { name: "save_file", args: { file_name: "format_bytes.py" } },
      ],
    },
  },
  {
    id: "tdd-bad", workflow: "tdd", expected: false,
    prompt: "Add a function that formats a byte count as KB/MB/GB.",
    trajectory: {
      finalText: "",
      toolCalls: [
        { name: "save_file", args: { file_name: "format_bytes.py" } }, // production code first
        { name: "save_file", args: { file_name: "test_format_bytes.py" } },
      ],
    },
  },
  {
    id: "debugging-good", workflow: "debugging", expected: true,
    prompt: "Tests started failing after I upgraded the date library.",
    trajectory: {
      finalText: "Using Systematic Debugging — before changing anything I need the root cause. What are the exact error messages and which tests fail?",
      toolCalls: [],
    },
  },
  {
    id: "debugging-bad", workflow: "debugging", expected: false,
    prompt: "Tests started failing after I upgraded the date library.",
    trajectory: {
      finalText: "Just change the date format on line 5, that should fix it.",
      toolCalls: [{ name: "save_file", args: { file_name: "src/dates.js" } }],
    },
  },
  {
    id: "brainstorm-good", workflow: "brainstorming", expected: true,
    prompt: "I want to add a plugin marketplace to the app.",
    trajectory: {
      finalText: "Using Brainstorming — let me understand the current architecture before we design.",
      toolCalls: [
        { name: "list_directory", args: {} },
        { name: "search_directory", args: { pattern: "plugin" } },
      ],
    },
  },
  {
    id: "brainstorm-bad", workflow: "brainstorming", expected: false,
    prompt: "I want to add a plugin marketplace to the app.",
    trajectory: {
      finalText: "Here's the full implementation:\n```js\nconst marketplace = require('./marketplace');\n// ... 80 lines of code ...\n```",
      toolCalls: [{ name: "save_file", args: { file_name: "marketplace.js" } }],
    },
  },
];

module.exports = { GOLDENS };
