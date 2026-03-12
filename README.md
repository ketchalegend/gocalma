# GoCalma Local PDF Redactor

Challenge build for **Privacy & Open Source AI Tools**.
Challenge reference in repo: `docs/CHALLENGE_SPEC.md`.

## What it does

- Runs local-first in browser with React + Vite + TypeScript.
- Detects PII from PDF text using a hybrid pipeline:
  - Regex-first detection
  - Optional NER enrichment via Transformers.js
- Supports approval workflow before final redaction.
- Produces:
  - `*_redacted.pdf`
  - `*.gocalma` encrypted key file for reversibility
- Includes a **Ground Truth Builder** and scoring workflow.

## Scope (current)

- Core + Reversible implemented.
- OCR/image redaction is behind feature flag (`VITE_ENABLE_OCR=true`) and treated as stretch work.
- Project operating alignment docs:
  - `AGENTS.md`
  - `PROJECT_SKILLS.md`

## Local development

```bash
npm install
npm run setup
npm run dev
```

Open the app and choose:

- `Redaction` tab: Upload -> Detect -> Review -> Download
- `Ground Truth` tab: generate/edit/export annotations

Enable OCR stretch mode:

```bash
VITE_ENABLE_OCR=true npm run dev
```

`npm run setup` downloads the local `Xenova/bert-base-NER` assets into `public/models/`. Those generated model files are intentionally not committed.

## Scripts

```bash
npm run test         # unit tests
npm run build        # type-check + production build
npm run setup        # download local NER model assets into public/models/
npm run evaluate     # score detections against ground-truth/*.json
npm run extract:text # export extracted sample text to .tmp_extracted_text.txt
```

## Ground Truth Dataset

`ground-truth/` contains v1 canonical labels for:

- `sample_hospital_invoice_synthetic.pdf`
- `sample_social_security_notice_synthetic.pdf`
- `sample_scanned_admission_form_synthetic.pdf`

Schema reference: `ground-truth/schema.json`

## Privacy model

- PII detection and redaction run in-app on local PDF bytes.
- No API sends document text to external services.
- NER model assets are downloaded locally via `npm run setup`.
- Key file uses AES-GCM encrypted token mapping.

## Local model strategy

- Default detector path: regex-first local rules (fast, deterministic).
- Optional local NER enrichment: `Xenova/bert-base-NER` through `@xenova/transformers`.
- OCR stretch path: `tesseract.js` for scanned/image-heavy pages.

## Notes

- Visual un-redaction of already-redacted pixels is out of scope in this iteration.
- Reversibility is implemented at token/text mapping level and validated via tests.
