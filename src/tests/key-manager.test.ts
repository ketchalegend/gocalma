import { describe, expect, it } from 'vitest';
import { createKeyFilePayload, decryptKeyFilePayload, decryptOriginalPdfBytes, matchesRedactedPdf } from '../core/security/key-manager';
import type { TokenMappingEntry } from '../types/domain';

describe('Key manager', () => {
  it('encrypts/decrypts mappings and original pdf bytes and rejects tampered payload', async () => {
    const mapping: TokenMappingEntry[] = [
      { token: '[PERSON_001]', original: 'Test Person', type: 'PERSON', page: 1, start: 3, end: 16 },
    ];
    const originalPdf = new TextEncoder().encode('source-pdf');
    const redactedPdf = new TextEncoder().encode('redacted-pdf');

    const payload = await createKeyFilePayload(mapping, originalPdf, redactedPdf, 'source.pdf');
    const restored = await decryptKeyFilePayload(payload);
    const restoredPdf = await decryptOriginalPdfBytes(payload);

    expect(restored).toEqual(mapping);
    expect(Array.from(restoredPdf)).toEqual(Array.from(originalPdf));
    await expect(matchesRedactedPdf(payload, redactedPdf)).resolves.toBe(true);

    const ciphertextBytes = Uint8Array.from(atob(payload.ciphertext), (char) => char.charCodeAt(0));
    ciphertextBytes[0] = ciphertextBytes[0] ^ 0xff;
    let tamperedBinary = '';
    for (let index = 0; index < ciphertextBytes.length; index += 0x8000) {
      tamperedBinary += String.fromCharCode(...ciphertextBytes.subarray(index, index + 0x8000));
    }
    const tamperedCiphertext = btoa(tamperedBinary);

    const tampered = {
      ...payload,
      ciphertext: tamperedCiphertext,
    };

    await expect(decryptKeyFilePayload(tampered)).rejects.toThrow();
  });
});
