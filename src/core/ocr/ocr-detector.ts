import { getDocument, type DocumentInitParameters } from 'pdfjs-dist/legacy/build/pdf.mjs';
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

let detectionId = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ocrWorker: any = null;

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

/* eslint-disable no-useless-escape */
const PERSON_LABEL =
  'full name|name|recipient|empf[a\u00e4]nger|kontoinhaber|account holder' +
  '|patient(?: name)?|emergency contact|treating physician|arzt' +
  '|m[e\u00e9]decin|medico';

const PERSON_VALUE =
  "(?:(?:dr|mr|mrs|ms|prof|frau|herr)\\.?\\s+)?[A-Z\u00c0-\u00d6\u00d8-\u00dd][\\p{L}''.\\x2d]{1,30}" +
  "(?:\\s*,?\\s*[A-Z\u00c0-\u00d6\u00d8-\u00dd][\\p{L}''.\\x2d]{1,30}){0,4}";

const DOB_LABEL =
  'date of birth|dob|geburtsdatum|fecha de nacimiento|date de naissance|data di nascita';

const PHONE_LABEL = 'phone|telefon|tel\\.?|telefono|t[e\u00e9]l[e\u00e9]phone';

const EMAIL_LABEL =
  'e-?mail|correo(?: electr[o\u00f3]nico)?|courriel|posta elettronica';

const INSURANCE_LABEL =
  'insurance no\\.?|insurance number|policy no\\.?|versicherungsnummer|versicherungs-?nr\\.?';

const PASSPORT_LABEL =
  'passport(?: no\\.?)?|pass(?:port)?[-\\s]?nr\\.?|document id|ausweis[-\\s]?nr\\.?';
/* eslint-enable no-useless-escape */

