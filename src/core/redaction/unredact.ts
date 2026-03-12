import type { KeyFilePayload } from '../../types/domain';
import { decryptKeyFilePayload } from '../security/key-manager';
import { TokenService } from './token-service';

export async function restoreRedactedText(redactedTextByPage: string[], payload: KeyFilePayload): Promise<string[]> {
  const mappings = await decryptKeyFilePayload(payload);

  return redactedTextByPage.map((text, index) => {
    const page = index + 1;
    const pageMappings = mappings.filter((mapping) => mapping.page === page);
    return TokenService.restoreText(text, pageMappings);
  });
}
