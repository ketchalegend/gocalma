import { describe, expect, it } from 'vitest';
import { scoreDetections } from '../core/metrics/scoring';
import type { Detection, GroundTruthDocument } from '../types/domain';

describe('Scoring', () => {
  describe('scoreDetections', () => {
    it('calculates perfect scores for exact matches', () => {
      const detections: Detection[] = [
        { id: '1', type: 'EMAIL', text: 'test@example.com', page: 1, bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1, source: 'regex' },
      ];

      const groundTruth: GroundTruthDocument = {
        schemaVersion: '1.0.0',
        docId: 'doc1',
        fileName: 'test.pdf',
        generatedAt: '2023-01-01T00:00:00Z',
        entities: [
          { id: '1', docId: 'doc1', type: 'EMAIL', text: 'test@example.com', page: 1, source: 'text' },
        ],
      };

      const result = scoreDetections(detections, groundTruth);

      expect(result.perType[0].tp).toBe(1);
      expect(result.perType[0].fp).toBe(0);
      expect(result.perType[0].fn).toBe(0);
      expect(result.perType[0].precision).toBe(1);
      expect(result.perType[0].recall).toBe(1);
      expect(result.perType[0].f1).toBe(1);
      expect(result.macroRecall).toBe(1);
      expect(result.macroF1).toBe(1);
    });

    it('handles false positives', () => {
      const detections: Detection[] = [
        { id: '1', type: 'EMAIL', text: 'test@example.com', page: 1, bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1, source: 'regex' },
        { id: '2', type: 'EMAIL', text: 'fake@example.com', page: 1, bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1, source: 'regex' },
      ];

      const groundTruth: GroundTruthDocument = {
        schemaVersion: '1.0.0',
        docId: 'doc1',
        fileName: 'test.pdf',
        generatedAt: '2023-01-01T00:00:00Z',
        entities: [
          { id: '1', docId: 'doc1', type: 'EMAIL', text: 'test@example.com', page: 1, source: 'text' },
        ],
      };

      const result = scoreDetections(detections, groundTruth);

      expect(result.perType[0].tp).toBe(1);
      expect(result.perType[0].fp).toBe(1);
      expect(result.perType[0].fn).toBe(0);
      expect(result.perType[0].precision).toBe(0.5);
      expect(result.perType[0].recall).toBe(1);
    });

    it('handles false negatives', () => {
      const detections: Detection[] = [];

      const groundTruth: GroundTruthDocument = {
        schemaVersion: '1.0.0',
        docId: 'doc1',
        fileName: 'test.pdf',
        generatedAt: '2023-01-01T00:00:00Z',
        entities: [
          { id: '1', docId: 'doc1', type: 'EMAIL', text: 'test@example.com', page: 1, source: 'text' },
        ],
      };

      const result = scoreDetections(detections, groundTruth);

      expect(result.perType[0].tp).toBe(0);
      expect(result.perType[0].fp).toBe(0);
      expect(result.perType[0].fn).toBe(1);
      expect(result.perType[0].precision).toBe(1); // 0/0 = 1
      expect(result.perType[0].recall).toBe(0);
    });

    it('matches text with normalization', () => {
      const detections: Detection[] = [
        { id: '1', type: 'EMAIL', text: 'Test@Example.Com', page: 1, bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1, source: 'regex' },
      ];

      const groundTruth: GroundTruthDocument = {
        schemaVersion: '1.0.0',
        docId: 'doc1',
        fileName: 'test.pdf',
        generatedAt: '2023-01-01T00:00:00Z',
        entities: [
          { id: '1', docId: 'doc1', type: 'EMAIL', text: 'test@example.com', page: 1, source: 'text' },
        ],
      };

      const result = scoreDetections(detections, groundTruth);

      expect(result.perType[0].tp).toBe(1);
    });

    it('handles multiple types', () => {
      const detections: Detection[] = [
        { id: '1', type: 'EMAIL', text: 'test@example.com', page: 1, bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1, source: 'regex' },
        { id: '2', type: 'PHONE', text: '+41 79 123 45 67', page: 1, bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1, source: 'regex' },
      ];

      const groundTruth: GroundTruthDocument = {
        schemaVersion: '1.0.0',
        docId: 'doc1',
        fileName: 'test.pdf',
        generatedAt: '2023-01-01T00:00:00Z',
        entities: [
          { id: '1', docId: 'doc1', type: 'EMAIL', text: 'test@example.com', page: 1, source: 'text' },
          { id: '2', docId: 'doc1', type: 'PHONE', text: '+41 79 123 45 67', page: 1, source: 'text' },
        ],
      };

      const result = scoreDetections(detections, groundTruth);

      expect(result.perType).toHaveLength(2);
      expect(result.macroRecall).toBe(1);
      expect(result.macroF1).toBe(1);
    });
  });
});