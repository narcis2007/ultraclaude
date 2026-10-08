import { readFileSync } from "node:fs";

export const POLICY_DATE = "2026-10-08";
const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const MODEL_CATALOG = Object.freeze([
  // Claude Code resolves the `haiku` alias to Haiku 5.5 (verified on 2.1.293); 4.5 stays reachable by id.
  { id: "claude-haiku-5-5", aliases: ["haiku"], efforts: ALL_EFFORTS, implicitEffortCap: "medium", minCliVersion: "2.1.293" },
  { id: "claude-haiku-4-5-20251001", aliases: ["claude-haiku-4-5"], efforts: [], minCliVersion: "2.1.0" },
  { id: "claude-sonnet-5-5", aliases: ["sonnet"], efforts: ALL_EFFORTS, minCliVersion: "2.1.284" },
  { id: "claude-opus-5-5", aliases: ["opus"], efforts: ALL_EFFORTS, minCliVersion: "2.1.280" },
  { id: "claude-fable-5-1", aliases: ["fable"], efforts: ALL_EFFORTS, minCliVersion: "2.1.257" },
  ...["claude-sonnet-4-5", "claude-sonnet-4-5-20250929"].map(id => ({ id, aliases: [], efforts: [], minCliVersion: "2.1.0" })),
  ...["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5"].map(id => ({ id, aliases: [], efforts: ALL_EFFORTS, minCliVersion: "2.1.0" })),
  ...["claude-opus-4-6", "claude-sonnet-4-6"].map(id => ({ id, aliases: [], efforts: ["low", "medium", "high", "max"], minCliVersion: "2.1.0" })),
]);
export const POLICY = Object.freeze({
  date: POLICY_DATE,
  tiers: {
    light: { model: "claude-haiku-5-5", effort: "medium" },
    daily: { model: "claude-sonnet-5-5", effort: "xhigh" },
    final: { model: "claude-opus-5-5", effort: "max" },
    deep: { model: "claude-fable-5-1", effort: "xhigh" },
  },
  deadlines: { verify: 600, ask: 900, review: 1800, implement: 5400 },
  turns: { verify: 24, ask: 32, review: 96, implement: 256 },
});

export function operatorCatalog(env = process.env) {
  if (!env.ULTRACLAUDE_MODEL_CATALOG) return MODEL_CATALOG;
  const entries = JSON.parse(readFileSync(env.ULTRACLAUDE_MODEL_CATALOG, "utf8"));
  if (!Array.isArray(entries) || entries.length > 128) throw new TypeError("Operator model catalog must be an array of at most 128 entries.");
  for (const item of entries) {
    if (!item || typeof item.id !== "string" || !Array.isArray(item.efforts) ||
        item.efforts.some(e => !ALL_EFFORTS.includes(e)) ||
        (item.aliases !== undefined && (!Array.isArray(item.aliases) || item.aliases.some(a => typeof a !== "string")))) {
      throw new TypeError("Invalid operator model catalog entry.");
    }
  }
  return [...entries, ...MODEL_CATALOG];
}

