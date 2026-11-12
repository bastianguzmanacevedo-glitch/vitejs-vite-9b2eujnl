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
  getDoc,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import {
  Camera,
  CheckCircle,
  ShieldCheck,
  User,
  ArrowRight,
  AlertTriangle,
  LogOut,
  ClipboardList,
  Settings,
} from 'lucide-react';
import {
  CARPETA_FOTOS,
  COL_OTS,
  COL_PLANIFICACION,
  db,
  ES_PRUEBA,
  storage,
} from './firebase';
import { AdminLotes, PlanificacionBodega } from './Planificacion';
import Monitoreo from './Monitoreo';
import Inventario from './Inventario';
import Ajustes from './Ajustes';
import {
  CATALOGO_PAN,
  CATEGORIAS_EN_LATAS,
  ETAPAS,
  esPersonaCalidad,
  RESULTADOS_CALIDAD,
} from './catalogo';

// Contraseña numérica del Panel Administrador SAP (y de la etapa Control SAP)
const ADMIN_PIN = '2640';

// Los teléfonos de planta solo necesitan los registros recientes (para saber
// qué OT de la planificación ya avanzaron); así la app carga más rápido.
const DIAS_RECIENTES = 21;

// Nombre de operario: solo letras (con tildes y ñ) y espacios, mínimo 2 letras
const NOMBRE_VALIDO = /^\p{L}[\p{L} ]*\p{L}$/u;

// N° de carro: números, o varios carros separados por guion (ej. 03-02)
const FORMATO_CARRO = /^\d+(-\d+)*$/;

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

const BannerPrueba = () =>
  ES_PRUEBA ? (
    <div className="bg-violet-700 text-white text-center text-xs font-bold py-2 px-4">
      COPIA DE PRUEBA: los datos de aquí no afectan a la app oficial
    </div>
  ) : null;

const ESTILO_INPUT =
  'w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 transition-all';
const ESTILO_LABEL =
  'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5';

