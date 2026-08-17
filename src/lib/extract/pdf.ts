/**
 * Extração de texto de PDF no navegador.
 * Feita no cliente por decisão de arquitetura: evita upload multipart na função
 * serverless, mantém o bundle do servidor pequeno e reduz o custo de execução.
 * O pdf.js é carregado sob demanda (§42).
 */

export interface PdfExtraction {
  text: string;
  pages: number;
  warnings: string[];
}

export async function extractPdfText(file: File): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const warnings: string[] = [];

  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    document = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/password/i.test(message)) {
      throw new Error('Este PDF está protegido por senha. Remova a proteção e tente novamente.');
    }
    throw new Error('Não foi possível ler este PDF. O arquivo pode estar corrompido.');
  }

  const chunks: string[] = [];
  const maxPages = Math.min(document.numPages, 30);
  if (document.numPages > maxPages) {
    warnings.push(`O arquivo tem ${document.numPages} páginas; apenas as ${maxPages} primeiras foram lidas.`);
  }

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    const lines: string[] = [];

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? Number(item.transform[5]) : null;
      // Mudança relevante de posição vertical indica nova linha.
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
        if (line.trim()) lines.push(line.trim());
        line = '';
      }
      line += item.str;
      if ('hasEOL' in item && item.hasEOL) {
        if (line.trim()) lines.push(line.trim());
        line = '';
      }
      if (y !== null) lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    chunks.push(lines.join('\n'));
    page.cleanup();
  }

  await document.destroy();

  const text = normalizeExtracted(chunks.join('\n\n'));
  if (text.replace(/\s/g, '').length < 60) {
    warnings.push(
      'Quase nenhum texto foi encontrado. Provavelmente é um PDF digitalizado (imagem) — cole o conteúdo manualmente.',
    );
  }

  return { text, pages: maxPages, warnings };
}

/** Limpa artefatos comuns de extração mantendo a estrutura de parágrafos. */
export function normalizeExtracted(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
