import { describe, expect, it } from 'vitest';
import { PIIDetector } from '../core/pii/detector';
import type { ExtractedPdf } from '../types/domain';

describe('context-aware local detection', () => {
  it('detects german field-labeled values like Geburtsdatum/Vorname/Familienname (synthetic)', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'local-form.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 500,
          height: 700,
          text: 'Geburtsdatum: 28.11.1994 Vorname: MAX Familienname: MUSTERMANN Geburtsort: BEISPIELSTADT',
          items: [
            { text: 'Geburtsdatum', x: 10, y: 620, width: 90, height: 10 },
            { text: '28.11.1994', x: 110, y: 620, width: 70, height: 10 },
            { text: 'Vorname', x: 10, y: 600, width: 60, height: 10 },
            { text: 'MAX', x: 80, y: 600, width: 75, height: 10 },
            { text: 'Familienname', x: 10, y: 580, width: 90, height: 10 },
            { text: 'MUSTERMANN', x: 110, y: 580, width: 90, height: 10 },
            { text: 'Geburtsort', x: 10, y: 560, width: 80, height: 10 },
            { text: 'BEISPIELSTADT', x: 100, y: 560, width: 70, height: 10 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });

    expect(detections.some((detection) => detection.type === 'DATE_OF_BIRTH' && detection.text.includes('28.11.1994'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.toLowerCase().includes('max'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.toLowerCase().includes('mustermann'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'ADDRESS' && detection.text.toLowerCase().includes('beispielstadt'))).toBe(true);
  });

  it('detects spanish field-labeled values', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'es-form.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 500,
          height: 700,
          text: 'Fecha de nacimiento: 12/05/1988 Nombre: CARLA Apellido: GARCIA Telefono: +34 612 34 56 78 Correo electronico: carla@example.es',
          items: [
            { text: 'Fecha de nacimiento', x: 10, y: 620, width: 130, height: 10 },
            { text: '12/05/1988', x: 150, y: 620, width: 70, height: 10 },
            { text: 'Nombre', x: 10, y: 600, width: 60, height: 10 },
            { text: 'CARLA', x: 80, y: 600, width: 55, height: 10 },
            { text: 'Apellido', x: 10, y: 580, width: 70, height: 10 },
            { text: 'GARCIA', x: 90, y: 580, width: 65, height: 10 },
            { text: 'Telefono', x: 10, y: 560, width: 65, height: 10 },
            { text: '+34 612 34 56 78', x: 85, y: 560, width: 110, height: 10 },
            { text: 'Correo electronico', x: 10, y: 540, width: 120, height: 10 },
            { text: 'carla@example.es', x: 140, y: 540, width: 110, height: 10 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });

    expect(detections.some((detection) => detection.type === 'DATE_OF_BIRTH' && detection.text.includes('12/05/1988'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.toLowerCase().includes('carla'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.toLowerCase().includes('garcia'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PHONE' && detection.text.includes('612'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'EMAIL' && detection.text.includes('carla@example.es'))).toBe(true);
  });

  it('detects standalone header name + address block without explicit labels', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'header-block.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 600,
          height: 800,
          text: 'Kraftfahrt-Bundesamt\nMax Mustermann\nMusterstr. 78\n51063 Beispielstadt',
          items: [
            { text: 'Kraftfahrt-Bundesamt', x: 40, y: 760, width: 200, height: 12 },
            { text: 'Max Mustermann', x: 40, y: 720, width: 210, height: 12 },
            { text: 'Musterstr. 78', x: 40, y: 700, width: 150, height: 12 },
            { text: '51063 Beispielstadt', x: 40, y: 680, width: 170, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });

    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.includes('Max Mustermann'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'ADDRESS' && detection.text.includes('Musterstr. 78'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'ADDRESS' && detection.text.includes('51063 Beispielstadt'))).toBe(true);
  });

  it('aggressive mode expands detected PII to full sentence/line coverage', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'sentence.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 600,
          height: 800,
          text: 'Sehr geehrte(r) Frau/Herr Max Mustermann,',
          items: [
            { text: 'Sehr geehrte(r) Frau/Herr Max Mustermann,', x: 40, y: 700, width: 280, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false, aggressiveLineMode: true });

    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.includes('Max Mustermann'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.includes('Sehr geehrte'))).toBe(true);
  });

  it('detects standalone address from item geometry when page text is flattened', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'flattened-text.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 600,
          height: 800,
          text: 'Max Mustermann Musterstr. 78 51063 Beispielstadt',
          items: [
            { text: 'Max Mustermann', x: 40, y: 720, width: 210, height: 12 },
            { text: 'Musterstr. 78', x: 40, y: 700, width: 150, height: 12 },
            { text: '51063 Beispielstadt', x: 40, y: 680, width: 170, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });

    expect(detections.some((detection) => detection.type === 'ADDRESS' && detection.text.includes('Musterstr. 78'))).toBe(true);
    expect(detections.some((detection) => detection.type === 'ADDRESS' && detection.text.includes('51063 Beispielstadt'))).toBe(true);
  });

  it('keeps repeated same-text PII occurrences on the same page', async () => {
    const detector = new PIIDetector();
           const text = 'Sehr geehrte(r) Frau/Herr Max Mustermann, Geburtsname Max Mustermann Familienname Max Mustermann';

    const fakePdf: ExtractedPdf = {
      fileName: 'repeated-names.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 600,
          height: 800,
          text,
          items: [
            { text: 'Sehr geehrte(r) Frau/Herr Max Mustermann,', x: 40, y: 720, width: 280, height: 12 },
            { text: 'Geburtsname', x: 40, y: 700, width: 90, height: 12 },
            { text: 'Max Mustermann', x: 140, y: 700, width: 90, height: 12 },
            { text: 'Familienname', x: 250, y: 700, width: 90, height: 12 },
            { text: 'Max Mustermann', x: 350, y: 700, width: 90, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    const repeated = detections.filter(
      (detection) => detection.type === 'PERSON' && detection.text.toUpperCase().includes('MAX MUSTERMANN'),
    );

    expect(repeated.length).toBeGreaterThanOrEqual(2);
  });

  it('detects inline label+value items (e.g. Familienname Max Mustermann)', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'inline-label-value.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 600,
          height: 800,
          text: 'Familienname Max Mustermann',
          items: [{ text: 'Familienname Max Mustermann', x: 260, y: 520, width: 170, height: 12 }],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    expect(
      detections.some(
        (detection) =>
          detection.type === 'PERSON' &&
          detection.text.toUpperCase().includes('MAX MUSTERMANN'),
      ),
    ).toBe(true);
  });

  it('detects account holder names and titled comma-separated recipient names', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'invoice-names.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 800,
          height: 1000,
          text: 'Zahlungsdetails:\nKontoinhaber: Max Mustermann\nEmpfänger:\nDr. Beispiel, Erika Muster',
          items: [
            { text: 'Zahlungsdetails:', x: 500, y: 900, width: 120, height: 12 },
            { text: 'Kontoinhaber: Max Mustermann', x: 500, y: 880, width: 250, height: 12 },
            { text: 'Empfänger:', x: 100, y: 700, width: 90, height: 12 },
            { text: 'Dr. Beispiel, Erika Muster', x: 100, y: 680, width: 250, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    const personTexts = detections
      .filter((detection) => detection.type === 'PERSON')
      .map((detection) => detection.text.toLowerCase());

    expect(personTexts.some((text) => text.includes('max mustermann'))).toBe(true);
    expect(personTexts.some((text) => text.includes('beispiel'))).toBe(true);
    expect(personTexts.some((text) => text.includes('erika muster'))).toBe(true);
  });

  it('rejects screenshot-style generic document phrases and business contact fields as PII', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'business-invoice-copy.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 900,
          height: 1200,
          text:
            'Gewünschte Optionale Absicherungen\n' +
            'Abgelehnte Optionale Absicherungen\n' +
            'Verkauft durch Beispielhandel e. K.\n' +
            'E-Mail kontakt@example-pharmacy.example\n' +
            'Telefon +49-0000-000000\n' +
            'Registrierte Adresse in der Beispielallee 42, 99999 Musterstadt\n' +
            '03.2099-08.03.2099\n' +
            'UC0000 SELBSTBETEILIGUNG 000',
          items: [
            { text: 'Gewünschte Optionale Absicherungen', x: 40, y: 980, width: 320, height: 12 },
            { text: 'Abgelehnte Optionale Absicherungen', x: 40, y: 960, width: 320, height: 12 },
            { text: 'Verkauft durch', x: 420, y: 900, width: 120, height: 12 },
            { text: 'Beispielhandel e. K.', x: 560, y: 900, width: 140, height: 12 },
            { text: 'E-Mail', x: 420, y: 880, width: 60, height: 12 },
            { text: 'kontakt@example-pharmacy.example', x: 560, y: 880, width: 260, height: 12 },
            { text: 'Telefon', x: 420, y: 860, width: 70, height: 12 },
            { text: '+49-0000-000000', x: 560, y: 860, width: 140, height: 12 },
            { text: 'Registrierte Adresse in der Beispielallee 42, 99999 Musterstadt', x: 40, y: 820, width: 420, height: 12 },
            { text: '03.2099-08.03.2099', x: 40, y: 800, width: 180, height: 12 },
            { text: 'UC0000 SELBSTBETEILIGUNG 000', x: 40, y: 780, width: 230, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    const texts = detections.map((detection) => detection.text);

    expect(texts.some((text) => text.includes('Gewünschte Optionale Absicherungen'))).toBe(false);
    expect(texts.some((text) => text.includes('Abgelehnte Optionale Absicherungen'))).toBe(false);
    expect(texts.some((text) => text.includes('kontakt@example-pharmacy.example'))).toBe(false);
    expect(texts.some((text) => text.includes('+49-0000-000000'))).toBe(false);
    expect(texts.some((text) => text.includes('Beispielallee 42'))).toBe(false);
    expect(texts.some((text) => text.includes('03.2099-08.03.2099'))).toBe(false);
    expect(texts.some((text) => text.includes('UC0000 SELBSTBETEILIGUNG 000'))).toBe(false);
  });

  it('keeps personal recipient fields while avoiding full-line expansion of mixed invoice metadata', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'mixed-invoice-line.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 900,
          height: 1200,
          text: 'Mieter: Max Mustermann Rechnungsdatum 11.03.2026 Rechnungsnr. DEM060143754',
          items: [{ text: 'Mieter: Max Mustermann Rechnungsdatum 11.03.2026 Rechnungsnr. DEM060143754', x: 40, y: 900, width: 700, height: 12 }],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false, aggressiveLineMode: true });

    expect(detections.some((detection) => detection.type === 'PERSON' && detection.text.includes('Max Mustermann'))).toBe(true);
    expect(
      detections.some(
        (detection) =>
          detection.text.includes('Rechnungsdatum 11.03.2026') ||
          detection.text.includes('Rechnungsnr. DEM060143754'),
      ),
    ).toBe(false);
  });

  it('does not redact rental branch location, business holder, or fee sections from screenshot-style content', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'rental-summary.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 1100,
          height: 1600,
          text:
            'Mieter: Max Mustermann\n' +
            'Mietbeginn\n' +
            'Donnerstag, 5. März 2026 16:54\n' +
            'BEISPIELSTR. 1\n' +
            '99999 BEISPIELORT\n' +
            '0000 000000\n' +
            'Erwartete Rückgabe\n' +
            'Sonntag, 8. März 2026 16:00\n' +
            'BEISPIELSTR. 1\n' +
            '99999 BEISPIELORT\n' +
            '0000 000000\n' +
            'MITGLIEDERVORTEILSPREIS\n' +
            'PERSONAL EFFECTS COVERAGE\n' +
            'RAP\n' +
            'TANKGEBÜHR\n' +
            'KRAFTSTOFF\n' +
            'MEHRWERTSTEUER (19%)\n' +
            'TAGESPREIS: 47,94 €/ Tag\n' +
            'Halter: BEISPIEL AUTOVERMIETUNG GMBH & CO. KG',
          items: [
            { text: 'Mieter: Max Mustermann', x: 40, y: 1500, width: 260, height: 12 },
            { text: 'Mietbeginn', x: 40, y: 1460, width: 120, height: 12 },
            { text: 'Donnerstag, 5. März 2026 16:54', x: 40, y: 1440, width: 260, height: 12 },
            { text: 'BEISPIELSTR. 1', x: 340, y: 1440, width: 180, height: 12 },
            { text: '99999 BEISPIELORT', x: 340, y: 1420, width: 160, height: 12 },
            { text: '0000 000000', x: 340, y: 1400, width: 110, height: 12 },
            { text: 'Erwartete Rückgabe', x: 40, y: 1360, width: 150, height: 12 },
            { text: 'Sonntag, 8. März 2026 16:00', x: 40, y: 1340, width: 240, height: 12 },
            { text: 'BEISPIELSTR. 1', x: 340, y: 1340, width: 180, height: 12 },
            { text: '99999 BEISPIELORT', x: 340, y: 1320, width: 160, height: 12 },
            { text: '0000 000000', x: 340, y: 1300, width: 110, height: 12 },
            { text: 'MITGLIEDERVORTEILSPREIS', x: 40, y: 1260, width: 250, height: 12 },
            { text: 'PERSONAL EFFECTS COVERAGE', x: 560, y: 1240, width: 220, height: 12 },
            { text: 'RAP', x: 560, y: 1220, width: 40, height: 12 },
            { text: 'TANKGEBÜHR', x: 560, y: 1200, width: 100, height: 12 },
            { text: 'KRAFTSTOFF', x: 560, y: 1180, width: 100, height: 12 },
            { text: 'MEHRWERTSTEUER (19%)', x: 560, y: 1160, width: 170, height: 12 },
            { text: 'TAGESPREIS: 47,94 €/ Tag', x: 40, y: 1140, width: 200, height: 12 },
            { text: 'Halter: BEISPIEL AUTOVERMIETUNG GMBH & CO. KG', x: 560, y: 1120, width: 420, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false, aggressiveLineMode: true });
    const texts = detections.map((detection) => detection.text);

    expect(texts.some((text) => text.includes('Max Mustermann'))).toBe(true);
    expect(texts.some((text) => text.includes('BEISPIELSTR. 1'))).toBe(false);
    expect(texts.some((text) => text.includes('0000 000000'))).toBe(false);
    expect(texts.some((text) => text.includes('ADAC MITGLIEDERVORTEILSPREIS'))).toBe(false);
    expect(texts.some((text) => text.includes('PERSONAL EFFECTS COVERAGE'))).toBe(false);
    expect(texts.some((text) => text.includes('RAP'))).toBe(false);
    expect(texts.some((text) => text.includes('TANKGEBÜHR'))).toBe(false);
    expect(texts.some((text) => text.includes('KRAFTSTOFF'))).toBe(false);
    expect(texts.some((text) => text.includes('MEHRWERTSTEUER'))).toBe(false);
    expect(texts.some((text) => text.includes('TAGESPREIS'))).toBe(false);
    expect(texts.some((text) => text.includes('BEISPIEL AUTOVERMIETUNG'))).toBe(false);
  });

  it('detects recipient billing and delivery address blocks on invoice layouts', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'invoice-address-blocks.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 1100,
          height: 1600,
          text:
            'Rechnungsadresse\n' +
            'Max Mustermann\n' +
            'Beispielstr. 10\n' +
            '99999 Beispielstadt\n' +
            'Lieferadresse\n' +
            'Max Mustermann\n' +
            'Beispielstr. 10\n' +
            '99999 Beispielstadt\n' +
            'Verkauft durch\n' +
            'Beispiel Apotheke Stadt\n' +
            'Beispielweg 1',
          items: [
            { text: 'Rechnungsadresse', x: 80, y: 1200, width: 140, height: 12 },
            { text: 'Max Mustermann', x: 80, y: 1180, width: 180, height: 12 },
            { text: 'Beispielstr. 10', x: 80, y: 1160, width: 130, height: 12 },
            { text: '99999 Beispielstadt', x: 80, y: 1140, width: 140, height: 12 },
            { text: 'Lieferadresse', x: 360, y: 1200, width: 120, height: 12 },
            { text: 'Max Mustermann', x: 360, y: 1180, width: 180, height: 12 },
            { text: 'Beispielstr. 10', x: 360, y: 1160, width: 130, height: 12 },
            { text: '99999 Beispielstadt', x: 360, y: 1140, width: 140, height: 12 },
            { text: 'Verkauft durch', x: 720, y: 1200, width: 110, height: 12 },
            { text: 'Beispiel Apotheke Stadt', x: 720, y: 1180, width: 200, height: 12 },
            { text: 'Beispielweg 1', x: 720, y: 1160, width: 120, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    const texts = detections.map((detection) => detection.text);

    expect(texts.some((text) => text.includes('Max Mustermann'))).toBe(true);
    expect(texts.some((text) => text.includes('Beispielstr. 10'))).toBe(true);
    expect(texts.some((text) => text.includes('99999 Beispielstadt'))).toBe(true);
    expect(texts.some((text) => text.includes('Beispiel Apotheke Stadt'))).toBe(false);
    expect(texts.some((text) => text.includes('Beispielweg 1'))).toBe(false);
  });

  it('keeps top recipient address block detection even when a sender business line appears above it', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'header-recipient-block.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 1100,
          height: 1600,
          text:
            'Beispiel Apotheke Stadt · Beispielweg 1 · 99999 Beispielstadt\n' +
            'Max Mustermann\n' +
            'Beispielstr. 10\n' +
            '99999 Beispielstadt',
          items: [
            { text: 'Beispiel Apotheke Stadt · Beispielweg 1 · 99999 Beispielstadt', x: 80, y: 1260, width: 360, height: 12 },
            { text: 'Max Mustermann', x: 80, y: 1220, width: 180, height: 12 },
            { text: 'Beispielstr. 10', x: 80, y: 1200, width: 130, height: 12 },
            { text: '99999 Beispielstadt', x: 80, y: 1180, width: 140, height: 12 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    const texts = detections.map((detection) => detection.text);

    expect(texts.some((text) => text.includes('Max Mustermann'))).toBe(true);
    expect(texts.some((text) => text.includes('Beispielstr. 10'))).toBe(true);
    expect(texts.some((text) => text.includes('99999 Beispielstadt'))).toBe(true);
  });

  it('detects sender-line-over-recipient header blocks', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'sender-over-recipient.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 1100,
          height: 1600,
          text:
            'Beispiel Apotheke Stadt · Beispielweg 1 · 99999 Beispielstadt\n' +
            'Max Mustermann\n' +
            'Beispielstr. 10\n' +
            '99999 Beispielstadt',
          items: [
            { text: 'Beispiel Apotheke Stadt · Beispielweg 1 · 99999 Beispielstadt', x: 58.5, y: 674.952, width: 200, height: 6.8 },
            { text: 'Max Mustermann', x: 58.5, y: 652.974, width: 97.04, height: 9 },
            { text: 'Beispielstr. 10', x: 58.5, y: 641.985, width: 64.03, height: 9 },
            { text: '99999 Beispielstadt', x: 58.5, y: 630.996, width: 80, height: 9 },
          ],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    const texts = detections.map((detection) => detection.text);

    expect(texts.some((text) => text.includes('Max Mustermann'))).toBe(true);
    expect(texts.some((text) => text.includes('Beispielstr. 10'))).toBe(true);
    expect(texts.some((text) => text.includes('99999 Beispielstadt'))).toBe(true);
  });

  it('does not classify medicine product titles as person names in invoice item tables', async () => {
    const detector = new PIIDetector();

    const fakePdf: ExtractedPdf = {
      fileName: 'invoice-product-title.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      pages: [
        {
          page: 1,
          width: 1000,
          height: 1400,
          text: 'Hametum Hämorrhoidenzäpfchen',
          items: [{ text: 'Hametum Hämorrhoidenzäpfchen', x: 120, y: 900, width: 220, height: 12 }],
          spans: [],
        },
      ],
    };

    const detections = await detector.detect(fakePdf, { useRegex: true, useNER: false });
    expect(detections.some((detection) => detection.type === 'PERSON')).toBe(false);
  });
});
