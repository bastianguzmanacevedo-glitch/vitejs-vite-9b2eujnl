import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  FieldPath,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { COL_OTS, COL_PLANIFICACION, db } from './firebase';
import { AlertaFaltaCarro } from './CarrosPacking';
import {
  CATALOGO_PAN,
  COLOR_ETAPA,
  ETAPAS,
  ETAPAS_POSTERIORES,
  rangoPreset,
} from './catalogo';

// --- UTILIDADES ---
const hoyISO = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const numero = (n, decimales = 3) =>
  Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: decimales });

// Muestra la cantidad en la unidad de SAP y, si es menos de 1, también en
// gramos o mililitros, que es como se lee en la pesa.
const cantidadLegible = (cantidad, unidad) => {
  const u = String(unidad || '').toLowerCase();
  const esLitro = u.startsWith('l');
  const base = esLitro ? 'L' : u.startsWith('k') ? 'kg' : unidad || '';
  const texto = `${numero(cantidad, 4)} ${base}`;
  if (cantidad < 1 && (esLitro || base === 'kg')) {
    return `${texto} (${numero(cantidad * 1000, 1)} ${esLitro ? 'ml' : 'g'})`;
  }
  return texto;
};

const agruparPorVariedad = (ots) => {
  const grupos = new Map();
  ots.forEach((ot) => {
    const clave = ot.nombre || ot.producto;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(ot);
  });
  return [...grupos.entries()].map(([nombre, lista]) => ({ nombre, lista }));
};

// Una OT puede traer la misma materia prima en dos líneas, así que cada casilla
// se identifica por su línea de SAP y no por el código.
const claveLinea = (ingrediente) => String(ingrediente.linea);

// La mezcla va primero; lo que se entrega aparte (topping o harina de polvoreo),
// al final en su propia sección.
const ordenarLineas = (ingredientes) =>
  [...(ingredientes || [])].sort(
    (a, b) => Number(!!a.seccion) - Number(!!b.seccion)
  );

// Si la OT ya está en una etapa posterior a Bodega, la materia prima ya salió
// aunque el operario no haya marcado las casillas: se muestran marcadas solas.
// (Amasado, Horneado, Packing, Control SAP y Control de calidad)

// otNumber -> última etapa posterior registrada (registros: del más nuevo al más antiguo)
const mapaEtapasPosteriores = (registros) => {
  const mapa = new Map();
  registros.forEach((r) => {
    if (ETAPAS_POSTERIORES.includes(r.etapa) && !mapa.has(r.otNumber)) {
      mapa.set(r.otNumber, r.etapa);
    }
  });
  return mapa;
};

const progreso = (ot, etapaPosterior) => {
  const total = (ot.ingredientes || []).length;
  const hechos = etapaPosterior
    ? total
    : (ot.ingredientes || []).filter(
        (i) => ot.checks && ot.checks[claveLinea(i)]
      ).length;
  return { total, hechos, completa: total > 0 && hechos === total };
};

const usePlanificacion = (fecha) => {
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, COL_PLANIFICACION),
      where('fecha', '==', fecha)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.orden || 0) - (b.orden || 0));
        setOts(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Error al leer la planificación:', err);
        setLoading(false);
      }
    );
  }, [fecha]);

  return { ots, loading };
};

const SelectorFecha = ({ fecha, onChange, resumen }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <input
      type="date"
      value={fecha}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      aria-label="Fecha de la planificación"
      className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
    />
    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
      {resumen}
    </span>
  </div>
);

const Lotes = ({ ingrediente }) => {
  const lotes = ingrediente.lotes || [];
  if (ingrediente.emitido) {
    return (
      <p className="text-xs text-slate-400 font-medium mt-1">
        Ya emitido en SAP
      </p>
    );
  }
  if (lotes.length === 0) {
    return (
      <p className="text-xs text-red-600 font-bold mt-1">Sin lote asignado</p>
    );
  }
  return (
    <ul className="mt-1.5 space-y-1">
      {lotes.map((l) => (
        <li
          key={l.lote}
          className="text-xs text-slate-600 flex flex-wrap gap-x-2 items-baseline"
        >
          <span className="font-mono font-black text-amber-900 text-sm">
            Lote {l.lote}
          </span>
          {lotes.length > 1 && (
            <span className="font-bold">
              {cantidadLegible(l.cantidad, ingrediente.unidad)}
            </span>
          )}
          {l.vence && <span className="text-slate-400">vence {l.vence}</span>}
        </li>
      ))}
    </ul>
  );
};

