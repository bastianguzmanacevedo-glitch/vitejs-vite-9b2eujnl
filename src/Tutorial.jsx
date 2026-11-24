import React, { useState } from 'react';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { GraduationCap } from 'lucide-react';
import { COL_OPERARIOS, COL_OTS, db } from './firebase';

// --- TUTORIAL POR ETAPA ---
// Se muestra la primera vez que una persona entra a una etapa. Solo enseña
// esa etapa; las demás se enseñan si algún día entra a ellas.

export const CLAVE_CALIDAD_HORNO = 'Horneado (calidad)';

const PASO_AJUSTES = {
  titulo: 'Tus ajustes',
  texto:
    'Tu nombre y tu puesto quedan guardados en este teléfono para la próxima vez. Toca tu nombre arriba para cambiarlo o activar el modo oscuro.',
};

export const TUTORIALES = {
  Bodega: [
    {
      titulo: 'La planificación del día',
      texto:
        'En la pestaña "Planificación" están los productos del día. Toca un producto y luego una OT para ver sus materias primas, cantidades y lotes.',
    },
    {
      titulo: 'Marca lo que entregas',
      texto:
        'Marca cada materia prima a medida que la entregas. Si te equivocas, tócala de nuevo para desmarcarla.',
    },
    {
      titulo: 'Registra la OT',
      texto:
        'Con todas las materias primas marcadas, toca "Registrar en Bodega". La OT queda dosificada. El N° de carro no se anota aquí: lo ingresa Amasado.',
    },
    {
      titulo: 'OT fuera de la planificación',
      texto:
        'Si una OT no aparece en la planificación, regístrala en la pestaña "Registrar OT".',
    },
    PASO_AJUSTES,
  ],
  Amasado: [
    {
      titulo: 'Escribe el N° de OT',
      texto:
        'Al escribir el N° de OT aparecen solos el tipo de pan y la variedad, desde la planificación.',
    },
    {
      titulo: 'Carro y cantidad',
      texto:
        'Ingresa el N° de carro y las unidades (o las latas, según el pan).',
    },
    {
      titulo: 'Doble carro',
      texto:
        'Si la OT salió en dos carros, marca "Doble carro" y completa el N° y la cantidad del segundo carro.',
    },
    {
      titulo: 'Registra',
      texto: 'Toca "Registrar OT en Amasado". ¡Listo!',
    },
    PASO_AJUSTES,
  ],
  Horneado: [
    {
      titulo: 'Escribe el N° de OT',
      texto:
        'Al escribir el N° de OT verás el pan, el carro y lo registrado en Amasado.',
    },
    {
      titulo: 'Marca "Horneado"',
      texto:
        'Cuando el carro salga del horno, marca la casilla "Horneado". Si puedes, agrega una foto clara de la OT (sirve para completar lo que falte). Luego toca "Registrar OT en Horneado".',
    },
    PASO_AJUSTES,
  ],
  [CLAVE_CALIDAD_HORNO]: [
    {
      titulo: 'Escribe el N° de OT',
      texto:
        'Al escribir el N° de OT verás lo registrado en Amasado y, si ya pasó por el horno, se agrega tu revisión a ese registro.',
    },
    {
      titulo: 'Revisa lo producido',
      texto:
        'Revisa las unidades (o latas) y el N° de carro, y corrígelos si no coinciden. Si en Amasado olvidaron un carro, marca "Doble carro" y complétalo.',
    },
    {
      titulo: 'Elige el resultado',
      texto:
        'Sin rechazo, Rechazo parcial (con las unidades rechazadas), Para selección o Rechazada al 100%. Puedes marcar "Rechazo parcial" y "Para selección" juntos: las rechazadas son merma y el resto va a selección. Con "Para selección", Packing deberá anotar las mermas.',
    },
    {
      titulo: 'Guarda',
      texto: 'Toca "Guardar control de calidad". ¡Listo!',
    },
    PASO_AJUSTES,
  ],
  Packing: [
    {
      titulo: 'Escribe el N° de OT',
      texto:
        'Al escribir el N° de OT verás el pan, el carro y la liberación en horno.',
    },
    {
      titulo: 'Cajas y mermas',
      texto:
        'Ingresa las cajas y, si hubo, las mermas. Si la OT quedó "Para selección" en el horno, las mermas son obligatorias.',
    },
    {
      titulo: 'Doble carro',
      texto:
        'Si la OT salió en dos carros, marca "Doble carro" y anota las cajas de cada carro. Las latas o unidades vienen de Amasado. Si un carro se mermó entero, anota 0 cajas. Si se empaca después o en otra sala, deja sus cajas en blanco: se completa ingresando la misma OT.',
    },
    {
      titulo: 'Si la OT ya estaba registrada',
      texto:
        'Si aparece otro carro de una OT ya empacada, ingrésala de nuevo, marca "Doble carro" y agrega el carro. Todo queda en el mismo registro.',
    },
    PASO_AJUSTES,
  ],
  'Control de calidad': [
    {
      titulo: 'Escribe el N° de OT',
      texto:
        'Al escribir el N° de OT verás todo lo registrado, incluidas las unidades liberadas en horno y las unidades mermadas.',
    },
    {
      titulo: 'Si todo está bien',
      texto: 'Solo toca "Registrar OT en Control de calidad".',
    },
    {
      titulo: 'Mermas y rechazos',
      texto:
        'Si hay unidades mermadas, marca "Rechazo parcial" y confirma o corrige la cantidad. Si se rechazó todo, marca "Rechazada al 100%".',
    },
    {
      titulo: 'Doble carro',
      texto:
        'Si en Amasado olvidaron un carro, marca "Doble carro" y complétalo: se corrige en todas las etapas.',
    },
    PASO_AJUSTES,
  ],
  'Control SAP': [
    {
      titulo: 'OT y OF PT',
      texto:
        'Escribe el N° de OT y el N° de OF PT creada en SAP.',
    },
    {
      titulo: 'Foto definitiva',
      texto:
        'Si quieres, agrega la foto definitiva de la OT y toca "Registrar OT en Control SAP".',
    },
    PASO_AJUSTES,
  ],
};

