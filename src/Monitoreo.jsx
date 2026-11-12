import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Image as ImageIcon,
  Search,
  Trash2,
} from 'lucide-react';
import { COL_OTS, COL_PLANIFICACION, db, storage } from './firebase';
import {
  CATALOGO_PAN,
  COLOR_ETAPA,
  ETAPAS,
  ETAPAS_FABRICADA,
  fechaRegistro,
  isoLocal,
  rangoPreset,
  textoProduccion,
  RESULTADOS_CALIDAD,
} from './catalogo';

const POR_PAGINA = 45;

const COLOR_LIBERACION = {
  aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  parcial: 'bg-amber-50 text-amber-800 border-amber-200',
  seleccion: 'bg-amber-50 text-amber-800 border-amber-200',
  rechazada: 'bg-red-50 text-red-700 border-red-200',
};

// Control de calidad en horno: resultado, unidades corregidas y quién revisó
const Liberacion = ({ ot }) => {
  if (!ot.resultadoCalidad) {
    return <span className="text-slate-300 font-bold">-</span>;
  }
  const tipo = ot.tipoCantidad || 'unidades';
  return (
    <div className="space-y-1 whitespace-nowrap">
      <span
        className={`inline-flex px-3 py-1.5 rounded-lg text-xs font-bold border ${
          COLOR_LIBERACION[ot.resultadoCalidad] ||
          'bg-slate-50 text-slate-700 border-slate-200'
        }`}
      >
        {ot.resultadoCalidad === 'aprobada'
          ? 'Liberada'
          : ot.resultadoCalidad === 'parcial'
          ? `${ot.unidadesRechazadas} ${tipo} rechazadas`
          : RESULTADOS_CALIDAD[ot.resultadoCalidad]}
      </span>
      {ot.cantidadCorregida != null && (
        <p className="text-xs font-bold text-slate-600">
          Corregido a {ot.cantidadCorregida} {tipo}
        </p>
      )}
      {ot.revisadoPor && (
        <p className="text-[11px] text-slate-400 font-medium">
          {ot.revisadoPor}
          {ot.revisadoHora ? ` · ${ot.revisadoHora}` : ''}
        </p>
      )}
    </div>
  );
};
// Una OT planificada puede avanzar de etapa unos días después: se cargan
// estos días extra para no dejarla fuera del conteo de fabricadas.
const DIAS_EXTRA = 3;

const sumarDias = (iso, dias) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d;
};

const fechaCorta = (iso) => iso.split('-').reverse().join('-');

