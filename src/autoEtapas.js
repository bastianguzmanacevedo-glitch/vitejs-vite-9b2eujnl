import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { COL_OTS, db } from './firebase';
import { CATEGORIAS_EN_LATAS } from './catalogo';

// --- ETAPAS ANTERIORES AUTOMÁTICAS ---
// Si una OT se registra en una etapa y le faltan etapas anteriores (Bodega a
// Packing), se crean solas: la OT ya pasó por ellas. Quedan con
// registroAutomatico: true y operario "Automático". Amasado y Packing quedan
// con pendienteFoto: true; el carro, las latas y las cajas se leen después de
// la foto de la OT (scripts/completar_desde_foto.mjs). Control de calidad no
// se completa: es un juicio de calidad de una persona.
// Si quien registra ingresa los datos de la OT física (Horneado pide los de
// Amasado; Control de calidad, los de Amasado y Packing), llegan en `datos`
// y esa etapa queda completa, sin esperar la foto.

export const OPERARIO_AUTO = 'Automático';
const ORDEN = [
  'Bodega',
  'Amasado',
  'Horneado',
  'Packing',
  'Control de calidad',
  'Control SAP',
];
const ETAPAS_AUTO = ['Bodega', 'Amasado', 'Horneado', 'Packing'];

export async function completarEtapasAnteriores({
  otNumber,
  etapa,
  previos,
  categoria,
  variedad,
  batches,
  usuario,
  fechaStr,
  horaStr,
  datos = {},
}) {
  const hasta = ORDEN.indexOf(etapa);
  const creadas = [];
  const tipo = CATEGORIAS_EN_LATAS.includes(categoria) ? 'latas' : 'unidades';
  for (const e of ETAPAS_AUTO) {
    if (ORDEN.indexOf(e) >= hasta) break;
    if (previos.some((d) => d.etapa === e)) continue;
    const registro = {
      otNumber,
      categoria: categoria || 'No especificada',
      variedad: variedad || 'No especificada',
      batches: e === 'Bodega' ? '' : batches || '',
      etapa: e,
      operario: OPERARIO_AUTO,
      photoURL: null,
      createdAt: serverTimestamp(),
      fechaStr,
      horaStr,
      registroAutomatico: true,
      origenAutomatico: etapa,
      registradoPor: usuario,
    };
    if (e === 'Amasado') {
      Object.assign(registro, {
        cantidadProducida: null,
        tipoCantidad: tipo,
        pendienteFoto: true,
      });
    }
    if (e === 'Horneado') Object.assign(registro, { horneado: true, tipoCantidad: tipo });
    if (e === 'Packing') {
      Object.assign(registro, { cajas: null, tipoCantidad: tipo, pendienteFoto: true });
    }
    if (datos[e]) {
      Object.assign(registro, datos[e], {
        pendienteFoto: false,
        datosIngresados: true,
      });
    }
    try {
      await addDoc(collection(db, COL_OTS), registro);
      creadas.push(e);
    } catch (err) {
      // Un fallo aquí no afecta al registro de la persona
      console.error(`No se pudo completar ${e} automáticamente:`, err);
    }
  }
  return creadas;
}

// El registro automático de una etapa da paso al registro real de esa etapa
export async function quitarAutomatico(registro) {
  await deleteDoc(doc(db, COL_OTS, registro.id));
}
