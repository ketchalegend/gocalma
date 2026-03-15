import { promises as fs } from 'fs';
import path from 'path';

// Mock import.meta.env for Node
if (!import.meta.env) {
  (import.meta as any).env = { VITE_ENABLE_OCR: 'false' };
}

// Set worker before importing PDF.js
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc = '';

import { extractPdfFromBytes } from '../src/core/pdf/extractor';
import { PIIDetector } from '../src/core/pii/detector';
import { createRedactionPackage } from '../src/core/redaction/service';

async function main() {
  const pdfPath = path.join(process.cwd(), 'sample-pdfs', 'sample_hospital_invoice_synthetic.pdf');
  const outputPath = path.join(process.cwd(), 'sample-pdfs', 'test-results', 'real-redacted-sample_hospital_invoice_synthetic.pdf');

  console.log('Reading PDF...');
  const pdfBytes = await fs.readFile(pdfPath);

  console.log('Extracting PDF...');
  const extractedPdf = await extractPdfFromBytes(pdfBytes, 'sample_hospital_invoice_synthetic.pdf');

  console.log('Detecting PII...');
  const detector = new PIIDetector();
  const detections = await detector.detect(extractedPdf);

  console.log(`Found ${detections.length} detections`);

  console.log('Creating redaction package...');
  const redactionPackage = await createRedactionPackage(extractedPdf, detections);

  console.log('Saving redacted PDF...');
  const buffer = await redactionPackage.redactedPdfBlob.arrayBuffer();
  await fs.writeFile(outputPath, new Uint8Array(buffer));

  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);