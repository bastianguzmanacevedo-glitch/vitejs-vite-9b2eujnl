import React, { useState, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
} from 'firebase/firestore';
import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  Camera,
  Package,
  Wheat,
  CheckCircle,
  Clock,
  Search,
  Download,
  ShieldCheck,
  User,
  Layers,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Image as ImageIcon,
  ClipboardCheck,
  Trash2,
  ClipboardList,
} from 'lucide-react';
import { CARPETA_FOTOS, COL_OTS, db, ES_PRUEBA, storage } from './firebase';
import { AdminLotes, PlanificacionBodega } from './Planificacion';

// Contraseña numérica del Panel Administrador SAP
const ADMIN_PIN = '2640';

// --- CATÁLOGO DE PRODUCCIÓN EL ESPIGAL ---
const CATALOGO_PAN = {
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

const ETAPAS = [
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
    name: 'Control de calidad',
    icon: ClipboardCheck,
    description: 'Revisión final de calidad',
  },
];

// Estas categorías se cuentan en latas; todas las demás, en unidades.
const CATEGORIAS_EN_LATAS = [
  'Coliza',
  'Ciabatta coctail',
  'Ciabatta grande',
  'Fogaccia',
];

const claveUltimaVariedad = (etapa) => `espigal_ultima_variedad_${etapa}`;

const leerUltimaVariedad = (etapa) => {
  try {
    return JSON.parse(localStorage.getItem(claveUltimaVariedad(etapa))) || {};
  } catch {
    return {};
  }
};

const guardarUltimaVariedad = (etapa, categoria, variedad) => {
  try {
    localStorage.setItem(
      claveUltimaVariedad(etapa),
      JSON.stringify({ categoria, variedad })
    );
  } catch {
    // Sin almacenamiento disponible: la selección dura hasta salir de la app.
  }
};

const textoProduccion = (ot) => {
  const partes = [];
  if (ot.cantidadProducida != null) {
    partes.push(`${ot.cantidadProducida} ${ot.tipoCantidad || 'unidades'}`);
  }
  if (ot.cajas != null) partes.push(`${ot.cajas} cajas`);
  return partes.join(' / ');
};

const BannerPrueba = () =>
  ES_PRUEBA ? (
    <div className="bg-violet-700 text-white text-center text-xs font-bold py-2 px-4">
      COPIA DE PRUEBA: los datos de aquí no afectan a la app oficial
    </div>
  ) : null;

