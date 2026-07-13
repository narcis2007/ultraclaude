# Cross-model workflow patterns

## Adversarial second opinion

Use for one load-bearing Codex conclusion.

Prompt shape:

    Codex concluded: <short conclusion>.
    Try to refute it using independent inspection of <named files>.
    Cite concrete evidence. If evidence is insufficient, return insufficient_evidence.

Run one Claude call at high effort, then have Codex reconcile the evidence.

## Finding verification

Batch related findings when they share the same files. Ask Claude to classify each stable finding
identifier as confirmed, refuted, or unverified. Do not drop a finding when the relay fails.

Use a custom schema with:

- results: array keyed by finding id
- status: confirmed, refuted, or unverified
- evidence: string
- confidence: integer

## Mixed judge panel

Generate candidates before judging. Ask Claude to score all candidates against the same explicit
rubric. Codex should also score them independently.

Rank only candidates that received both judgments. Do not compare a single-model score with a
cross-model average.

## Persistent dialogue

Use only when Claude's first answer creates a concrete follow-up question.

1. Start with persistSession:true.
2. Save sessionId.
3. Resume with a focused prompt and resumeSessionId.
4. Stop after three Claude calls unless the user asks for a longer exchange.

Never instruct Claude to contact Codex. Codex owns the exchange and passes only the next focused
question.

## Failure-closed synthesis

Partition results into:

- confirmed: schema-valid response with sufficient evidence
- refuted: schema-valid response that disproves the claim
- unverified: any relay failure, timeout, missing evidence, or insufficient_evidence verdict

If a required review is unverified, report the final status as incomplete.
