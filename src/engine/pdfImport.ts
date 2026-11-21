import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfRow {
  y: number;
  tokens: { x: number; str: string }[];
}

export async function extractTextFromPdfArrayBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const linesOut: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rows: PdfRow[] = [];

    for (const item of textContent.items) {
      if (!('str' in item) || !('transform' in item)) continue;
      const str = item.str.trim();
      if (!str) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 5);
      if (!row) {
        row = { y, tokens: [] };
        rows.push(row);
      }
      row.tokens.push({ x, str });
    }

    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.tokens.sort((a, b) => a.x - b.x);
      linesOut.push(r.tokens.map((t) => t.str).join(' '));
    }
  }

  return linesOut.join('\n');
}
