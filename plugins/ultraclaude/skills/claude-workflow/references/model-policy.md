# Model policy

Policy date: 2026-10-07. The runtime model-policy.mjs is the single source of truth.

| Tier | First-party model | Effort | Role |
|---|---|---|---|
| light | claude-haiku-4-5-20251001 | omitted | small checks, summaries, classification |
| daily | claude-sonnet-5-5 | xhigh | implementation, analysis, routine review |
| final | claude-opus-5-5 | max | security and consequential final reviews |
| deep | claude-fable-5-1 | xhigh | explicitly requested long/deep investigations |

An explicit model/effort overrides tier defaults. Legacy requests without mode/kind/tier keep
opus/max. Haiku has no effort parameter; an explicit unsupported effort is rejected. Opus/Sonnet
4.6 do not accept xhigh. Fable is never selected implicitly by a normal review or implementation.

Model capabilities are not account availability. Preflight reports CLI version support and
accountAvailability:not_probed. A live result preserves modelUsage/observedModels and requested
routing separately. effectiveEffort remains null when the CLI did not expose an observed value.
Provider-side remapping or fallback is not disguised as the requested model.

On third-party providers the tier selects family aliases. Operator family environment overrides
must name cataloged models. Register custom deployment IDs through an operator-only JSON array in
ULTRACLAUDE_MODEL_CATALOG, with id, optional aliases, supported efforts, and optional minCliVersion.
A request cannot choose a catalog or executable. Catalog registration describes capabilities;
it does not assert account access. Keep it current when providers change alias resolutions.
The current Bedrock/Agent Platform/Foundry Sonnet alias points to Sonnet 4.5, so effort is omitted
unless the operator pins a newer deployment. Foundry's Opus alias uses Opus 4.6. Unsupported
implicit tier efforts step down to a supported level; explicit unsupported efforts are rejected.

Deadlines/turn limits are role-based (verify 10 min/24 turns, ask 15 min/32, review 30 min/96,
implement 90 min/256). Requests can set timeoutSec up to four hours and maxTurns up to 1000.
maxBudgetUsd is the CLI's API cost-estimate cap, not a guaranteed subscription-credit budget.

Sources: [Claude model configuration](https://code.claude.com/docs/en/model-config),
[model catalog](https://platform.claude.com/docs/en/models/overview),
[CLI limits](https://code.claude.com/docs/en/cli-reference).
