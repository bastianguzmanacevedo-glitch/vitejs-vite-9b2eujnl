import React, { useEffect, useState } from 'react';
import { getMetadata, listAll, ref } from 'firebase/storage';
import { Moon, RefreshCw, X } from 'lucide-react';
import { storage } from './firebase';

const LIMITE_BYTES = 5 * 1024 ** 3; // 5 GB gratuitos de Firebase Storage

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

  useEffect(medir, []);

  const fraccion = medicion ? medicion.total / LIMITE_BYTES : 0;

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

        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            Espacio en la nube (fotos)
          </h3>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <Anillo fraccion={fraccion} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-800">
                  {medicion
                    ? `${(fraccion * 100).toLocaleString('es-CL', {
                        maximumFractionDigits: 1,
                      })}%`
                    : '...'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  usado
                </span>
              </div>
            </div>
            <div className="text-sm text-slate-600 space-y-1 min-w-0">
              {medicion ? (
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
              ) : progreso ? (
                <p>
                  Midiendo...
                  {progreso[1] > 0 && ` ${progreso[0]} de ${progreso[1]} fotos`}
                </p>
              ) : (
                <p className="text-red-600 font-bold">{error}</p>
              )}
              <button
                type="button"
                onClick={medir}
                disabled={!!progreso}
                className="mt-1 text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Volver a medir
              </button>
            </div>
          </div>
        </section>

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
