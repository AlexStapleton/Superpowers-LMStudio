// Adherence judge (backlog B7). Asks a model to grade whether the agent's trajectory followed the
// workflow procedure — replacing the brittle text-regex firstStep heuristic. Judge model defaults to
// the eval model; override with EVAL_JUDGE_MODEL.
const { buildJudgePrompt, parseJudgeVerdict, majorityVerdict } = require("../dist/evalAnalysis.js");
const { chatOnce } = require("./client.js");

// EVAL_JUDGE_VOTES > 1 hardens the noisiest link (Gemma-judges-Gemma) via majority vote.
const VOTES = Math.max(1, parseInt(process.env.EVAL_JUDGE_VOTES || "1", 10));

async function singleJudge({ baseUrl, model, messages }) {
  let lastErr;
  let convo = messages;
  // Up to 3 attempts. A small judge usually DID decide in prose but never emitted the verdict line —
  // so on an unparseable reply we feed its own answer back and demand ONLY the line. This converts
  // most "unparseable" (the biggest source of thrown-away adherence signal) into a real verdict.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await chatOnce({ baseUrl, model, messages: convo, temperature: 0 });
      const verdict = parseJudgeVerdict(text);
      if (!verdict.error) return verdict;
      convo = [
        ...messages,
        { role: "assistant", content: String(text).slice(0, 800) },
        { role: "user", content: 'Based on your analysis, reply with EXACTLY ONE line and nothing else: "VERDICT: PASS" or "VERDICT: FAIL".' },
      ];
    } catch (e) {
      lastErr = e;
    }
  }
  // error: true so the runner can EXCLUDE this from the adherence rate (a judge/infra failure is not
  // a "did not follow" verdict).
  return { pass: false, error: true, reason: lastErr ? `judge error: ${lastErr.message}` : "unparseable judge response" };
}

async function judgeAdherence({ baseUrl, model, procedure, prompt, trajectory }) {
  const messages = [{ role: "user", content: buildJudgePrompt(procedure, prompt, trajectory) }];
  if (VOTES === 1) return singleJudge({ baseUrl, model, messages });
  const verdicts = [];
  for (let v = 0; v < VOTES; v++) verdicts.push(await singleJudge({ baseUrl, model, messages }));
  return majorityVerdict(verdicts);
}

module.exports = { judgeAdherence };
