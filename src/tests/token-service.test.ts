import { describe, expect, it } from 'vitest';
import { TokenService } from '../core/redaction/token-service';
import type { Detection } from '../types/domain';

describe('TokenService', () => {
  it('creates deterministic token labels and restores text', () => {
    const service = new TokenService();
    const text = 'Name: Lara Meier IBAN: CH44 3199 9123 0000 5512 8';

    const detections: Detection[] = [
      {
        id: '1',
        type: 'PERSON',
        text: 'Lara Meier',
        page: 1,
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        start: text.indexOf('Lara Meier'),
        end: text.indexOf('Lara Meier') + 'Lara Meier'.length,
        confidence: 1,
        source: 'regex',
      },
      {
        id: '2',
        type: 'IBAN',
        text: 'CH44 3199 9123 0000 5512 8',
        page: 1,
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        start: text.indexOf('CH44 3199 9123 0000 5512 8'),
        end: text.indexOf('CH44 3199 9123 0000 5512 8') + 'CH44 3199 9123 0000 5512 8'.length,
        confidence: 1,
        source: 'regex',
      },
    ];

    const tokenized = service.tokenizePage(1, text, detections);

    expect(tokenized.redactedText).toContain('[PERSON_001]');
    expect(tokenized.redactedText).toContain('[IBAN_001]');

    const restored = TokenService.restoreText(tokenized.redactedText, tokenized.mappings);
    expect(restored).toBe(text);
  });

  it('tokenizes OCR-only preview text when detections have no text offsets', () => {
    const service = new TokenService();
    const text = 'Esther Bepa Bepa\nEmail: kbepa@yahoo.com';

    const detections: Detection[] = [
      {
        id: '1',
        type: 'PERSON',
        text: 'Esther Bepa Bepa',
        page: 1,
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        confidence: 0.93,
        source: 'ocr',
      },
      {
        id: '2',
        type: 'EMAIL',
        text: 'kbepa@yahoo.com',
        page: 1,
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        confidence: 0.95,
        source: 'ocr',
      },
    ];

    const tokenized = service.tokenizePage(1, text, detections);

    expect(tokenized.redactedText).toContain('[PERSON_001]');
    expect(tokenized.redactedText).toContain('[EMAIL_001]');

    const restored = TokenService.restoreText(tokenized.redactedText, tokenized.mappings);
    expect(restored).toBe(text);
  });
});