const Avisos = ({ ingrediente }) => (
  <>
    {ingrediente.sustitutoDe && (
      <p className="text-xs text-amber-700 font-bold mt-1">
        Reemplaza a {ingrediente.sustitutoDe}
      </p>
    )}
    {ingrediente.faltante > 0 && (
      <p className="text-xs text-red-600 font-bold mt-1 flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Faltan{' '}
        {cantidadLegible(ingrediente.faltante, ingrediente.unidad)} en stock
      </p>
    )}
  </>
);

// --- BODEGA: PLANIFICACIÓN Y CHECKLIST ---
export function PlanificacionBodega({ session, registros, onRegistrar }) {
  const [fecha, setFecha] = useState(hoyISO);
  const [seleccionId, setSeleccionId] = useState(null);
  // Tipo de pan desplegado (uno a la vez, para encontrar rápido la variedad)
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Registro en Bodega directo desde la checklist (sin pasar al formulario)
  const [carroBodega, setCarroBodega] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { ots, loading } = usePlanificacion(fecha);
  useEffect(() => {
    setCarroBodega('');
    setErrorMsg('');
  }, [seleccionId]);

  const grupos = useMemo(() => agruparPorVariedad(ots), [ots]);
  const seleccion = ots.find((o) => o.id === seleccionId);
  const posteriores = useMemo(
    () => mapaEtapasPosteriores(registros),
    [registros]
  );
  const estaRegistrada = (ot) =>
    registros.some((r) => r.otNumber === ot.otNumber && r.etapa === 'Bodega');

  const marcar = async (ot, linea, marcado) => {
    setErrorMsg('');
    try {
      await updateDoc(
        doc(db, COL_PLANIFICACION, ot.id),
        new FieldPath('checks', linea),
        marcado
          ? {
              operario: session.user,
              hora: new Date().toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            }
          : deleteField()
      );
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo guardar. Revisa tu conexión a internet.');
    }
  };

  const registrarBodega = async (ot) => {
    const carro = carroBodega.trim();
    if (!/^\d+(-\d+)*$/.test(carro)) {
      setErrorMsg('Ingresa el N° de carro (ej. 3, o 03-02 si son varios)');
      return;
    }
    setGuardando(true);
    setErrorMsg('');
    try {
      const previos = await getDocs(
        query(collection(db, COL_OTS), where('otNumber', '==', ot.otNumber))
      );
      if (previos.docs.some((d) => d.data().etapa === 'Bodega')) {
        setErrorMsg(`La OT #${ot.otNumber} ya fue registrada en Bodega.`);
        return;
      }
      const ahora = new Date();
      const categoriaValida = !!CATALOGO_PAN[ot.categoria];
      await addDoc(collection(db, COL_OTS), {
        otNumber: ot.otNumber,
        categoria: categoriaValida ? ot.categoria : 'No especificada',
        variedad:
          categoriaValida && CATALOGO_PAN[ot.categoria].includes(ot.variedad)
            ? ot.variedad
            : 'No especificada',
        batches: carro,
        etapa: 'Bodega',
        operario: session.user,
        photoURL: null,
        createdAt: serverTimestamp(),
        fechaStr: ahora.toLocaleDateString('es-CL'),
        horaStr: ahora.toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
      setCarroBodega('');
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo registrar. Revisa tu conexión a internet.');
    } finally {
      setGuardando(false);
    }
  };

  if (seleccion) {
    const etapaPosterior = posteriores.get(seleccion.otNumber);
    const { total, hechos, completa } = progreso(seleccion, etapaPosterior);
    const registrada = estaRegistrada(seleccion);
    return (
      <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-sm border border-slate-100">
        <button
          type="button"
          onClick={() => setSeleccionId(null)}
          className="flex items-center gap-1.5 text-sm font-bold text-amber-700 hover:text-amber-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a la planificación
        </button>
        <h2 className="text-2xl font-black text-slate-800">
          OT {seleccion.otNumber}
        </h2>
        <p className="text-base font-bold text-amber-800">{seleccion.nombre}</p>
        <div className="mt-4">
          <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
            <span>Dosificación</span>
            <span>
              {hechos} de {total}
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                completa ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${total ? (hechos / total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
            {errorMsg}
          </div>
        )}

        <ul className="mt-5 space-y-2.5">
          {ordenarLineas(seleccion.ingredientes).map((ing, idx, lista) => {
            const linea = claveLinea(ing);
            const check = seleccion.checks && seleccion.checks[linea];
            const marcada = !!check || !!etapaPosterior;
            const inicioSeccion =
              ing.seccion &&
              (idx === 0 || lista[idx - 1].seccion !== ing.seccion);
            return (
              <li key={linea}>
                {inicioSeccion && (
                  <h3 className="text-sm font-black text-amber-900 border-b border-amber-100 pb-2 mt-6 mb-2.5 text-left">
                    {ing.seccion} (se entrega aparte)
                  </h3>
                )}
                <label
                  className={`flex gap-3.5 p-4 rounded-2xl border transition-all ${
                    etapaPosterior ? '' : 'cursor-pointer'
                  } ${
                    marcada
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-slate-50 border-slate-200 hover:border-amber-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={!!etapaPosterior}
                    onChange={(e) =>
                      marcar(seleccion, linea, e.target.checked)
                    }
                    className="w-6 h-6 mt-0.5 shrink-0 accent-emerald-600 [color-scheme:light]"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap justify-between gap-x-3">
                      <span
                        className={`font-bold ${
                          marcada ? 'text-emerald-900' : 'text-slate-800'
                        }`}
                      >
                        {ing.nombre}
                      </span>
                      <span className="font-black text-slate-900">
                        {cantidadLegible(ing.cantidad, ing.unidad)}
                      </span>
                    </div>
                    <Lotes ingrediente={ing} />
                    <Avisos ingrediente={ing} />
                    {check ? (
                      <p className="text-[11px] text-emerald-700 mt-1.5 font-medium">
                        Marcado por {check.operario} a las {check.hora}
                      </p>
                    ) : (
                      etapaPosterior && (
                        <p className="text-[11px] text-emerald-700 mt-1.5 font-medium">
                          Marcado solo: la OT ya está en {etapaPosterior}
                        </p>
                      )
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {etapaPosterior ? (
          <p className="mt-6 text-center text-sm font-bold text-emerald-700 flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" /> OT ya está en {etapaPosterior}
          </p>
        ) : registrada ? (
          <p className="mt-6 text-center text-sm font-bold text-emerald-700 flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" /> OT ya registrada en Bodega
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {completa && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  N° de carro
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={carroBodega}
                  onChange={(e) =>
                    setCarroBodega(e.target.value.replace(/[^\d-]/g, ''))
                  }
                  placeholder="Ej. 3"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                />
              </div>
            )}
            <button
              type="button"
              disabled={!completa || guardando}
              onClick={() => registrarBodega(seleccion)}
              className="w-full py-4 px-4 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              {guardando
                ? 'Guardando...'
                : completa
                ? 'Registrar en Bodega'
                : 'Marca todas las materias primas'}
            </button>
            {errorMsg && (
              <p className="text-sm font-bold text-red-600 text-center">
                {errorMsg}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-sm border border-slate-100">
      <h2 className="text-2xl font-black text-slate-800 mb-1">
        Planificación del día
      </h2>
      <p className="text-sm text-slate-500 mb-5">
        Toca un producto para ver sus OT, y una OT para ver sus materias
        primas, cantidades y lotes.
      </p>
      <SelectorFecha
        fecha={fecha}
        onChange={(f) => {
          setFecha(f);
          setGrupoAbierto(null);
        }}
        resumen={`${ots.length} OT`}
      />

      {loading ? (
        <p className="py-12 text-center text-slate-400 font-medium">
          Cargando planificación...
        </p>
      ) : ots.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No hay planificación para esta fecha.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {grupos.map((grupo) => {
            const abierto = grupoAbierto === grupo.nombre;
            const listas = grupo.lista.filter(
              (ot) =>
                estaRegistrada(ot) ||
                progreso(ot, posteriores.get(ot.otNumber)).completa
            ).length;
            const terminado = listas === grupo.lista.length;
            return (
            <section key={grupo.nombre}>
              <button
                type="button"
                onClick={() => setGrupoAbierto(abierto ? null : grupo.nombre)}
                aria-expanded={abierto}
                className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-all ${
                  terminado
                    ? 'bg-emerald-50 border-emerald-200'
                    : abierto
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-slate-50 border-slate-200 hover:border-amber-400'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-base font-black text-amber-900">
                    {grupo.nombre}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {grupo.lista.length} OT · {listas} de{' '}
                    {grupo.lista.length} dosificadas
                  </span>
                </span>
                {terminado ? (
                  <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                ) : abierto ? (
                  <ChevronDown className="w-6 h-6 text-amber-700 shrink-0" />
                ) : (
                  <ChevronRight className="w-6 h-6 text-slate-400 shrink-0" />
                )}
              </button>
              {abierto && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 mt-2.5 mb-2 pl-3 border-l-2 border-amber-200">
                {grupo.lista.map((ot) => {
                  const etapaPosterior = posteriores.get(ot.otNumber);
                  const { total, hechos, completa } = progreso(
                    ot,
                    etapaPosterior
                  );
                  const registrada = estaRegistrada(ot);
                  return (
                    <button
                      key={ot.id}
                      type="button"
                      onClick={() => setSeleccionId(ot.id)}
                      className={`text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        registrada || completa
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-slate-50 border-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <span>
                        <span className="block font-mono font-black text-slate-800">
                          OT {ot.otNumber}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          {etapaPosterior
                            ? `Ya está en ${etapaPosterior}`
                            : registrada
                            ? 'Registrada'
                            : completa
                            ? 'Lista para registrar'
                            : hechos > 0
                            ? `En curso: ${hechos} de ${total}`
                            : `${total} materias primas`}
                        </span>
                      </span>
                      {registrada || completa ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              )}
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- ADMINISTRADOR: EDICIÓN DE LOTES ---
const EditorLotes = ({ ot, ingrediente, otsDelDia, onCerrar }) => {
  const [lotes, setLotes] = useState(() =>
    (ingrediente.lotes || []).map((l) => ({
      ...l,
      original: l.lote,
      cantidadTexto: String(l.cantidad),
    }))
  );
  const [aplicarATodas, setAplicarATodas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const cambiar = (i, cambios) =>
    setLotes((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...cambios } : l))
    );

  const leerCantidad = (t) => Number(String(t).replace(',', '.'));
  const suma = lotes.reduce((s, l) => s + (leerCantidad(l.cantidadTexto) || 0), 0);
  const diferencia = Math.abs(suma - ingrediente.cantidad) > 0.0005;

  // Lotes con nuevo nombre, para replicar el cambio en las otras OT del día
  const renombres = lotes.filter((l) => l.original && l.original !== l.lote.trim());

  const guardar = async () => {
    const limpios = lotes
      .filter((l) => l.lote.trim())
      .map((l) => ({
        lote: l.lote.trim(),
        cantidad: leerCantidad(l.cantidadTexto) || 0,
        // Un lote con otro nombre ya no tiene la fecha del lote anterior
        vence: l.original === l.lote.trim() ? l.vence || null : null,
      }));
    if (limpios.length === 0) {
      setErrorMsg('Ingresa al menos un lote.');
      return;
    }

    setGuardando(true);
    setErrorMsg('');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COL_PLANIFICACION, ot.id), {
        ingredientes: ot.ingredientes.map((i) =>
          i.linea === ingrediente.linea
            ? { ...i, lotes: limpios, loteManual: true }
            : i
        ),
      });

      if (aplicarATodas && renombres.length > 0) {
        otsDelDia
          .filter((o) => o.id !== ot.id)
          .forEach((o) => {
            let cambio = false;
            const ingredientes = (o.ingredientes || []).map((i) => {
              if (i.codigo !== ingrediente.codigo) return i;
              let cambioEnLinea = false;
              const nuevos = (i.lotes || []).map((l) => {
                const r = renombres.find((x) => x.original === l.lote);
                if (!r) return l;
                cambioEnLinea = true;
                return { ...l, lote: r.lote.trim(), vence: null };
              });
              if (!cambioEnLinea) return i;
              cambio = true;
              return { ...i, lotes: nuevos, loteManual: true };
            });
            if (cambio) {
              batch.update(doc(db, COL_PLANIFICACION, o.id), { ingredientes });
            }
          });
      }

      await batch.commit();
      onCerrar();
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo guardar. Revisa tu conexión a internet.');
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
      {lotes.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="text"
            value={l.lote}
            onChange={(e) => cambiar(i, { lote: e.target.value })}
            placeholder="N° de lote"
            aria-label="Número de lote"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm font-bold bg-white"
          />
          <input
            type="text"
            inputMode="decimal"
            value={l.cantidadTexto}
            onChange={(e) => cambiar(i, { cantidadTexto: e.target.value })}
            aria-label="Cantidad del lote"
            className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold bg-white"
          />
          <button
            type="button"
            onClick={() => setLotes((p) => p.filter((_, idx) => idx !== i))}
            aria-label="Quitar lote"
            className="p-2 text-red-500 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setLotes((p) => [
            ...p,
            {
              lote: '',
              cantidadTexto: String(Math.max(ingrediente.cantidad - suma, 0)),
              original: null,
            },
          ])
        }
        className="text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> Agregar lote
      </button>

      <p
        className={`text-xs font-bold ${
          diferencia ? 'text-red-600' : 'text-slate-500'
        }`}
      >
        Suma de lotes: {numero(suma, 4)} de {numero(ingrediente.cantidad, 4)}{' '}
        requeridos
      </p>

      {renombres.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={aplicarATodas}
            onChange={(e) => setAplicarATodas(e.target.checked)}
            className="w-4 h-4 accent-amber-700 [color-scheme:light]"
          />
          Cambiar este lote en todas las OT del día que lo usan
        </label>
      )}

      {errorMsg && <p className="text-xs font-bold text-red-600">{errorMsg}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCerrar}
          className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg"
        >
          {guardando ? 'Guardando...' : 'Guardar lotes'}
        </button>
      </div>
    </div>
  );
};

// --- ADMINISTRADOR: AVANCE DE LA PLANIFICACIÓN Y LOTES ---

// Nivel de cada etapa (Bodega 1, Amasado 2, Horneado 3, Packing 4, ...)
const NIVEL_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.name, e.id]));
const ETAPA_DE_NIVEL = Object.fromEntries(ETAPAS.map((e) => [e.id, e.name]));

