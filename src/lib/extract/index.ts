/** Validação e extração de texto de currículos enviados pelo usuário (§17). */
import { UPLOAD_ALLOWED_EXT, UPLOAD_ALLOWED_MIME, UPLOAD_MAX_BYTES } from '@shared/constants';
import { formatBytes } from '../format';
import { extractPdfText } from './pdf';
import { extractDocxText } from './docx';

export type FileKind = 'pdf' | 'docx';

export interface FileExtraction {
  text: string;
  kind: FileKind;
  pages: number | null;
  warnings: string[];
}

export interface FileValidation {
  ok: boolean;
  kind: FileKind | null;
  error: string | null;
}

/** Assinaturas binárias: extensão e MIME informados pelo cliente não bastam. */
const SIGNATURES: Record<FileKind, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK.. (zip)
};

export function validateFile(file: File): FileValidation {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (!(UPLOAD_ALLOWED_EXT as readonly string[]).includes(extension)) {
    return { ok: false, kind: null, error: 'Formato não suportado. Envie um arquivo PDF ou DOCX.' };
  }
  if (file.size === 0) {
    return { ok: false, kind: null, error: 'O arquivo está vazio.' };
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      kind: null,
      error: `Arquivo muito grande (${formatBytes(file.size)}). O limite é ${formatBytes(UPLOAD_MAX_BYTES)}.`,
    };
  }
  if (file.type && !(UPLOAD_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, kind: null, error: 'O tipo do arquivo não confere com PDF ou DOCX.' };
  }

  return { ok: true, kind: extension === 'pdf' ? 'pdf' : 'docx', error: null };
}

/** Confere os bytes iniciais do arquivo contra a assinatura esperada. */
export async function verifySignature(file: File, kind: FileKind): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const expected = SIGNATURES[kind];
  return expected.every((byte, index) => header[index] === byte);
}

export async function extractTextFromFile(file: File): Promise<FileExtraction> {
  const validation = validateFile(file);
  if (!validation.ok || !validation.kind) {
    throw new Error(validation.error ?? 'Arquivo inválido.');
  }

  const kind = validation.kind;
  if (!(await verifySignature(file, kind))) {
    throw new Error('O conteúdo do arquivo não corresponde à extensão. Ele pode estar corrompido ou renomeado.');
  }

  if (kind === 'pdf') {
    const result = await extractPdfText(file);
    return { text: result.text, kind, pages: result.pages, warnings: result.warnings };
  }

  const result = await extractDocxText(file);
  return { text: result.text, kind, pages: null, warnings: result.warnings };
}

export const MIME_BY_KIND: Record<FileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
