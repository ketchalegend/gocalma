import { describe, expect, it, vi } from 'vitest';
import { createRedactionPackage } from '../core/redaction/service';
import type { Detection, ExtractedPdf } from '../types/domain';

// Mock dependencies
vi.mock('../core/redaction/pdf-redactor', () => ({
  applyVisualRedactions: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('../core/ocr/ocr-redaction', () => ({
  applyOcrOverlayRedactions: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6])),
}));

vi.mock('../core/security/key-manager', () => ({
  createKeyFilePayload: vi.fn().mockResolvedValue({}),
  keyPayloadToBlob: vi.fn().mockReturnValue(new Blob()),
}));

vi.mock('../core/ocr/feature-flag', () => ({
  OCR_ENABLED: false,
}));

vi.mock('../core/redaction/token-service', () => {
  class MockTokenService {
    tokenizePage = vi.fn().mockReturnValue({
      mappings: [],
      redactedText: 'redacted text',
    });
  }

  return { TokenService: MockTokenService };
});

describe('Redaction Service', () => {
  describe('createRedactionPackage', () => {
    it('creates redaction package with approved detections', async () => {
      const mockPdf: ExtractedPdf = {
        fileName: 'test.pdf',
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        pages: [
          {
            page: 1,
            width: 612,
            height: 792,
            text: 'Hello world test@example.com',
            ocrText: undefined,
            items: [],
            spans: [],
          },
        ],
      };

      const approvedDetections: Detection[] = [
        {
          id: '1',
          type: 'EMAIL',
          text: 'test@example.com',
          page: 1,
          bbox: { x: 100, y: 100, width: 100, height: 12 },
          confidence: 1,
          source: 'regex',
        },
      ];

      const result = await createRedactionPackage(mockPdf, approvedDetections);

      expect(result).toHaveProperty('redactedPdfBlob');
      expect(result).toHaveProperty('encryptedKeyBlob');
      expect(result.approvedDetections).toEqual(approvedDetections);
      expect(result.metricsSnapshot.detectionCount).toBe(1);
      expect(result.metricsSnapshot.approvedCount).toBe(1);
      expect(result.redactedTextByPage).toEqual(['redacted text']);
    });

    it('handles multiple pages', async () => {
      const mockPdf: ExtractedPdf = {
        fileName: 'test.pdf',
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        pages: [
          {
            page: 1,
            width: 612,
            height: 792,
            text: 'Page 1 content',
            ocrText: undefined,
            items: [],
            spans: [],
          },
          {
            page: 2,
            width: 612,
            height: 792,
            text: 'Page 2 content',
            ocrText: undefined,
            items: [],
            spans: [],
          },
        ],
      };

      const approvedDetections: Detection[] = [];

      const result = await createRedactionPackage(mockPdf, approvedDetections);

      expect(result.redactedTextByPage).toHaveLength(2);
    });

    it('handles OCR text fallback', async () => {
      const mockPdf: ExtractedPdf = {
        fileName: 'test.pdf',
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        pages: [
          {
            page: 1,
            width: 612,
            height: 792,
            text: '',
            ocrText: 'OCR content',
            items: [],
            spans: [],
          },
        ],
      };

      const approvedDetections: Detection[] = [];

      const result = await createRedactionPackage(mockPdf, approvedDetections);

      expect(result.redactedTextByPage).toHaveLength(1);
    });
  });
});