// Cada indicador cuenta las OT que llegaron a esa etapa o a una posterior
const INDICADORES = [
  { id: 'dosificadas', titulo: 'Dosificadas', detalle: 'Salieron de bodega', nivel: 1 },
  { id: 'amasadas', titulo: 'Amasadas', detalle: 'Llegaron a Amasado', nivel: 2 },
  { id: 'horneadas', titulo: 'Horneadas', detalle: 'Llegaron a Horneado', nivel: 3 },
  // No depende de la etapa: en el turno de tarde no hay control de calidad
  { id: 'liberadas', titulo: 'Liberadas', detalle: 'Liberación en horno', liberacion: true },
  { id: 'empacadas', titulo: 'Empacadas', detalle: 'Llegaron a Packing', nivel: 4 },
];

const fechaLarga = (iso) => {
  const t = new Date(`${iso}T00:00:00`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Planificación de un rango de fechas, en tiempo real
const usePlanificacionRango = (desde, hasta) => {
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, COL_PLANIFICACION),
      where('fecha', '>=', desde),
      where('fecha', '<=', hasta)
    );
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) =>
          a.fecha === b.fecha ? (a.orden || 0) - (b.orden || 0) : a.fecha < b.fecha ? 1 : -1
        );
        setOts(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Error al leer la planificación:', err);
        setLoading(false);
      }
    );
  }, [desde, hasta]);
  return { ots, loading };
};

