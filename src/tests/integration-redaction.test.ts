import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdfFromBytes } from '../core/pdf/extractor';
import { PIIDetector } from '../core/pii/detector';
import { createRedactionPackage } from '../core/redaction/service';

const SAMPLE_PDFS_DIR = path.join(process.cwd(), 'sample-pdfs');
const TEST_RESULTS_DIR = path.join(SAMPLE_PDFS_DIR, 'test-results');

// Set worker for PDF.js
GlobalWorkerOptions.workerSrc = '';

describe('Integration: Redact Sample PDFs', () => {
  it('redacts all sample PDFs and saves results', async () => {
    // Get all PDF files in sample-pdfs directory
    const files = await fs.readdir(SAMPLE_PDFS_DIR);
    const pdfFiles = files.filter((file: string) => file.endsWith('.pdf') && !file.includes('redacted'));

    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(SAMPLE_PDFS_DIR, pdfFile);
      const outputPath = path.join(TEST_RESULTS_DIR, `redacted-${pdfFile}`);

      // Read PDF bytes
      const pdfBytes = await fs.readFile(pdfPath);

      // Extract PDF content
      const extractedPdf = await extractPdfFromBytes(pdfBytes, pdfFile);

      // Detect PII
      const detector = new PIIDetector();
      const detections = await detector.detect(extractedPdf, {
        useRegex: true,
        useNER: false, // Skip NER for faster testing
      });

      // Create redaction package
      const redactionPackage = await createRedactionPackage(extractedPdf, detections);

      // Save redacted PDF
      const buffer = await redactionPackage.redactedPdfBlob.arrayBuffer();
      await fs.writeFile(outputPath, new Uint8Array(buffer));

      console.log(`Redacted ${pdfFile} -> ${outputPath}`);
    }

    // Verify that output files were created
    const outputFiles = await fs.readdir(TEST_RESULTS_DIR);
    const redactedFiles = outputFiles.filter((file: string) => file.startsWith('redacted-'));

    // Should have one redacted file for each input PDF
    expect(redactedFiles).toHaveLength(pdfFiles.length);
  });
});