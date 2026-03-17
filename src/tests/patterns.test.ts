import { describe, expect, it } from 'vitest';
import { REGEX_PATTERNS } from '../core/pii/patterns';

describe('PII Patterns', () => {
  describe('EMAIL', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'EMAIL')!.pattern;

    it('matches valid email addresses', () => {
      expect('user@example.com'.match(pattern)).toBeTruthy();
      expect('test.email+tag@domain.co.uk'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid emails', () => {
      expect('invalid-email'.match(pattern)).toBeFalsy();
      expect('@domain.com'.match(pattern)).toBeFalsy();
    });
  });

  describe('IBAN', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'IBAN')!.pattern;

    it('matches valid IBANs', () => {
      expect('CH2108307000289537320'.match(pattern)).toBeTruthy();
      expect('DE89370400440532013000'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid IBANs', () => {
      expect('INVALID'.match(pattern)).toBeFalsy();
    });
  });

  describe('PHONE', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'PHONE')!.pattern;

    it('matches valid phone numbers', () => {
      expect('+41 79 123 45 67'.match(pattern)).toBeTruthy();
      expect('079 123 45 67'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid phones', () => {
      expect('abc'.match(pattern)).toBeFalsy();
    });
  });

  describe('AVS_NUMBER', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'AVS_NUMBER')!.pattern;

    it('matches valid AVS numbers', () => {
      expect('756.1234.5678.90'.match(pattern)).toBeTruthy();
      expect('756 1234 5678 90'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid AVS', () => {
      expect('123.4567.8901.23'.match(pattern)).toBeFalsy();
    });
  });

  describe('ADDRESS', () => {
    const basePattern = REGEX_PATTERNS.find((p) => p.type === 'ADDRESS')!.pattern;

    it('matches valid addresses', () => {
      const pattern = new RegExp(basePattern.source, basePattern.flags.replace('g', ''));
      expect(pattern.test('Main Street 123')).toBe(true);
      expect(pattern.test('Bahnhof Strasse 45a')).toBe(true);
    });

    it('does not match invalid addresses', () => {
      const pattern = new RegExp(basePattern.source, basePattern.flags.replace('g', ''));
      expect(pattern.test('random text')).toBe(false);
    });
  });

  describe('PATIENT_ID', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'PATIENT_ID')!.pattern;

    it('matches valid patient IDs', () => {
      expect('PT-123456'.match(pattern)).toBeTruthy();
      expect('PT-1234567890'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid patient IDs', () => {
      expect('PT-123'.match(pattern)).toBeFalsy();
      expect('123456'.match(pattern)).toBeFalsy();
    });
  });

  describe('INSURANCE_NUMBER', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'INSURANCE_NUMBER')!.pattern;

    it('matches valid insurance numbers', () => {
      expect('HC-CH-123-456-789'.match(pattern)).toBeTruthy();
      expect('KV-DE-987-654-321'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid insurance numbers', () => {
      expect('INVALID'.match(pattern)).toBeFalsy();
    });
  });

  describe('ID_NUMBER', () => {
    const pattern = REGEX_PATTERNS.find(p => p.type === 'ID_NUMBER')!.pattern;

    it('matches valid ID numbers', () => {
      expect('CLM-ABC123'.match(pattern)).toBeTruthy();
      expect('CH/ABC/1234/567890/DE'.match(pattern)).toBeTruthy();
    });

    it('does not match invalid IDs', () => {
      expect('INVALID'.match(pattern)).toBeFalsy();
    });
  });
});