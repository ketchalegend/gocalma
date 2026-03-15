import { describe, expect, it } from 'vitest';
import { REGEX_PATTERNS } from '../core/pii/patterns';
import { detectPiiFromOcrLines } from '../core/ocr/ocr-detector';
import { applyOcrOverlayRedactions } from '../core/ocr/ocr-redaction';
import type { Detection } from '../types/domain';

describe('OCR stretch regressions', () => {
  it('detects SCAN-style identifiers using ID_NUMBER pattern', () => {
    const idRule = REGEX_PATTERNS.find((pattern) => pattern.type === 'ID_NUMBER');
    expect(idRule).toBeDefined();

    const text = 'Document ID: SCAN-ADM-2026-02-18017';
    const matches = text.match(idRule!.pattern) ?? [];

    expect(matches).toContain('SCAN-ADM-2026-02-18017');
  });

  it('keeps bytes unchanged when OCR overlays are empty', async () => {
    const input = new Uint8Array([1, 2, 3, 4]);
    const output = await applyOcrOverlayRedactions(input, [] as Detection[]);
    expect(output).toEqual(input);
  });

  it('detects person/address/email/phone from OCR lines in scanned forms', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      lines: [
        {
          text: 'Full name: Alice Example',
          confidence: 92,
          bbox: { x0: 100, y0: 200, x1: 1100, y1: 260 },
        },
        {
          text: 'Address: Sample Street 7, 1205 Examplecity, ZZ',
          confidence: 91,
          bbox: { x0: 100, y0: 280, x1: 1600, y1: 340 },
        },
        {
          text: 'Phone: +99 78 444 33 22',
          confidence: 93,
          bbox: { x0: 100, y0: 360, x1: 1200, y1: 420 },
        },
        {
          text: 'Email: alice.example@syntheticmail.example',
          confidence: 90,
          bbox: { x0: 100, y0: 440, x1: 1800, y1: 500 },
        },
      ],
    });

    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.includes('Alice Example'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'ADDRESS' && detection.text.includes('1205 Examplecity'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PHONE' && detection.text.includes('+99 78 444'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'EMAIL' && detection.text.includes('alice.example@'))).toBe(true);
  });

  it('detects treating physician as PERSON', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      lines: [
        {
          text: 'Treating physician: Dr. Alex Example (synthetic)',
          confidence: 90,
          bbox: { x0: 100, y0: 600, x1: 1400, y1: 660 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'PERSON' && d.text.includes('Dr. Alex Example'))).toBe(true);
  });

  it('detects date of birth from OCR lines', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      lines: [
        {
          text: 'Date of birth: 1986-05-29',
          confidence: 93,
          bbox: { x0: 100, y0: 220, x1: 1000, y1: 260 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'DATE_OF_BIRTH' && d.text === '1986-05-29')).toBe(true);
  });

  it('detects insurance number from OCR lines', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      lines: [
        {
          text: 'Insurance No.: INS-ZZ-550-229-104',
          confidence: 92,
          bbox: { x0: 100, y0: 300, x1: 1200, y1: 340 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'INSURANCE_NUMBER' && d.text.includes('INS-ZZ-550-229-104'))).toBe(true);
  });

  it('detects passport number from OCR lines', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      lines: [
        {
          text: 'Passport No.: ZZ0002147',
          confidence: 91,
          bbox: { x0: 100, y0: 340, x1: 1000, y1: 380 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'ID_NUMBER' && d.text === 'ZZ0002147')).toBe(true);
  });

  it('detects emergency contact name as PERSON', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 1000,
      pageHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      lines: [
        {
          text: 'Emergency contact: Bob Backup',
          confidence: 92,
          bbox: { x0: 100, y0: 400, x1: 1100, y1: 440 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'PERSON' && d.text.includes('Bob Backup'))).toBe(true);
  });

  it('detects all major PII from the scanned admission form OCR lines', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 595,
      pageHeight: 842,
      canvasWidth: 1190,
      canvasHeight: 1684,
      lines: [
        { text: 'Full name: Alice Example', confidence: 92, bbox: { x0: 140, y0: 200, x1: 500, y1: 230 } },
        { text: 'Date of birth: 1986-05-29', confidence: 93, bbox: { x0: 140, y0: 240, x1: 500, y1: 270 } },
        { text: 'Address: Sample Street 7, 1205 Examplecity, ZZ', confidence: 91, bbox: { x0: 140, y0: 280, x1: 700, y1: 310 } },
        { text: 'Phone: +99 78 444 33 22', confidence: 93, bbox: { x0: 140, y0: 320, x1: 500, y1: 350 } },
        { text: 'Insurance No.: INS-ZZ-550-229-104', confidence: 92, bbox: { x0: 140, y0: 360, x1: 600, y1: 390 } },
        { text: 'Passport No.: ZZ0002147', confidence: 91, bbox: { x0: 140, y0: 400, x1: 500, y1: 430 } },
        { text: 'Emergency contact: Bob Backup', confidence: 92, bbox: { x0: 140, y0: 480, x1: 500, y1: 510 } },
        { text: 'Phone: +99 79 111 22 33', confidence: 93, bbox: { x0: 140, y0: 560, x1: 500, y1: 590 } },
        { text: 'Email: alice.example@syntheticmail.example', confidence: 90, bbox: { x0: 140, y0: 600, x1: 700, y1: 630 } },
        { text: 'Treating physician: Dr. Alex Example (synthetic)', confidence: 90, bbox: { x0: 140, y0: 700, x1: 600, y1: 730 } },
      ],
    });

    const types = detections.map((d) => d.type);
    expect(types).toContain('PERSON');
    expect(types).toContain('DATE_OF_BIRTH');
    expect(types).toContain('ADDRESS');
    expect(types).toContain('PHONE');
    expect(types).toContain('INSURANCE_NUMBER');
    expect(types).toContain('ID_NUMBER');
    expect(types).toContain('EMAIL');

    expect(detections.filter((d) => d.type === 'PERSON').length).toBeGreaterThanOrEqual(3);
    expect(detections.filter((d) => d.type === 'PHONE').length).toBeGreaterThanOrEqual(2);

    for (const d of detections) {
      expect(d.source).toBe('ocr');
      expect(d.bbox.width).toBeGreaterThan(0);
      expect(d.bbox.height).toBeGreaterThan(0);
    }
  });

  it('detects French education transcript identity fields from OCR lines', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 595,
      pageHeight: 842,
      canvasWidth: 1190,
      canvasHeight: 1684,
      lines: [
        {
          text: 'Nom: BEPABEPA',
          confidence: 93,
          bbox: { x0: 120, y0: 250, x1: 420, y1: 290 },
        },
        {
          text: 'Prénom(s) : Esther',
          confidence: 93,
          bbox: { x0: 430, y0: 250, x1: 760, y1: 290 },
        },
        {
          text: 'Date/Naissance : 24/11/1996 Lieu/Naissance : Nkwen-Bamenda',
          confidence: 91,
          bbox: { x0: 120, y0: 300, x1: 980, y1: 340 },
        },
        {
          text: 'Matricule : 77HB96',
          confidence: 92,
          bbox: { x0: 120, y0: 350, x1: 540, y1: 390 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'PERSON' && d.text.includes('BEPABEPA'))).toBe(true);
    expect(detections.some((d) => d.type === 'PERSON' && d.text.includes('Esther'))).toBe(true);
    expect(detections.some((d) => d.type === 'DATE_OF_BIRTH' && d.text === '24/11/1996')).toBe(true);
    expect(detections.some((d) => d.type === 'ADDRESS' && d.text.includes('Nkwen-Bamenda'))).toBe(true);
    expect(detections.some((d) => d.type === 'ID_NUMBER' && d.text === '77HB96')).toBe(true);
    expect(detections.some((d) => d.type === 'PHONE' && d.text === '090200014388')).toBe(false);
    expect(detections.some((d) => d.type === 'PERSON' && d.text.includes("bre d' UV"))).toBe(false);
    expect(detections.some((d) => d.type === 'PERSON' && d.text.includes('bre de module'))).toBe(false);
  });

  it('does not detect document section labels as PERSON (DE, EN, FR, IT, ES)', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 595,
      pageHeight: 842,
      canvasWidth: 1190,
      canvasHeight: 1684,
      lines: [
        { text: 'Lieferadresse Rechnungsadresse', confidence: 92, bbox: { x0: 100, y0: 150, x1: 600, y1: 190 } },
        { text: 'Versandkosten Versandkoste', confidence: 90, bbox: { x0: 100, y0: 200, x1: 550, y1: 240 } },
        { text: 'Gesamt MwSt. 42,56 €', confidence: 91, bbox: { x0: 100, y0: 250, x1: 400, y1: 290 } },
        { text: 'Zahlungsart e-Transactions 266,56 €', confidence: 93, bbox: { x0: 100, y0: 300, x1: 600, y1: 340 } },
      ],
    });

    const personDetections = detections.filter((d) => d.type === 'PERSON');
    expect(personDetections.some((d) => d.text.includes('Lieferadresse') || d.text.includes('Rechnungsadresse'))).toBe(false);
    expect(personDetections.some((d) => d.text.includes('Versandkosten') || d.text.includes('Versandkoste'))).toBe(false);
    expect(personDetections.some((d) => d.text.includes('Gesamt') || d.text.includes('MwSt'))).toBe(false);
    expect(personDetections.some((d) => d.text.includes('Zahlungsart') || d.text.includes('e-Transactions'))).toBe(false);
  });

  it('detects scanned CV identity fields from OCR-only lines', () => {
    const detections = detectPiiFromOcrLines({
      pageNumber: 1,
      pageWidth: 595,
      pageHeight: 842,
      canvasWidth: 1190,
      canvasHeight: 1684,
      lines: [
        {
          text: 'Esther Bepa Bepa anid | |',
          confidence: 92,
          bbox: { x0: 100, y0: 120, x1: 700, y1: 170 },
        },
        {
          text: 'Anschrift Djeleng 4 TE ii ve',
          confidence: 90,
          bbox: { x0: 100, y0: 200, x1: 780, y1: 250 },
        },
        {
          text: 'Kontaktdaten 00237677781158 N ANT',
          confidence: 91,
          bbox: { x0: 100, y0: 300, x1: 900, y1: 350 },
        },
        {
          text: 'kbepa@yahoo.com | By ; we N',
          confidence: 93,
          bbox: { x0: 100, y0: 360, x1: 760, y1: 410 },
        },
        {
          text: 'Geburtsdatum und -ort 24.11.1996 in Nkwen 7 i Eo FE ad',
          confidence: 90,
          bbox: { x0: 100, y0: 440, x1: 980, y1: 490 },
        },
      ],
    });

    expect(detections.some((d) => d.type === 'PERSON' && d.text === 'Esther Bepa Bepa')).toBe(true);
    expect(detections.some((d) => d.type === 'ADDRESS' && d.text === 'Djeleng 4')).toBe(true);
    expect(detections.some((d) => d.type === 'PHONE' && d.text === '00237677781158')).toBe(true);
    expect(detections.some((d) => d.type === 'EMAIL' && d.text.includes('kbepa@yahoo.com'))).toBe(true);
    expect(detections.some((d) => d.type === 'DATE_OF_BIRTH' && d.text === '24.11.1996')).toBe(true);
    expect(detections.some((d) => d.type === 'ADDRESS' && d.text === 'Nkwen')).toBe(true);
    expect(detections.filter((d) => d.type === 'EMAIL' && d.text === 'kbepa@yahoo.com')).toHaveLength(1);
  });
});
