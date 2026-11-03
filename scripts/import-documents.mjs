import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const inputDir = resolve(process.argv[2] || "importaciones/texto");
const outputDir = resolve("data");
const IMPORT_DATE = "2026-11-03";
const sources = [
  ["Ordenanza", "ORDENANZAS.txt"],
  ["Decreto", "DECRETOS.txt"],
  ["Resolución", "RESOLUCIONES.txt"],
  ["Declaración", "DECLARACIONES.txt"],
  ["Comunicación", "COMUNICACIONES.txt"],
  ["Mensaje", "Mensajes Años 98-2026.txt"],
];

const clean = (value) => value
  .replace(/^\uFEFF/, "")
  .replace(/[\u00AD\u200B]/g, "")
  .replace(/\u00A0/g, " ")
  .replace(/[ \t]+/g, " ")
  .replace(/\s*\n\s*/g, " ")
  .trim();

function parseDate(value) {
  const match = value?.match(/(?<!\d)(\d{1,2})[ \t]*[\/.-][ \t]*(\d{1,2})[ \t]*[\/.-][ \t]*(\d{2,4})(?!\d)/);
  if (!match) return { iso: null, raw: null, valid: false };
  let [, day, month, year] = match;
  day = Number(day);
  month = Number(month);
  year = Number(year);
  if (year < 100) year += year <= 30 ? 2000 : 1900;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return {
    iso: valid ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
    raw: match[0],
    valid,
  };
}

function extractDescription(block, header, type) {
  let body = block.slice(header.length).trim();
  if (type === "Mensaje") {
    const reference = body.match(/(?:^|\n)\s*Referencia:\s*([\s\S]*?)(?=\n\s*(?:Comisiones|Sanci[oó]n|Expte\.?|$))/i);
    if (reference) return clean(reference[1]);
  }
  body = body.replace(/^\s*[\[(]?\d{1,2}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{2,4}[\])]?\s*/, "");
  body = body.replace(/^\s*(?:Fecha de ingreso:|Fecha:)\s*\d{1,2}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{2,4}\s*/i, "");
  const beforeDetails = body.split(/\n\s*(?=(?:Expte\.?|Epte\.?|Exptes?\.?|CO-\d|DE-\d|Nota de Elevaci[oó]n|Comisiones asignadas:|Sanci[oó]n:|Autor\/es:))/i)[0];
  return clean(beforeDetails || body);
}

function extractExpediente(block) {
  const labels = [...block.matchAll(/(?:Expedientes?|Exptes?|Eptes?|Exp|Ex)(?=\.|\s|\d|$)\.?\s*(?:N[º°ªo]\s*)?([^\n]{1,150})/gi)]
    .map((match) => clean(match[1]))
    .filter(Boolean);
  if (labels.length) return [...new Set(labels)].join("; ");

  // En registros modernos el identificador suele aparecer solo, sin la palabra "Expte".
  // También se conservan expedientes históricos como 1178-D-84 cuando están sin rótulo.
  const codes = [...block.matchAll(/\b(?:[A-Z]{2}-\d{3,5}-\d{8}-\d|\d{2,8}-[A-Z]{1,4}-\d{2,4})\b/gi)]
    .map((match) => match[0]);
  return codes.length ? [...new Set(codes)].join("; ") : null;
}

function parseStandard(text, type) {
  if (type === "Resolución") {
    text = text.replace(/^(\s*)(23\d{3})(\s+)23\/(?:07\/26|07726)\b/gm, (line, indent, rawNumber, spacing) => {
      const number = Number(rawNumber);
      if (number < 23194 || number > 23223) return line;
      return `${indent}${number + 3000}${spacing}23/07/26`;
    });
  }
  const lines = text.replace(/\r/g, "").split("\n");
  const start = /^\s*(\d{1,6})\s+[\[(]?(\d{1,2}[ \t]*[\/.-][ \t]*\d{1,2}[ \t]*[\/.-][ \t]*\d{2,4})[\])]?\s*/;
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(start);
    if (match) starts.push({ index, match });
  });
  return starts.map(({ index, match }, position) => {
    const block = lines.slice(index, starts[position + 1]?.index ?? lines.length).join("\n");
    const date = parseDate(match[2]);
    return makeRecord(type, match[1], date, extractDescription(block, match[0], type), block, index + 1);
  });
}

function parseMessages(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const start = /^\s*Mensaje\s*:?[ \t]*(\d{1,4})\s*\/\s*(\d{2,4})\b/i;
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(start);
    if (match) starts.push({ index, match });
  });
  return starts.map(({ index, match }, position) => {
    const block = lines.slice(index, starts[position + 1]?.index ?? lines.length).join("\n");
    const dateLine = block.match(/(?:Fecha de ingreso:[ \t]*)?(\d{1,2}[ \t]*[\/.-][ \t]*\d{1,2}[ \t]*[\/.-][ \t]*\d{2,4})/i);
    const date = parseDate(dateLine?.[1]);
    const year = match[2].length === 2 ? match[2] : match[2].slice(-2);
    return makeRecord("Mensaje", `${match[1].padStart(3, "0")}/${year}`, date, extractDescription(block, match[0], "Mensaje"), block, index + 1);
  });
}

