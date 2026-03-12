import { PDFDocument, rgb } from 'pdf-lib';
import type { Detection } from '../../types/domain';
import { assertPdfHeader } from '../pdf/guards';

export async function applyVisualRedactions(pdfBytes: Uint8Array, approvedDetections: Detection[]): Promise<Uint8Array> {
  const stableBytes = Uint8Array.from(pdfBytes);
  assertPdfHeader(stableBytes, 'Visual redaction');
  const pdfDoc = await PDFDocument.load(stableBytes);
  const pages = pdfDoc.getPages();

  for (const detection of approvedDetections) {
    if (detection.source === 'ocr') continue;
    const page = pages[detection.page - 1];
    if (!page) continue;

    const segments =
      detection.segments && detection.segments.length > 0
        ? detection.segments
        : [detection.bbox];

    segments.forEach((segment) => {
      page.drawRectangle({
        x: segment.x,
        y: Math.max(segment.y, 0),
        width: Math.max(segment.width, 12),
        height: Math.max(segment.height, 10),
        color: rgb(0, 0, 0),
      });
    });

  }

  return pdfDoc.save();
}
