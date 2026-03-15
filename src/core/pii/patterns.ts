import type { PiiType } from '../../types/domain';

export interface RegexPattern {
  type: PiiType;
  pattern: RegExp;
}

export const REGEX_PATTERNS: RegexPattern[] = [
  { type: 'EMAIL', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'IBAN', pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/g },
  {
    type: 'PHONE',
    pattern: /(?<!\w)(?:\+\d{1,3}|00\d{1,3}|0\d{1,4})[\s()./-]*\d(?:[\d\s()./-]{6,}\d)(?!\w)/g,
  },
  { type: 'AVS_NUMBER', pattern: /\b756[.\s]\d{4}[.\s]\d{4}[.\s]\d{2}\b/g },
  {
    type: 'ADDRESS',
    pattern:
      /\b[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]{2,}\s*(?:str\.?|straße|strasse|weg|gasse|allee|platz|street|st\.|road|rd\.|avenue|ave\.)\s?\d{1,4}[a-zA-Z]?\b/giu,
  },
  { type: 'PATIENT_ID', pattern: /\bPT-\d{6,10}\b/g },
  { type: 'INSURANCE_NUMBER', pattern: /\b(?:HC|KV)-[A-Z]{2}-\d{3}-\d{3}-\d{3}\b/g },
  {
    type: 'ID_NUMBER',
    pattern:
      /\b(?:CLM|TCK)-[A-Z0-9-]{6,}\b|\bCH[-/][A-Z]{3}[-/]\d{4}[-/]\d{6}[-/]?[A-Z]{2}\b|\bSCAN-[A-Z]{3}-\d{4}-\d{2}-\d{5}\b/g,
  },
];