function makeRecord(type, number, date, description, block, line) {
  const normalizedNumber = type === "Mensaje" ? number : String(Number(number));
  return {
    id: `${type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}-${normalizedNumber}`,
    tipo: type,
    numero: normalizedNumber,
    fecha: date.iso,
    fechaOriginal: date.raw,
    descripcion: description,
    expediente: extractExpediente(block),
    lineaOrigen: line,
  };
}

function applyManualCorrections(type, records) {
  const corrections = [
    { type: "Declaración", number: "7326", date: "16/04/30", set: { fecha: "2026-04-16" }, note: "Fecha corregida a 16/04/26" },
    { type: "Mensaje", number: "034/24", date: "16/10/25", set: { numero: "034/25" }, note: "Número corregido a 034/25" },
    { type: "Mensaje", number: "064/05", date: "30/12/04", set: { numero: "064/04" }, note: "Número corregido a 064/04" },
    { type: "Mensaje", number: "006/25", date: null, set: { fecha: "2025-03-05" }, note: "Fecha incorporada: 05/03/25" },
    { type: "Mensaje", number: "007/25", date: "24/04/25", set: { fecha: "2025-03-05" }, note: "Fecha corregida a 05/03/25" },
    { type: "Decreto", number: "112", date: "30/12/91", set: { numeroDetalle: "112 BIS" }, note: "Identificado como Decreto 112 BIS" },
    { type: "Ordenanza", number: "9211", date: "04/01/91", set: { numero: "9311" }, note: "Número corregido a 9311" },
    { type: "Ordenanza", number: "8956", date: "30/96/87", set: { fecha: "1987-06-30" }, note: "Fecha corregida a 30/06/87" },
    { type: "Ordenanza", number: "10607", date: "31/09/00", set: { fecha: "2000-08-31" }, note: "Fecha corregida a 31/08/00" },
    { type: "Ordenanza", number: "10608", date: "31/09/00", set: { fecha: "2000-08-31" }, note: "Fecha corregida a 31/08/00" },
    { type: "Ordenanza", number: "10685", date: "29/93/01", set: { fecha: "2001-03-29" }, note: "Fecha corregida a 29/03/01" },
    { type: "Resolución", number: "962", date: "17/93/88", set: { fecha: "1988-03-17" }, note: "Fecha corregida a 17/03/88" },
    { type: "Resolución", number: "1463", date: "06/19/89", set: { fecha: "1989-10-06" }, note: "Fecha corregida a 06/10/89" },
    { type: "Resolución", number: "15546", date: "10/0/15", set: { fecha: "2015-09-10" }, note: "Fecha corregida a 10/09/15" },
    { type: "Resolución", number: "25775", date: "01/14/26", set: { fecha: "2026-04-01" }, note: "Fecha corregida a 01/04/26" },
    { type: "Resolución", number: "902", date: "16/09/87", set: { descripcion: "Sin descripción" }, note: "Descripción ausente explicitada" },
    { type: "Resolución", number: "17756", date: "07/12/06", set: { numero: "11756" }, note: "Número corregido a 11756" },
    { type: "Resolución", number: "11469", date: "22/11/12", set: { numero: "14469" }, note: "Número corregido a 14469" },
    { type: "Resolución", number: "11470", date: "22/11/12", set: { numero: "14470" }, note: "Número corregido a 14470" },
    { type: "Resolución", number: "10438", date: "30/08/18", set: { numero: "19438" }, note: "Número corregido a 19438" },
    { type: "Resolución", number: "8857", date: "29/03/01", set: { numero: "8557" }, note: "Número corregido a 8557" },
    { type: "Resolución", number: "8858", date: "29/03/01", set: { numero: "8558" }, note: "Número corregido a 8558" },
    { type: "Resolución", number: "8515", date: "07/09/00", set: { numero: "8415" }, note: "Número corregido a 8415" },
    { type: "Resolución", number: "5728", date: "15/06/95", description: "Archivo expediente N° 12213-R-94", set: { numero: "5726" }, note: "Número corregido a 5726" },
  ];

  for (const correction of corrections.filter((item) => item.type === type)) {
    const record = records.find((item) => item.numero === correction.number
      && item.fechaOriginal === correction.date
      && (!correction.description || item.descripcion.includes(correction.description)));
    if (!record) continue;
    Object.assign(record, correction.set);
    if (correction.set.numero) record.id = `${type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}-${record.numero}`;
    if (record.numeroDetalle === "112 BIS") {
      record.id = "decreto-112-bis";
      record.descripcion = `${record.descripcion} [N.º de decreto: 112 BIS]`;
    }
    record.correccion = correction.note;
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

await mkdir(outputDir, { recursive: true });
let previousDocuments = [];
try {
  previousDocuments = JSON.parse(await readFile(join(outputDir, "documentos.json"), "utf8")).documentos || [];
} catch {
  // La primera importación establece la línea de base.
}
const documents = [];
const sourceInfo = [];
for (const [type, filename] of sources) {
  const path = join(inputDir, filename);
  const content = await readFile(path, "utf8");
  const parsed = type === "Mensaje" ? parseMessages(content) : parseStandard(content, type);
  applyManualCorrections(type, parsed);
  documents.push(...parsed);
  sourceInfo.push({
    tipo: type,
    archivo: basename(path),
    sha256Texto: createHash("sha256").update(content).digest("hex"),
    registros: parsed.length,
  });
}

documents.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || a.tipo.localeCompare(b.tipo) || a.numero.localeCompare(b.numero, "es", { numeric: true }));
const anomalies = [];
const seen = new Map();
const confirmedResolutionDuplicates = new Set(["2069", "2089", "2739"]);
for (const document of documents) {
  if (!document.fecha) anomalies.push([document.tipo, document.numero, "fecha_invalida_o_ausente", document.fechaOriginal, document.lineaOrigen]);
  else if (document.fecha > IMPORT_DATE) anomalies.push([document.tipo, document.numero, "fecha_futura", document.fechaOriginal, document.lineaOrigen]);
  if (!document.descripcion) anomalies.push([document.tipo, document.numero, "descripcion_ausente", "", document.lineaOrigen]);
  if (!document.expediente) anomalies.push([document.tipo, document.numero, "expediente_ausente", "", document.lineaOrigen]);
  const key = `${document.tipo}|${document.numero}`;
  const duplicateConfirmed = (document.tipo === "Resolución" && Number(document.numero) >= 25851 && Number(document.numero) <= 25875)
    || (document.tipo === "Resolución" && confirmedResolutionDuplicates.has(document.numero))
    || (document.tipo === "Decreto" && document.numero === "112");
  if (seen.has(key) && !duplicateConfirmed) anomalies.push([document.tipo, document.numero, "numero_duplicado", `También en línea ${seen.get(key)}`, document.lineaOrigen]);
  else seen.set(key, document.lineaOrigen);
}

const stats = Object.fromEntries(sourceInfo.map((item) => [item.tipo, item.registros]));
const payload = { generado: IMPORT_DATE, total: documents.length, porTipo: stats, documentos: documents };
function indexOccurrences(items) {
  const counts = new Map();
  const indexed = new Map();
  for (const item of items) {
    const occurrence = (counts.get(item.id) || 0) + 1;
    counts.set(item.id, occurrence);
    indexed.set(`${item.id}#${occurrence}`, item);
  }
  return indexed;
}
const previousById = indexOccurrences(previousDocuments);
const currentById = indexOccurrences(documents);
const changes = [];
if (previousDocuments.length) {
  for (const [key, document] of currentById) {
    const previous = previousById.get(key);
    if (!previous) changes.push([payload.generado, "alta", document.tipo, document.numero, document.fecha, document.descripcion]);
    else if (["fecha", "descripcion", "expediente"].some((field) => (previous[field] || "") !== (document[field] || ""))) {
      changes.push([payload.generado, "modificación", document.tipo, document.numero, document.fecha, document.descripcion]);
    }
  }
  for (const [key, previous] of previousById) {
    if (!currentById.has(key)) changes.push([payload.generado, "baja", previous.tipo, previous.numero, previous.fecha, previous.descripcion]);
  }
}
await writeFile(join(outputDir, "documentos.json"), `${JSON.stringify(payload)}\n`);
await writeFile(join(outputDir, "fuentes.json"), `${JSON.stringify({ generado: payload.generado, fuentes: sourceInfo }, null, 2)}\n`);
const csv = [["tipo", "numero", "problema", "detalle", "linea_origen"], ...anomalies].map((row) => row.map(csvCell).join(",")).join("\n");
await writeFile(join(outputDir, "inconsistencias.csv"), `${csv}\n`);
const changeCsv = [["fecha_importacion", "cambio", "tipo", "numero", "fecha_documento", "descripcion"], ...changes].map((row) => row.map(csvCell).join(",")).join("\n");
await writeFile(join(outputDir, "cambios-ultima-importacion.csv"), `${changeCsv}\n`);
console.log(JSON.stringify({ total: documents.length, porTipo: stats, inconsistencias: anomalies.length, cambios: changes.length }, null, 2));