// Registros de las etapas desde el día anterior al rango, en tiempo real
const useRegistrosDesde = (desde) => {
  const [registros, setRegistros] = useState([]);
  useEffect(() => {
    const inicio = new Date(`${desde}T00:00:00`);
    inicio.setDate(inicio.getDate() - 1);
    const q = query(
      collection(db, COL_OTS),
      where('createdAt', '>=', Timestamp.fromDate(inicio)),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snap) => setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('Error al obtener OTs:', err)
    );
  }, [desde]);
  return registros;
};

export function AdminLotes() {
  const [preset, setPreset] = useState('hoy');
  const [[desde, hasta], setRango] = useState(() => rangoPreset('hoy'));
  const [indicador, setIndicador] = useState('dosificadas');
  const [mostrar, setMostrar] = useState('todas');
  const [abiertaId, setAbiertaId] = useState(null);
  const [editando, setEditando] = useState(null);
  const [grupoAbierto, setGrupoAbierto] = useState(null);

  const { ots, loading } = usePlanificacionRango(desde, hasta);
  const registros = useRegistrosDesde(desde);
  const posteriores = useMemo(
    () => mapaEtapasPosteriores(registros),
    [registros]
  );

  // Etapa más avanzada de cada OT. Con la checklist completa cuenta como dosificada.
  const nivelDe = useMemo(() => {
    const nivelRegistro = new Map();
    registros.forEach((r) => {
      const n = NIVEL_ETAPA[r.etapa] || 0;
      if (n > (nivelRegistro.get(r.otNumber) || 0)) nivelRegistro.set(r.otNumber, n);
    });
    const mapa = new Map();
    ots.forEach((ot) => {
      let n = nivelRegistro.get(ot.otNumber) || 0;
      if (n < 1 && progreso(ot).completa) n = 1;
      mapa.set(ot.id, n);
    });
    return mapa;
  }, [registros, ots]);

  // OT liberadas por control de calidad en horno (todo resultado menos el
  // rechazo al 100%)
  const liberadas = useMemo(
    () =>
      new Set(
        registros
          .filter(
            (r) =>
              r.etapa === 'Horneado' &&
              r.resultadoCalidad &&
              r.resultadoCalidad !== 'rechazada'
          )
          .map((r) => r.otNumber)
      ),
    [registros]
  );

  // Packing con carros pendientes ("Falta carro N")
  const packingIncompleto = useMemo(
    () =>
      new Map(
        registros
          .filter((r) => r.etapa === 'Packing' && r.carrosCompletos === false)
          .map((r) => [r.otNumber, r])
      ),
    [registros]
  );

  const cumple = (ot, ind) =>
    ind.liberacion
      ? liberadas.has(ot.otNumber)
      : (nivelDe.get(ot.id) || 0) >= ind.nivel;

  const conteos = Object.fromEntries(
    INDICADORES.map((i) => [i.id, ots.filter((ot) => cumple(ot, i)).length])
  );

  const indicadorSel = INDICADORES.find((i) => i.id === indicador);
  const tituloIndicador = indicadorSel.titulo;
  const visibles = ots.filter((ot) => {
    if (mostrar === 'todas') return true;
    const hecha = cumple(ot, indicadorSel);
    return mostrar === 'hechas' ? hecha : !hecha;
  });

  // Agrupadas por día y, dentro de cada día, por variedad
  const dias = useMemo(() => {
    const m = new Map();
    visibles.forEach((ot) => {
      if (!m.has(ot.fecha)) m.set(ot.fecha, []);
      m.get(ot.fecha).push(ot);
    });
    return [...m.entries()].map(([fecha, lista]) => ({
      fecha,
      grupos: agruparPorVariedad(lista),
    }));
  }, [visibles]);

  const actualizado = ots.find((o) => o.actualizado)?.actualizado;
  const varios = desde !== hasta;
  const textoRango = varios
    ? `${desde.split('-').reverse().join('-')} al ${hasta.split('-').reverse().join('-')}`
    : fechaLarga(desde);

  const elegirPreset = (p) => {
    setPreset(p);
    setRango(rangoPreset(p));
    setGrupoAbierto(null);
    setAbiertaId(null);
    setEditando(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Planificación y lotes
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              {actualizado
                ? `Última actualización desde SAP: ${actualizado}`
                : 'Los lotes se cargan desde SAP y se pueden corregir aquí.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              ['hoy', 'Hoy'],
              ['semana', 'Esta semana'],
              ['mes', 'Este mes'],
            ].map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => elegirPreset(id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  preset === id
                    ? 'bg-amber-700 text-white border-amber-700'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {texto}
              </button>
            ))}
            <input
              type="date"
              value={preset === 'dia' ? desde : ''}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset('dia');
                setRango([e.target.value, e.target.value]);
                setGrupoAbierto(null);
                setAbiertaId(null);
                setEditando(null);
              }}
              aria-label="Ver un día"
              title="Ver un día"
              className={`px-2.5 py-2 rounded-xl border text-xs font-bold text-slate-700 ${
                preset === 'dia'
                  ? 'border-amber-700 bg-amber-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            />
          </div>
        </div>

        <p className="mt-5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          OT planificadas · {textoRango}: {ots.length}
        </p>
        <div className="mt-2 grid grid-cols-2 lg:grid-cols-5 gap-3">
          {INDICADORES.map((i) => {
            const n = conteos[i.id];
            const pct = ots.length ? Math.round((n / ots.length) * 100) : 0;
            const activo = indicador === i.id;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => setIndicador(i.id)}
                aria-pressed={activo}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  activo
                    ? 'border-amber-600 ring-2 ring-amber-500/30 bg-amber-50'
                    : 'border-slate-200 bg-slate-50 hover:border-amber-400'
                }`}
              >
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {i.titulo}
                </p>
                <p className="text-3xl font-black text-amber-900 mt-1">
                  {n}
                  <span className="text-lg text-slate-400"> / {ots.length}</span>
                </p>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-amber-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  {pct}% · {i.detalle}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-600">
            {visibles.length} OT
          </p>
          <div className="flex gap-1.5">
            {[
              ['todas', 'Todas'],
              ['hechas', INDICADORES.find((i) => i.id === indicador).titulo],
              ['pendientes', 'Pendientes'],
            ].map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMostrar(id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  mostrar === id
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-12 text-center text-slate-400 font-medium">
            Cargando planificación...
          </p>
        ) : ots.length === 0 ? (
          <p className="py-12 text-center text-slate-400 font-medium">
            No hay planificación para estas fechas.
          </p>
        ) : visibles.length === 0 ? (
          <p className="py-12 text-center text-slate-400 font-medium">
            No hay OT con este filtro.
          </p>
        ) : (
          dias.map((dia) => (
            <div key={dia.fecha} className="mt-6">
              {varios && (
                <h3 className="text-sm font-black text-slate-700 mb-3">
                  {fechaLarga(dia.fecha)}
                </h3>
              )}
              <div className="grid gap-2.5 xl:grid-cols-2 items-start">
                {dia.grupos.map((grupo) => {
                  const claveGrupo = `${dia.fecha}|${grupo.nombre}`;
                  const grupoAbiertoAhora = grupoAbierto === claveGrupo;
                  const hechas = grupo.lista.filter(
                    (ot) => cumple(ot, indicadorSel)
                  ).length;
                  const terminado = hechas === grupo.lista.length;
                  return (
                  <section key={grupo.nombre}>
                    <button
                      type="button"
                      onClick={() => {
                        setGrupoAbierto(grupoAbiertoAhora ? null : claveGrupo);
                        setAbiertaId(null);
                        setEditando(null);
                      }}
                      aria-expanded={grupoAbiertoAhora}
                      className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-all ${
                        terminado
                          ? 'bg-emerald-50 border-emerald-200'
                          : grupoAbiertoAhora
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-slate-50 border-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-base font-black text-amber-900">
                          {grupo.nombre}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {grupo.lista.length} OT · {hechas} de{' '}
                          {grupo.lista.length} {tituloIndicador.toLowerCase()}
                        </span>
                      </span>
                      {terminado ? (
                        <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                      ) : grupoAbiertoAhora ? (
                        <ChevronDown className="w-6 h-6 text-amber-700 shrink-0" />
                      ) : (
                        <ChevronRight className="w-6 h-6 text-slate-400 shrink-0" />
                      )}
                    </button>
                    {grupoAbiertoAhora && (
                    <div className="divide-y divide-slate-100 mt-2 mb-2 pl-3 border-l-2 border-amber-200">
                      {grupo.lista.map((ot) => {
                        const abierta = abiertaId === ot.id;
                        const { total, hechos } = progreso(
                          ot,
                          posteriores.get(ot.otNumber)
                        );
                        const nivel = nivelDe.get(ot.id) || 0;
                        const etapa = ETAPA_DE_NIVEL[nivel];
                        return (
                          <div key={ot.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setAbiertaId(abierta ? null : ot.id);
                                setEditando(null);
                              }}
                              className="w-full py-3 flex items-center justify-between gap-3 text-left"
                            >
                              <span className="flex items-center gap-2">
                                {abierta ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400" />
                                )}
                                <span className="font-mono font-black text-slate-800">
                                  OT {ot.otNumber}
                                </span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400 hidden sm:inline">
                                  {hechos} de {total} dosificadas
                                </span>
                                <AlertaFaltaCarro
                                  ot={packingIncompleto.get(ot.otNumber)}
                                />
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap ${
                                    etapa
                                      ? COLOR_ETAPA[etapa]
                                      : 'bg-slate-50 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  {etapa || 'Sin iniciar'}
                                </span>
                              </span>
                            </button>

                            {abierta && (
                              <ul className="pb-4 pl-6 space-y-3">
                                {ordenarLineas(ot.ingredientes).map((ing) => {
                                  const clave = `${ot.id}|${claveLinea(ing)}`;
                                  return (
                                    <li
                                      key={claveLinea(ing)}
                                      className="p-3 bg-slate-50 rounded-xl border border-slate-100"
                                    >
                                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                                        <span className="font-bold text-slate-800 text-sm">
                                          {ing.nombre}{' '}
                                          <span className="text-xs font-medium text-slate-400">
                                            {ing.codigo}
                                          </span>
                                          {ing.seccion && (
                                            <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                              {ing.seccion}
                                            </span>
                                          )}
                                        </span>
                                        <span className="font-black text-sm text-slate-900">
                                          {cantidadLegible(ing.cantidad, ing.unidad)}
                                        </span>
                                      </div>
                                      {editando === clave ? (
                                        <EditorLotes
                                          ot={ot}
                                          ingrediente={ing}
                                          otsDelDia={ots.filter(
                                            (o) => o.fecha === ot.fecha
                                          )}
                                          onCerrar={() => setEditando(null)}
                                        />
                                      ) : (
                                        <>
                                          <Lotes ingrediente={ing} />
                                          <Avisos ingrediente={ing} />
                                          <div className="flex items-center justify-between mt-2">
                                            <span className="text-[11px] font-bold text-amber-700">
                                              {ing.loteManual ? 'Editado a mano' : ''}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setEditando(clave)}
                                              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                                            >
                                              <Pencil className="w-3.5 h-3.5" />{' '}
                                              Editar lotes
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </section>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
