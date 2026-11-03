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
  const matches = [...block.matchAll(/(?:Expte\.?|Epte\.?|Exptes?\.?)\s*(?:N[º°ª]\s*)?([^\n]{1,150})/gi)];
  return clean(matches.map((match) => match[1]).join("; ")) || null;
}

function parseStandard(text, type) {
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
for (const document of documents) {
  if (!document.fecha) anomalies.push([document.tipo, document.numero, "fecha_invalida_o_ausente", document.fechaOriginal, document.lineaOrigen]);
  else if (document.fecha > IMPORT_DATE) anomalies.push([document.tipo, document.numero, "fecha_futura", document.fechaOriginal, document.lineaOrigen]);
  if (!document.descripcion) anomalies.push([document.tipo, document.numero, "descripcion_ausente", "", document.lineaOrigen]);
  if (!document.expediente) anomalies.push([document.tipo, document.numero, "expediente_ausente", "", document.lineaOrigen]);
  const key = `${document.tipo}|${document.numero}`;
  if (seen.has(key)) anomalies.push([document.tipo, document.numero, "numero_duplicado", `También en línea ${seen.get(key)}`, document.lineaOrigen]);
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
