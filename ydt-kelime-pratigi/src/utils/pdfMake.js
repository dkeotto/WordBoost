import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function wrapText(text, maxChars) {
  const s = String(text || "").replace(/\r\n/g, "\n");
  const out = [];
  for (const rawLine of s.split("\n")) {
    let line = rawLine;
    while (line.length > maxChars) {
      // Prefer breaking at last space within range.
      const cut = line.lastIndexOf(" ", maxChars);
      const idx = cut > 20 ? cut : maxChars;
      out.push(line.slice(0, idx).trimEnd());
      line = line.slice(idx).trimStart();
    }
    out.push(line);
  }
  return out;
}

export async function makePdfBytesFromText(title, body) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = { width: 595.28, height: 841.89 }; // A4 (pt)
  const margin = 48;
  const fontSize = 11;
  const lineHeight = Math.ceil(fontSize * 1.45);
  const maxWidth = pageSize.width - margin * 2;

  const approxCharWidth = font.widthOfTextAtSize("M", fontSize);
  const maxChars = Math.max(30, Math.floor(maxWidth / approxCharWidth));

  const lines = wrapText(body, maxChars);

  let page = doc.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - margin;

  const safeTitle = String(title || "Wordy").trim() || "Wordy";
  page.drawText(safeTitle, {
    x: margin,
    y: y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 26;

  for (const ln of lines) {
    if (y < margin + lineHeight) {
      page = doc.addPage([pageSize.width, pageSize.height]);
      y = pageSize.height - margin;
    }
    if (ln) {
      page.drawText(ln, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
    y -= lineHeight;
  }

  return await doc.save();
}

