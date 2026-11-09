// Sube a Firestore el inventario de materias primas exportado desde SAP.
// Uso: node scripts/subir_inventario.mjs <archivo.json> [--oficial]
// Sin --oficial escribe en la copia de prueba (prueba_inventario/actual).
// Reemplaza el inventario anterior completo: es una foto del stock de SAP.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { doc, getFirestore, setDoc, terminate } from 'firebase/firestore';

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const oficial = args.includes('--oficial');
if (!archivo) {
  console.error('Falta el archivo. Uso: node scripts/subir_inventario.mjs <archivo.json> [--oficial]');
  process.exit(1);
}

const inv = JSON.parse(readFileSync(archivo, 'utf8').replace(/^﻿/, ''));
const bytes = Buffer.byteLength(JSON.stringify(inv));
if (bytes > 900 * 1024) {
  console.error(`El inventario pesa ${Math.round(bytes / 1024)} KB y supera el límite de un documento.`);
  process.exit(1);
}

const app = initializeApp({
  apiKey: 'AIzaSyCnoxH5nc6nLeuYlAQcglu_8NTzjWwIJsc',
  projectId: 'el-espigal',
  appId: '1:127308259288:web:daf03dc3437c5fb9b3dcad',
});
const db = getFirestore(app);
const COL = oficial ? 'inventario' : 'prueba_inventario';

await setDoc(doc(db, COL, 'actual'), inv);
console.log(`Destino: ${COL}/actual`);
console.log(`Artículos: ${inv.articulos.length} | Actualizado: ${inv.actualizado} | ${Math.round(bytes / 1024)} KB`);

await terminate(db);
process.exit(0);