const csvCelda = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export default function Monitoreo() {
  const [preset, setPreset] = useState('hoy');
  const [[desde, hasta], setRango] = useState(() => rangoPreset('hoy'));
  const todo = preset === 'todo';

  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('Todas');
  const [filtroPan, setFiltroPan] = useState('');
  const [pagina, setPagina] = useState(1);

  // Registros del rango (más unos días extra), en tiempo real
  useEffect(() => {
    setLoading(true);
    const col = collection(db, COL_OTS);
    const q = todo
      ? query(col, orderBy('createdAt', 'desc'))
      : query(
          col,
          where('createdAt', '>=', Timestamp.fromDate(sumarDias(desde, 0))),
          where(
            'createdAt',
            '<',
            Timestamp.fromDate(sumarDias(hasta, 1 + DIAS_EXTRA))
          ),
          orderBy('createdAt', 'desc')
        );
    return onSnapshot(
      q,
      (snap) => {
        setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Error al obtener OTs:', err);
        setLoading(false);
      }
    );
  }, [desde, hasta, todo]);

  // OT planificadas del rango
  useEffect(() => {
    let vigente = true;
    const col = collection(db, COL_PLANIFICACION);
    const q = todo
      ? col
      : query(col, where('fecha', '>=', desde), where('fecha', '<=', hasta));
    getDocs(q)
      .then((snap) => {
        if (vigente) {
          setPlan(snap.docs.map((d) => d.data().otNumber));
        }
      })
      .catch((err) => console.error('Error al leer la planificación:', err));
    return () => {
      vigente = false;
    };
  }, [desde, hasta, todo]);

  const enRango = useMemo(
    () =>
      todo
        ? registros
        : registros.filter((r) => {
            const f = fechaRegistro(r);
            return f >= desde && f <= hasta;
          }),
    [registros, desde, hasta, todo]
  );

  const resumen = useMemo(() => {
    const fabricadasTodas = new Set(
      registros
        .filter((r) => ETAPAS_FABRICADA.includes(r.etapa))
        .map((r) => r.otNumber)
    );
    const planSet = new Set(plan);
    const fabricadasPlan = [...planSet].filter((n) =>
      fabricadasTodas.has(n)
    ).length;
    const fabricadasRango = new Set(
      enRango
        .filter((r) => ETAPAS_FABRICADA.includes(r.etapa))
        .map((r) => r.otNumber)
    );
    const fueraPlan = [...fabricadasRango].filter((n) => !planSet.has(n))
      .length;
    const porEtapa = {};
    ETAPAS.forEach((e) => {
      porEtapa[e.name] = new Set(
        enRango.filter((r) => r.etapa === e.name).map((r) => r.otNumber)
      ).size;
    });
    return {
      planificadas: planSet.size,
      fabricadasPlan,
      fabricadasRango: fabricadasRango.size,
      fueraPlan,
      porEtapa,
    };
  }, [registros, enRango, plan]);

  const filtrados = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    const [cat, varie] = filtroPan.split('||');
    return enRango.filter((ot) => {
      const coincideTexto =
        !t ||
        String(ot.otNumber || '').toLowerCase().includes(t) ||
        String(ot.operario || '').toLowerCase().includes(t) ||
        String(ot.ofPT || '').toLowerCase().includes(t);
      const coincideEtapa = filtroEtapa === 'Todas' || ot.etapa === filtroEtapa;
      const coincidePan =
        !filtroPan ||
        (ot.categoria === cat && (!varie || ot.variedad === varie));
      return coincideTexto && coincideEtapa && coincidePan;
    });
  }, [enRango, searchTerm, filtroEtapa, filtroPan]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA
  );

  useEffect(() => {
    setPagina(1);
  }, [searchTerm, filtroEtapa, filtroPan, desde, hasta, todo]);

  const elegirPreset = (p) => {
    setPreset(p);
    if (p !== 'todo') setRango(rangoPreset(p));
  };

  const handleDeleteOT = async (ot) => {
    const confirmar = window.confirm(
      `¿Seguro que quieres eliminar la OT #${ot.otNumber} (${ot.etapa})?\n\nSe borrará el registro y su foto. Esta acción no se puede deshacer.`
    );
    if (!confirmar) return;
    try {
      await deleteDoc(doc(db, COL_OTS, ot.id));
    } catch (err) {
      console.error('Error al eliminar la OT:', err);
      alert('Hubo un error al eliminar la OT. Inténtalo de nuevo.');
      return;
    }
    if (ot.photoURL) {
      try {
        await deleteObject(ref(storage, ot.photoURL));
      } catch (err) {
        console.error('No se pudo borrar la foto:', err);
      }
    }
  };

  // Exporta lo filtrado (todas las páginas)
  const handleExportCSV = () => {
    const headers = [
      'OT SAP',
      'Categoria',
      'Variedad',
      'Numero de carro',
      'Cantidad producida',
      'Tipo de cantidad',
      'Cajas',
      'OF PT',
      'Rechazada 100%',
      'Corregido en horno',
      'Liberación en horno',
      'Rechazadas en horno',
      'Revisado por',
      'Mermas',
      'Etapa',
      'Operario',
      'Fecha',
      'Hora',
      'URL Foto',
    ];
    const rows = filtrados.map((ot) => [
      ot.otNumber,
      ot.categoria,
      ot.variedad,
      ot.batches,
      ot.cantidadProducida,
      ot.tipoCantidad,
      ot.cajas,
      ot.ofPT,
      ot.rechazada100 ? 'Si' : '',
      ot.cantidadCorregida,
      RESULTADOS_CALIDAD[ot.resultadoCalidad] || '',
      ot.unidadesRechazadas,
      ot.revisadoPor,
      ot.mermas,
      ot.etapa,
      ot.operario,
      ot.fechaStr,
      ot.horaStr,
      ot.photoURL,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map(csvCelda).join(','))
      .join('\n');
    const blob = new Blob([`﻿${csv}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = todo
      ? `OT_EL_ESPIGAL_todo.csv`
      : `OT_EL_ESPIGAL_${desde}_a_${hasta}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const { planificadas, fabricadasPlan } = resumen;
  const pct = planificadas ? Math.round((fabricadasPlan / planificadas) * 100) : 0;
  const textoRango = todo
    ? 'todas las fechas'
    : desde === hasta
    ? fechaCorta(desde)
    : `${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  return (
    <>
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {[
              ['hoy', 'Hoy'],
              ['semana', 'Esta semana'],
              ['mes', 'Este mes'],
              ['todo', 'Todo'],
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
          </div>
          <div
            className={`flex items-center gap-2 text-xs font-bold text-slate-500 ${
              todo ? 'opacity-50' : ''
            }`}
          >
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset('custom');
                setRango([e.target.value, hasta]);
              }}
              aria-label="Desde"
              className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700"
            />
            al
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => {
                if (!e.target.value) return;
                setPreset('custom');
                setRango([desde, e.target.value]);
              }}
              aria-label="Hasta"
              className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700"
            />
          </div>
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            OT fabricadas / planificadas · {textoRango}
          </p>
          {planificadas > 0 ? (
            <>
              <div className="flex items-baseline gap-3 mt-1">
                <p className="text-4xl font-black text-amber-900">
                  {fabricadasPlan}
                  <span className="text-2xl text-slate-400">
                    {' '}
                    / {planificadas}
                  </span>
                </p>
                <p className="text-lg font-black text-slate-500">{pct}%</p>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-amber-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Fabricada = llegó a Amasado o una etapa posterior.
                {resumen.fueraPlan > 0 &&
                  ` Además, en estas fechas avanzaron ${resumen.fueraPlan} OT que no estaban en esta planificación (por ejemplo, OT de días anteriores).`}
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl font-black text-amber-900 mt-1">
                {resumen.fabricadasRango}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                OT fabricadas. No hay planificación cargada para estas fechas
                (se carga desde el 06-11-2026).
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {ETAPAS.map((etapa) => (
          <div
            key={etapa.id}
            className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between"
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {etapa.name}
            </p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-3xl font-black text-slate-800">
                {resumen.porEtapa[etapa.name]}
              </p>
              <etapa.icon className="w-6 h-6 text-slate-200" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-5 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Monitoreo de Planta
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              {filtrados.length} registros · {textoRango}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar OT, operario u OF PT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 w-full sm:w-60 font-medium transition-all"
              />
            </div>

            <select
              value={filtroPan}
              onChange={(e) => setFiltroPan(e.target.value)}
              aria-label="Filtrar por pan"
              className="py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-bold focus:ring-2 focus:ring-amber-500 transition-all"
            >
              <option value="">Todos los panes</option>
              {Object.entries(CATALOGO_PAN).map(([cat, variedades]) => (
                <optgroup key={cat} label={cat}>
                  <option value={`${cat}||`}>{cat}: todas</option>
                  {variedades.map((v) => (
                    <option key={v} value={`${cat}||${v}`}>
                      {v}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value)}
              aria-label="Filtrar por etapa"
              className="py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-bold focus:ring-2 focus:ring-amber-500 transition-all"
            >
              <option value="Todas">Todas las etapas</option>
              {ETAPAS.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleExportCSV}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-900/20 transition-all"
            >
              <Download className="w-4 h-4" /> Exportar SAP
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-white text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">OT SAP</th>
                <th className="px-6 py-4">Variedad / Producto</th>
                <th className="px-6 py-4">N° de carro</th>
                <th className="px-6 py-4">Producción</th>
                <th className="px-6 py-4">Liberación en horno</th>
                <th className="px-6 py-4">Etapa</th>
                <th className="px-6 py-4">Operario</th>
                <th className="px-6 py-4">Fecha/Hora</th>
                <th className="px-6 py-4 text-center">Registro</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td
                    colSpan="10"
                    className="px-6 py-12 text-center text-slate-400 font-medium"
                  >
                    Cargando registros sincronizados...
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td
                    colSpan="10"
                    className="px-6 py-12 text-center text-slate-400 font-medium"
                  >
                    No hay registros con estos filtros.
                  </td>
                </tr>
              ) : (
                visibles.map((ot) => (
                  <tr
                    key={ot.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono font-black text-amber-900 text-base">
                      #{ot.otNumber}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-800 block">
                        {ot.variedad}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {ot.categoria}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">
                      Carro {ot.batches}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">
                      {ot.rechazada100 ? (
                        <span className="inline-flex px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                          Rechazada 100%
                        </span>
                      ) : (
                        textoProduccion(ot, { conCalidad: false }) || (
                          <span className="text-slate-300">-</span>
                        )
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Liberacion ot={ot} />
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap ${
                          COLOR_ETAPA[ot.etapa] ||
                          'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {ot.etapa}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-700">
                      {ot.operario}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-medium space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />{' '}
                        {ot.fechaStr}
                      </div>
                      <div className="ml-5 text-slate-400">{ot.horaStr}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {ot.photoURL ? (
                        <a
                          href={ot.photoURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-xl border border-amber-200 transition-all opacity-80 group-hover:opacity-100"
                        >
                          <ImageIcon className="w-4 h-4" /> Ver Foto
                        </a>
                      ) : ot.fotoReemplazadaEn ? (
                        <span
                          title="La foto se reemplazó por la de una etapa posterior"
                          className="text-xs text-slate-400 bg-slate-100 px-3 py-2 rounded-xl font-medium whitespace-nowrap"
                        >
                          Foto en {ot.fotoReemplazadaEn}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 bg-slate-100 px-3 py-2 rounded-xl font-medium whitespace-nowrap">
                          Sin foto
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteOT(ot)}
                        title="Eliminar OT"
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-xl border border-red-200 transition-all"
                      >
                        <Trash2 className="w-4 h-4" /> Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
            <button
              type="button"
              disabled={paginaActual <= 1}
              onClick={() => setPagina(paginaActual - 1)}
              className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-sm font-bold text-slate-500">
              Página {paginaActual} de {totalPaginas}
            </span>
            <button
              type="button"
              disabled={paginaActual >= totalPaginas}
              onClick={() => setPagina(paginaActual + 1)}
              className="px-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
