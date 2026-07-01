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
    checks: ["workflowLoaded", "toolInvoked", "announce", "fetchedSources"] },
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
    // Unambiguous "write this function" task (not "build me a system", which legitimately plans first).
    prompt: "Write a function that validates whether a string is a well-formed email address.",
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
    checks: ["announce", "adherence", "fetchedSources"] },
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

  // --- sub-agent orchestration: did it delegate a self-contained task AND verify independently? ---
  // router mode = procedure pre-injected; we measure the orchestration, not the routing. `delegated`
  // is a soft signal (called consult_secondary_agent); `adherence` is the judge grading it done WELL.
  { id: "subagent-impl-router", mode: "router", workflow: "subagent-driven", announce: "Subagent-Driven Implementation",
    prompt: "Hand the remove-widget endpoint off to a sub-agent to implement, then make sure it actually landed.",
    checks: ["announce", "delegated", "adherence"] },
  { id: "review-dispatch-router", mode: "router", workflow: "requesting-code-review", announce: "Requesting Code Review",
    prompt: "My change is finished — have a sub-agent review it for correctness before we merge.",
    checks: ["announce", "delegated", "adherence"] },
  { id: "parallel-fanout-router", mode: "router", workflow: "parallel-dispatch", announce: "Parallel Agent Dispatch",
    prompt: "These three doc files each need an unrelated update — fan them out so they run independently.",
    checks: ["announce", "delegated", "adherence"] },

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

  // ===================================================================================
  // Corpus expansion (toward DoD3) — added for a broader eval pass. Distinct phrasings.
  // ===================================================================================

  // --- new tool-mode routing cases (more phrasings; fills code-conventions coverage) ---
  { id: "code-conventions-tool", mode: "tool", workflow: "code-conventions", announce: "Code Conventions Check",
    prompt: "Before merging, make this new module follow the existing code conventions and patterns.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "dbg-tool-2", mode: "tool", workflow: "debugging", announce: "Systematic Debugging",
    prompt: "The checkout total comes out wrong whenever a coupon is applied — figure out why.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "research-tool-2", mode: "tool", workflow: "research", announce: "Research",
    prompt: "What's the current best practice for rate-limiting a public REST API?",
    checks: ["workflowLoaded", "toolInvoked", "announce", "fetchedSources"] },
  { id: "review-request-tool-2", mode: "tool", workflow: "requesting-code-review", announce: "Requesting Code Review",
    prompt: "Can you run a code review over my diff before I push it?",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },

  // --- security-hardening (converted from addyosmani/agent-skills; phrasings avoid the triggers) ---
  { id: "security-tool", mode: "tool", workflow: "security-hardening", announce: "Security Hardening",
    prompt: "We're about to accept file uploads and fetch user-supplied URLs on the server — what should I lock down before this ships?",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "security-router", mode: "router", workflow: "security-hardening", announce: "Security Hardening",
    prompt: "This handler keeps user passwords and hands out session cookies — go through it and close any holes an attacker could use.",
    checks: ["announce", "adherence"] },

  // --- code-simplification (converted from addyosmani/agent-skills; phrasings avoid the triggers) ---
  { id: "simplify-tool", mode: "tool", workflow: "code-simplification", announce: "Code Simplification",
    prompt: "This function grew into a deeply nested tangle over time — tidy it up without changing what it does.",
    checks: ["workflowLoaded", "toolInvoked", "announce"] },
  { id: "simplify-router", mode: "router", workflow: "code-simplification", announce: "Code Simplification",
    prompt: "The parser works but it's really hard to follow now — make it more readable while keeping the exact same behavior.",
    checks: ["announce", "adherence"] },

  // --- new router-mode adherence cases (the "evidence-before-conclusion" hard half) ---
  { id: "tdd-router-2", mode: "router", workflow: "tdd", announce: "Test-Driven Development",
    prompt: "I need a debounce utility for the search box.",
    checks: ["announce", "adherence"] },
  { id: "dbg-router-2", mode: "router", workflow: "debugging", announce: "Systematic Debugging",
    prompt: "After bumping the ORM to v3, about half the integration tests throw connection errors.",
    checks: ["announce", "adherence"] },
  { id: "research-router-2", mode: "router", workflow: "research", announce: "Research",
    prompt: "Figure out whether Bun is production-ready enough to replace Node for our API.",
    checks: ["announce", "adherence", "fetchedSources"] },
  { id: "brainstorm-router-2", mode: "router", workflow: "brainstorming", announce: "Brainstorming",
    prompt: "I'm toying with adding real-time collaboration to the editor — where do we even start?",
    checks: ["announce", "adherence"] },
  { id: "verify-router-2", mode: "router", workflow: "verification", announce: "Verification Before Completion",
    prompt: "Before I close out the ticket, double-check the fix actually holds end to end.",
    checks: ["announce", "adherence"] },

  // --- new precedence case: a bug + an implement verb → debugging (gate) must win over tdd ---
  { id: "prec-debug-over-tdd", mode: "tool", workflow: "debugging", announce: "Systematic Debugging",
    prompt: "There's a bug — implement a fix for the null pointer crash.",
    checks: ["workflowLoaded"] },

  // --- new benign negatives ---
  { id: "benign-weather", mode: "tool", workflow: null,
    prompt: "Any idea what the weather's like today?",
    checks: ["noWorkflow"] },
  { id: "benign-unit", mode: "tool", workflow: null,
    prompt: "How many ounces are in a pound?",
    checks: ["noWorkflow"] },
];

module.exports = { CASES };
