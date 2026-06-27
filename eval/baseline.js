// Regression baseline I/O (R5). Pure comparison logic lives in evalAnalysis (CI-tested);
// this just loads/saves the baseline summary and re-exports the comparators.
const fs = require("node:fs");
const { checkRegressions, formatRegressions } = require("../dist/evalAnalysis.js");

function loadBaseline(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function saveBaseline(p, summary) {
  fs.writeFileSync(p, JSON.stringify(summary, null, 2));
}

module.exports = { loadBaseline, saveBaseline, checkRegressions, formatRegressions };
