# Executable workflow patterns

The runner accepts these JSON objects through workflow --request or start --request.
All workflow stages are read-only. Codex owns synthesis; Claude never calls Codex recursively.

## claude-review

```json
{"workflow":"claude-review","cwd":"/absolute/repo","prompt":"Review the supplied diff and named files.","lenses":["code","security","tests"]}
```

Available lenses: code, security, tests, performance, domain. Ordinary lenses use daily; security
uses final. Explicit tier/model/effort overrides take priority. Results include each stage's routing
and evidence. Failed stages remain unverified. The default runs sequentially to bound usage.

## crosscheck and cross-review

```json
{"workflow":"crosscheck","cwd":"/absolute/repo","claims":[{"id":"C1","text":"The counter increment is atomic."}]}
```

```json
{"workflow":"cross-review","cwd":"/absolute/repo","findings":[{"id":"AUTH-1","text":"This handler accepts another tenant's record ID."}]}
```

Claude verifies one batch of related claims/findings, citing files and lines. Exactly one result
per supplied stable ID is required; missing, invented, or duplicate IDs fail closed. Codex then
checks material findings and classifies confirmed/refuted/unverified. Escalate one consequential
unresolved batch to final rather than repeating whole reviews.

## judge-panel

```json
{"workflow":"judge-panel","cwd":"/absolute/repo","rubric":"Correctness and operational simplicity","candidates":[{"id":"A","text":"Option A"},{"id":"B","text":"Option B"}],"codexScores":[{"id":"A","score":75},{"id":"B","score":65}]}
```

Obtain Codex's independent scores before passing them as codexScores. Claude sees candidates and
the rubric, not Codex scores. Scores are 0..100. Only candidates with both judgments are ranked;
others are unverifiedCandidates. Missing Codex judgments are never replaced with Claude-only means.

## Persistent dialogue

For real follow-ups, make a normal request with persistSession:true and resume the registered
session in the same workspace/scope. Keep the next question specific. Stop when there is no new
evidence or the agreed call/budget limit is reached. Failures never imply agreement.
