import { describe, expect, it, vi } from 'vitest';
import { PIIDetector } from '../core/pii/detector';
import type { ExtractedPdf } from '../types/domain';

describe('privacy guardrails', () => {
  it('regex mode does not call fetch with document content', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const detector = new PIIDetector();
    const fakePdf: ExtractedPdf = {
      fileName: 'fake.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 100,
          height: 100,
          text: 'Patient Lara Meier IBAN CH44 3199 9123 0000 5512 8',
          items: [],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });

    expect(detections.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
