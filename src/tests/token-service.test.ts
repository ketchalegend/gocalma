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
});
