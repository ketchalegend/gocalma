import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import type { Detection, ExtractedPdf, PiiType } from '../../types/domain';
import { REGEX_PATTERNS } from '../pii/patterns';

interface OcrOptions {
  language?: string;
  minWordConfidence?: number;
  minLineConfidence?: number;
  minPageTextLength?: number;
}

interface OcrWord {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrLine {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words?: OcrWord[];
}

interface OcrDetectionInput {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  lines: OcrLine[];
}

interface OcrLineRule {
  type: PiiType;
  pattern: RegExp;
  valueGroup: number;
  confidence: number;
}

const OCR_LABEL_SEPARATOR = '(?:\\s*[:.\\-]\\s*|\\s+)';

let detectionId = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ocrWorker: any = null;
const OCR_LANG_PATH = new URL(
  `${import.meta.env.BASE_URL}tessdata`,
  window.location.origin,
).toString();

function nextId() {
  detectionId += 1;
  return `ocr-${detectionId.toString().padStart(4, '0')}`;
}

function classifyWord(word: string): PiiType | null {
  for (const rule of REGEX_PATTERNS) {
    const regex = new RegExp(
      `^(?:${rule.pattern.source})$`,
      rule.pattern.flags.replace('g', ''),
    );
    if (regex.test(word.trim())) {
      return rule.type;
    }
  }
  return null;
}

const PERSON_LABEL =
  'full name|name|nom|pr[eé]nom(?:\\(s\\))?|prenom(?:\\(s\\))?|recipient|empf[a\u00e4]nger|kontoinhaber|account holder' +
  '|patient(?: name)?|emergency contact|treating physician|arzt' +
  '|m[e\u00e9]decin|medico';

const PERSON_VALUE =
  "(?:(?:dr|mr|mrs|ms|prof|frau|herr)\\.?\\s+)?[A-Z\u00c0-\u00d6\u00d8-\u00dd][\\p{L}''.\\x2d]{1,30}" +
  "(?:\\s*,?\\s*[A-Z\u00c0-\u00d6\u00d8-\u00dd][\\p{L}''.\\x2d]{1,30}){0,4}";

const DOB_LABEL =
  'date of birth|dob|geburtsdatum(?:\\s+und\\s+-?ort)?|fecha de nacimiento|date de naissance|date/naissance|data di nascita';

const PHONE_LABEL = 'phone|telefon|tel\\.?|telefono|t[e\u00e9]l[e\u00e9]phone|kontaktdaten';

const EMAIL_LABEL =
  'e-?mail|correo(?: electr[o\u00f3]nico)?|courriel|posta elettronica';

const INSURANCE_LABEL =
  'insurance no\\.?|insurance number|policy no\\.?|versicherungsnummer|versicherungs-?nr\\.?';

const PASSPORT_LABEL =
  'passport(?: no\\.?)?|pass(?:port)?[-\\s]?nr\\.?|document id|ausweis[-\\s]?nr\\.?|matricule|student id|id etudiant';

const ADDRESS_LABEL =
  'address|adresse|direcci[o\u00f3]n|indirizzo|lieu de naissance|lieu/naissance|place of birth|anschrift';
const OCR_LINE_RULES: OcrLineRule[] = [
  {
    type: 'PERSON',
    pattern: new RegExp(
      `\\b(${PERSON_LABEL})${OCR_LABEL_SEPARATOR}(${PERSON_VALUE})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.93,
  },
  {
    type: 'ADDRESS',
    pattern:
      new RegExp(
        `\\b(${ADDRESS_LABEL})${OCR_LABEL_SEPARATOR}([^\\n]{4,120})`,
        'giu',
      ),
    valueGroup: 2,
    confidence: 0.92,
  },
  {
    type: 'DATE_OF_BIRTH',
    pattern: new RegExp(
      `\\b(${DOB_LABEL})${OCR_LABEL_SEPARATOR}((?:[0-3]?\\d[./-][01]?\\d[./-](?:19|20)?\\d{2})|(?:(?:19|20)\\d{2}-\\d{2}-\\d{2}))`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.95,
  },
  {
    type: 'PHONE',
    pattern: new RegExp(
      `\\b(${PHONE_LABEL})${OCR_LABEL_SEPARATOR}(\\+?\\d[\\d\\s()./-]{7,}\\d)`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.94,
  },
  {
    type: 'EMAIL',
    pattern: new RegExp(
      `\\b(${EMAIL_LABEL})${OCR_LABEL_SEPARATOR}([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.95,
  },
  {
    type: 'IBAN',
    pattern: new RegExp(`\\b(iban)${OCR_LABEL_SEPARATOR}([A-Z]{2}\\d{2}(?:\\s?[A-Z0-9]){11,30})`, 'giu'),
    valueGroup: 2,
    confidence: 0.98,
  },
  {
    type: 'INSURANCE_NUMBER',
    pattern: new RegExp(
      `\\b(${INSURANCE_LABEL})${OCR_LABEL_SEPARATOR}([A-Z]{2,6}(?:-[A-Z]{2,6})?(?:-\\d{2,6}){1,4}|[A-Z]{2,6}\\d{6,})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.96,
  },
  {
    type: 'ID_NUMBER',
    pattern: new RegExp(
      `\\b(${PASSPORT_LABEL})${OCR_LABEL_SEPARATOR}([A-Z0-9]{2,40})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.95,
  },
];

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function createBBoxFromOcrBbox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageWidth: number,
  pageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const xScale = pageWidth / canvasWidth;
  const yScale = pageHeight / canvasHeight;
  const x = bbox.x0 * xScale;
  const y = bbox.y0 * yScale;
  const width = Math.max((bbox.x1 - bbox.x0) * xScale, 12);
  const height = Math.max((bbox.y1 - bbox.y0) * yScale, 10);
  return { x, y, width, height };
}

function findValueBBoxInLine(
  line: OcrLine,
  value: string,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const lineText = line.text ?? '';
  const exactStart = lineText.toLowerCase().indexOf(value.toLowerCase());
  if (exactStart >= 0) {
    const startRatio = exactStart / Math.max(lineText.length, 1);
    const endRatio =
      (exactStart + value.length) / Math.max(lineText.length, 1);
    const width = line.bbox.x1 - line.bbox.x0;
    return {
      x0: line.bbox.x0 + width * startRatio,
      x1: line.bbox.x0 + width * endRatio,
      y0: line.bbox.y0,
      y1: line.bbox.y1,
    };
  }

  const words = line.words ?? [];
  if (words.length === 0) return null;
  const wanted = value
    .split(/\s+/)
    .map((token) => normalizeForMatch(token))
    .filter(Boolean);
  if (wanted.length === 0) return null;

  const normalizedWords = words.map((word) => normalizeForMatch(word.text));
  for (let i = 0; i <= normalizedWords.length - wanted.length; i += 1) {
    const slice = normalizedWords.slice(i, i + wanted.length);
    const matches = wanted.every(
      (token, idx) =>
        slice[idx]?.includes(token) || token.includes(slice[idx] ?? ''),
    );
    if (!matches) continue;
    const matchedWords = words.slice(i, i + wanted.length);
    return {
      x0: Math.min(...matchedWords.map((word) => word.bbox.x0)),
      y0: Math.min(...matchedWords.map((word) => word.bbox.y0)),
      x1: Math.max(...matchedWords.map((word) => word.bbox.x1)),
      y1: Math.max(...matchedWords.map((word) => word.bbox.y1)),
    };
  }

  return null;
}

function createDetectionFromOcrLine(
  input: OcrDetectionInput,
  line: OcrLine,
  type: PiiType,
  value: string,
  confidence: number,
): Detection {
  const bbox = findValueBBoxInLine(line, value) ?? line.bbox;
  return {
    id: nextId(),
    type,
    text: value,
    page: input.pageNumber,
    bbox: createBBoxFromOcrBbox(
      bbox,
      input.pageWidth,
      input.pageHeight,
      input.canvasWidth,
      input.canvasHeight,
    ),
    confidence,
    source: 'ocr',
  };
}

function normalizeOcrAddressValue(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  const streetWithNumber = /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ýa-zÀ-ÖØ-öø-ÿ'’.-]+){0,4}\s+\d{1,4}[A-Za-z]?)/u.exec(cleaned);
  if (streetWithNumber) return streetWithNumber[1].trim();

  const cityLike = /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:[-\s][A-ZÀ-ÖØ-Ýa-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})/u.exec(cleaned);
  return cityLike ? cityLike[1].trim() : cleaned;
}

function detectCvStyleOcrFields(
  input: OcrDetectionInput,
  minLineConfidence: number,
): Detection[] {
  const detections: Detection[] = [];
  const lines = input.lines.filter((line) => (line.confidence ?? 100) >= minLineConfidence && line.text?.trim());

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineText = line.text.trim();

    if (index < 3) {
      const nameMatch = /^([A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}){1,3})\b/u.exec(lineText);
      if (nameMatch) {
        const candidate = nameMatch[1];
        const nextLine = lines[index + 1]?.text?.trim();
        const hasFinancialContext = /(?:€|\$|£|CHF)|\d+[.,]\d{2}\s*(?:€|CHF)?/.test(lineText);
        const nextLooksLikeAddress = nextLine && (/\d/.test(nextLine) && /\b(str|strasse|straße|street|weg|gasse|via|rue|anschrift)\b/i.test(nextLine));
        if (!hasFinancialContext && nextLooksLikeAddress) {
          detections.push(createDetectionFromOcrLine(input, line, 'PERSON', candidate, 0.92));
        }
      }
    }

    const addressMatch = /\banschrift\b\s+([^\n]{4,80})/iu.exec(lineText);
    if (addressMatch) {
      detections.push(
        createDetectionFromOcrLine(
          input,
          line,
          'ADDRESS',
          normalizeOcrAddressValue(addressMatch[1]),
          0.9,
        ),
      );
    }

    const phoneMatch = /\bkontaktdaten\b\s+(\+?\d{8,15})\b/iu.exec(lineText);
    if (phoneMatch) {
      detections.push(createDetectionFromOcrLine(input, line, 'PHONE', phoneMatch[1], 0.92));
    }

    const emailMatch = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/u.exec(lineText);
    if (emailMatch) {
      detections.push(createDetectionFromOcrLine(input, line, 'EMAIL', emailMatch[1], 0.95));
    }

    const birthLineMatch =
      /\bgeburtsdatum(?:\s+und\s+-?ort)?\b\s+((?:[0-3]?\d[./-][01]?\d[./-](?:19|20)?\d{2}))(?:\s+in\s+([A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?:[-\s][A-ZÀ-ÖØ-Ý][\p{L}'’-]+){0,3}))?/iu.exec(lineText);
    if (birthLineMatch) {
      detections.push(createDetectionFromOcrLine(input, line, 'DATE_OF_BIRTH', birthLineMatch[1], 0.95));
      if (birthLineMatch[2]) {
        detections.push(createDetectionFromOcrLine(input, line, 'ADDRESS', birthLineMatch[2], 0.9));
      }
    }
  }

  return detections;
}

export function detectPiiFromOcrLines(
  input: OcrDetectionInput,
  minLineConfidence = 55,
): Detection[] {
  const detections: Detection[] = [];

  for (const line of input.lines) {
    const lineText = line.text?.trim();
    if (!lineText) continue;
    if ((line.confidence ?? 100) < minLineConfidence) continue;

    for (const rule of OCR_LINE_RULES) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null = regex.exec(lineText);
      while (match) {
        const value = match[rule.valueGroup]?.trim();
        if (value) {
          const bbox = findValueBBoxInLine(line, value) ?? line.bbox;
          detections.push({
            id: nextId(),
            type: rule.type,
            text: value,
            page: input.pageNumber,
            bbox: createBBoxFromOcrBbox(
              bbox,
              input.pageWidth,
              input.pageHeight,
              input.canvasWidth,
              input.canvasHeight,
            ),
            confidence: rule.confidence,
            source: 'ocr',
          });
        }
        match = regex.exec(lineText);
      }
    }
  }

  detections.push(...detectCvStyleOcrFields(input, minLineConfidence));

  return filterOcrDetections(detections);
}

function dedupeOcrDetections(detections: Detection[]): Detection[] {
  const byKey = new Map<string, Detection>();

  for (const detection of detections) {
    const normalizedText = detection.text.toLowerCase().trim();
    const coarsePosition =
      detection.type === 'EMAIL' || detection.type === 'PHONE'
        ? 'global'
        : `${Math.round(detection.bbox.x / 24)}|${Math.round(detection.bbox.y / 24)}`;
    const key =
      detection.type === 'ADDRESS'
        ? `${detection.page}|${detection.type}|${coarsePosition}`
        : `${detection.page}|${detection.type}|${normalizedText}|${coarsePosition}`;
    const existing = byKey.get(key);
    if (!existing || isPreferredOcrDetection(detection, existing)) {
      byKey.set(key, detection);
    }
  }

  return Array.from(byKey.values());
}

function isPreferredOcrDetection(candidate: Detection, existing: Detection): boolean {
  if (candidate.type === 'ADDRESS' && existing.type === 'ADDRESS') {
    const candidateNoise = (candidate.text.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.-]/g) ?? []).length;
    const existingNoise = (existing.text.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.-]/g) ?? []).length;
    if (candidateNoise !== existingNoise) return candidateNoise < existingNoise;
    if (candidate.text.length !== existing.text.length) return candidate.text.length < existing.text.length;
  }
  return candidate.confidence > existing.confidence;
}

