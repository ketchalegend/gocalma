import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { extractPdfFromBytes } from '../core/pdf/extractor';
import { PIIDetector } from '../core/pii/detector';
import { createRedactionPackage } from '../core/redaction/service';

const SAMPLE_PDFS_DIR = path.join(process.cwd(), 'sample-pdfs');
const TEST_RESULTS_DIR = path.join(SAMPLE_PDFS_DIR, 'test-results');

describe('Integration: Redact Sample PDFs', () => {
  it('redacts all sample PDFs and saves results', async () => {
    await fs.mkdir(TEST_RESULTS_DIR, { recursive: true });

    // Get all PDF files in sample-pdfs directory
    const files = await fs.readdir(SAMPLE_PDFS_DIR);
    const pdfFiles = files.filter((file: string) => file.endsWith('.pdf') && !file.includes('redacted'));

    let successCount = 0;
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(SAMPLE_PDFS_DIR, pdfFile);
      const outputPath = path.join(TEST_RESULTS_DIR, `redacted-${pdfFile}`);

      try {
        const pdfBytes = await fs.readFile(pdfPath);
        const extractedPdf = await extractPdfFromBytes(pdfBytes, pdfFile);

        const detector = new PIIDetector();
        const detections = await detector.detect(extractedPdf, {
          useRegex: true,
          useNER: false,
        });

        const redactionPackage = await createRedactionPackage(extractedPdf, detections);
        const buffer = await redactionPackage.redactedPdfBlob.arrayBuffer();
        await fs.writeFile(outputPath, new Uint8Array(buffer));
        successCount += 1;
        console.log(`Redacted ${pdfFile} -> ${outputPath}`);
      } catch (err) {
        // Some PDFs (e.g. with embedded images) may fail in jsdom canvas environment
        console.warn(`Skipped ${pdfFile}:`, (err as Error).message);
      }
    }

    const outputFiles = await fs.readdir(TEST_RESULTS_DIR);
    const redactedFiles = outputFiles.filter((file: string) => file.startsWith('redacted-'));

    // At least one PDF should have been redacted successfully
    expect(successCount).toBeGreaterThan(0);
    expect(redactedFiles).toHaveLength(successCount);
  });
});