export default function App() {
  const [session, setSession] = useState(null);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulario Operario
  const [numOt, setNumOt] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('');
  const [variedadSel, setVariedadSel] = useState('');
  const [batchCount, setBatchCount] = useState(1);
  const [cantidadProducida, setCantidadProducida] = useState('');
  const [cajas, setCajas] = useState('');
  const [rechazada100, setRechazada100] = useState(false);
  const [fotoBase64, setFotoBase64] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Acceso Administrador
  const [showPinAdmin, setShowPinAdmin] = useState(false);
  const [pinAdmin, setPinAdmin] = useState('');
  const [pinError, setPinError] = useState('');

  // Pestañas: Bodega (registrar / planificacion), Admin (monitoreo / lotes)
  const [vistaBodega, setVistaBodega] = useState('planificacion');
  const [vistaAdmin, setVistaAdmin] = useState('monitoreo');

  // Filtros Dashboard
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('Todas');

  const etapaActual = session?.etapa;
  const tipoCantidad = CATEGORIAS_EN_LATAS.includes(categoriaSel)
    ? 'latas'
    : 'unidades';

  // Al entrar a un puesto, recupera la última variedad usada en ese puesto
  useEffect(() => {
    if (!etapaActual) return;
    const ultima = leerUltimaVariedad(etapaActual);
    const categoria = CATALOGO_PAN[ultima.categoria] ? ultima.categoria : '';
    setCategoriaSel(categoria);
    setVariedadSel(
      categoria && CATALOGO_PAN[categoria].includes(ultima.variedad)
        ? ultima.variedad
        : ''
    );
  }, [etapaActual]);

  useEffect(() => {
    const q = query(collection(db, COL_OTS), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setOts(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Error al obtener OTs:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleCapturePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Comprime la foto (máx. ~1 MB) para ahorrar espacio en Firebase.
    // Si la compresión falla, se usa la foto original.
    let finalFile = file;
    try {
      finalFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
    } catch (err) {
      console.error('Error al comprimir la foto:', err);
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFotoBase64(reader.result);
    };
    reader.readAsDataURL(finalFile);
  };

  // Borra la foto de cada registro anterior de la OT y lo marca como
  // "foto reemplazada". Un fallo aquí no afecta al registro nuevo.
  const borrarFotosAnteriores = async (docsPrevios, etapaNueva) => {
    for (const d of docsPrevios) {
      const fotoAnterior = d.data().photoURL;
      if (!fotoAnterior) continue;
      try {
        await deleteObject(ref(storage, fotoAnterior));
      } catch (err) {
        // Si la foto ya no existía, igual se limpia el registro
        if (err?.code !== 'storage/object-not-found') {
          console.error('No se pudo borrar la foto anterior:', err);
          continue;
        }
      }
      try {
        await updateDoc(doc(db, COL_OTS, d.id), {
          photoURL: null,
          fotoReemplazadaEn: etapaNueva,
        });
      } catch (err) {
        console.error('No se pudo actualizar el registro anterior:', err);
      }
    }
  };

  const handleSubmitRegistro = async (e) => {
    e.preventDefault();
    const otNumber = numOt.trim();
    if (!otNumber) return setErrorMsg('Ingresa el número de OT');
    if (session.etapa === 'Amasado' && (!categoriaSel || !variedadSel)) {
      return setErrorMsg('Selecciona el tipo de pan y la variedad');
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Todos los registros previos de esta OT (en cualquier etapa)
      const previos = await getDocs(
        query(
          collection(db, COL_OTS),
          where('otNumber', '==', otNumber)
        )
      );

      // Bloquea OTs duplicadas en la misma etapa
      if (previos.docs.some((d) => d.data().etapa === session.etapa)) {
        setErrorMsg(
          `La OT #${otNumber} ya fue registrada en la etapa ${session.etapa}.`
        );
        return;
      }

      // La foto es opcional
      let photoURL = null;
      if (fotoBase64) {
        const photoRef = ref(
          storage,
          `${CARPETA_FOTOS}/${otNumber}_${session.etapa}_${Date.now()}.jpg`
        );
        await uploadString(photoRef, fotoBase64, 'data_url');
        photoURL = await getDownloadURL(photoRef);
      }

      // Datos propios de cada etapa
      const datosEtapa = {};
      if (session.etapa === 'Amasado') {
        datosEtapa.cantidadProducida = Number(cantidadProducida);
        datosEtapa.tipoCantidad = tipoCantidad;
      }
      if (session.etapa === 'Packing') datosEtapa.cajas = Number(cajas);
      if (session.etapa === 'Control de calidad') {
        datosEtapa.rechazada100 = rechazada100;
      }

      await addDoc(collection(db, COL_OTS), {
        otNumber: otNumber,
        categoria: categoriaSel || 'No especificada',
        variedad: variedadSel || 'No especificada',
        batches: Number(batchCount) || 1,
        ...datosEtapa,
        etapa: session.etapa,
        operario: session.user,
        photoURL: photoURL,
        createdAt: serverTimestamp(),
        fechaStr: new Date().toLocaleDateString('es-CL'),
        horaStr: new Date().toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });

      // Si se subió una foto nueva, borra las fotos de etapas anteriores
      // para dejar solo una foto por OT y ahorrar espacio en Storage.
      if (photoURL) {
        await borrarFotosAnteriores(previos.docs, session.etapa);
      }

      setSuccessMsg(
        `¡OT #${otNumber} registrada exitosamente en ${session.etapa}!`
      );
      // Se mantiene la variedad: suelen venir muchas OT seguidas de la misma
      guardarUltimaVariedad(session.etapa, categoriaSel, variedadSel);
      setNumOt('');
      setFotoBase64(null);
      setBatchCount(1);
      setCantidadProducida('');
      setCajas('');
      setRechazada100(false);
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al guardar. Verifica tu conexión a internet.');
    } finally {
      setUploading(false);
    }
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

    // Borra la foto para liberar espacio (si falla, el registro ya se eliminó)
    if (ot.photoURL) {
      try {
        await deleteObject(ref(storage, ot.photoURL));
      } catch (err) {
        console.error('No se pudo borrar la foto:', err);
      }
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'OT SAP',
      'Categoria',
      'Variedad',
      'Numero de carro',
      'Cantidad producida',
      'Tipo de cantidad',
      'Cajas',
      'Rechazada 100%',
      'Etapa Actual',
      'Ultimo Operario',
      'Fecha',
      'Hora',
      'URL Foto',
    ];
    const rows = ots.map((ot) => [
      ot.otNumber,
      ot.categoria,
      ot.variedad,
      ot.batches,
      ot.cantidadProducida ?? '',
      ot.tipoCantidad ?? '',
      ot.cajas ?? '',
      ot.rechazada100 ? 'Si' : '',
      ot.etapa,
      ot.operario,
      ot.fechaStr,
      ot.horaStr,
      ot.photoURL,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `OT_EL_ESPIGAL_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center pb-12 sm:px-6 lg:px-8 font-sans">
        <BannerPrueba />
        <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="w-32 h-32 bg-amber-700 rounded-full mx-auto flex items-center justify-center shadow-lg mb-4">
            <img
              src="/logo.png"
              alt="Logo EL ESPIGAL"
              className="w-24 h-24 object-contain drop-shadow-md"
            />
          </div>
          <h2 className="text-3xl font-black text-amber-900 tracking-tight">
            EL ESPIGAL
          </h2>
          <p className="mt-2 text-sm text-slate-500 font-medium">
            Control Digital de Órdenes de Trabajo
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-100 space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                <User className="w-5 h-5 text-amber-600" /> Acceso Operarios
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = e.target.operarioName.value;
                  const etapa = e.target.etapaSel.value;
                  if (name && etapa)
                    setSession({ user: name, role: 'operario', etapa: etapa });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nombre Completo
                  </label>
                  <input
                    name="operarioName"
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm transition-all bg-slate-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Etapa de Trabajo
                  </label>
                  <select
                    name="etapaSel"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm transition-all bg-slate-50 focus:bg-white"
                  >
                    <option value="">-- Selecciona tu puesto --</option>
                    {ETAPAS.map((e) => (
                      <option key={e.id} value={e.name}>
                        {e.id}. {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-3.5 px-4 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-xl shadow-md shadow-amber-900/20 transition-all flex items-center justify-center gap-2 mt-2"
                >
                  Ingresar a Puesto <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
                <span className="bg-white px-3 text-slate-300">
                  O Administrador
                </span>
              </div>
            </div>

            {!showPinAdmin ? (
              <button
                onClick={() => {
                  setShowPinAdmin(true);
                  setPinAdmin('');
                  setPinError('');
                }}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-slate-900/20"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" /> Panel
                Administrador SAP
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pinAdmin === ADMIN_PIN) {
                    setShowPinAdmin(false);
                    setPinAdmin('');
                    setPinError('');
                    setSession({ user: 'Administrador SAP', role: 'admin' });
                  } else {
                    setPinError('Contraseña incorrecta');
                    setPinAdmin('');
                  }
                }}
                className="space-y-3"
              >
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Contraseña Administrador
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  autoFocus
                  value={pinAdmin}
                  onChange={(e) =>
                    setPinAdmin(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder="••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-700 focus:border-slate-700 text-center text-lg tracking-[0.5em] font-bold bg-slate-50 focus:bg-white transition-all"
                />
                {pinError && (
                  <p className="text-xs text-red-600 font-bold text-center">
                    {pinError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPinAdmin(false)}
                    className="flex-1 py-3 px-4 bg-white hover:bg-slate-50 text-slate-600 font-semibold rounded-xl text-sm border border-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-slate-900/20"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-400" /> Entrar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      <header className="bg-amber-800 text-white shadow-lg sticky top-0 z-50">
        <BannerPrueba />
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-7 h-7 object-contain"
              />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight tracking-wide">
                EL ESPIGAL
              </h1>
              <p className="text-[10px] uppercase tracking-wider text-amber-200/80 font-semibold">
                {session.role === 'admin'
                  ? 'Administración SAP'
                  : `Puesto: ${session.etapa}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs bg-black/20 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5 font-medium">
              <User className="w-3.5 h-3.5 text-amber-300" /> {session.user}
            </span>
            <button
              onClick={() => setSession(null)}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-6">
        {session.role === 'operario' && (
          <div className="max-w-xl mx-auto space-y-4">
            {session.etapa === 'Bodega' && (
              <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/60 rounded-2xl">
                {[
                  ['planificacion', 'Planificación', ClipboardList],
                  ['registrar', 'Registrar OT', Camera],
                ].map(([id, texto, Icono]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVistaBodega(id)}
                    className={`py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                      vistaBodega === id
                        ? 'bg-white text-amber-800 shadow-sm'
                        : 'text-slate-500'
                    }`}
                  >
                    <Icono className="w-4 h-4" /> {texto}
                  </button>
                ))}
              </div>
            )}

            {session.etapa === 'Bodega' && vistaBodega === 'planificacion' ? (
              <PlanificacionBodega
                session={session}
                registros={ots}
                onRegistrar={(ot) => {
                  setNumOt(ot.otNumber);
                  setCategoriaSel(ot.categoria || '');
                  setVariedadSel(ot.variedad || '');
                  setErrorMsg('');
                  setSuccessMsg('');
                  setVistaBodega('registrar');
                }}
              />
            ) : (
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
              <h2 className="text-2xl font-black text-slate-800 mb-1">
                Registrar OT en {session.etapa}
              </h2>
              <p className="text-sm text-slate-500 mb-8">
                Completa los datos y fotografía la ficha física para registrar
                el avance.
              </p>

              {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />{' '}
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm rounded-2xl flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />{' '}
                  {successMsg}
                </div>
              )}

              <form onSubmit={handleSubmitRegistro} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Número de OT (SAP)
                  </label>
                  <input
                    type="text"
                    value={numOt}
                    onChange={(e) => setNumOt(e.target.value)}
                    placeholder="Ej. 100452"
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-base font-bold text-slate-700 bg-slate-50 focus:bg-white transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Tipo de Pan
                    </label>
                    <select
                      value={categoriaSel}
                      onChange={(e) => {
                        setCategoriaSel(e.target.value);
                        setVariedadSel('');
                      }}
                      className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                    >
                      <option value="">-- Categoría --</option>
                      {Object.keys(CATALOGO_PAN).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Variedad Exacta
                    </label>
                    <select
                      value={variedadSel}
                      onChange={(e) => setVariedadSel(e.target.value)}
                      disabled={!categoriaSel}
                      className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all disabled:opacity-50"
                    >
                      <option value="">-- Variedad --</option>
                      {categoriaSel &&
                        CATALOGO_PAN[categoriaSel].map((varItem) => (
                          <option key={varItem} value={varItem}>
                            {varItem}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Número de carro
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={batchCount}
                    onChange={(e) => setBatchCount(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                  />
                </div>

                {session.etapa === 'Amasado' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      {!categoriaSel
                        ? 'Unidades / Latas'
                        : tipoCantidad === 'latas'
                        ? 'Número de latas'
                        : 'Unidades producidas'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      required
                      value={cantidadProducida}
                      onChange={(e) => setCantidadProducida(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                    />
                  </div>
                )}

                {session.etapa === 'Packing' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Cajas
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      required
                      value={cajas}
                      onChange={(e) => setCajas(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all"
                    />
                  </div>
                )}

                {session.etapa === 'Control de calidad' && (
                  <label
                    className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                      rechazada100
                        ? 'bg-red-50 border-red-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={rechazada100}
                      onChange={(e) => setRechazada100(e.target.checked)}
                      className="w-5 h-5 accent-red-600 [color-scheme:light]"
                    />
                    <span>
                      <span className="block text-left text-sm font-bold text-slate-800">
                        Rechazada al 100%
                      </span>
                      <span className="text-xs text-slate-500">
                        Marcar solo si se rechazó el carro completo
                      </span>
                    </span>
                  </label>
                )}

                <div className="pt-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                    Fotografía de la OT (opcional)
                  </label>
                  <div className="flex justify-center px-6 pt-6 pb-7 border-2 border-slate-200 border-dashed rounded-2xl hover:border-amber-500 hover:bg-amber-50/30 transition-all bg-slate-50 relative">
                    {fotoBase64 ? (
                      <div className="space-y-3 text-center w-full">
                        <img
                          src={fotoBase64}
                          alt="Vista previa OT"
                          className="max-h-64 rounded-xl mx-auto shadow-md border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => setFotoBase64(null)}
                          className="text-xs text-red-500 font-bold hover:text-red-700 transition-colors uppercase tracking-wider"
                        >
                          Reemplazar Foto
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-center">
                        <Camera className="mx-auto h-12 w-12 text-slate-300" />
                        <div className="flex text-sm text-slate-600 justify-center">
                          <label className="relative cursor-pointer bg-white rounded-xl font-bold text-amber-700 hover:text-amber-800 px-5 py-2.5 shadow-sm border border-slate-200 hover:border-amber-300 transition-all">
                            <span>Tomar Foto / Abrir Cámara</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleCapturePhoto}
                              className="sr-only"
                            />
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                          Captura clara de la ficha física
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-4 px-4 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 disabled:shadow-none text-white font-bold rounded-2xl shadow-lg shadow-amber-900/20 transition-all flex items-center justify-center gap-2 text-base mt-6"
                >
                  {uploading ? (
                    <>Guardando...</>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" /> Registrar OT en{' '}
                      {session.etapa}
                    </>
                  )}
                </button>
              </form>
            </div>
            )}
          </div>
        )}

        {session.role === 'admin' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/60 rounded-2xl max-w-md">
              {[
                ['monitoreo', 'Monitoreo'],
                ['lotes', 'Planificación y lotes'],
              ].map(([id, texto]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVistaAdmin(id)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    vistaAdmin === id
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>

            {vistaAdmin === 'lotes' && <AdminLotes />}

            {vistaAdmin === 'monitoreo' && (
            <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 md:col-span-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Total OTs
                </p>
                <div className="flex items-end justify-between mt-2">
                  <p className="text-4xl font-black text-amber-900">
                    {ots.length}
                  </p>
                  <Layers className="w-8 h-8 text-amber-200" />
                </div>
              </div>

              {ETAPAS.map((etapa) => {
                const count = ots.filter((o) => o.etapa === etapa.name).length;
                return (
                  <div
                    key={etapa.id}
                    className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between"
                  >
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      En {etapa.name}
                    </p>
                    <div className="flex items-end justify-between mt-2">
                      <p className="text-3xl font-black text-slate-800">
                        {count}
                      </p>
                      <etapa.icon className="w-6 h-6 text-slate-200" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    Monitoreo de Planta
                  </h2>
                  <p className="text-sm text-slate-500 font-medium">
                    Trazabilidad en tiempo real sincronizada con Firestore
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar OT u operario..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 w-full sm:w-64 font-medium transition-all"
                    />
                  </div>

                  <select
                    value={filtroEtapa}
                    onChange={(e) => setFiltroEtapa(e.target.value)}
                    className="py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-bold focus:ring-2 focus:ring-amber-500 transition-all"
                  >
                    <option value="Todas">Todas las Etapas</option>
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
                      <th className="px-6 py-4">Etapa Actual</th>
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
                          colSpan="9"
                          className="px-6 py-12 text-center text-slate-400 font-medium"
                        >
                          Cargando registros sincronizados...
                        </td>
                      </tr>
                    ) : ots.length === 0 ? (
                      <tr>
                        <td
                          colSpan="9"
                          className="px-6 py-12 text-center text-slate-400 font-medium"
                        >
                          No hay órdenes de trabajo activas.
                        </td>
                      </tr>
                    ) : (
                      ots
                        .filter((ot) => {
                          const matchesSearch =
                            ot.otNumber
                              .toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            ot.operario
                              .toLowerCase()
                              .includes(searchTerm.toLowerCase());
                          const matchesEtapa =
                            filtroEtapa === 'Todas' || ot.etapa === filtroEtapa;
                          return matchesSearch && matchesEtapa;
                        })
                        .map((ot) => (
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
                            <td className="px-6 py-4 font-bold text-slate-700">
                              Carro {ot.batches}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">
                              {ot.rechazada100 ? (
                                <span className="inline-flex px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                                  Rechazada 100%
                                </span>
                              ) : (
                                textoProduccion(ot) || (
                                  <span className="text-slate-300">-</span>
                                )
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                  ot.etapa === 'Bodega'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : ot.etapa === 'Amasado'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : ot.etapa === 'Horneado'
                                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                                    : ot.etapa === 'Control de calidad'
                                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
                              <div className="ml-5 text-slate-400">
                                {ot.horaStr}
                              </div>
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
                                  className="text-xs text-slate-400 bg-slate-100 px-3 py-2 rounded-xl font-medium"
                                >
                                  Foto en {ot.fotoReemplazadaEn}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 bg-slate-100 px-3 py-2 rounded-xl font-medium">
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
            </div>
            </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
