# GoCalma

## Local-First PDF PII Redaction For Real Documents

GoCalma is an open-source browser application that detects and redacts sensitive information in PDFs without sending document contents to any server. It is built for the GoCalma challenge and focuses on a practical privacy guarantee: the document stays on the user’s machine from upload to export.

## Why This Matters

Users regularly paste or upload highly sensitive PDFs into cloud tools before realizing those files contain names, addresses, IDs, account numbers, medical references, and other personal data. Existing workflows are either too risky, too fragmented, or too hard to use.

GoCalma provides a safer path:

- upload a PDF locally,
- detect likely PII,
- review the findings,
- export a redacted PDF,
- keep an encrypted key for reversible restoration.

## What Makes GoCalma Submission-Worthy

### 1. Fully local execution

The core workflow runs entirely in the browser:

- PDF parsing
- text extraction
- PII detection
- OCR for scanned/image-heavy files
- redaction
- restoration

No plain document payload is sent to third parties.

### 2. Strong benchmark performance

The repository’s current evaluator clears the challenge gate on the core benchmark:

- **Core text-PDF macro recall: 97.50%**

This is above the stated challenge threshold of 90% recall for the core text-PDF path.

### 3. Handles more than clean digital PDFs

The project was improved using a broader set of realistic sample documents, including:

- clean digital PDFs,
- scanned PDFs,
- phone-captured document images converted into PDF,
- noisier OCR-heavy forms.

That broader sample set materially improved robustness and helped push practical accuracy higher on messy real-world inputs, not just ideal text-layer PDFs.

### 4. Human review before final redaction

GoCalma is optimized for high recall and transparent review. Instead of silently missing risky fields, it presents detections to the user for confirmation before export.

That is the right product choice for privacy-sensitive redaction.

### 5. Reversible redaction

Alongside the redacted PDF, GoCalma exports an encrypted `.gocalma` key file. This preserves the mapping needed to restore the original values later without weakening the local-first privacy model.

## How It Works

GoCalma combines several local detection methods:

- contextual regex and rule-based matching,
- layout-aware heuristics,
- local NER enrichment with Transformers.js,
- local OCR with `tesseract.js`,
- post-processing and deduplication.

This layered approach is why the system performs well across structured forms, letters, notices, invoices, and lower-quality scanned inputs.

## Challenge Fit

GoCalma directly addresses the core challenge requirements:

- open-source prototype repository,
- working redaction flow,
- local-first privacy guarantee,
- user review before export,
- encrypted reversible un-redaction,
- support for scanned and image-heavy PDFs as an extended capability.

## Summary

GoCalma is not just a demo. It is a practical, browser-based privacy tool with strong core recall, a reviewable workflow, reversible redaction, and support for both standard PDFs and tougher scanned or phone-captured documents.

The result is a credible local-first redaction product that is aligned with the challenge and ready for submission.
