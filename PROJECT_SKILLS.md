# GoCalma Execution Skills (Project-Specific)
Canonical challenge source of truth: `docs/CHALLENGE_SPEC.md`.

## Core Build Skill
- React + Vite + TypeScript frontend with local-only processing.
- PDF extraction via `pdfjs-dist` and visual redaction via `pdf-lib`.
- Hybrid PII detection: regex-first, NER optional.

## Reversible Redaction Skill
- Deterministic tokenization (`[TYPE_###]`).
- AES-GCM key payload generation and safe import for reversal.
- Text-level fidelity checks and tamper-failure tests.

## Dataset & Evaluation Skill
- Ground-truth JSON per sample PDF under `ground-truth/`.
- Schema validation before scoring.
- Metrics split:
  - Core gate: text PDFs only.
  - Stretch report: OCR/image docs.

## OCR Stretch Skill
- Run OCR for low-text/image-first pages.
- Map OCR word boxes to PDF coordinates.
- Feed OCR detections into the same review and redaction flow.

## Docs & Demo Skill
- Keep README current with scope, feature flags, and scripts.
- Preserve demo reliability over feature breadth.
- Keep judging metrics and deliverables explicitly mapped in docs.
