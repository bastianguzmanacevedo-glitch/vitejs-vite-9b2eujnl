import {
  CheckCircle,
  ClipboardCheck,
  FileCheck,
  Package,
  RefreshCw,
  Wheat,
} from 'lucide-react';

// --- CATÁLOGO DE PRODUCCIÓN EL ESPIGAL ---
export const CATALOGO_PAN = {
  Coliza: ['Peruana'],
  'Ciabatta coctail': ['Mini Ciabatta', 'Mini Toscano', 'Mini Cebolla'],
  'Ciabatta grande': ['Blanca', 'Cebolla'],
  Fogaccia: ['Cebolla', 'Mini cebolla'],
  'Panes de campo': ['Blanco', 'Integral', 'Integral linaza'],
  Hogazas: ['Integral linaza', 'Aceituna', 'Blanca semillas', 'Multigrano'],
  Moldes: ['Integral linaza', 'Maravilla', 'Amapola', 'Calabaza'],
  'Moldes premium': ['Multisemillas', 'Fibra', 'Proteína', 'Low Gi'],
  Pruebas: ['Otros'],
};

export const ETAPAS = [
  {
    id: 1,
    name: 'Bodega',
    icon: Package,
    description: 'Despacho de materias primas por carro',
  },
  {
    id: 2,
    name: 'Amasado',
    icon: RefreshCw,
    description: 'Batea, mezcladora y amasado',
  },
  {
    id: 3,
    name: 'Horneado',
    icon: Wheat,
    description: 'Fermentación y horneado de lotes',
  },
  {
    id: 4,
    name: 'Packing',
    icon: CheckCircle,
    description: 'Envasado y congelado final',
  },
  {
    id: 5,
    name: 'Control SAP',
    icon: FileCheck,
    description: 'N° de OF PT, lo ingresa el administrador',
    soloAdmin: true,
  },
  {
    id: 6,
    name: 'Control de calidad',
    icon: ClipboardCheck,
    description: 'Revisión final de calidad',
  },
];

// Etapas en las que la materia prima ya salió de bodega
export const ETAPAS_POSTERIORES = ETAPAS.filter((e) => e.id > 1).map(
  (e) => e.name
);

// Desde Amasado la OT ya se fabricó
export const ETAPAS_FABRICADA = ETAPAS_POSTERIORES;

// Estas categorías se cuentan en latas; todas las demás, en unidades.
export const CATEGORIAS_EN_LATAS = [
  'Coliza',
  'Ciabatta coctail',
  'Ciabatta grande',
  'Fogaccia',
];

export const COLOR_ETAPA = {
  Bodega: 'bg-blue-50 text-blue-700 border-blue-200',
  Amasado: 'bg-amber-50 text-amber-700 border-amber-200',
  Horneado: 'bg-orange-50 text-orange-700 border-orange-200',
  Packing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Control SAP': 'bg-sky-50 text-sky-700 border-sky-200',
  'Control de calidad': 'bg-violet-50 text-violet-700 border-violet-200',
};

// Fecha local AAAA-MM-DD
export const isoLocal = (d) => {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

// Rango de fechas de calendario: hoy, esta semana (desde el lunes) o este mes,
// siempre hasta hoy.
export const rangoPreset = (preset) => {
  const hoy = new Date();
  const h = isoLocal(hoy);
  if (preset === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return [isoLocal(lunes), h];
  }
  if (preset === 'mes') {
    return [isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), h];
  }
  return [h, h];
};

// Día de un registro: la hora del servidor o, si aún no llega, la del teléfono
export const fechaRegistro = (ot) => {
  if (ot.createdAt?.toDate) return isoLocal(ot.createdAt.toDate());
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(ot.fechaStr || '');
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isoLocal(new Date());
};

// Control de calidad: Yara y Katherine Núñez (Katy). En Horneado entran con
// la contraseña y pueden corregir unidades y marcar rechazos.
export const esPersonaCalidad = (nombre) =>
  /^(yara|katy|kathy|katherine|katherin|katerine|catherine)\b/.test(
    String(nombre || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
  );

export const RESULTADOS_CALIDAD = {
  aprobada: 'Sin rechazo',
  parcial: 'Rechazo parcial',
  seleccion: 'Para selección',
  rechazada: 'Rechazada al 100%',
};

export const textoProduccion = (ot) => {
  const partes = [];
  const tipo = ot.tipoCantidad || 'unidades';
  if (ot.cantidadProducida != null) {
    partes.push(`${ot.cantidadProducida} ${tipo}`);
  }
  if (ot.horneado) partes.push('Horneado');
  if (ot.cantidadCorregida != null) {
    partes.push(`corregido a ${ot.cantidadCorregida} ${tipo}`);
  }
  if (ot.resultadoCalidad === 'parcial') {
    partes.push(`${ot.unidadesRechazadas} ${tipo} rechazadas`);
  } else if (ot.resultadoCalidad === 'seleccion') {
    partes.push('para selección');
  } else if (ot.resultadoCalidad === 'rechazada') {
    partes.push('rechazada al 100%');
  }
  if (ot.cajas != null) partes.push(`${ot.cajas} cajas`);
  if (ot.mermas != null) partes.push(`${ot.mermas} mermas`);
  if (ot.ofPT) partes.push(`OF PT ${ot.ofPT}`);
  return partes.join(' / ');
};
