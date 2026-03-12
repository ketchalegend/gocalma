import type { Detection, ExtractedPdf, RedactionResult, TokenMappingEntry } from '../../types/domain';
import { applyVisualRedactions } from './pdf-redactor';
import { TokenService } from './token-service';
import { createKeyFilePayload, keyPayloadToBlob } from '../security/key-manager';
import { applyOcrOverlayRedactions } from '../ocr/ocr-redaction';
import { OCR_ENABLED } from '../ocr/feature-flag';

export async function createRedactionPackage(pdf: ExtractedPdf, approvedDetections: Detection[]): Promise<RedactionResult> {
  const tokenService = new TokenService();

  const mappingsByPage = new Map<number, TokenMappingEntry[]>();
  const redactedTextByPage: string[] = [];

  for (const page of pdf.pages) {
    const onPage = approvedDetections.filter((d) => d.page === page.page);
    const tokenized = tokenService.tokenizePage(page.page, page.text, onPage);
    mappingsByPage.set(page.page, tokenized.mappings);
    redactedTextByPage.push(tokenized.redactedText);
  }

  const mappings = Array.from(mappingsByPage.values()).flat();
  const visualRedactedBytes = await applyVisualRedactions(pdf.bytes, approvedDetections);
  const ocrDetections = OCR_ENABLED ? approvedDetections.filter((d) => d.source === 'ocr') : [];
  const redactedPdfBytes = await applyOcrOverlayRedactions(visualRedactedBytes, ocrDetections, pdf);
  const redactedPdfBuffer = new Uint8Array(redactedPdfBytes);
  const keyPayload = await createKeyFilePayload(mappings, pdf.bytes, redactedPdfBuffer, pdf.fileName);

  return {
    redactedPdfBlob: new Blob([redactedPdfBuffer], { type: 'application/pdf' }),
    encryptedKeyBlob: keyPayloadToBlob(keyPayload),
    approvedDetections,
    metricsSnapshot: {
      detectionCount: approvedDetections.length,
      approvedCount: approvedDetections.length,
    },
    redactedTextByPage,
  };
}
