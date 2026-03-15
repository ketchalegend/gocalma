import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { applyOcrOverlayRedactions } from '../core/ocr/ocr-redaction';
import type { Detection, ExtractedPdf } from '../types/domain';

async function createSimplePdfBytes(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  page.drawText('Hello World', { x: 50, y: 740, size: 12 });
  return await pdfDoc.save();
}

describe('OCR Redaction', () => {
  describe('applyOcrOverlayRedactions', () => {
    it('returns input bytes when no OCR detections', async () => {
      const mockPdfBytes = await createSimplePdfBytes();
      const result = await applyOcrOverlayRedactions(mockPdfBytes, []);

      expect(result).toEqual(mockPdfBytes);
    });

    it('handles OCR detections in Node.js environment (fallback)', async () => {
      const mockPdfBytes = await createSimplePdfBytes();
      const mockPdf: ExtractedPdf = {
        fileName: 'test.pdf',
        bytes: mockPdfBytes,
        pages: [
          {
            page: 1,
            width: 612,
            height: 792,
            text: 'Hello World',
            ocrText: undefined,
            items: [{ text: 'Hello', x: 100, y: 700, width: 50, height: 12 }],
            spans: [],
          },
        ],
      };

      const detections: Detection[] = [
        {
          id: '1',
          type: 'EMAIL',
          text: 'test@example.com',
          page: 1,
          bbox: { x: 100, y: 700, width: 100, height: 12 },
          confidence: 1,
          source: 'ocr',
        },
      ];

      const result = await applyOcrOverlayRedactions(mockPdfBytes, detections, mockPdf);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(mockPdfBytes.length);
    });
  });
});