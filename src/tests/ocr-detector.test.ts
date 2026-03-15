import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOcrDetections } from '../core/ocr/ocr-detector';
import type { ExtractedPdf } from '../types/domain';

describe('OCR Detector', () => {
  beforeEach(() => {
    // Simulate Node.js environment where no DOM is available.
    vi.stubGlobal('document', undefined);
  });

  describe('detectOcrDetections', () => {
    it('returns empty array in Node.js environment', async () => {
      const mockPdf: ExtractedPdf = {
        fileName: 'test.pdf',
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        pages: [
          {
            page: 1,
            width: 612,
            height: 792,
            text: '',
            ocrText: undefined,
            items: [],
            spans: [],
          },
        ],
      };

      const result = await detectOcrDetections(mockPdf);

      expect(result).toEqual([]);
    });
  });
});