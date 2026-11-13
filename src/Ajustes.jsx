import React, { useEffect, useState } from 'react';
import { getMetadata, listAll, ref } from 'firebase/storage';
import {
  Bytes,
  collection,
  DocumentReference,
  GeoPoint,
  getCountFromServer,
  getDocs,
  limit,
  query,
  Timestamp,
} from 'firebase/firestore';
import { Moon, RefreshCw, X } from 'lucide-react';
import { db, storage } from './firebase';

const LIMITE_BYTES = 5 * 1024 ** 3; // 5 GB gratuitos de Firebase Storage
const LIMITE_TEXTO = 1024 ** 3; // 1 GB gratuito de Firestore (texto)

const tamano = (bytes) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toLocaleString('es-CL', { maximumFractionDigits: 2 })} GB`
    : `${(bytes / 1024 ** 2).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`;

// Recorre todas las carpetas de Storage y suma el tamaño de cada archivo
const medirStorage = async (onProgreso) => {
  const archivos = [];
  const recorrer = async (carpeta) => {
    const res = await listAll(carpeta);
    archivos.push(...res.items);
    for (const sub of res.prefixes) await recorrer(sub);
  };
  await recorrer(ref(storage));

  let total = 0;
  let hechos = 0;
  const porCarpeta = {};
  const cola = [...archivos];
  const trabajador = async () => {
    while (cola.length) {
      const item = cola.shift();
      try {
        const meta = await getMetadata(item);
        const carpeta = item.parent?.fullPath || '(raíz)';
        total += meta.size;
        porCarpeta[carpeta] = (porCarpeta[carpeta] || 0) + meta.size;
      } catch (err) {
        console.error('No se pudo leer', item.fullPath, err);
      }
      hechos++;
      onProgreso(hechos, archivos.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, trabajador));
  return { total, archivos: archivos.length, porCarpeta };
};

// --- Texto (Firestore) ---
// Tamaño según la fórmula oficial de Firestore: cada texto pesa sus bytes + 1,
// números y fechas 8, cada documento su nombre + campos + 32, y cada campo
// suma entradas de índice (ascendente y descendente) para las búsquedas.
const COLECCIONES_TEXTO = [
  ['ordenes_trabajo', 'oficial'],
  ['planificacion_ots', 'oficial'],
  ['inventario', 'oficial'],
  ['prueba_ordenes_trabajo', 'prueba'],
  ['prueba_planificacion_ots', 'prueba'],
  ['prueba_inventario', 'prueba'],
];
const MUESTRA = 150;

const largoTexto = (s) => new TextEncoder().encode(s).length + 1;
const esValorSimple = (v) =>
  v === null ||
  typeof v !== 'object' ||
  v instanceof Timestamp ||
  v instanceof GeoPoint ||
  v instanceof DocumentReference ||
  v instanceof Bytes;
const pesoValor = (v) => {
  if (v === null || v === undefined || typeof v === 'boolean') return 1;
  if (typeof v === 'number' || v instanceof Timestamp) return 8;
  if (typeof v === 'string') return largoTexto(v);
  if (v instanceof GeoPoint) return 16;
  if (v instanceof Bytes) return v.toUint8Array().length;
  if (v instanceof DocumentReference) {
    return 16 + v.path.split('/').reduce((a, p) => a + largoTexto(p), 0);
  }
  if (Array.isArray(v)) return v.reduce((a, e) => a + pesoValor(e), 0);
  return Object.entries(v).reduce((a, [k, e]) => a + largoTexto(k) + pesoValor(e), 0);
};
const pesoIndices = (nombre, obj, prefijo = '') => {
  let total = 0;
  for (const [k, v] of Object.entries(obj)) {
    const campo = prefijo + k;
    if (Array.isArray(v)) {
      for (const e of v) total += nombre + largoTexto(campo) + pesoValor(e) + 32;
      continue;
    }
    total += 2 * (nombre + largoTexto(campo) + pesoValor(v) + 32);
    if (!esValorSimple(v)) total += pesoIndices(nombre, v, campo + '.');
  }
  return total;
};

// Cuenta los documentos de cada colección y pesa una muestra de ellos, así la
// medición cuesta pocas lecturas aunque la base crezca.
const medirTexto = async () => {
  let total = 0;
  let documentos = 0;
  const porGrupo = { oficial: 0, prueba: 0 };
  for (const [nombreCol, grupo] of COLECCIONES_TEXTO) {
    const col = collection(db, nombreCol);
    const [conteo, muestra] = await Promise.all([
      getCountFromServer(col),
      getDocs(query(col, limit(MUESTRA))),
    ]);
    const cantidad = conteo.data().count;
    if (!cantidad || muestra.empty) continue;
    let pesoMuestra = 0;
    muestra.forEach((d) => {
      const nombre = largoTexto(nombreCol) + largoTexto(d.id) + 16;
      const datos = d.data();
      pesoMuestra +=
        nombre +
        Object.entries(datos).reduce((a, [k, v]) => a + largoTexto(k) + pesoValor(v), 0) +
        32 +
        pesoIndices(nombre, datos);
    });
    const peso = (pesoMuestra / muestra.size) * cantidad;
    total += peso;
    documentos += cantidad;
    porGrupo[grupo] += peso;
  }
  return { total, documentos, porGrupo };
};

const NOMBRE_GRUPO_TEXTO = {
  oficial: 'Registros de la app',
  prueba: 'Copia de prueba',
};

const NOMBRE_CARPETA = {
  ots: 'Fotos de la app',
  prueba_ots: 'Fotos de la copia de prueba',
};

const Anillo = ({ fraccion }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color =
    fraccion >= 0.9 ? '#dc2626' : fraccion >= 0.7 ? '#d97706' : '#b45309';
  return (
    <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90">
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="12"
        className="stroke-slate-100"
        stroke="currentColor"
      />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="12"
        stroke={color}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(Math.max(fraccion, 0.004), 1))}
        style={{ transition: 'stroke-dashoffset 0.6s' }}
      />
    </svg>
  );
};

const porcentaje = (fraccion) =>
  `${(fraccion * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

// Esfera de espacio usado con su detalle al lado
const BloqueEspacio = ({ titulo, fraccion, listo, cargando, error, onMedir, children }) => (
  <section>
    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
      {titulo}
    </h3>
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <Anillo fraccion={fraccion} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-800">
            {listo ? porcentaje(fraccion) : '...'}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase">
            usado
          </span>
        </div>
      </div>
      <div className="text-sm text-slate-600 space-y-1 min-w-0">
        {listo ? (
          children
        ) : cargando ? (
          <p>{cargando}</p>
        ) : (
          <p className="text-red-600 font-bold">{error}</p>
        )}
        <button
          type="button"
          onClick={onMedir}
          disabled={!listo && !!cargando}
          className="mt-1 text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Volver a medir
        </button>
      </div>
    </div>
  </section>
);

export default function Ajustes({ onCerrar, oscuro, setOscuro }) {
  const [medicion, setMedicion] = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState('');

  const medir = () => {
    setError('');
    setMedicion(null);
    setProgreso([0, 0]);
    medirStorage((h, t) => setProgreso([h, t]))
      .then((m) => {
        setMedicion(m);
        setProgreso(null);
      })
      .catch((err) => {
        console.error(err);
        setError('No se pudo medir el espacio. Revisa tu conexión.');
        setProgreso(null);
      });
  };

  const [texto, setTexto] = useState(null);
  const [midiendoTexto, setMidiendoTexto] = useState(false);
  const [errorTexto, setErrorTexto] = useState('');

  const medirBaseTexto = () => {
    setErrorTexto('');
    setTexto(null);
    setMidiendoTexto(true);
    medirTexto()
      .then(setTexto)
      .catch((err) => {
        console.error(err);
        setErrorTexto('No se pudo medir el texto. Revisa tu conexión.');
      })
      .finally(() => setMidiendoTexto(false));
  };

  useEffect(() => {
    medir();
    medirBaseTexto();
  }, []);

  const fraccion = medicion ? medicion.total / LIMITE_BYTES : 0;
  const fraccionTexto = texto ? texto.total / LIMITE_TEXTO : 0;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-label="Ajustes"
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">Ajustes</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ajustes"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <BloqueEspacio
          titulo="Espacio en la nube (fotos)"
          fraccion={fraccion}
          listo={!!medicion}
          cargando={
            progreso &&
            `Midiendo...${progreso[1] > 0 ? ` ${progreso[0]} de ${progreso[1]} fotos` : ''}`
          }
          error={error}
          onMedir={medir}
        >
          {medicion && (
            <>
              <p className="font-black text-slate-800 text-base">
                {tamano(medicion.total)} de 5 GB
              </p>
              <p>{medicion.archivos} fotos guardadas</p>
              {Object.entries(medicion.porCarpeta).map(([c, b]) => (
                <p key={c} className="text-xs text-slate-500">
                  {NOMBRE_CARPETA[c] || c}: {tamano(b)}
                </p>
              ))}
            </>
          )}
        </BloqueEspacio>

        <BloqueEspacio
          titulo="Espacio en la nube (texto)"
          fraccion={fraccionTexto}
          listo={!!texto}
          cargando={midiendoTexto && 'Midiendo...'}
          error={errorTexto}
          onMedir={medirBaseTexto}
        >
          {texto && (
            <>
              <p className="font-black text-slate-800 text-base">
                ≈ {tamano(texto.total)} de 1 GB
              </p>
              <p>
                {texto.documentos.toLocaleString('es-CL')} registros guardados
              </p>
              {Object.entries(texto.porGrupo)
                .filter(([, b]) => b > 0)
                .map(([g, b]) => (
                  <p key={g} className="text-xs text-slate-500">
                    {NOMBRE_GRUPO_TEXTO[g]}: {tamano(b)}
                  </p>
                ))}
              <p className="text-[11px] text-slate-400">
                Estimado, incluye los índices de búsqueda
              </p>
            </>
          )}
        </BloqueEspacio>

        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Apariencia
          </h3>
          <label className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer">
            <span className="flex items-center gap-3">
              <Moon className="w-5 h-5 text-slate-500" />
              <span>
                <span className="block text-sm font-bold text-slate-800">
                  Modo oscuro
                </span>
                <span className="text-xs text-slate-500">
                  Solo en este dispositivo
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={oscuro}
              onChange={(e) => setOscuro(e.target.checked)}
              className="w-5 h-5 accent-amber-700 [color-scheme:light]"
            />
          </label>
        </section>
      </div>
    </div>
  );
}