function isLikelyOcrPhone(text: string): boolean {
  const cleaned = text.trim();
  const digits = cleaned.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  // Allow compact numbers: 00 (international) or 0 + 10–15 digits (German mobile/landline)
  if (/^\d+$/.test(cleaned)) {
    return cleaned.startsWith('00') || (cleaned.startsWith('0') && digits.length >= 10);
  }
  const separators = (cleaned.match(/[\s()./-]/g) ?? []).length;
  return cleaned.startsWith('+') || separators >= 2;
}

/** Education transcripts / form headers – not document labels, small edge-case list. */
const OCR_NON_NAME_HINTS = ['uv', 'module', 'moyenne', 'pourcentage', 'credit', 'annee', 'niveau', 'anschrift', 'kontaktdaten'] as const;

function isLikelyOcrPerson(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned || /\d/.test(cleaned)) return false;
  const lowered = cleaned.toLowerCase();
  if (OCR_NON_NAME_HINTS.some((hint) => lowered.includes(hint))) return false;
  const parts = cleaned.split(' ');
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’.()-]{1,30}$/u.test(part));
}

function filterOcrDetections(detections: Detection[]): Detection[] {
  return detections.filter((detection) => {
    if (detection.type === 'PHONE') return isLikelyOcrPhone(detection.text);
    if (detection.type === 'PERSON') return isLikelyOcrPerson(detection.text);
    return true;
  });
}

