import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc = '';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExtractedPage, ExtractedPdf, PageCharSpan, PageTextItem } from '../../types/domain';

let workerConfigured = false;

async function ensureWorkerConfigured() {
  if (workerConfigured) return;

  try {
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    GlobalWorkerOptions.workerSrc = workerModule.default;
  } catch {
    // Node/test runtime may not support worker URL imports. pdfjs can still run for tests.
  }

  workerConfigured = true;
}

function buildPageText(items: PageTextItem[]): { text: string; spans: PageCharSpan[] } {
  let text = '';
  const spans: PageCharSpan[] = [];
  let previousItem: PageTextItem | null = null;

  items.forEach((item) => {
    if (previousItem) {
      const yDelta = Math.abs(item.y - previousItem.y);
      const sameLine = yDelta <= Math.max(2, previousItem.height * 0.35);

      if (!sameLine) {
        text += '\n';
      } else {
        const previousRight = previousItem.x + previousItem.width;
        const gap = item.x - previousRight;
        const minWordGap = Math.max(1.5, previousItem.height * 0.16);
        if (gap > minWordGap) {
          text += ' ';
        }
      }
    }

    const start = text.length;
    text += item.text;
    const end = text.length;
    spans.push({ start, end, item });
    previousItem = item;
  });

  return { text, spans };
}

export async function extractPdf(file: File): Promise<ExtractedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractPdfFromBytes(bytes, file.name);
}

export async function extractPdfFromBytes(bytes: Uint8Array, fileName: string): Promise<ExtractedPdf> {
  await ensureWorkerConfigured();
  const parseBytes = Uint8Array.from(bytes);

  const doc = await getDocument({
    data: parseBytes,
    // Avoid worker boot issues in some local dev/browser combinations.
    disableWorker: true,
  } as unknown as Parameters<typeof getDocument>[0]).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PageTextItem[] = content.items
      .map((item) => {
        if (!('str' in item) || typeof item.str !== 'string') return null;

        const x = item.transform[4] ?? 0;
        const y = item.transform[5] ?? 0;

        return {
          text: item.str,
          x,
          y,
          width: item.width ?? 0,
          height: item.height ?? 10,
        } as PageTextItem;
      })
      .filter((item): item is PageTextItem => Boolean(item && item.text.trim()))
      .sort((a, b) => {
        const yDelta = b.y - a.y;
        if (Math.abs(yDelta) > 2) return yDelta;
        return a.x - b.x;
      });

    const { text, spans } = buildPageText(items);

    pages.push({
      page: pageNum,
      width: viewport.width,
      height: viewport.height,
      text,
      items,
      spans,
    });
  }

  return { fileName, bytes: Uint8Array.from(bytes), pages };
}
