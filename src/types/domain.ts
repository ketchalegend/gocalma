export const PII_TYPES = [
  'PERSON',
  'ADDRESS',
  'EMAIL',
  'PHONE',
  'IBAN',
  'ID_NUMBER',
  'DATE_OF_BIRTH',
  'INSURANCE_NUMBER',
  'PATIENT_ID',
  'AVS_NUMBER',
] as const;

export type PiiType = (typeof PII_TYPES)[number];

export type DetectionSource = 'regex' | 'ner' | 'ocr' | 'context';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  id: string;
  type: PiiType;
  text: string;
  page: number;
  bbox: BoundingBox;
  segments?: BoundingBox[];
  start?: number;
  end?: number;
  confidence: number;
  source: DetectionSource;
}

export interface GroundTruthEntity {
  id: string;
  docId: string;
  page: number;
  type: PiiType;
  text: string;
  bbox?: BoundingBox;
  start?: number;
  end?: number;
  source: 'text' | 'ocr';
  notes?: string;
}

export interface GroundTruthDocument {
  schemaVersion: '1.0.0';
  docId: string;
  fileName: string;
  generatedAt: string;
  entities: GroundTruthEntity[];
}

export interface TokenMappingEntry {
  token: string;
  original: string;
  type: PiiType;
  page: number;
  start?: number;
  end?: number;
}

export interface KeyFilePayload {
  version: '1.0.0' | '1.1.0';
  algorithm: 'AES-GCM';
  iv: string;
  ciphertext: string;
  keyMaterial: string;
  docHash: string;
  redactedDocHash?: string;
  originalPdfIv?: string;
  originalPdfCiphertext?: string;
  originalFileName?: string;
  createdAt: string;
}

export interface RedactionResult {
  redactedPdfBlob: Blob;
  encryptedKeyBlob: Blob;
  approvedDetections: Detection[];
  metricsSnapshot: {
    detectionCount: number;
    approvedCount: number;
  };
  redactedTextByPage: string[];
}

export interface PageTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageCharSpan {
  start: number;
  end: number;
  item: PageTextItem;
}

export interface ExtractedPage {
  page: number;
  width: number;
  height: number;
  text: string;
  ocrText?: string;
  items: PageTextItem[];
  spans: PageCharSpan[];
}

export interface ExtractedPdf {
  fileName: string;
  bytes: Uint8Array;
  pages: ExtractedPage[];
}
