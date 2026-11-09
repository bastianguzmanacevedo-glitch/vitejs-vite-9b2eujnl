import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { AlertTriangle, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { COL_INVENTARIO, db } from './firebase';
import { isoLocal } from './catalogo';

const DIAS_AVISO = 30;

const numero = (n) =>
  Number(n || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });

const unidadCorta = (u) => {
  const t = String(u || '').toLowerCase();
  if (t.startsWith('kilo')) return 'kg';
  if (t.startsWith('litro')) return 'L';
  if (t.startsWith('unid')) return 'un';
  return u || '';
};

const fechaCorta = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

const estadoLote = (vence, hoy, limite) => {
  if (!vence) return 'sin fecha';
  if (vence < hoy) return 'vencido';
  if (vence <= limite) return 'por vencer';
  return 'ok';
};

const COLOR_ESTADO = {
  vencido: 'text-red-700 bg-red-50 border-red-200',
  'por vencer': 'text-amber-800 bg-amber-50 border-amber-200',
  'sin fecha': 'text-slate-500 bg-slate-100 border-slate-200',
  ok: 'text-slate-600 bg-white border-slate-200',
};

export default function Inventario() {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [abierto, setAbierto] = useState(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, COL_INVENTARIO, 'actual'),
        (snap) => {
          setDatos(snap.exists() ? snap.data() : null);
          setLoading(false);
        },
        (err) => {
          console.error('Error al leer el inventario:', err);
          setLoading(false);
        }
      ),
    []
  );

  const hoy = isoLocal(new Date());
  const limite = (() => {
    const d = new Date();
    d.setDate(d.getDate() + DIAS_AVISO);
    return isoLocal(d);
  })();

  const articulos = useMemo(
    () =>
      (datos?.articulos || []).map((a) => {
        const lotes = (a.lotes || []).map((l) => ({
          ...l,
          estado: estadoLote(l.vence, hoy, limite),
        }));
        return {
          ...a,
          lotes,
          vencidos: lotes.filter((l) => l.estado === 'vencido').length,
          porVencer: lotes.filter((l) => l.estado === 'por vencer').length,
        };
      }),
    [datos, hoy, limite]
  );

  const grupos = useMemo(
    () => [...new Set(articulos.map((a) => a.grupo))].sort(),
    [articulos]
  );
  const almacenes = useMemo(
    () =>
      [
        ...new Set(
          articulos.flatMap((a) => (a.almacenes || []).map((w) => w.almacen))
        ),
      ].sort(),
    [articulos]
  );

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return articulos.filter((a) => {
      if (grupo && a.grupo !== grupo) return false;
      if (almacen && !(a.almacenes || []).some((w) => w.almacen === almacen))
        return false;
      if (soloAlertas && !a.vencidos && !a.porVencer) return false;
      if (!t) return true;
      return (
        a.codigo.toLowerCase().includes(t) ||
        a.nombre.toLowerCase().includes(t) ||
        a.lotes.some((l) => String(l.lote).toLowerCase().includes(t))
      );
    });
  }, [articulos, busqueda, grupo, almacen, soloAlertas]);

  const porGrupo = useMemo(() => {
    const m = new Map();
    filtrados.forEach((a) => {
      if (!m.has(a.grupo)) m.set(a.grupo, []);
      m.get(a.grupo).push(a);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtrados]);

  const totalVencidos = articulos.reduce((s, a) => s + a.vencidos, 0);
  const totalPorVencer = articulos.reduce((s, a) => s + a.porVencer, 0);

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center text-slate-400 font-medium">
        Cargando inventario...
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center text-slate-400 font-medium">
        Todavía no hay inventario cargado desde SAP.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              Inventario de materias primas
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              Desde SAP · actualizado {datos.actualizado}
            </p>
          </div>
          <div className="flex gap-2 text-center">
            <div className="px-4 py-2 rounded-2xl bg-white border border-slate-200">
              <p className="text-xl font-black text-slate-800">
                {articulos.length}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase">
                Artículos
              </p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-red-50 border border-red-200">
              <p className="text-xl font-black text-red-700">{totalVencidos}</p>
              <p className="text-[10px] font-bold text-red-700 uppercase">
                Lotes vencidos
              </p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-amber-50 border border-amber-200">
              <p className="text-xl font-black text-amber-800">
                {totalPorVencer}
              </p>
              <p className="text-[10px] font-bold text-amber-800 uppercase">
                Vencen en {DIAS_AVISO} días
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar código, nombre o lote..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm w-full sm:w-64 font-medium"
            />
          </div>
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            aria-label="Grupo de artículos"
            className="py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-bold"
          >
            <option value="">Todos los grupos</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={almacen}
            onChange={(e) => setAlmacen(e.target.value)}
            aria-label="Almacén"
            className="py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-bold"
          >
            <option value="">Todos los almacenes</option>
            {almacenes.map((w) => (
              <option key={w} value={w}>
                Almacén {w}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600 px-1">
            <input
              type="checkbox"
              checked={soloAlertas}
              onChange={(e) => setSoloAlertas(e.target.checked)}
              className="w-4 h-4 accent-amber-700 [color-scheme:light]"
            />
            Solo con lotes vencidos o por vencer
          </label>
        </div>
      </div>

      {porGrupo.length === 0 ? (
        <p className="p-12 text-center text-slate-400 font-medium">
          No hay artículos con estos filtros.
        </p>
      ) : (
        porGrupo.map(([nombreGrupo, lista]) => (
          <section key={nombreGrupo} className="px-4 sm:px-6 py-4">
            <h3 className="text-sm font-black text-amber-900 border-b border-amber-100 pb-2 mb-1 flex justify-between">
              {nombreGrupo}
              <span className="text-xs font-bold text-slate-400">
                {lista.length} artículos
              </span>
            </h3>
            <ul className="divide-y divide-slate-100">
              {lista.map((a) => {
                const esAbierto = abierto === a.codigo;
                return (
                  <li key={a.codigo}>
                    <button
                      type="button"
                      onClick={() => setAbierto(esAbierto ? null : a.codigo)}
                      className="w-full py-3 flex items-center gap-3 text-left"
                    >
                      {esAbierto ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="font-mono text-xs font-bold text-slate-400 w-16 shrink-0">
                        {a.codigo}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-slate-800 text-sm truncate">
                          {a.nombre}
                        </span>
                        <span className="text-xs text-slate-400">
                          {(a.almacenes || [])
                            .map(
                              (w) =>
                                `Alm. ${w.almacen}: ${numero(w.cantidad)}`
                            )
                            .join(' · ')}
                          {' · '}
                          {a.lotes.length}{' '}
                          {a.lotes.length === 1 ? 'lote' : 'lotes'}
                        </span>
                      </span>
                      {(a.vencidos > 0 || a.porVencer > 0) && (
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 ${
                            a.vencidos ? 'text-red-500' : 'text-amber-500'
                          }`}
                        />
                      )}
                      <span className="font-black text-slate-900 text-sm whitespace-nowrap">
                        {numero(a.total)} {unidadCorta(a.unidad)}
                      </span>
                    </button>
                    {esAbierto && (
                      <div className="pb-4 pl-7 sm:pl-24 overflow-x-auto">
                        {a.lotes.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            Artículo sin manejo de lotes.
                          </p>
                        ) : (
                          <table className="text-xs w-full max-w-xl">
                            <thead className="text-[10px] uppercase text-slate-400 font-bold">
                              <tr>
                                <th className="text-left py-1.5">Lote</th>
                                <th className="text-left py-1.5">Almacén</th>
                                <th className="text-right py-1.5">Cantidad</th>
                                <th className="text-right py-1.5">Vence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {a.lotes.map((l) => (
                                <tr
                                  key={`${l.almacen}|${l.lote}`}
                                  className="border-t border-slate-100"
                                >
                                  <td className="py-1.5 font-mono font-bold text-amber-900">
                                    {l.lote}
                                  </td>
                                  <td className="py-1.5 text-slate-500">
                                    {l.almacen}
                                  </td>
                                  <td className="py-1.5 text-right font-bold text-slate-700">
                                    {numero(l.cantidad)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-md border font-bold ${
                                        COLOR_ESTADO[l.estado]
                                      }`}
                                    >
                                      {l.vence ? fechaCorta(l.vence) : 'sin fecha'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
