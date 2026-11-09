import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: 'AIzaSyCnoxH5nc6nLeuYlAQcglu_8NTzjWwIJsc',
  authDomain: 'el-espigal.firebaseapp.com',
  projectId: 'el-espigal',
  storageBucket: 'el-espigal.firebasestorage.app',
  messagingSenderId: '127308259288',
  appId: '1:127308259288:web:daf03dc3437c5fb9b3dcad',
  measurementId: 'G-F6TY4PJ658',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Solo la dirección oficial usa los datos reales. Cualquier otra (copia de
// prueba de Vercel, localhost) trabaja en colecciones "prueba_" separadas.
const HOST_OFICIAL = 'el-espigal-ot.vercel.app';
export const ES_PRUEBA = window.location.hostname !== HOST_OFICIAL;

const PREFIJO = ES_PRUEBA ? 'prueba_' : '';
export const COL_OTS = `${PREFIJO}ordenes_trabajo`;
export const COL_PLANIFICACION = `${PREFIJO}planificacion_ots`;
export const CARPETA_FOTOS = `${PREFIJO}ots`;
export const COL_INVENTARIO = `${PREFIJO}inventario`;
