# GoCalma

Local-first PDF PII redaction that runs in the browser.

GoCalma is an open-source browser app for detecting and redacting sensitive information in PDFs without sending document contents to any server. Users upload a PDF locally, review detected entities, export a redacted PDF, and keep an encrypted `.gocalma` key file for reversible restoration.

## Submission Snapshot

- Core text-PDF macro recall: `97.50%` on the current repository evaluator
- End-to-end workflow: upload -> detect -> review -> export
- Privacy model: in-browser processing, no plain document upload
- Reversible redaction: encrypted key export for un-redaction
- Extended input coverage: clean PDFs, scanned PDFs, and phone-captured document images converted into PDF

## Why This Project Matters

People routinely upload sensitive PDFs to cloud tools before realizing those files contain names, addresses, IDs, insurance numbers, account numbers, and other personal data. GoCalma provides a safer preprocessing step so documents can be sanitized locally before they are shared anywhere else.

## What The App Does

1. Upload a PDF locally in the browser
2. Extract text and detect likely PII with local processing
3. Run OCR locally for image-heavy or scanned inputs
4. Let the user review every candidate before redaction
5. Export a redacted PDF plus an encrypted `.gocalma` recovery key
6. Restore the original document later with the matching key

## Accuracy And Coverage

The current repository evaluator clears the challenge gate for the core benchmark:

- Core text-PDF macro recall: `97.50%`

The detection logic was also improved using a broader set of realistic samples beyond the canonical benchmark, including scanned documents and phone-captured PDF inputs. Those additional examples helped harden the system against noisier real-world files, not just ideal text-layer PDFs.

## Linked Submission Assets

- One-pager markdown: [docs/ONEPAGER.md](docs/ONEPAGER.md)
- One-pager PDF: [docs/GoCalma-OnePager.pdf](docs/GoCalma-OnePager.pdf)
- Challenge spec: [docs/CHALLENGE_SPEC.md](docs/CHALLENGE_SPEC.md)
- Exercise brief: [docs/EXERCISE_BRIEF.md](docs/EXERCISE_BRIEF.md)

## Included Sample PDFs

Canonical benchmark and validation inputs:

- [sample_hospital_invoice_synthetic.pdf](sample-pdfs/sample_hospital_invoice_synthetic.pdf)
- [sample_social_security_notice_synthetic.pdf](sample-pdfs/sample_social_security_notice_synthetic.pdf)
- [sample_scanned_admission_form_synthetic.pdf](sample-pdfs/sample_scanned_admission_form_synthetic.pdf)

Additional realistic samples used to improve robustness:

- [RELEVE LICENCE ESTHER.pdf](sample-pdfs/RELEVE%20LICENCE%20ESTHER.pdf)
- [Lebenslauf Esther Bepa Bepa.pdf](sample-pdfs/Lebenslauf%20Esther%20Bepa%20Bepa.pdf)

Ground-truth annotations:

- [hospital-invoice.json](ground-truth/hospital-invoice.json)
- [social-security-notice.json](ground-truth/social-security-notice.json)
- [scanned-admission-form.json](ground-truth/scanned-admission-form.json)
- [schema.json](ground-truth/schema.json)

Included redacted outputs:

- [sample_hospital_invoice_synthetic_redacted (2).pdf](sample-pdfs/redacted-results/sample_hospital_invoice_synthetic_redacted%20(2).pdf)
- [sample_social_security_notice_synthetic_redacted (1).pdf](sample-pdfs/redacted-results/sample_social_security_notice_synthetic_redacted%20(1).pdf)
- [sample_scanned_admission_form_synthetic_redacted (8).pdf](sample-pdfs/redacted-results/sample_scanned_admission_form_synthetic_redacted%20(8).pdf)
- [RELEVE LICENCE ESTHER_redacted (3).pdf](sample-pdfs/redacted-results/RELEVE%20LICENCE%20ESTHER_redacted%20(3).pdf)
- [Lebenslauf Esther Bepa Bepa_redacted (2).pdf](sample-pdfs/redacted-results/Lebenslauf%20Esther%20Bepa%20Bepa_redacted%20(2).Hi.pdf)

## Privacy Model

- All PDF parsing, detection, OCR, redaction, and restoration happen locally in the browser
- No plain document content is transmitted to external servers
- OCR uses local `tesseract.js`
- Reversible restoration depends on the user-held encrypted `.gocalma` file

## Technical Approach

GoCalma combines several local strategies instead of relying on a single detector:

- contextual regex and rule-based matching
- layout-aware heuristics
- local NER enrichment with Transformers.js
- local OCR for scanned and image-heavy documents
- post-processing and deduplication before review

This layered approach is what made the project more accurate across structured forms, letters, notices, invoices, and low-quality scanned inputs.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- a modern desktop browser

### Install

```bash
npm install
npm run setup
```

`npm run setup` provisions both the local NER model and local OCR language data for English, German, French, Italian, and Spanish.

### Run

```bash
npm run dev
```

Open the local Vite URL in your browser and upload a PDF.

## Useful Commands

```bash
npm run dev
npm run test
npm run test:e2e
npm run evaluate
npm run build
```

## Notes On Verification

- `npm run evaluate` currently reports `97.50%` core text-PDF macro recall
- the repository also contains additional scanned and phone-captured style samples plus redacted outputs for inspection
- `npm run build` currently fails due to pre-existing TypeScript issues in `src/core/ocr/ocr-redaction.ts`, unrelated to the submission-document updates

## License

[LICENSE](LICENSE)