const IMAGE_OPS = new Set([82, 85, 86]);
const TEXT_COVERAGE_THRESHOLD = 0.05;

async function pageNeedsOcr(
  pdfPage: { getOperatorList: () => Promise<{ fnArray: number[] }> },
  extractedPage: { text: string; width: number; height: number; items: { width: number; height: number }[] },
): Promise<boolean> {
  if (extractedPage.text.trim().length === 0) return true;

  const ops = await pdfPage.getOperatorList();
  const hasImages = ops.fnArray.some((op: number) => IMAGE_OPS.has(op));
  if (!hasImages) return extractedPage.text.length < 120;

  const pageArea = extractedPage.width * extractedPage.height;
  if (pageArea <= 0) return true;
  let textArea = 0;
  for (const item of extractedPage.items) {
    textArea += item.width * item.height;
  }
  return textArea / pageArea < TEXT_COVERAGE_THRESHOLD;
}

export async function detectOcrDetections(
  pdf: ExtractedPdf,
  options: OcrOptions = {},
): Promise<Detection[]> {
  if (typeof document === 'undefined') {
    console.warn('[OCR] Skipping: no DOM (Node.js environment)');
    return [];
  }

  console.log('[OCR] Starting OCR detection pipeline...');
  const language = options.language ?? 'eng+deu+fra+ita+spa';
  const minWordConfidence = options.minWordConfidence ?? 70;
  const minLineConfidence = options.minLineConfidence ?? 55;
  const detections: Detection[] = [];

   const doc = await getDocument({
     data: Uint8Array.from(pdf.bytes),
   }).promise;

  console.log(`[OCR] PDF loaded: ${doc.numPages} page(s)`);

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const existing = pdf.pages[pageNumber - 1];
    if (!existing) continue;

    try {
      const page = await doc.getPage(pageNumber);
      const needsOcr = await pageNeedsOcr(page, existing);
      console.log(`[OCR] Page ${pageNumber}: needsOcr=${needsOcr}, textLen=${existing.text.trim().length}, items=${existing.items.length}`);
      if (!needsOcr) continue;

      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn(`[OCR] Page ${pageNumber}: could not get 2D context`);
        continue;
      }

      await page.render({ canvas, viewport, canvasContext: ctx }).promise;

      console.log(`[OCR] Page ${pageNumber}: rendered to canvas ${canvas.width}x${canvas.height}`);

      console.log(`[OCR] Page ${pageNumber}: running Tesseract (${language})...`);

      if (!ocrWorker) {
        ocrWorker = await createWorker(language, 1, {
          langPath: OCR_LANG_PATH,
          gzip: false,
          logger: (m: { status: string; progress: number }) => {
            console.log(`[OCR] Tesseract: ${m.status} ${Math.round((m.progress ?? 0) * 100)}%`);
          },
        });
      }

      const result = await ocrWorker.recognize(canvas, {}, { blocks: true, text: true, layoutBlocks: false, hocr: false, tsv: false });

      const blocks = result.data?.blocks ?? [];
      const words: OcrWord[] = [];
      const lines: OcrLine[] = [];
      for (const block of blocks) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            lines.push({
              text: line.text,
              confidence: line.confidence,
              bbox: line.bbox,
              words: line.words?.map((w: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }) => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox,
              })) ?? [],
            });
            for (const w of line.words ?? []) {
              words.push({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox,
              });
            }
          }
        }
      }
      console.log(`[OCR] Page ${pageNumber}: Tesseract found ${words.length} words, ${lines.length} lines`);
      if (lines.length > 0) {
        console.log(`[OCR] First 3 lines:`, lines.slice(0, 3).map((l: OcrLine) => l.text));
      }
      existing.ocrText = lines
        .map((line) => line.text?.trim() ?? '')
        .filter(Boolean)
        .join('\n');

      for (const word of words) {
        if (!word.text?.trim()) continue;
        if ((word.confidence ?? 0) < minWordConfidence) continue;

        const type = classifyWord(word.text);
        if (!type) continue;

        const bbox = createBBoxFromOcrBbox(
          word.bbox,
          existing.width,
          existing.height,
          canvas.width,
          canvas.height,
        );

        detections.push({
          id: nextId(),
          type,
          text: word.text,
          page: pageNumber,
          bbox,
          confidence: Math.min((word.confidence ?? 0) / 100, 1),
          source: 'ocr',
        });
      }

      detections.push(
        ...detectPiiFromOcrLines(
          {
            pageNumber,
            pageWidth: existing.width,
            pageHeight: existing.height,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            lines,
          },
          minLineConfidence,
        ),
      );
    } catch (pageErr) {
      console.error(`[OCR] Page ${pageNumber} failed:`, pageErr);
    }
  }

  if (ocrWorker) {
    try { await ocrWorker.terminate(); } catch { /* ignore */ }
    ocrWorker = null;
  }

  const filtered = filterOcrDetections(detections);
  console.log(`[OCR] Pipeline complete: ${detections.length} raw detections, ${filtered.length} after OCR filters`);
  return dedupeOcrDetections(filtered);
}
