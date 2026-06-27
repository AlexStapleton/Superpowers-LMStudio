// Adherence judge (backlog B7). Asks a model to grade whether the agent's trajectory followed the
// workflow procedure — replacing the brittle text-regex firstStep heuristic. Judge model defaults to
// the eval model; override with EVAL_JUDGE_MODEL.
const { buildJudgePrompt, parseJudgeVerdict } = require("../dist/evalAnalysis.js");
const { chatOnce } = require("./client.js");

async function judgeAdherence({ baseUrl, model, procedure, prompt, trajectory }) {
  const judgePrompt = buildJudgePrompt(procedure, prompt, trajectory);
  const messages = [{ role: "user", content: judgePrompt }];
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await chatOnce({ baseUrl, model, messages, temperature: 0 });
      return parseJudgeVerdict(text);
    } catch (e) {
      lastErr = e;
    }
  }
  return { pass: false, reason: `judge error: ${lastErr ? lastErr.message : "unknown"}` };
}

module.exports = { judgeAdherence };
