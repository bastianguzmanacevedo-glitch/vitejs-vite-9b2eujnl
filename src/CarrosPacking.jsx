import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { carroCompleto, textoFaltaCarros } from './catalogo';

// Alerta "Falta carro N" mientras un Packing con varios carros esté incompleto
export const AlertaFaltaCarro = ({ ot }) => {
  const texto = textoFaltaCarros(ot);
  if (!texto) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 whitespace-nowrap">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> {texto}
    </span>
  );
};

// Detalle de cada carro de un registro de Packing (solo si tiene más de uno)
export function DetalleCarrosPacking({ ot }) {
  if (ot?.etapa !== 'Packing' || !(ot.carros?.length > 1)) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {ot.carros.map((c, i) => (
        <p
          key={`${c.numero}-${i}`}
          className="text-xs font-medium text-slate-500 whitespace-nowrap"
        >
          <span className="font-bold text-slate-700">Carro {c.numero}:</span>{' '}
          {carroCompleto(c) ? (
            <>
              {c.cantidad} {c.tipoCantidad} · {c.cajas} cajas
              {c.operario && (
                <span className="text-slate-400">
                  {' '}
                  · {c.operario}
                  {c.horaStr ? ` ${c.horaStr}` : ''}
                </span>
              )}
            </>
          ) : (
            <span className="text-amber-700 font-bold">pendiente</span>
          )}
        </p>
      ))}
      <AlertaFaltaCarro ot={ot} />
    </div>
  );
}
