# GoCalma Challenge Spec (Canonical Project Copy)

## Track
Privacy & Open Source AI Tools.

## Problem
Users currently leak sensitive data when uploading PDFs to cloud AI tools. We need a privacy-first redaction system that runs locally.

## Primary Objective
Build an open-source tool that:
- accepts a PDF,
- detects and redacts PII locally,
- outputs a safe redacted PDF,
- supports reversible un-redaction using a user-held key.

## Super Challenge
Redact images in scanned documents (OCR path).

## Mandatory Constraints
- No plain personal data transmitted to third parties.
- Local execution for core workflow.
- User review step before final redaction.
- Open-source compatible licensing.
- Synthetic data only during development.

## Preferred Stack
- JavaScript/TypeScript browser app.
- `pdf.js` / `pdf-lib` for PDF processing.
- `Transformers.js` and/or Presidio-compatible local detection strategies.
- `Tesseract.js` for OCR bonus.

## Expected Deliverables
- Public GitHub repo.
- Working demo flow: upload -> detect -> redact -> download.
- Encrypted key export for un-redaction.
- README with setup/architecture/usage.

## Success Metrics
- PII detection recall >= 90%.
- Zero PII leakage outside local device.
- Un-redaction fidelity of redacted values.
- Usability for non-technical users.

## Language Focus
EN, DE, FR, IT, ES (LTR European languages).

## PII Examples in Scope
Names, addresses, phones, emails, AHV/AVS, SSN-like IDs, passport IDs, patient IDs, insurance numbers, IBAN, card/account numbers.

## FAQ-Derived Implementation Notes
- Local-first is required; optional external provider support can exist only as explicit opt-in path.
- Development order:
  1. text-based PDF redaction,
  2. image/scanned redaction.
- If input is scan/image-heavy, output should preserve that modality with redacted areas.
