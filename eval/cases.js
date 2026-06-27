// Held-out behavioral eval cases (backlog B2).
// RULE: phrasings here are deliberately DIFFERENT from the `examples:` in skill frontmatter — they
// test the model's semantic understanding, not the regex triggers. Never copy a trigger example.
//
// mode "tool":   only the dispatcher table is in context → measures whether the model self-invokes
//                use_workflow (+ announces).
// mode "router": the workflow body is pre-injected (simulating the code router) → measures announce
//                + first-step adherence.

const CASES = [
  // --- tool mode: does the model recognize the intent and call use_workflow? ---
  { id: "dbg-tool", mode: "tool", workflow: "debugging", announce: "Systematic Debugging",
    prompt: "The login page silently fails when the password is wrong — nothing happens, no error. Can you sort it out?",
    checks: ["toolInvoked", "announce"] },
  { id: "research-tool", mode: "tool", workflow: "research", announce: "Research",
    prompt: "What's the currently recommended way to persist auth tokens in a desktop Electron app?",
    checks: ["toolInvoked", "announce"] },
  { id: "explain-tool", mode: "tool", workflow: "explaining-code", announce: "Code Explanation",
    prompt: "Give me an overview of how this project is put together and where the important logic lives.",
    checks: ["toolInvoked", "announce"] },
  { id: "verify-tool", mode: "tool", workflow: "verification", announce: "Verification Before Completion",
    prompt: "I think I'm finished with the feature — can you confirm everything actually works before I move on?",
    checks: ["toolInvoked", "announce"] },
  { id: "finish-tool", mode: "tool", workflow: "finishing-a-branch", announce: "Finishing a Branch",
    prompt: "I'm happy with the change. Let's wrap it up and get it into the main branch.",
    checks: ["toolInvoked", "announce"] },

  // --- router mode: body pre-injected → does it announce and take the right first step? ---
  { id: "tdd-router", mode: "router", workflow: "tdd", announce: "Test-Driven Development",
    prompt: "I need a small utility that turns a byte count into a human-readable size string (KB/MB/GB).",
    checks: ["announce", "firstStep"] },
  { id: "brainstorm-router", mode: "router", workflow: "brainstorming", announce: "Brainstorming",
    prompt: "I'm toying with the idea of adding a plugin marketplace to the app. Where would we even start?",
    checks: ["announce", "firstStep"] },
  { id: "dbg-router", mode: "router", workflow: "debugging", announce: "Systematic Debugging",
    prompt: "A bunch of tests started blowing up right after I bumped the date library to the new major version.",
    checks: ["announce", "firstStep"] },
  { id: "plans-router", mode: "router", workflow: "writing-plans", announce: "Writing Plans",
    prompt: "Here's the approved spec — lay out exactly how we'll build it, step by step.",
    checks: ["announce"] },

  // --- benign: must NOT load or announce any workflow ---
  { id: "benign-pwd", mode: "tool", workflow: null,
    prompt: "Which folder am I currently in?",
    checks: ["noWorkflow"] },
  { id: "benign-thanks", mode: "tool", workflow: null,
    prompt: "Thanks, that's everything for now.",
    checks: ["noWorkflow"] },
  { id: "benign-math", mode: "tool", workflow: null,
    prompt: "Quick one — what's 17 times 23?",
    checks: ["noWorkflow"] },
];

module.exports = { CASES };
