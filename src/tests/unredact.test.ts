import { describe, expect, it, vi } from 'vitest';
import { restoreRedactedText } from '../core/redaction/unredact';
import type { KeyFilePayload } from '../types/domain';

// Mock dependencies
vi.mock('../core/security/key-manager', () => ({
  decryptKeyFilePayload: vi.fn().mockResolvedValue([
    { token: '[REDACTED-1]', original: 'secret@example.com', type: 'EMAIL', page: 1 },
  ]),
}));

vi.mock('../core/redaction/token-service', () => ({
  TokenService: {
    restoreText: vi.fn().mockReturnValue('restored text with secret@example.com'),
  },
}));

describe('Unredact', () => {
  describe('restoreRedactedText', () => {
    it('restores text using mappings', async () => {
      const redactedTextByPage = ['This is [REDACTED-1] content'];
      const payload: KeyFilePayload = {
        version: '1.0.0',
        algorithm: 'AES-GCM',
        iv: 'test-iv',
        ciphertext: 'test-ciphertext',
        keyMaterial: 'test-key',
        docHash: 'test-hash',
        createdAt: new Date().toISOString(),
      };

      const result = await restoreRedactedText(redactedTextByPage, payload);

      expect(result).toEqual(['restored text with secret@example.com']);
    });

    it('handles multiple pages', async () => {
      const redactedTextByPage = ['Page 1 [REDACTED-1]', 'Page 2 content'];
      const payload: KeyFilePayload = {
        version: '1.0.0',
        algorithm: 'AES-GCM',
        iv: 'test-iv',
        ciphertext: 'test-ciphertext',
        keyMaterial: 'test-key',
        docHash: 'test-hash',
        createdAt: new Date().toISOString(),
      };

      const result = await restoreRedactedText(redactedTextByPage, payload);

      expect(result).toHaveLength(2);
    });
  });
});