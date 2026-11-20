// Completa con la foto de la OT los registros automáticos de Amasado y
// Packing (los que la app creó porque la OT pasó a una etapa siguiente sin
// registrarse en ellas). Claude lee la foto entre los dos pasos.
//
// 1) node scripts/completar_desde_foto.mjs listar <carpeta> [--oficial]
//    Descarga a <carpeta> la foto de cada OT con registros pendienteFoto y
//    escribe <carpeta>/pendientes.json. Una foto ya revisada no se repite.
// 2) Claude mira cada foto y escribe <carpeta>/leido.json:
//    [{ "ot": "17135", "carros": [{ "carro": "16", "cantidad": 16 }],
//       "cajas": 12, "ilegible": false }]
//    (cajas null si la sección EMPAQUE está vacía; ilegible true si no se lee)
// 3) node scripts/completar_desde_foto.mjs aplicar <carpeta> [--oficial]
//
// Sin --oficial trabaja en la copia de prueba (prueba_ordenes_trabajo).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  terminate,
  updateDoc,
  where,
} from 'firebase/firestore';

const args = process.argv.slice(2);
const [accion, carpeta] = args.filter((a) => !a.startsWith('--'));
const oficial = args.includes('--oficial');
if (!['listar', 'aplicar'].includes(accion) || !carpeta) {
  console.error('Uso: node scripts/completar_desde_foto.mjs listar|aplicar <carpeta> [--oficial]');
  process.exit(1);
}
const COL = oficial ? 'ordenes_trabajo' : 'prueba_ordenes_trabajo';
const db = getFirestore(
  initializeApp({ apiKey: 'AIzaSyCnoxH5nc6nLeuYlAQcglu_8NTzjWwIJsc', projectId: 'el-espigal' })
);

const registrosDe = async (ot) =>
  (await getDocs(query(collection(db, COL), where('otNumber', '==', ot)))).docs.map(
    (d) => ({ id: d.id, ...d.data() })
  );
const fotoDe = (regs) => regs.find((r) => r.photoURL)?.photoURL || null;

async function listar() {
  mkdirSync(carpeta, { recursive: true });
  const snap = await getDocs(query(collection(db, COL), where('pendienteFoto', '==', true)));
  const ots = [...new Set(snap.docs.map((d) => d.data().otNumber))];
  const pendientes = [];
  const sinFoto = [];
  for (const ot of ots) {
    const regs = await registrosDe(ot);
    const foto = fotoDe(regs);
    const porRevisar = regs.filter((r) => r.pendienteFoto && r.fotoRevisada !== foto);
    if (!foto) {
      sinFoto.push(ot);
      continue;
    }
    if (!porRevisar.length) continue;
    const resp = await fetch(foto);
    if (!resp.ok) {
      console.error(`OT ${ot}: no se pudo bajar la foto (${resp.status})`);
      continue;
    }
    const archivo = join(carpeta, `${ot}.jpg`);
    writeFileSync(archivo, Buffer.from(await resp.arrayBuffer()));
    const amasado = regs.find((r) => r.etapa === 'Amasado');
    pendientes.push({
      ot,
      foto: archivo,
      categoria: amasado?.categoria || regs[0]?.categoria,
      variedad: amasado?.variedad || regs[0]?.variedad,
      tipoCantidad: amasado?.tipoCantidad || 'unidades',
      etapasPendientes: porRevisar.map((r) => r.etapa),
      carroConocido: amasado?.batches || regs.find((r) => r.batches)?.batches || '',
    });
  }
  writeFileSync(join(carpeta, 'pendientes.json'), JSON.stringify(pendientes, null, 2));
  console.log(
    JSON.stringify({ fotosPorLeer: pendientes.length, otsEsperandoFoto: sinFoto.length, pendientes }, null, 2)
  );
}

async function aplicar() {
  const archivo = join(carpeta, 'leido.json');
  if (!existsSync(archivo)) {
    console.log('No hay leido.json: nada que aplicar.');
    return;
  }
  const leido = JSON.parse(readFileSync(archivo, 'utf8').replace(/^﻿/, ''));
  const resumen = [];
  for (const l of leido) {
    const ot = String(l.ot);
    const regs = await registrosDe(ot);
    const foto = fotoDe(regs);
    const carros = (l.ilegible ? [] : l.carros || [])
      .map((c) => ({ carro: String(c.carro ?? '').replace(/\D/g, ''), cantidad: c.cantidad }))
      .filter((c) => c.carro && Number.isInteger(c.cantidad) && c.cantidad >= 0);
    const hechos = [];
    let batches = '';

    const amasado = regs.find(
      (r) => r.etapa === 'Amasado' && r.pendienteFoto && r.fotoRevisada !== foto
    );
    if (amasado) {
      const cambios = { fotoRevisada: foto };
      if (carros.length && amasado.cantidadProducida == null) {
        batches = carros.map((c) => c.carro).join('-');
        Object.assign(cambios, {
          batches,
          cantidadProducida: carros.reduce((a, c) => a + c.cantidad, 0),
          pendienteFoto: false,
          datosDesdeFoto: true,
        });
        if (carros.length > 1) cambios.carros = carros;
        hechos.push(`Amasado carro ${batches}, ${cambios.cantidadProducida} ${amasado.tipoCantidad || ''}`.trim());
      } else if (amasado.cantidadProducida != null) {
        // Ya lo completó Packing (doble carro) antes de leer la foto
        cambios.pendienteFoto = false;
      } else {
        cambios.fotoIlegible = true;
        hechos.push('Amasado: no se pudo leer la foto (se reintenta con una foto nueva)');
      }
      await updateDoc(doc(db, COL, amasado.id), cambios);
    }

    const packing = regs.find(
      (r) => r.etapa === 'Packing' && r.pendienteFoto && r.fotoRevisada !== foto
    );
    if (packing) {
      const cambios = { fotoRevisada: foto };
      if (Number.isInteger(l.cajas) && l.cajas >= 0) {
        Object.assign(cambios, { cajas: l.cajas, pendienteFoto: false, datosDesdeFoto: true });
        hechos.push(`Packing ${l.cajas} cajas`);
      } else {
        hechos.push('Packing: la foto aún no tiene las cajas (espera otra foto)');
      }
      await updateDoc(doc(db, COL, packing.id), cambios);
    }

    // El carro leído pasa a las etapas siguientes que quedaron sin carro
    if (batches) {
      for (const r of regs) {
        if (r.etapa === 'Bodega' || r.etapa === 'Amasado' || r.batches) continue;
        await updateDoc(doc(db, COL, r.id), { batches });
        hechos.push(`${r.etapa} carro ${batches}`);
      }
    }
    resumen.push({ ot, hechos });
  }
  writeFileSync(archivo.replace('leido.json', `aplicado_${Date.now()}.json`), JSON.stringify(leido));
  writeFileSync(archivo, '[]');
  console.log(JSON.stringify(resumen, null, 2));
}

await (accion === 'listar' ? listar() : aplicar());
await terminate(db);
process.exit(0);