export function modelInfo(model, env = process.env) {
  const base = model.replace(/\[1m\]$/, "");
  const catalog = operatorCatalog(env);
  const entry = catalog.find(item => item.id === base || item.aliases?.includes(base));
  if (!entry) throw new TypeError(`request.model is unknown: ${model}. Configure an operator catalog for custom deployment IDs.`);
  const contextChecked = info => {
    if (model.endsWith("[1m]") && /^claude-(?:haiku-|sonnet-4-5)/.test(info.id)) throw new TypeError(`${info.id} does not support the [1m] context suffix.`);
    return info;
  };
  const variable = { opus: "ANTHROPIC_DEFAULT_OPUS_MODEL", sonnet: "ANTHROPIC_DEFAULT_SONNET_MODEL", haiku: "ANTHROPIC_DEFAULT_HAIKU_MODEL", fable: "ANTHROPIC_DEFAULT_FABLE_MODEL" }[base];
  if (variable && env[variable]) {
    const override = catalog.find(item => item.id === env[variable] || item.aliases?.includes(env[variable]));
    if (!override) throw new TypeError(`${variable} selects an unknown model; register its capabilities in the operator catalog.`);
    return contextChecked(override);
  }
  // Provider aliases can resolve to older families with different effort capabilities.
  const enabled = key => env[key] === "1" || env[key] === "true";
  const providerModel = enabled("CLAUDE_CODE_USE_FOUNDRY") ? { opus: "claude-opus-4-6", sonnet: "claude-sonnet-4-5", haiku: "claude-haiku-4-5-20251001" }[base] :
    enabled("CLAUDE_CODE_USE_BEDROCK") || enabled("CLAUDE_CODE_USE_VERTEX") ? { opus: "claude-opus-5-5", sonnet: "claude-sonnet-4-5", haiku: "claude-haiku-4-5-20251001" }[base] : null;
  // The fallback describes the built-in aliases only: an alias the operator catalog registers wins.
  if (providerModel && MODEL_CATALOG.includes(entry)) return contextChecked(catalog.find(item => item.id === providerModel));
  return contextChecked(entry);
}

export function resolveRoute(raw, env = process.env) {
  const legacy = raw.kind === undefined && raw.tier === undefined && raw.mode === undefined;
  const mode = raw.mode ?? (raw.kind === "implement" ? "implement" : "review");
  const kind = raw.kind ?? (mode === "review" ? "review" : "implement");
  if (!["review", "edit", "implement"].includes(mode)) throw new TypeError("request.mode must be review, edit, or implement.");
  if (!Object.hasOwn(POLICY.deadlines, kind)) throw new TypeError("request.kind must be verify, ask, review, or implement.");
  if (mode === "review" && kind === "implement") throw new TypeError("Implementation requires edit or implement mode.");
  const tier = raw.tier ?? (legacy ? "final" : "daily");
  if (!Object.hasOwn(POLICY.tiers, tier)) throw new TypeError("request.tier must be light, daily, final, or deep.");
  const thirdParty = ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"].some(key => env[key] === "1" || env[key] === "true");
  const aliases = { light: "haiku", daily: "sonnet", final: "opus", deep: "fable" };
  const model = raw.model ?? (legacy ? "opus" : thirdParty ? aliases[tier] : POLICY.tiers[tier].model);
  if (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]{0,511}$/.test(model)) throw new TypeError("request.model contains unsupported characters.");
  const info = modelInfo(model, env);
  // A model may cap the effort it gets implicitly (Haiku 5.5: medium; measured 2026-10-08, max cost
  // ~15x and took ~8x longer without better verdicts). An explicit effort is never capped.
  const tierEffort = legacy ? "max" : POLICY.tiers[tier].effort ?? "high";
  const desiredEffort = info.implicitEffortCap && ALL_EFFORTS.indexOf(info.implicitEffortCap) < ALL_EFFORTS.indexOf(tierEffort) ? info.implicitEffortCap : tierEffort;
  const effort = raw.effort ?? (info.efforts.length ? [...ALL_EFFORTS].reverse().find(level => info.efforts.includes(level) && ALL_EFFORTS.indexOf(level) <= ALL_EFFORTS.indexOf(desiredEffort)) : null);
  if (effort !== null && !info.efforts.includes(effort)) {
    throw new TypeError(`request.effort ${effort} is not supported by ${model}${info.efforts.length ? "." : "; omit effort for this model."}`);
  }
  return { mode, kind, tier, model, effort, legacy, minCliVersion: info.minCliVersion ?? null,
    timeoutSec: legacy ? 300 : POLICY.deadlines[kind], maxTurns: legacy ? null : POLICY.turns[kind] };
}

export function versionAtLeast(actual, required) {
  const a = String(actual).match(/\d+\.\d+\.\d+/)?.[0].split(".").map(Number);
  const b = required?.split(".").map(Number);
  if (!a || !b) return !required;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return true;
}
