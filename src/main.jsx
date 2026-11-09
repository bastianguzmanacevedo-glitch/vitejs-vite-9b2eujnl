import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './oscuro.css';

// Modo oscuro guardado en este dispositivo (se aplica antes de dibujar la app)
try {
  if (localStorage.getItem('espigal_modo_oscuro') === '1') {
    document.documentElement.classList.add('oscuro');
  }
} catch {
  // Sin almacenamiento disponible: modo claro
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
