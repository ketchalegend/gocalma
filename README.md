# GoCalma

Local-first PDF PII redaction that runs in the browser.

**🚀 Live Demo: https://gocalme.ketchalegend.me/**

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

### Secure Redaction: Why Pixel-Level Redaction Matters

Simply drawing black rectangles over text in a PDF does **not** remove the underlying content. The text layer remains in the file, so it stays:

- Selectable and copyable
- Searchable
- Detectable by OS features (e.g. macOS data detectors showing phone numbers when you click a "redacted" area)

**GoCalma’s solution:** For text-based pages, the app uses **pixel-level redaction**. Each affected page is rendered to an image, black rectangles are painted at the detection coordinates (removing the underlying pixels), and the page is replaced with the redacted image. The original text layer is removed, so OS data detectors and similar tools cannot access the redacted content. Un-redaction still works as before, since the original document is stored encrypted in the `.gocalma` key file.

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
npm run test:all
npm run test:e2e
npm run evaluate
npm run build
```

## Test Coverage Snapshot

- Unit tests: `15` test files, `75` tests (`npm run test`)
- End-to-end tests: `2` Playwright tests (`npm run test:e2e`)
- Total automated tests currently passing: `77`
- Single command for both suites: `npm run test:all`

Current e2e coverage validates full-app integration flows in a real browser:

- integration run across all canonical sample PDFs (hospital invoice, social security notice, scanned admission form)
- select/deselect behavior in the review stage
- upload PDF -> detect -> review -> generate -> download for each integration sample

The e2e suite also verifies generated outputs are saved under `test-results/`, including redacted PDFs and matching `.gocalma` key files.
It additionally validates artifact integrity by asserting non-trivial output sizes and checking the redacted PDF header (`%PDF`).

## Notes On Verification

- `npm run evaluate` currently reports `97.50%` core text-PDF macro recall
- the repository also contains additional scanned and phone-captured style samples plus redacted outputs for inspection
- `npm run build` produces a production-ready static bundle that can be hosted on any static host (for example Vercel) while preserving the local-first privacy model

## Deployment Notes

### Option 1: Own Node.js Server (Recommended for Full Control)

Deploy on your own server (VPS, dedicated, or cloud VM):

```bash
npm install
npm run setup      # Downloads ~5GB NER model + OCR data to server
npm run build
```

**Serve with Node.js (port 3000):**

```bash
# Using serve package
npx serve -s dist -l 3000

# Or with a simple Express server (server.js):
# const express = require('express');
# const app = express();
# app.use(express.static('dist'));
# app.listen(3000, () => console.log('Server running on port 3000'));
```

**Pros:**
- Full functionality immediately available
- No external CDN dependencies
- Complete control over the deployment
- Port 3000 is fine and commonly used for Node.js apps

### Option 2: Vercel + Cloudflare R2 (Easy Scaling)

For easy scaling without managing servers:

1. **Upload models to Cloudflare R2:**
   ```bash
   # Create R2 bucket and upload model files
   aws s3 sync public/models/ s3://your-bucket/models/ --endpoint-url=https://<account>.r2.cloudflarestorage.com
   ```

2. **Deploy app to Vercel:**
   ```bash
   vercel --prod
   ```

3. **Configure CORS on R2** to allow your Vercel domain

**Pros:**
- Fast global CDN for models (no egress fees with R2)
- Models download once, cache in browser
- Easy auto-scaling
- All PDF processing stays local in browser

### Option 3: Vercel Deployment (Demo Mode - No NER)

The NER model files (~5GB) are too large for Vercel's 250MB limit. The Vercel deployment:
- Runs with regex-based detection only (no NER)
- Still provides strong PII detection via contextual patterns and layout heuristics
- Maintains the local-first privacy guarantee (no data leaves the browser)

### Why Local Models Only

Per the challenge requirements and privacy-first design:
- **No remote models** - All AI processing happens locally in the browser
- **No data transmission** - Document content never leaves the user's device
- **User-controlled** - Models are downloaded once and cached locally

This ensures compliance with the challenge's "Zero PII leakage outside local device" requirement.

## License

[LICENSE](LICENSE)
