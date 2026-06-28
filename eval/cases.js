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
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "research-tool", mode: "tool", workflow: "research", announce: "Research",
    prompt: "What's the currently recommended way to persist auth tokens in a desktop Electron app?",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "explain-tool", mode: "tool", workflow: "explaining-code", announce: "Code Explanation",
    prompt: "Give me an overview of how this project is put together and where the important logic lives.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "verify-tool", mode: "tool", workflow: "verification", announce: "Verification Before Completion",
    prompt: "I think I'm finished with the feature — can you confirm everything actually works before I move on?",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "finish-tool", mode: "tool", workflow: "finishing-a-branch", announce: "Finishing a Branch",
    prompt: "I'm happy with the change. Let's wrap it up and get it into the main branch.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },

  // --- router mode: body pre-injected → does it announce and take the right first step? ---
  { id: "tdd-router", mode: "router", workflow: "tdd", announce: "Test-Driven Development",
    prompt: "I need a small utility that turns a byte count into a human-readable size string (KB/MB/GB).",
    checks: ["announce", "adherence"] },
  { id: "brainstorm-router", mode: "router", workflow: "brainstorming", announce: "Brainstorming",
    prompt: "I'm toying with the idea of adding a plugin marketplace to the app. Where would we even start?",
    checks: ["announce", "adherence"] },
  { id: "dbg-router", mode: "router", workflow: "debugging", announce: "Systematic Debugging",
    prompt: "A bunch of tests started blowing up right after I bumped the date library to the new major version.",
    checks: ["announce", "adherence"] },
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

  // --- more tool-mode cases (broader intent coverage; phrasings avoid the triggers) ---
  { id: "tdd-tool", mode: "tool", workflow: "tdd", announce: "Test-Driven Development",
    prompt: "I want a rate limiter for the API client — go ahead and build it out for me.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "review-request-tool", mode: "tool", workflow: "requesting-code-review", announce: "Requesting Code Review",
    prompt: "Could you have someone look over my changes and tell me whether they're solid before I merge?",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "review-receive-tool", mode: "tool", workflow: "receiving-code-review", announce: "Receiving Code Review",
    prompt: "The reviewer left a bunch of notes on my PR — help me work through each one.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "plan-exec-tool", mode: "tool", workflow: "executing-a-plan", announce: "Executing a Written Plan",
    prompt: "We already wrote the plan down. Let's start working through it one task at a time.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "plans-tool", mode: "tool", workflow: "writing-plans", announce: "Writing Plans",
    prompt: "The spec is signed off. Map out the implementation as an ordered set of steps before we touch code.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },

  // --- more router-mode cases (body pre-injected → announce + first-step adherence) ---
  { id: "verify-router", mode: "router", workflow: "verification", announce: "Verification Before Completion",
    prompt: "Before I tell the team it's shipped, make sure the whole thing actually passes.",
    checks: ["announce", "adherence"] },
  { id: "finish-router", mode: "router", workflow: "finishing-a-branch", announce: "Finishing a Branch",
    prompt: "Everything's reviewed and green. Take it from here and get it merged.",
    checks: ["announce", "adherence"] },
  { id: "research-router", mode: "router", workflow: "research", announce: "Research",
    prompt: "Figure out which testing framework the React community is standardizing on these days.",
    checks: ["announce", "adherence"] },
  { id: "explain-router", mode: "router", workflow: "explaining-code", announce: "Code Explanation",
    prompt: "Help me get my head around how the request-routing layer in this repo actually flows.",
    checks: ["announce", "adherence"] },
  { id: "review-request-router", mode: "router", workflow: "requesting-code-review", announce: "Requesting Code Review",
    prompt: "The implementation's complete — get it reviewed for correctness and quality before we ship.",
    checks: ["announce", "adherence"] },

  // --- precedence: prompts that match two skills; the higher-priority gate must win (C2) ---
  { id: "prec-verify-over-finish", mode: "tool", workflow: "verification", announce: "Verification Before Completion",
    prompt: "Is the feature done? Ready to merge the branch once it is.",
    checks: ["workflowLoaded"] },
  { id: "prec-brainstorm-over-tdd", mode: "tool", workflow: "brainstorming", announce: "Brainstorming",
    prompt: "Let's build a CSV exporter function for the reports page.",
    checks: ["workflowLoaded"] },

  // --- more benign negatives (false-positive hunting) ---
  { id: "benign-greeting", mode: "tool", workflow: null,
    prompt: "Morning! How's it going today?",
    checks: ["noWorkflow"] },
  { id: "benign-open-file", mode: "tool", workflow: null,
    prompt: "Open up the config file for me.",
    checks: ["noWorkflow"] },
  { id: "benign-opinion", mode: "tool", workflow: null,
    prompt: "Out of curiosity, do you prefer tabs or spaces?",
    checks: ["noWorkflow"] },
  { id: "benign-cd", mode: "tool", workflow: null,
    prompt: "Switch over to the src directory.",
    checks: ["noWorkflow"] },
];

module.exports = { CASES };
