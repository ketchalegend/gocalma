# GoCalma Project Rules

## Mission
Win the GoCalma challenge with a local-first, open-source PDF PII redaction tool.
Reference spec: `docs/CHALLENGE_SPEC.md`.

## Product Scope (primary)
- Core + Reversible is mandatory for submission quality.
- OCR/Image redaction is stretch and must not break core delivery.

## Delivery Constraints
- No document content leaves the user environment.
- No server-side document processing.
- Reversible flow must preserve exact token mapping fidelity.

## Engineering Rules
- Prefer minimal, focused changes.
- Keep type safety strict; do not suppress type errors.
- Maintain deterministic outputs for token and key generation logic.
- Any new detection logic must include tests and evaluator impact checks.

## Challenge Acceptance Gates
- Core text-PDF benchmark recall >= 90%.
- End-to-end flow: upload -> detect -> review -> download.
- Encrypted key export/import works for un-redaction.
- Deliverables present: public-repo-ready codebase, working demo flow, README architecture/usage.
- Local-first guarantee: no plain document payload transmitted externally.

## OCR Stretch Rules
- OCR is controlled by `VITE_ENABLE_OCR=true`.
- OCR regressions must not reduce core gate outcomes.
- Report OCR metrics separately from core gate metrics.

## Product Judgement Rules
- Prioritize recall + transparent user review over silent precision misses.
- Never block core flow on OCR stretch work.
- Keep challenge narrative explicit in docs and demo scripts.
