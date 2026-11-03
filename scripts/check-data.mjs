import { readFile } from "node:fs/promises";

const payload = JSON.parse(await readFile("data/documentos.json", "utf8"));
const errors = [];
if (!Array.isArray(payload.documentos) || payload.documentos.length === 0) errors.push("No hay documentos");
if (payload.total !== payload.documentos.length) errors.push("El total no coincide con la cantidad de documentos");
for (const type of ["Ordenanza", "Decreto", "Resolución", "Declaración", "Comunicación", "Mensaje"]) {
  if (!payload.documentos.some((document) => document.tipo === type)) errors.push(`Falta el tipo ${type}`);
}
for (const document of payload.documentos) {
  if (!document.id || !document.tipo || !document.numero) errors.push(`Registro incompleto en línea ${document.lineaOrigen}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${payload.total} documentos válidos; 6 tipos presentes.`);
