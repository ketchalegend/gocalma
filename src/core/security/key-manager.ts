import type { KeyFilePayload, TokenMappingEntry } from '../../types/domain';

const VERSION = '1.1.0';
const BASE64_CHUNK_SIZE = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBufferSource(bytes: Uint8Array): BufferSource {
  return Uint8Array.from(bytes) as unknown as BufferSource;
}

async function sha256Base64(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toBufferSource(input));
  return toBase64(new Uint8Array(digest));
}

export async function hashBytes(input: Uint8Array): Promise<string> {
  return sha256Base64(input);
}

export async function createKeyFilePayload(
  mapping: TokenMappingEntry[],
  originalPdfBytes: Uint8Array,
  redactedPdfBytes: Uint8Array,
  originalFileName: string,
): Promise<KeyFilePayload> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const originalPdfIv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(mapping));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      toBufferSource(encoded),
    ),
  );
  const encryptedOriginalPdf = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: originalPdfIv,
      },
      key,
      toBufferSource(originalPdfBytes),
    ),
  );

  return {
    version: VERSION,
    algorithm: 'AES-GCM',
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted),
    keyMaterial: toBase64(rawKey),
    docHash: await sha256Base64(originalPdfBytes),
    redactedDocHash: await sha256Base64(redactedPdfBytes),
    originalPdfIv: toBase64(originalPdfIv),
    originalPdfCiphertext: toBase64(encryptedOriginalPdf),
    originalFileName,
    createdAt: new Date().toISOString(),
  };
}

export async function decryptKeyFilePayload(payload: KeyFilePayload): Promise<TokenMappingEntry[]> {
  const keyBytes = fromBase64(payload.keyMaterial);
  const key = await crypto.subtle.importKey('raw', toBufferSource(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(fromBase64(payload.iv)),
    },
    key,
    toBufferSource(fromBase64(payload.ciphertext)),
  );

  return JSON.parse(new TextDecoder().decode(decrypted)) as TokenMappingEntry[];
}

export async function decryptOriginalPdfBytes(payload: KeyFilePayload): Promise<Uint8Array> {
  if (!payload.originalPdfCiphertext || !payload.originalPdfIv) {
    throw new Error('This key file does not contain the original PDF. Regenerate it with the current GoCalma version.');
  }

  const keyBytes = fromBase64(payload.keyMaterial);
  const key = await crypto.subtle.importKey('raw', toBufferSource(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(fromBase64(payload.originalPdfIv)),
    },
    key,
    toBufferSource(fromBase64(payload.originalPdfCiphertext)),
  );

  return new Uint8Array(decrypted);
}

export async function matchesRedactedPdf(payload: KeyFilePayload, redactedPdfBytes: Uint8Array): Promise<boolean | null> {
  if (!payload.redactedDocHash) return null;
  return (await sha256Base64(redactedPdfBytes)) === payload.redactedDocHash;
}

export function keyPayloadToBlob(payload: KeyFilePayload): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

export async function parseKeyFile(file: File): Promise<KeyFilePayload> {
  const raw = await file.text();
  return JSON.parse(raw) as KeyFilePayload;
}
