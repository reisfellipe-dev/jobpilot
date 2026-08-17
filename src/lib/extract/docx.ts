/**
 * Extração de texto de DOCX no navegador.
 * Um .docx é um ZIP; o conteúdo textual vive em `word/document.xml`.
 * Descompactamos com fflate e lemos o XML com o DOMParser nativo — sem
 * dependência pesada de conversão de documentos.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { normalizeExtracted } from './pdf';

export interface DocxExtraction {
  text: string;
  warnings: string[];
}

export async function extractDocxText(file: File): Promise<DocxExtraction> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, { filter: (info) => info.name === 'word/document.xml' });
  } catch {
    throw new Error('Não foi possível abrir este DOCX. O arquivo pode estar corrompido.');
  }

  const documentXml = files['word/document.xml'];
  if (!documentXml) {
    throw new Error('Este arquivo não parece ser um DOCX válido (conteúdo principal não encontrado).');
  }

  const xml = strFromU8(documentXml);
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error('O conteúdo do DOCX não pôde ser interpretado.');
  }

  const paragraphs = Array.from(parsed.getElementsByTagName('w:p'));
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    let line = '';
    for (const node of Array.from(paragraph.getElementsByTagName('*'))) {
      const tag = node.tagName;
      if (tag === 'w:t') line += node.textContent ?? '';
      else if (tag === 'w:tab') line += ' ';
      else if (tag === 'w:br' || tag === 'w:cr') line += '\n';
    }
    lines.push(line.trim());
  }

  const text = normalizeExtracted(lines.join('\n'));
  const warnings: string[] = [];
  if (text.replace(/\s/g, '').length < 60) {
    warnings.push('Pouco texto encontrado no documento. Confira se o conteúdo não está em caixas de texto ou imagens.');
  }

  return { text, warnings };
}
