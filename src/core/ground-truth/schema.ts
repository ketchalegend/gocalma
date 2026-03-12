import { z } from 'zod';
import { PII_TYPES } from '../../types/domain';

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const groundTruthEntitySchema = z.object({
  id: z.string().min(1),
  docId: z.string().min(1),
  page: z.number().int().positive(),
  type: z.enum(PII_TYPES),
  text: z.string().min(1),
  bbox: bboxSchema.optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  source: z.enum(['text', 'ocr']),
  notes: z.string().optional(),
});

export const groundTruthDocumentSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  docId: z.string().min(1),
  fileName: z.string().min(1),
  generatedAt: z.string().datetime(),
  entities: z.array(groundTruthEntitySchema),
});

export function validateGroundTruthDocument(payload: unknown) {
  return groundTruthDocumentSchema.safeParse(payload);
}
