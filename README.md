# Concejo Abierto Santa Fe

Buscador estático de transparencia legislativa para ordenanzas, decretos, resoluciones, declaraciones, comunicaciones y mensajes del Concejo Municipal de Santa Fe.

## Uso local

```bash
npm start
```

La aplicación queda disponible en `http://localhost:4173`. No requiere instalar paquetes de npm.

## Actualizar los datos

1. Guardar los seis archivos completos recibidos en `importaciones/entrada/`.
2. Convertirlos a texto con LibreOffice, conservando estos nombres: `ORDENANZAS.txt`, `DECRETOS.txt`, `RESOLUCIONES.txt`, `DECLARACIONES.txt`, `COMUNICACIONES.txt` y `Mensajes Años 98-2026.txt`.
3. Guardar los textos en `importaciones/texto/`.
4. Ejecutar `npm run import` y luego `npm run check`.
5. Revisar `data/inconsistencias.csv` y `data/cambios-ultima-importacion.csv` antes de publicar. El archivo `data/fuentes.json` guarda la huella SHA-256 de cada texto importado y la cantidad de registros. `data/archivos-originales.json` conserva las huellas de los documentos fuente recibidos.

Los archivos originales y los textos intermedios están ignorados por Git para evitar versionar documentos binarios grandes. El JSON normalizado, el CSV de inconsistencias y el resumen de altas, modificaciones y bajas sí se conservan en el historial. Las correcciones confirmadas manualmente se documentan en `data/correcciones.csv` para poder volver a aplicarlas en futuras importaciones.

## Datos normalizados

Cada registro incluye tipo, número, fecha normalizada, fecha original, descripción, expediente y línea de origen. Las inconsistencias detectadas actualmente incluyen fechas inválidas, ausentes o futuras, descripciones vacías, expedientes ausentes y números repetidos.

Los enlaces a documentos individuales son marcadores de posición hasta que estén disponibles los archivos específicos.
