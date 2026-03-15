const ocrFlag = import.meta.env?.VITE_ENABLE_OCR;

// OCR is enabled by default so image-only/scanned PDFs are handled out of the box.
// Set VITE_ENABLE_OCR=false to force-disable it.
export const OCR_ENABLED = ocrFlag !== 'false';