// --- Tutoriales ya vistos: en Firestore (por persona) y en el teléfono ---
const CLAVE_LOCAL = 'espigal_tutoriales_vistos';

const idOperario = (nombre) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');

const leerLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_LOCAL)) || {};
  } catch {
    return {};
  }
};

const guardarLocal = (id, vistos) => {
  try {
    const todo = leerLocal();
    todo[id] = [...new Set([...(todo[id] || []), ...vistos])];
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(todo));
  } catch {
    // Sin almacenamiento: se usa solo lo guardado en Firestore
  }
};

// ¿Hay que mostrarle a esta persona el tutorial de esta etapa?
export async function tutorialPendiente(nombre, clave) {
  if (!TUTORIALES[clave]) return false;
  const id = idOperario(nombre);
  if (leerLocal()[id]?.includes(clave)) return false;
  try {
    const ref = doc(db, COL_OPERARIOS, id);
    const snap = await getDoc(ref);
    let vistos;
    if (snap.exists()) {
      vistos = snap.data().tutoriales || [];
    } else {
      // Quien ya usaba la app antes del tutorial no lo ve en sus etapas
      const [propios, revisados] = await Promise.all([
        getDocs(
          query(collection(db, COL_OTS), where('operario', '==', nombre), limit(300))
        ),
        getDocs(
          query(collection(db, COL_OTS), where('revisadoPor', '==', nombre), limit(1))
        ),
      ]);
      vistos = [...new Set(propios.docs.map((d) => d.data().etapa))];
      if (!revisados.empty) vistos.push(CLAVE_CALIDAD_HORNO);
      await setDoc(ref, {
        nombre,
        tutoriales: vistos,
        creado: serverTimestamp(),
      });
    }
    guardarLocal(id, vistos);
    return !vistos.includes(clave);
  } catch (err) {
    // Sin conexión: no se interrumpe al operario
    console.error('No se pudo revisar el tutorial:', err);
    return false;
  }
}

export async function marcarTutorialVisto(nombre, clave) {
  const id = idOperario(nombre);
  guardarLocal(id, [clave]);
  try {
    await setDoc(
      doc(db, COL_OPERARIOS, id),
      { nombre, tutoriales: arrayUnion(clave) },
      { merge: true }
    );
  } catch (err) {
    console.error('No se pudo guardar el tutorial visto:', err);
  }
}

// --- Ventana del tutorial ---
export default function Tutorial({ clave, nombre, onTerminar }) {
  const pasos = TUTORIALES[clave] || [];
  const [paso, setPaso] = useState(0);
  if (!pasos.length) return null;
  const actual = pasos[paso];
  const ultimo = paso === pasos.length - 1;
  const primerNombre = nombre.split(' ')[0];

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        role="dialog"
        aria-label={`Tutorial de ${clave}`}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6 text-amber-700" />
          </span>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {paso === 0 ? `¡Hola, ${primerNombre}!` : `Paso ${paso + 1} de ${pasos.length}`}
            </p>
            <h2 className="text-lg font-black text-slate-800 leading-tight">
              {paso === 0 ? `Cómo usar ${clave}` : actual.titulo}
            </h2>
          </div>
        </div>

        <div className="min-h-[96px]">
          {paso === 0 && (
            <p className="text-sm font-black text-amber-800 mb-1">
              {actual.titulo}
            </p>
          )}
          <p className="text-base text-slate-600 leading-relaxed">{actual.texto}</p>
        </div>

        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {pasos.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === paso ? 'w-6 bg-amber-600' : 'w-2 bg-slate-200'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {!ultimo && (
            <button
              type="button"
              onClick={onTerminar}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
            >
              Saltar
            </button>
          )}
          {paso > 0 && (
            <button
              type="button"
              onClick={() => setPaso((p) => p - 1)}
              className="py-3.5 px-4 rounded-2xl text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-all"
            >
              Atrás
            </button>
          )}
          <button
            type="button"
            onClick={() => (ultimo ? onTerminar() : setPaso((p) => p + 1))}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white bg-amber-700 hover:bg-amber-800 shadow-lg shadow-amber-900/20 transition-all"
          >
            {ultimo ? '¡Entendido!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
