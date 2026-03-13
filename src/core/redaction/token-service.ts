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
    const ranged = [...detections]
      .filter((d) => typeof d.start === 'number' && typeof d.end === 'number')
      .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
    const textOnly = [...detections]
      .filter((d) => typeof d.start !== 'number' || typeof d.end !== 'number')
      .sort((a, b) => b.text.length - a.text.length);

    const rangedMappings: TokenMappingEntry[] = [];
    const textMappings: TokenMappingEntry[] = [];
    let redactedText = text;

    for (const detection of ranged) {
      if (typeof detection.start !== 'number' || typeof detection.end !== 'number') continue;

      const token = this.createToken(detection.type);
      redactedText = `${redactedText.slice(0, detection.start)}${token}${redactedText.slice(detection.end)}`;

      rangedMappings.push({
        token,
        original: detection.text,
        type: detection.type,
        page,
        start: detection.start,
        end: detection.end,
      });
    }

    for (const detection of textOnly) {
      const matchIndex = this.findTextOccurrence(redactedText, detection.text);
      if (matchIndex < 0) continue;

      const token = this.createToken(detection.type);
      redactedText = `${redactedText.slice(0, matchIndex)}${token}${redactedText.slice(matchIndex + detection.text.length)}`;
      textMappings.push({
        token,
        original: detection.text,
        type: detection.type,
        page,
      });
    }

    const mappings = [...rangedMappings.reverse(), ...textMappings];

    return {
      page,
      originalText: text,
      redactedText,
      mappings,
    };
  }

  private findTextOccurrence(text: string, value: string): number {
    if (!value) return -1;
    const exact = text.indexOf(value);
    if (exact >= 0) return exact;
    return text.toLowerCase().indexOf(value.toLowerCase());
  }

  static restoreText(redactedText: string, mappings: TokenMappingEntry[]): string {
    return mappings.reduce((acc, mapping) => acc.split(mapping.token).join(mapping.original), redactedText);
  }
}
