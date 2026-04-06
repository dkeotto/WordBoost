import * as pdfjs from "pdfjs-dist/build/pdf";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function pageText(page) {
  const content = await page.getTextContent();
  const chunks = (content.items || [])
    .map((it) => (it && typeof it.str === "string" ? it.str : ""))
    .filter(Boolean);
  // PDF text often comes tokenized; join with spaces, then normalize whitespace.
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export async function extractPdfTextFromArrayBuffer(buf, opts = {}) {
  const maxPages = Number.isFinite(opts.maxPages) ? Math.max(1, opts.maxPages) : 20;
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const n = Math.min(doc.numPages || 0, maxPages);
  const pages = [];
  for (let i = 1; i <= n; i += 1) {
    const page = await doc.getPage(i);
    const t = await pageText(page);
    if (t) pages.push(t);
  }
  const suffix =
    doc.numPages && doc.numPages > n ? `\n\n…(PDF kısaltıldı: ${n}/${doc.numPages} sayfa işlendi)` : "";
  return (pages.join("\n\n") + suffix).trim();
}

