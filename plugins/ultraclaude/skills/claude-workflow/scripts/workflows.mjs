const LENSES = { code: "correctness and maintainability", security: "security and trust boundaries", tests: "missing or ineffective tests", performance: "performance regressions", domain: "domain requirements and edge cases" };
const TYPES = ["claude-review", "crosscheck", "cross-review", "judge-panel"];
const FIELDS = new Set(["workflow", "cwd", "prompt", "lenses", "findings", "claims", "candidates", "rubric", "codexScores", "tier", "model", "effort", "timeoutSec", "maxTurns", "maxBudgetUsd"]);
export function planWorkflow(raw, validate) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Workflow request must be an object.");
  const unknown = Object.keys(raw).filter(key => !FIELDS.has(key));
  if (unknown.length) throw new TypeError(`Unknown workflow fields: ${unknown.join(", ")}`);
  if (!TYPES.includes(raw.workflow)) throw new TypeError(`workflow must be ${TYPES.join(", ")}.`);
  const common = Object.fromEntries(["cwd", "model", "effort", "timeoutSec", "maxTurns", "maxBudgetUsd"].filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
  const node = (prompt, kind, schemaPreset, tier = raw.tier ?? "daily") => ({ ...common, prompt, kind, schemaPreset, tier, mode: "review" });
  let nodes, ids;
  if (raw.workflow === "claude-review") {
    if (typeof raw.prompt !== "string" || !raw.prompt.trim()) throw new TypeError("Review workflow requires a scoped prompt describing the change.");
    const lenses = raw.lenses ?? ["code", "security", "tests"];
    if (!Array.isArray(lenses) || !lenses.length || lenses.length > 5 || new Set(lenses).size !== lenses.length || lenses.some(key => !LENSES[key])) throw new TypeError("Invalid or duplicated review lenses.");
    nodes = lenses.map(lens => ({ label: lens, request: node(`Review this change independently for ${LENSES[lens]}. Cite file/line evidence and uncertainty.\n${raw.prompt}`, "review", "review", raw.tier ?? (lens === "security" ? "final" : "daily")) }));
  } else {
    const items = raw.workflow === "judge-panel" ? raw.candidates : raw.workflow === "cross-review" ? raw.findings : raw.claims;
    if (!Array.isArray(items) || !items.length || items.length > 64 || items.some(item => !item || typeof item.id !== "string" || !item.id.trim()) || new Set(items.map(item => item.id)).size !== items.length) throw new TypeError("Workflow items need unique non-empty string IDs (at most 64 items).");
    ids = items.map(item => item.id);
    if (raw.workflow === "judge-panel" && (typeof raw.rubric !== "string" || !raw.rubric.trim())) throw new TypeError("A judge panel needs an explicit common rubric.");
    const prompt = raw.workflow === "judge-panel" ? `Independently score every candidate from 0 to 100 against this rubric: ${raw.rubric}. Cite evidence.\nCandidates: ${JSON.stringify(items)}` :
      `Independently try to refute every supplied claim or finding. Return exactly one confirmed/refuted/unverified result per supplied ID, with file/line evidence.\n${JSON.stringify(items)}\n${raw.prompt ?? ""}`;
    nodes = [{ label: raw.workflow, request: node(prompt, "verify", raw.workflow === "judge-panel" ? "judge" : "verify") }];
  }
  for (const entry of nodes) validate(entry.request);
  if (raw.codexScores !== undefined) {
    if (raw.workflow !== "judge-panel" || !Array.isArray(raw.codexScores) || raw.codexScores.some(score => !ids.includes(score.id) || !Number.isFinite(score.score) || score.score < 0 || score.score > 100) || new Set(raw.codexScores.map(score => score.id)).size !== raw.codexScores.length) throw new TypeError("Invalid Codex candidate scores.");
  }
  return { workflow: raw.workflow, nodes, ids, codexScores: raw.codexScores ?? [], cwd: validate(nodes[0].request).cwd, mode: "review" };
}

export async function executeWorkflow(raw, validate, execute, dependencies = {}) {
  let plan;
  try { plan = planWorkflow(raw, validate); }
  catch (error) { return { ok: false, error: { kind: "invalid_request", message: error.message, retryable: false } }; }
  const stages = [];
  // A sequential default bounds quota use. Independent stages can be started as separate jobs.
  for (const entry of plan.nodes) {
    if (dependencies.signal?.aborted) return { ok: false, stages, error: { kind: "cancelled", message: "Workflow cancelled.", retryable: false } };
    const result = await execute(entry.request, dependencies);
    if (result.ok && plan.ids) {
      const records = result.output?.results ?? result.output?.scores ?? [];
      const actual = records.map(item => item.id);
      if (actual.length !== plan.ids.length || new Set(actual).size !== actual.length || plan.ids.some(id => !actual.includes(id))) {
        result.ok = false; result.error = { kind: "schema", message: "Workflow response omitted, duplicated, or invented an item ID.", retryable: false };
      }
    }
    stages.push({ label: entry.label, ...result });
  }
  const ok = stages.every(stage => stage.ok);
  const result = { ok, workflow: plan.workflow, stages, requiresCodexSynthesis: true };
  if (!ok) result.error = { kind: "workflow", message: "At least one stage is unverified.", retryable: false };
  if (plan.workflow === "judge-panel") {
    const scores = stages[0]?.ok ? stages[0].output.scores : [];
    result.ranked = plan.ids.flatMap(id => {
      const claude = scores.find(item => item.id === id), codex = plan.codexScores.find(item => item.id === id);
      return claude && codex ? [{ id, claudeScore: claude.score, codexScore: codex.score, score: (claude.score + codex.score) / 2 }] : [];
    }).sort((a, b) => b.score - a.score);
    result.unverifiedCandidates = plan.ids.filter(id => !result.ranked.some(item => item.id === id));
  }
  return result;
}
