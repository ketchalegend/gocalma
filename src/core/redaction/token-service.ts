import type { Detection, PiiType, TokenMappingEntry } from '../../types/domain';

export interface TokenizedPage {
  page: number;
  originalText: string;
  redactedText: string;
  mappings: TokenMappingEntry[];
}

export class TokenService {
  private counters = new Map<PiiType, number>();

  private createToken(type: PiiType): string {
    const current = this.counters.get(type) ?? 0;
    const next = current + 1;
    this.counters.set(type, next);
    return `[${type}_${next.toString().padStart(3, '0')}]`;
  }

  tokenizePage(page: number, text: string, detections: Detection[]): TokenizedPage {
    const sorted = [...detections]
      .filter((d) => typeof d.start === 'number' && typeof d.end === 'number')
      .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));

    const mappings: TokenMappingEntry[] = [];
    let redactedText = text;

    for (const detection of sorted) {
      if (typeof detection.start !== 'number' || typeof detection.end !== 'number') continue;

      const token = this.createToken(detection.type);
      redactedText = `${redactedText.slice(0, detection.start)}${token}${redactedText.slice(detection.end)}`;

      mappings.push({
        token,
        original: detection.text,
        type: detection.type,
        page,
        start: detection.start,
        end: detection.end,
      });
    }

    return {
      page,
      originalText: text,
      redactedText,
      mappings: mappings.reverse(),
    };
  }

  static restoreText(redactedText: string, mappings: TokenMappingEntry[]): string {
    return mappings.reduce((acc, mapping) => acc.split(mapping.token).join(mapping.original), redactedText);
  }
}
