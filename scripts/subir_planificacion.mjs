// Sube a Firestore la planificación exportada desde SAP.
// Uso: node scripts/subir_planificacion.mjs <archivo.json> [--oficial]
// Sin --oficial escribe en la copia de prueba (colección prueba_planificacion_ots).
//
// Al volver a subir un mismo día se respeta lo que ya se hizo en la app: las
// casillas marcadas y, en cada materia prima marcada o con lote editado a mano, y
// en las OT que ya pasaron de Bodega, la línea anterior. Las OT que ya no están en
// SAP se borran si nadie las empezó.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  terminate,
  where,
} from 'firebase/firestore';

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const oficial = args.includes('--oficial');
if (!archivo) {
  console.error('Falta el archivo. Uso: node scripts/subir_planificacion.mjs <archivo.json> [--oficial]');
  process.exit(1);
}

const plan = JSON.parse(readFileSync(archivo, 'utf8').replace(/^﻿/, ''));

const app = initializeApp({
  apiKey: 'AIzaSyCnoxH5nc6nLeuYlAQcglu_8NTzjWwIJsc',
  projectId: 'el-espigal',
  appId: '1:127308259288:web:daf03dc3437c5fb9b3dcad',
});
const db = getFirestore(app);
const COL = oficial ? 'planificacion_ots' : 'prueba_planificacion_ots';
const COL_OTS = oficial ? 'ordenes_trabajo' : 'prueba_ordenes_trabajo';

// Una OT en una etapa posterior a Bodega ya sacó su materia prima: sus lotes no se cambian.
const posteriores = await getDocs(
  query(
    collection(db, COL_OTS),
    where('etapa', 'in', ['Amasado', 'Horneado', 'Packing', 'Control de calidad'])
  )
);
const yaSalieron = new Set(posteriores.docs.map((d) => d.data().otNumber));

const existentes = await getDocs(
  query(collection(db, COL), where('fecha', '==', plan.fecha))
);
const previos = new Map(existentes.docs.map((d) => [d.id, d.data()]));

let conservadas = 0;
for (const ot of plan.ots) {
  const previo = previos.get(ot.otNumber);
  const checks = previo?.checks || {};

  const ingredientes = ot.ingredientes.map((nuevo) => {
    const anterior = previo?.ingredientes?.find((i) => i.linea === nuevo.linea);
    if (
      anterior &&
      (yaSalieron.has(ot.otNumber) ||
        anterior.loteManual ||
        checks[String(nuevo.linea)])
    ) {
      conservadas++;
      return { ...anterior, seccion: nuevo.seccion ?? null };
    }
    return nuevo;
  });

  await setDoc(doc(db, COL, ot.otNumber), {
    ...ot,
    ingredientes,
    checks,
    actualizado: plan.generado,
  });
  previos.delete(ot.otNumber);
}

// OT que ya no están en SAP
const conAvance = [];
let borradas = 0;
for (const [id, data] of previos) {
  if (yaSalieron.has(id) || (data.checks && Object.keys(data.checks).length > 0)) {
    conAvance.push(id);
  } else {
    await deleteDoc(doc(db, COL, id));
    borradas++;
  }
}

console.log(`Destino: ${COL}`);
console.log(`Fecha ${plan.fecha}: ${plan.ots.length} OT subidas`);
console.log(`Líneas conservadas (marcadas o editadas a mano): ${conservadas}`);
console.log(`OT eliminadas por ya no estar en SAP: ${borradas}`);
if (conAvance.length) {
  console.log(`Ya no están en SAP pero tienen avance, se dejaron: ${conAvance.join(', ')}`);
}

await terminate(db);
process.exit(0);
