export function hasPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

export function assertPdfHeader(bytes: Uint8Array, context: string): void {
  if (!hasPdfHeader(bytes)) {
    throw new Error(`${context}: input is not a valid PDF byte stream.`);
  }
}

