const string = { type: "string" };
const strings = { type: "array", items: string };
function object(properties) { return { type: "object", additionalProperties: false, required: Object.keys(properties), properties }; }

export const ASK_SCHEMA = object({ answer: string, evidence: strings, limitations: strings });
export const IMPLEMENT_SCHEMA = object({
  status: { type: "string", enum: ["done", "partial", "blocked"] },
  summary: string, files: strings,
  tasks: { type: "array", items: object({ task: string, status: { type: "string", enum: ["done", "partial", "not_done"] } }) },
  tests: { type: "array", items: object({ command: string, status: { type: "string", enum: ["passed", "failed", "not_run"] }, evidence: string }) },
  openQuestions: strings, risks: strings,
});
export const VERIFY_SCHEMA = object({ results: { type: "array", items: object({
  id: string, status: { type: "string", enum: ["confirmed", "refuted", "unverified"] }, evidence: string,
  confidence: { type: "integer", minimum: 0, maximum: 100 },
}) } });
export const JUDGE_SCHEMA = object({ scores: { type: "array", items: object({
  id: string, score: { type: "number", minimum: 0, maximum: 100 }, evidence: string,
}) } });
export const SCHEMA_PRESETS = { ask: ASK_SCHEMA, implement: IMPLEMENT_SCHEMA, verify: VERIFY_SCHEMA, judge: JUDGE_SCHEMA };
