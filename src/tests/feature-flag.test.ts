import { describe, expect, it } from 'vitest';
import { OCR_ENABLED } from '../core/ocr/feature-flag';

describe('OCR Feature Flag', () => {
  it('OCR_ENABLED is boolean', () => {
    expect(typeof OCR_ENABLED).toBe('boolean');
  });

  // Note: Actual value depends on VITE_ENABLE_OCR env var
  // In test environment, it should be true by default
  it('defaults to true when env var not set', () => {
    // This test assumes VITE_ENABLE_OCR is not set to 'false'
    expect(OCR_ENABLED).toBe(true);
  });
});