// Datos que la OT trae de Amasado (y de Horneado), para no volver a escribirlos
const TarjetaOt = ({ info, amasado, horneado, origen }) => {
  if (!info) {
    return (
      <p className="text-xs text-slate-400 font-medium -mt-2">
        Al ingresar la OT aparecerán la variedad, el carro y lo producido en
        Amasado.
      </p>
    );
  }
  if (info.cargando) {
    return (
      <p className="text-xs text-slate-400 font-medium -mt-2">Buscando la OT...</p>
    );
  }
  if (!origen) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-2xl flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
        No se encontró esta OT en Amasado ni en la planificación. Revisa el
        número.
      </div>
    );
  }
  const tipo = CATEGORIAS_EN_LATAS.includes(origen.categoria)
    ? 'latas'
    : 'unidades';
  const filas = [
    ['Variedad', `${origen.categoria} · ${origen.variedad}`],
    ['N° de carro', amasado?.batches || '—'],
    [
      tipo === 'latas' ? 'Latas en Amasado' : 'Unidades en Amasado',
      amasado?.cantidadProducida ?? '—',
    ],
  ];
  if (horneado?.cantidadCorregida != null) {
    filas.push([
      'Corregido en horno',
      `${horneado.cantidadCorregida} ${tipo}`,
    ]);
  }
  if (horneado?.resultadoCalidad) {
    filas.push([
      'Calidad en horno',
      horneado.resultadoCalidad === 'parcial'
        ? `${horneado.unidadesRechazadas} ${tipo} rechazadas`
        : RESULTADOS_CALIDAD[horneado.resultadoCalidad],
    ]);
  }
  return (
    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
      {!amasado && (
        <p className="text-xs font-bold text-amber-700 mb-2">
          Aún no está registrada en Amasado: la variedad viene de la
          planificación.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {filas.map(([titulo, valor]) => (
          <div key={titulo} className={titulo === 'Variedad' ? 'col-span-2' : ''}>
            <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {titulo}
            </dt>
            <dd className="text-sm font-black text-slate-800">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [ots, setOts] = useState([]);

  // Formulario Operario
  const [numOt, setNumOt] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('');
  const [variedadSel, setVariedadSel] = useState('');
  const [batchCount, setBatchCount] = useState('1');
  const [cantidadProducida, setCantidadProducida] = useState('');
  const [cajas, setCajas] = useState('');
  const [ofPT, setOfPT] = useState('');
  const [rechazada100, setRechazada100] = useState(false);
  const [horneadoOk, setHorneadoOk] = useState(false);
  const [cantidadCorregida, setCantidadCorregida] = useState('');
  const [resultadoCalidad, setResultadoCalidad] = useState('aprobada');
  const [unidadesRechazadas, setUnidadesRechazadas] = useState('');
  const [mermas, setMermas] = useState('');
  // Lo que ya se sabe de la OT ingresada (registros y planificación)
  const [infoOt, setInfoOt] = useState(null);
  const [fotoBase64, setFotoBase64] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Acceso
  const [etapaLogin, setEtapaLogin] = useState('');
  const [nombreLogin, setNombreLogin] = useState('');
  const [pinEtapa, setPinEtapa] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPinAdmin, setShowPinAdmin] = useState(false);
  const [pinAdmin, setPinAdmin] = useState('');
  const [pinError, setPinError] = useState('');

  // Pestañas: Bodega (registrar / planificacion), Admin (monitoreo / lotes / inventario)
  const [vistaBodega, setVistaBodega] = useState('planificacion');
  const [vistaAdmin, setVistaAdmin] = useState('monitoreo');

  // Ajustes y modo oscuro (por dispositivo)
  const [showAjustes, setShowAjustes] = useState(false);
  const [oscuro, setOscuro] = useState(() =>
    document.documentElement.classList.contains('oscuro')
  );
  useEffect(() => {
    document.documentElement.classList.toggle('oscuro', oscuro);
    try {
      localStorage.setItem('espigal_modo_oscuro', oscuro ? '1' : '0');
    } catch {
      // Sin almacenamiento disponible: el modo dura hasta cerrar la app.
    }
  }, [oscuro]);

  const etapaActual = session?.etapa;
  const esControlSap = etapaActual === 'Control SAP';
  // Yara o Katy en Horneado: control de calidad en horno (con contraseña)
  const esCalidadHorno = etapaActual === 'Horneado' && !!session?.calidad;
  // Bodega y Amasado ingresan pan y carro; las etapas siguientes los toman de Amasado
  const pideCarro = etapaActual === 'Bodega' || etapaActual === 'Amasado';
  const usaDatosAmasado = !!etapaActual && !pideCarro;

  const infoVigente =
    infoOt && infoOt.otNumber === numOt.trim() ? infoOt : null;
  const regAmasado = infoVigente?.registros.find((r) => r.etapa === 'Amasado');
  const regHorneado = infoVigente?.registros.find((r) => r.etapa === 'Horneado');
  const datosOt =
    regAmasado ||
    infoVigente?.registros.find(
      (r) => r.categoria && r.categoria !== 'No especificada'
    ) ||
    (infoVigente?.plan?.categoria ? infoVigente.plan : null);

  const categoriaEfectiva = usaDatosAmasado ? datosOt?.categoria : categoriaSel;
  const tipoCantidad = CATEGORIAS_EN_LATAS.includes(categoriaEfectiva)
    ? 'latas'
    : 'unidades';
  // Moldes, panes de campo y hogazas se cuentan por unidad
  const esUnitario = tipoCantidad === 'unidades';

  const loginCalidadHorno =
    etapaLogin === 'Horneado' && esPersonaCalidad(nombreLogin);
  const loginRequierePin =
    ETAPAS.find((e) => e.name === etapaLogin)?.soloAdmin || loginCalidadHorno;

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

  // Al escribir la OT, trae sus registros y su planificación
  useEffect(() => {
    const ot = numOt.trim();
    if (session?.role !== 'operario' || !/^\d{3,}$/.test(ot)) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      setInfoOt({ otNumber: ot, cargando: true, registros: [], plan: null });
      try {
        const [regs, plan] = await Promise.all([
          getDocs(query(collection(db, COL_OTS), where('otNumber', '==', ot))),
          getDoc(doc(db, COL_PLANIFICACION, ot)),
        ]);
        if (cancelado) return;
        const registros = regs.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) -
              (a.createdAt?.toMillis?.() || 0)
          );
        setInfoOt({
          otNumber: ot,
          cargando: false,
          registros,
          plan: plan.exists() ? plan.data() : null,
        });
      } catch (err) {
        console.error('No se pudo buscar la OT:', err);
        if (!cancelado) {
          setInfoOt({ otNumber: ot, cargando: false, registros: [], plan: null });
        }
      }
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [numOt, session]);

  // Amasado: la variedad sale de la planificación de la OT
  useEffect(() => {
    const plan = infoOt?.plan;
    if (etapaActual !== 'Amasado' || !plan || !CATALOGO_PAN[plan.categoria]) {
      return;
    }
    setCategoriaSel(plan.categoria);
    setVariedadSel(
      CATALOGO_PAN[plan.categoria].includes(plan.variedad) ? plan.variedad : ''
    );
  }, [infoOt, etapaActual]);

  // Control de calidad en horno: parte con lo contado en Amasado
  useEffect(() => {
    if (!esCalidadHorno || !infoOt || infoOt.cargando) return;
    const amasado = infoOt.registros.find((r) => r.etapa === 'Amasado');
    const horneado = infoOt.registros.find((r) => r.etapa === 'Horneado');
    setCantidadCorregida(
      String(horneado?.cantidadCorregida ?? amasado?.cantidadProducida ?? '')
    );
    setResultadoCalidad(horneado?.resultadoCalidad || 'aprobada');
    setUnidadesRechazadas(String(horneado?.unidadesRechazadas ?? ''));
  }, [infoOt, esCalidadHorno]);

  // Registros recientes (el panel de monitoreo carga los suyos por fecha)
  useEffect(() => {
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_RECIENTES);
    const q = query(
      collection(db, COL_OTS),
      where('createdAt', '>=', Timestamp.fromDate(desde)),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snapshot) => {
        setOts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error('Error al obtener OTs:', err)
    );
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

  const limpiarFormulario = () => {
    setNumOt('');
    setFotoBase64(null);
    setBatchCount('1');
    setCantidadProducida('');
    setCajas('');
    setMermas('');
    setOfPT('');
    setRechazada100(false);
    setHorneadoOk(false);
    setCantidadCorregida('');
    setResultadoCalidad('aprobada');
    setUnidadesRechazadas('');
    setInfoOt(null);
  };

  const handleSubmitRegistro = async (e) => {
    e.preventDefault();
    const otNumber = numOt.trim();
    const carro = String(batchCount).trim();
    const etapa = session.etapa;
    if (!otNumber) return setErrorMsg('Ingresa el número de OT');
    if (esControlSap && !ofPT.trim()) {
      return setErrorMsg('Ingresa el N° de OF PT');
    }
    if (pideCarro && !FORMATO_CARRO.test(carro)) {
      return setErrorMsg('El N° de carro debe ser un número o carros separados por guion, ej. 03-02');
    }
    if (etapa === 'Amasado' && (!categoriaSel || !variedadSel)) {
      return setErrorMsg('Selecciona el tipo de pan y la variedad');
    }
    if (etapa === 'Horneado' && !esCalidadHorno && !horneadoOk) {
      return setErrorMsg('Marca la casilla "Horneado" para confirmar');
    }
    if (esCalidadHorno) {
      if (esUnitario && (cantidadCorregida === '' || Number(cantidadCorregida) < 0)) {
        return setErrorMsg('Ingresa las unidades producidas');
      }
      if (resultadoCalidad === 'parcial' && !(Number(unidadesRechazadas) > 0)) {
        return setErrorMsg('Ingresa cuántas unidades se rechazaron');
      }
    }

    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString('es-CL');
    const horaStr = ahora.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      // Todos los registros previos de esta OT (en cualquier etapa)
      const previos = await getDocs(
        query(collection(db, COL_OTS), where('otNumber', '==', otNumber))
      );
      const datosPrevios = previos.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
        );
      const previoAmasado = datosPrevios.find((d) => d.etapa === 'Amasado');
      const previoHorneado = datosPrevios.find((d) => d.etapa === 'Horneado');

      // Control de calidad en horno: unidades corregidas y rechazos
      let datosCalidad = {};
      if (esCalidadHorno) {
        const contadas = previoAmasado?.cantidadProducida;
        const corregida = esUnitario ? Number(cantidadCorregida) : null;
        datosCalidad = {
          resultadoCalidad,
          unidadesRechazadas:
            resultadoCalidad === 'parcial' ? Number(unidadesRechazadas) : null,
          cantidadCorregida:
            corregida != null && corregida !== contadas ? corregida : null,
          revisadoPor: session.user,
          revisadoFecha: fechaStr,
          revisadoHora: horaStr,
        };
      }

      // Si el horno ya registró la OT, control de calidad completa ese registro
      if (esCalidadHorno && previoHorneado) {
        await updateDoc(doc(db, COL_OTS, previoHorneado.id), datosCalidad);
        setSuccessMsg(
          `¡Control de calidad en horno guardado para la OT #${otNumber}!`
        );
        limpiarFormulario();
        return;
      }

      // Bloquea OTs duplicadas en la misma etapa
      if (datosPrevios.some((d) => d.etapa === etapa)) {
        setErrorMsg(`La OT #${otNumber} ya fue registrada en la etapa ${etapa}.`);
        return;
      }

      // Solo Control SAP lleva foto (opcional): la foto definitiva de la OT
      let photoURL = null;
      if (fotoBase64 && esControlSap) {
        const photoRef = ref(
          storage,
          `${CARPETA_FOTOS}/${otNumber}_${etapa}_${Date.now()}.jpg`
        );
        await uploadString(photoRef, fotoBase64, 'data_url');
        photoURL = await getDownloadURL(photoRef);
      }

      // Pan y carro: en Bodega y Amasado se ingresan; después se copian de
      // Amasado (o del último registro, o de la planificación).
      let categoria = categoriaSel || 'No especificada';
      let variedad = variedadSel || 'No especificada';
      let batches = carro;
      let tipoOrigen = tipoCantidad;
      if (usaDatosAmasado) {
        const origen =
          previoAmasado ||
          datosPrevios.find(
            (d) => d.categoria && d.categoria !== 'No especificada'
          );
        const plan = infoVigente?.plan;
        if (origen) {
          categoria = origen.categoria;
          variedad = origen.variedad;
          batches = origen.batches ?? '';
        } else if (plan?.categoria) {
          categoria = plan.categoria;
          variedad = plan.variedad;
          batches = '';
        } else {
          categoria = 'No especificada';
          variedad = 'No especificada';
          batches = '';
        }
        tipoOrigen = CATEGORIAS_EN_LATAS.includes(categoria)
          ? 'latas'
          : 'unidades';
      }

      const datosEtapa = {};
      if (etapa === 'Amasado') {
        datosEtapa.cantidadProducida = Number(cantidadProducida);
        datosEtapa.tipoCantidad = tipoCantidad;
      }
      if (etapa === 'Horneado') {
        datosEtapa.horneado = true;
        datosEtapa.tipoCantidad = tipoOrigen;
        Object.assign(datosEtapa, datosCalidad);
      }
      if (etapa === 'Packing') {
        datosEtapa.cajas = Number(cajas);
        if (mermas !== '') {
          datosEtapa.mermas = Number(mermas);
          datosEtapa.tipoCantidad = tipoOrigen;
        }
      }
      if (esControlSap) datosEtapa.ofPT = ofPT.trim();
      if (etapa === 'Control de calidad') {
        datosEtapa.rechazada100 = rechazada100;
      }

      await addDoc(collection(db, COL_OTS), {
        otNumber: otNumber,
        categoria,
        variedad,
        batches,
        ...datosEtapa,
        etapa,
        operario: session.user,
        photoURL: photoURL,
        createdAt: serverTimestamp(),
        fechaStr,
        horaStr,
      });

      // Si se subió una foto nueva, borra las fotos de etapas anteriores
      // para dejar solo una foto por OT y ahorrar espacio en Storage.
      if (photoURL) {
        await borrarFotosAnteriores(previos.docs, etapa);
      }

      setSuccessMsg(`¡OT #${otNumber} registrada exitosamente en ${etapa}!`);
      // Se mantiene la variedad: suelen venir muchas OT seguidas de la misma
      if (pideCarro) {
        guardarUltimaVariedad(etapa, categoriaSel, variedadSel);
      }
      limpiarFormulario();
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al guardar. Verifica tu conexión a internet.');
    } finally {
      setUploading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center pb-12 sm:px-6 lg:px-8 font-sans">
        <BannerPrueba />
        <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="w-44 h-44 sm:w-48 sm:h-48 rounded-full mx-auto mb-5 p-[5px] bg-gradient-to-br from-amber-400 via-amber-700 to-amber-900 shadow-xl shadow-amber-900/25">
            <img
              src="/logo.png"
              alt="Logo EL ESPIGAL"
              className="w-full h-full rounded-full bg-white object-contain ring-1 ring-black/10"
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
                  const name = e.target.operarioName.value
                    .replace(/\s+/g, ' ')
                    .trim();
                  if (!etapaLogin) return;
                  if (!NOMBRE_VALIDO.test(name)) {
                    setLoginError('Escribe tu nombre con letras, sin números');
                    return;
                  }
                  if (loginRequierePin && pinEtapa !== ADMIN_PIN) {
                    setLoginError('Contraseña incorrecta');
                    setPinEtapa('');
                    return;
                  }
                  setLoginError('');
                  setPinEtapa('');
                  setSession({
                    user: name,
                    role: 'operario',
                    etapa: etapaLogin,
                    calidad:
                      etapaLogin === 'Horneado' && esPersonaCalidad(name),
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className={ESTILO_LABEL}>Nombre Completo</label>
                  <input
                    name="operarioName"
                    type="text"
                    required
                    autoComplete="name"
                    autoCapitalize="words"
                    onChange={(e) => {
                      // Solo letras y espacios: evita escribir la OT aquí por error
                      e.target.value = e.target.value.replace(
                        /[^\p{L}\s]/gu,
                        ''
                      );
                      setNombreLogin(e.target.value);
                      setLoginError('');
                    }}
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm transition-all bg-slate-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className={ESTILO_LABEL}>Etapa de Trabajo</label>
                  <select
                    name="etapaSel"
                    required
                    value={etapaLogin}
                    onChange={(e) => {
                      setEtapaLogin(e.target.value);
                      setLoginError('');
                    }}
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
                {loginRequierePin && (
                  <div>
                    <label className={ESTILO_LABEL}>
                      {loginCalidadHorno
                        ? 'Contraseña de control de calidad'
                        : 'Contraseña Administrador'}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pinEtapa}
                      onChange={(e) =>
                        setPinEtapa(e.target.value.replace(/\D/g, ''))
                      }
                      placeholder="••••"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-center text-lg tracking-[0.5em] font-bold bg-slate-50 focus:bg-white transition-all"
                    />
                  </div>
                )}
                {loginError && (
                  <p className="text-xs text-red-600 font-bold text-center">
                    {loginError}
                  </p>
                )}
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
                <label className={ESTILO_LABEL}>Contraseña Administrador</label>
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
        <div className="max-w-[1920px] mx-auto px-4 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-full p-[3px] bg-gradient-to-br from-amber-200 via-amber-500 to-amber-900 shadow-md shadow-black/30">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full rounded-full bg-white object-contain"
              />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight tracking-wide">
                EL ESPIGAL
              </h1>
              <p className="text-[10px] uppercase tracking-wider text-amber-200/80 font-semibold">
                {session.role === 'admin'
                  ? 'Administración SAP'
                  : `Puesto: ${session.etapa}${
                      session.calidad ? ' · Control de calidad' : ''
                    }`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {session.role === 'admin' ? (
              <button
                type="button"
                onClick={() => setShowAjustes(true)}
                title="Ajustes"
                className="text-xs bg-black/20 hover:bg-black/30 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5 font-medium transition-all"
              >
                <Settings className="w-3.5 h-3.5 text-amber-300" />{' '}
                {session.user}
              </button>
            ) : (
              <span className="text-xs bg-black/20 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5 font-medium">
                <User className="w-3.5 h-3.5 text-amber-300" /> {session.user}
              </span>
            )}
            <button
              onClick={() => setSession(null)}
              aria-label="Salir"
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {showAjustes && (
        <Ajustes
          onCerrar={() => setShowAjustes(false)}
          oscuro={oscuro}
          setOscuro={setOscuro}
        />
      )}

      <main className="max-w-[1920px] mx-auto px-4 lg:px-8 mt-6">
        {session.role === 'operario' && (
          <div
            className={`mx-auto space-y-4 ${
              session.etapa === 'Bodega' && vistaBodega === 'planificacion'
                ? 'max-w-xl lg:max-w-6xl'
                : 'max-w-xl'
            }`}
          >
            {session.etapa === 'Bodega' && (
              <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-200/60 rounded-2xl max-w-xl mx-auto">
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
                  {esControlSap
                    ? 'Ingresa el N° de OT, el N° de OF PT creada en SAP y la foto definitiva.'
                    : esCalidadHorno
                    ? 'Ingresa el N° de OT para revisar lo producido y registrar el control de calidad.'
                    : usaDatosAmasado
                    ? 'Ingresa el N° de OT: la variedad y el carro se toman de Amasado.'
                    : 'Completa los datos para registrar el avance.'}
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
                    <label className={ESTILO_LABEL}>Número de OT (SAP)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={numOt}
                      onChange={(e) => setNumOt(e.target.value)}
                      placeholder="Ej. 100452"
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-base font-bold text-slate-700 bg-slate-50 focus:bg-white transition-all"
                      required
                    />
                  </div>

                  {usaDatosAmasado && (
                    <TarjetaOt
                      info={infoVigente}
                      amasado={regAmasado}
                      horneado={regHorneado}
                      origen={datosOt}
                    />
                  )}

                  {esControlSap && (
                    <div>
                      <label className={ESTILO_LABEL}>N° OF PT</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={ofPT}
                        onChange={(e) =>
                          setOfPT(e.target.value.replace(/\D/g, ''))
                        }
                        placeholder="Ej. 16550"
                        className={`${ESTILO_INPUT} font-mono text-base font-bold`}
                      />
                    </div>
                  )}

                  {pideCarro && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={ESTILO_LABEL}>Tipo de Pan</label>
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
                          <label className={ESTILO_LABEL}>Variedad Exacta</label>
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
                      {session.etapa === 'Amasado' && infoVigente?.plan && (
                        <p className="-mt-3 text-[11px] text-emerald-700 font-medium">
                          Variedad tomada de la planificación de la OT
                        </p>
                      )}

                      <div>
                        <label className={ESTILO_LABEL}>Número de carro</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="\d+(-\d+)*"
                          title="Un número o varios carros separados por guion, ej. 03-02"
                          required
                          value={batchCount}
                          onChange={(e) =>
                            setBatchCount(e.target.value.replace(/[^\d-]/g, ''))
                          }
                          placeholder="Ej. 3 o 03-02"
                          className={ESTILO_INPUT}
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Si la OT tiene dos carros, sepáralos con guion: 03-02
                        </p>
                      </div>
                    </>
                  )}

                  {session.etapa === 'Amasado' && (
                    <div>
                      <label className={ESTILO_LABEL}>
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
                        className={ESTILO_INPUT}
                      />
                    </div>
                  )}

                  {session.etapa === 'Horneado' && !esCalidadHorno && (
                    <label
                      className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                        horneadoOk
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={horneadoOk}
                        onChange={(e) => setHorneadoOk(e.target.checked)}
                        className="w-6 h-6 accent-emerald-600 [color-scheme:light]"
                      />
                      <span>
                        <span className="block text-left text-base font-bold text-slate-800">
                          Horneado
                        </span>
                        <span className="block text-left text-xs text-slate-500">
                          Marca la casilla cuando el carro salga del horno
                        </span>
                      </span>
                    </label>
                  )}

                  {esCalidadHorno && infoVigente && !infoVigente.cargando && (
                    <div className="p-4 rounded-2xl border border-violet-200 bg-violet-50/60 space-y-4">
                      <div>
                        <p className="text-sm font-black text-violet-900">
                          Control de calidad en horno
                        </p>
                        <p className="text-xs text-slate-500">
                          {regHorneado
                            ? 'El horno ya registró esta OT: se agregará tu revisión.'
                            : 'La OT quedará registrada como horneada con tu revisión.'}
                        </p>
                      </div>

                      {esUnitario ? (
                        <div>
                          <label className={ESTILO_LABEL}>
                            Unidades producidas
                          </label>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            required
                            value={cantidadCorregida}
                            onChange={(e) => setCantidadCorregida(e.target.value)}
                            className={ESTILO_INPUT}
                          />
                          <p className="text-[11px] text-slate-500 mt-1">
                            {regAmasado?.cantidadProducida != null
                              ? `En Amasado se contaron ${regAmasado.cantidadProducida}. Corrígelo si no coincide.`
                              : 'Esta OT no tiene unidades registradas en Amasado.'}
                          </p>
                        </div>
                      ) : null}

                      <div>
                        <label className={ESTILO_LABEL}>Resultado</label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(RESULTADOS_CALIDAD).map(
                            ([id, texto]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setResultadoCalidad(id)}
                                aria-pressed={resultadoCalidad === id}
                                className={`py-3 px-2 rounded-xl text-xs font-bold border transition-all ${
                                  resultadoCalidad === id
                                    ? id === 'aprobada'
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : id === 'rechazada'
                                      ? 'bg-red-600 text-white border-red-600'
                                      : 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                {texto}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {resultadoCalidad === 'parcial' && (
                        <div>
                          <label className={ESTILO_LABEL}>
                            {tipoCantidad === 'latas'
                              ? 'Latas rechazadas'
                              : 'Unidades rechazadas'}
                          </label>
                          <input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            required
                            value={unidadesRechazadas}
                            onChange={(e) => setUnidadesRechazadas(e.target.value)}
                            className={ESTILO_INPUT}
                          />
                        </div>
                      )}
                      {resultadoCalidad === 'seleccion' && (
                        <p className="text-xs text-amber-800 font-medium">
                          En Packing seleccionarán las unidades buenas y anotarán
                          las mermas.
                        </p>
                      )}
                    </div>
                  )}

                  {session.etapa === 'Packing' && (
                    <>
                      {regHorneado?.resultadoCalidad === 'seleccion' && (
                        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-2xl flex items-center gap-3">
                          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                          Control de calidad dejó esta OT para selección:
                          anota las mermas.
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={ESTILO_LABEL}>Cajas</label>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            required
                            value={cajas}
                            onChange={(e) => setCajas(e.target.value)}
                            className={ESTILO_INPUT}
                          />
                        </div>
                        <div>
                          <label className={ESTILO_LABEL}>
                            Mermas (opcional)
                          </label>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={mermas}
                            onChange={(e) => setMermas(e.target.value)}
                            placeholder={tipoCantidad === 'latas' ? 'Latas' : 'Unidades'}
                            className={ESTILO_INPUT}
                          />
                        </div>
                      </div>
                    </>
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
                        <span className="block text-left text-xs text-slate-500">
                          Marcar solo si se rechazó el carro completo
                        </span>
                      </span>
                    </label>
                  )}

                  {esControlSap && (
                    <div className="pt-2">
                      <label className={`${ESTILO_LABEL} mb-2 text-center`}>
                        Foto definitiva de la OT (opcional)
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
                  )}

                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-full py-4 px-4 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 disabled:shadow-none text-white font-bold rounded-2xl shadow-lg shadow-amber-900/20 transition-all flex items-center justify-center gap-2 text-base mt-6"
                  >
                    {uploading ? (
                      <>Guardando...</>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />{' '}
                        {esCalidadHorno
                          ? 'Guardar control de calidad'
                          : `Registrar OT en ${session.etapa}`}
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
            <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-200/60 rounded-2xl max-w-xl">
              {[
                ['monitoreo', 'Monitoreo'],
                ['lotes', 'Planificación y lotes'],
                ['inventario', 'Inventario'],
              ].map(([id, texto]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVistaAdmin(id)}
                  className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    vistaAdmin === id
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {texto}
                </button>
              ))}
            </div>

            {vistaAdmin === 'monitoreo' && <Monitoreo />}
            {vistaAdmin === 'lotes' && <AdminLotes />}
            {vistaAdmin === 'inventario' && <Inventario />}
          </div>
        )}
      </main>
    </div>
  );
}
