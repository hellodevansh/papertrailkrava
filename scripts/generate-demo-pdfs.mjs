/**
 * Builds minimal but valid PDFs from demo-documents/*.txt (Helvetica, multi-page).
 * Run: node scripts/generate-demo-pdfs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(__dirname, "..", "demo-documents");

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line, maxChars = 92) {
  if (line.length <= maxChars) return [line];
  const words = line.split(/\s+/);
  const out = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars) {
      if (cur) out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

function buildPdfBytes(text) {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const lines = rawLines.flatMap((l) => wrapLine(l));
  const fontSize = 9;
  const lineHeight = 11;
  const marginX = 54;
  const marginTop = 756;
  const linesPerPage = 62;
  const pageChunks = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pageChunks.push(lines.slice(i, i + linesPerPage));
  }
  if (!pageChunks.length) pageChunks.push([""]);

  const streams = pageChunks.map((pageLines) => {
    const parts = ["BT", `/F1 ${fontSize} Tf`, `${lineHeight} TL`, `${marginX} ${marginTop} Td`];
    pageLines.forEach((line, idx) => {
      if (idx > 0) parts.push("T*");
      parts.push(`(${escapePdf(line || " ")}) Tj`);
    });
    parts.push("ET");
    return parts.join("\n");
  });

  const pageCount = streams.length;
  const fontId = 3 + pageCount * 2;
  const pageIds = [];
  const contentIds = [];
  for (let i = 0; i < pageCount; i++) {
    contentIds.push(3 + i * 2);
    pageIds.push(4 + i * 2);
  }

  const objects = new Array(fontId);
  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  for (let i = 0; i < pageCount; i++) {
    const stream = streams[i];
    const cid = contentIds[i];
    const pid = pageIds[i];
    objects[cid - 1] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
    objects[pid - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${cid} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }
  objects[fontId - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    const id = i + 1;
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${id} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  const size = objects.length + 1;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

const txtFiles = fs.readdirSync(DEMO_DIR).filter((f) => f.endsWith(".txt")).sort();
let built = 0;
for (const file of txtFiles) {
  const text = fs.readFileSync(path.join(DEMO_DIR, file), "utf8");
  const pdfName = file.replace(/\.txt$/i, ".pdf");
  fs.writeFileSync(path.join(DEMO_DIR, pdfName), buildPdfBytes(text));
  built += 1;
  console.log(`  ${pdfName}`);
}
console.log(`Generated ${built} PDF(s) in demo-documents/`);
