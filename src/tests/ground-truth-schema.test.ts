import { describe, expect, it } from 'vitest';
import { validateGroundTruthDocument } from '../core/ground-truth/schema';

describe('ground truth schema', () => {
  it('validates canonical ground truth payload', () => {
    const result = validateGroundTruthDocument({
      schemaVersion: '1.0.0',
      docId: 'hospital-invoice',
      fileName: 'sample_hospital_invoice_synthetic.pdf',
      generatedAt: new Date().toISOString(),
      entities: [
        {
          id: 'gt-0001',
          docId: 'hospital-invoice',
          page: 1,
          type: 'PERSON',
          text: 'Alice Example',
          source: 'text',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
