import { PDFDocument, rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Detection, ExtractedPdf } from '../../types/domain';
import { assertPdfHeader } from '../pdf/guards';

const RENDER_SCALE = 2;
const BBOX_PADDING = 3;
const JPEG_QUALITY = 0.92;

interface PageOcrGroup {
  pageNumber: number;
  detections: Detection[];
}

function groupByPage(detections: Detection[]): PageOcrGroup[] {
  const map = new Map<number, Detection[]>();
  for (const d of detections) {
    const list = map.get(d.page) ?? [];
    list.push(d);
    map.set(d.page, list);
  }
  return Array.from(map.entries()).map(([pageNumber, dets]) => ({
    pageNumber,
    detections: dets,
  }));
}

function isImageOnlyPage(pdf: ExtractedPdf, pageNumber: number): boolean {
  const page = pdf.pages[pageNumber - 1];
  if (!page) return false;
  if (page.text.trim().length === 0) return true;

  const pageArea = page.width * page.height;
  if (pageArea <= 0) return true;
  let textArea = 0;
  for (const item of page.items) {
    textArea += item.width * item.height;
  }
  return textArea / pageArea < 0.05;
}

const IMG_KIND_GRAYSCALE = 1;
const IMG_KIND_RGB = 2;
const IMG_KIND_RGBA = 3;

function rawToRgba(src: Uint8ClampedArray | Uint8Array, width: number, height: number, kind: number): Uint8ClampedArray {
  if (kind === IMG_KIND_RGBA) return src instanceof Uint8ClampedArray ? src : new Uint8ClampedArray(src);
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
    if (!imgName) return false;

    const imgData: any = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('image obj timeout')), 15000);
      try {
        page.objs.get(imgName, (obj: any) => { clearTimeout(timeout); resolve(obj); });
      } catch (e) { clearTimeout(timeout); reject(e); }
    });
    if (!imgData) return false;

    if (imgData.bitmap) {
      canvas.width = imgData.width || imgData.bitmap.width;
      canvas.height = imgData.height || imgData.bitmap.height;
      ctx.drawImage(imgData.bitmap, 0, 0);
      return true;
    }
    if (imgData.data && imgData.width && imgData.height) {
      const w = imgData.width, h = imgData.height;
      canvas.width = w;
      canvas.height = h;
      const kind = imgData.kind || (imgData.data.length === w * h * 4 ? IMG_KIND_RGBA : imgData.data.length === w * h * 3 ? IMG_KIND_RGB : IMG_KIND_GRAYSCALE);
      const rgba = rawToRgba(imgData.data, w, h, kind);
      const imageDataArray = new Uint8ClampedArray(rgba.length);
      imageDataArray.set(rgba);
      ctx.putImageData(new ImageData(imageDataArray, w, h), 0, 0);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function renderPageToCanvas(
  pdfBytes: Uint8Array,
  pageNumber: number,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; pageWidth: number; pageHeight: number }> {
  const doc = await getDocument({
    data: Uint8Array.from(pdfBytes),
  }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create canvas 2d context');

  await page.render({ canvas, viewport, canvasContext: ctx }).promise;

  let isBlank = true;
  const probe = ctx.getImageData(0, 0, Math.min(canvas.width, 200), Math.min(canvas.height, 200)).data;
  for (let i = 0; i < probe.length; i += 4) {
    if (probe[i + 3] > 0 && (probe[i] < 250 || probe[i + 1] < 250 || probe[i + 2] < 250)) {
      isBlank = false;
      break;
    }
  }

  if (isBlank) {
    await extractPageImageToCanvas(page, canvas, ctx);
  }

  const unscaledViewport = page.getViewport({ scale: 1 });
  return { canvas, ctx, pageWidth: unscaledViewport.width, pageHeight: unscaledViewport.height };
}

function paintBlackRects(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
  pageWidth: number,
  pageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  const xScale = canvasWidth / pageWidth;
  const yScale = canvasHeight / pageHeight;

  ctx.fillStyle = '#000000';
  for (const d of detections) {
    const x = d.bbox.x * xScale - BBOX_PADDING;
    const y = d.bbox.y * yScale - BBOX_PADDING;
    const w = d.bbox.width * xScale + BBOX_PADDING * 2;
    const h = d.bbox.height * yScale + BBOX_PADDING * 2;
    ctx.fillRect(Math.max(0, x), Math.max(0, y), w, h);
  }
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas toBlob returned null'));
        blob.arrayBuffer().then(
          (buf) => resolve(new Uint8Array(buf)),
          reject,
        );
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function replacePageWithImage(
  pdfDoc: PDFDocument,
  pageIndex: number,
  imageBytes: Uint8Array,
) {
  const page = pdfDoc.getPages()[pageIndex];
  if (!page) return;

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const jpg = await pdfDoc.embedJpg(imageBytes);
  page.drawImage(jpg, { x: 0, y: 0, width: pageWidth, height: pageHeight });
}

/**
 * Applies permanent pixel-level redaction for OCR detections on image-only pages.
 *
 * For image-only pages: renders page to canvas, paints black rectangles at detection
 * coordinates (destroying the pixel data), then replaces the page content with the
 * redacted image. The original image bytes are permanently gone from the output.
 *
 * For text-layer pages with OCR detections (rare): falls back to pdf-lib drawRectangle
 * overlay as before.
 */
export async function applyOcrOverlayRedactions(
  redactedPdfBytes: Uint8Array,
  ocrDetections: Detection[],
  pdf?: ExtractedPdf,
): Promise<Uint8Array> {
  if (ocrDetections.length === 0) return redactedPdfBytes;

  const stableBytes = Uint8Array.from(redactedPdfBytes);
  assertPdfHeader(stableBytes, 'OCR overlay redaction');
  const pdfDoc = await PDFDocument.load(stableBytes);
  const pages = pdfDoc.getPages();
  const groups = groupByPage(ocrDetections);

  for (const group of groups) {
    const page = pages[group.pageNumber - 1];
    if (!page) continue;

    const canUseCanvasRedaction =
      typeof document !== 'undefined' && pdf && isImageOnlyPage(pdf, group.pageNumber);

    if (canUseCanvasRedaction) {
      const { canvas, ctx, pageWidth, pageHeight } = await renderPageToCanvas(
        pdf.bytes,
        group.pageNumber,
      );

      paintBlackRects(ctx, group.detections, pageWidth, pageHeight, canvas.width, canvas.height);

      const jpgBytes = await canvasToJpegBytes(canvas);
      await replacePageWithImage(pdfDoc, group.pageNumber - 1, jpgBytes);
    } else {
      const pageHeight = page.getHeight();
      for (const detection of group.detections) {
        page.drawRectangle({
          x: detection.bbox.x,
          y: pageHeight - detection.bbox.y - detection.bbox.height,
          width: detection.bbox.width,
          height: detection.bbox.height,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  return pdfDoc.save();
}