const OCR_LINE_RULES: OcrLineRule[] = [
  {
    type: 'PERSON',
    pattern: new RegExp(
      `\\b(${PERSON_LABEL})\\s*[.:]?\\s*[:-]?\\s*(${PERSON_VALUE})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.93,
  },
  {
    type: 'ADDRESS',
    pattern:
      /\b(address|adresse|direcci[o\u00f3]n|indirizzo)\s*[.:]?\s*[:-]?\s*([^\n]{6,120})/giu,
    valueGroup: 2,
    confidence: 0.92,
  },
  {
    type: 'DATE_OF_BIRTH',
    pattern: new RegExp(
      `\\b(${DOB_LABEL})\\s*[.:]?\\s*[:-]?\\s*((?:[0-3]?\\d[./-][01]?\\d[./-](?:19|20)?\\d{2})|(?:(?:19|20)\\d{2}-\\d{2}-\\d{2}))`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.95,
  },
  {
    type: 'PHONE',
    pattern: new RegExp(
      `\\b(${PHONE_LABEL})\\s*[.:]?\\s*[:-]?\\s*(\\+?\\d[\\d\\s()./-]{7,}\\d)`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.94,
  },
  {
    type: 'EMAIL',
    pattern: new RegExp(
      `\\b(${EMAIL_LABEL})\\s*[.:]?\\s*[:-]?\\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.95,
  },
  {
    type: 'IBAN',
    pattern: /\b(iban)\s*[.:]?\s*[:-]?\s*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30})/giu,
    valueGroup: 2,
    confidence: 0.98,
  },
  {
    type: 'INSURANCE_NUMBER',
    pattern: new RegExp(
      `\\b(${INSURANCE_LABEL})\\s*[.:]?\\s*[:-]?\\s*([A-Z]{2,6}(?:-[A-Z]{2,6})?(?:-\\d{2,6}){1,4}|[A-Z]{2,6}\\d{6,})`,
      'giu',
    ),
    valueGroup: 2,
    confidence: 0.96,
  },
  {
    type: 'ID_NUMBER',
    pattern: new RegExp(
      `\\b(${PASSPORT_LABEL})\\s*[.:]?\\s*[:-]?\\s*([A-Z0-9]{2,40})`,
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

  return detections;
}

function dedupeOcrDetections(detections: Detection[]): Detection[] {
  const seen = new Set<string>();
  const unique: Detection[] = [];

  for (const detection of detections) {
    const key = `${detection.page}|${detection.type}|${detection.text.toLowerCase().trim()}|${Math.round(detection.bbox.x)}|${Math.round(detection.bbox.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(detection);
  }

  return unique;
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

const IMG_KIND_GRAYSCALE = 1;
const IMG_KIND_RGB = 2;
const IMG_KIND_RGBA = 3;

function rawToRgba(src: Uint8ClampedArray | Uint8Array, width: number, height: number, kind: number): Uint8ClampedArray {
  if (kind === IMG_KIND_RGBA) {
    return src instanceof Uint8ClampedArray ? src : new Uint8ClampedArray(src);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (kind === IMG_KIND_RGB) {
    for (let s = 0, d = 0; s < src.length; s += 3, d += 4) {
      rgba[d] = src[s]; rgba[d + 1] = src[s + 1]; rgba[d + 2] = src[s + 2]; rgba[d + 3] = 255;
    }
  } else if (kind === IMG_KIND_GRAYSCALE) {
    for (let s = 0, d = 0; s < src.length; s += 1, d += 4) {
      rgba[d] = src[s]; rgba[d + 1] = src[s]; rgba[d + 2] = src[s]; rgba[d + 3] = 255;
    }
  }
  return rgba;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function extractPageImageToCanvas(
  page: any,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Promise<boolean> {
  try {
    const ops = await page.getOperatorList();
    const OPS_paintImageXObject = 85;

    let imgName: string | null = null;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS_paintImageXObject) {
        imgName = ops.argsArray[i]?.[0];
        break;
      }
    }
    if (!imgName) {
      console.warn('[OCR] No paintImageXObject found in operator list');
      return false;
    }

    console.log(`[OCR] Found image object: ${imgName}`);

    const imgData: any = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('image obj timeout after 15s')), 15000);
      try {
        page.objs.get(imgName, (obj: any) => {
          clearTimeout(timeout);
          resolve(obj);
        });
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    });

    if (!imgData) {
      console.warn('[OCR] page.objs.get returned null');
      return false;
    }

    console.log(`[OCR] Image data: width=${imgData.width}, height=${imgData.height}, kind=${imgData.kind}, hasBitmap=${!!imgData.bitmap}, hasData=${!!(imgData.data)}`);

    if (imgData.bitmap) {
      canvas.width = imgData.width || imgData.bitmap.width;
      canvas.height = imgData.height || imgData.bitmap.height;
      ctx.drawImage(imgData.bitmap, 0, 0);
      console.log('[OCR] Drew ImageBitmap to canvas');
      return true;
    }

    if (imgData.data && imgData.width && imgData.height) {
      const w = imgData.width;
      const h = imgData.height;
      canvas.width = w;
      canvas.height = h;

      const kind = imgData.kind || (imgData.data.length === w * h * 4 ? IMG_KIND_RGBA : imgData.data.length === w * h * 3 ? IMG_KIND_RGB : IMG_KIND_GRAYSCALE);
      const rgba = rawToRgba(imgData.data, w, h, kind);
      const imgDataObj = new ImageData(rgba, w, h);
      ctx.putImageData(imgDataObj, 0, 0);
      console.log(`[OCR] Put raw image data to canvas (kind=${kind}, ${w}x${h})`);
      return true;
    }

    console.warn('[OCR] Image object has neither bitmap nor data');
    return false;
  } catch (err) {
    console.error('[OCR] extractPageImageToCanvas failed:', err);
    return false;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    disableWorker: true,
  } as unknown as DocumentInitParameters).promise;

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

  console.log(`[OCR] Pipeline complete: ${detections.length} raw detections`);
  return dedupeOcrDetections(detections);
}
