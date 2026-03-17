import { describe, expect, it } from 'vitest';
import { hasPdfHeader, assertPdfHeader } from '../core/pdf/guards';

describe('PDF Guards', () => {
  describe('hasPdfHeader', () => {
    it('returns true for valid PDF header', () => {
      const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
      expect(hasPdfHeader(validPdf)).toBe(true);
    });

    it('returns false for invalid header', () => {
      const invalidPdf = new Uint8Array([0x00, 0x50, 0x44, 0x46, 0x2d]);
      expect(hasPdfHeader(invalidPdf)).toBe(false);
    });

    it('returns false for short array', () => {
      const shortArray = new Uint8Array([0x25, 0x50]);
      expect(hasPdfHeader(shortArray)).toBe(false);
    });
  });

  describe('assertPdfHeader', () => {
    it('does not throw for valid PDF', () => {
      const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      expect(() => assertPdfHeader(validPdf, 'test')).not.toThrow();
    });

    it('throws for invalid PDF', () => {
      const invalidPdf = new Uint8Array([0x00, 0x50, 0x44, 0x46, 0x2d]);
      expect(() => assertPdfHeader(invalidPdf, 'test')).toThrow('test: input is not a valid PDF byte stream.');
    });
  });
});