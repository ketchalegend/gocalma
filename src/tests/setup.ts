import '@testing-library/jest-dom/vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import { createCanvas } from 'canvas';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const workerPath = path.join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

// Provide real canvas 2d context for jsdom (needed by pdf.js and OCR redaction)
const OriginalCanvas = globalThis.HTMLCanvasElement;
if (OriginalCanvas) {
  const OriginalGetContext = OriginalCanvas.prototype.getContext;
  OriginalCanvas.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ) {
    if (contextId === '2d') {
      const nodeCanvas = createCanvas(this.width, this.height);
      return nodeCanvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;
    }
    return OriginalGetContext?.call(this, contextId, options) ?? null;
  } as HTMLCanvasElement['getContext'];
}
