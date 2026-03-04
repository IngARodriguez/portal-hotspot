// ============================================
// server.js - Servidor interceptor de Captive Portal
// ============================================
// Intercepta las peticiones automáticas de verificación de internet
// que realizan iOS, Android y Windows al conectarse a una red WiFi,
// y redirige al usuario a una página de bienvenida personalizada.
// ============================================

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Rutas de detección de Captive Portal
// ============================================
// Cada sistema operativo hace peticiones a URLs específicas
// para verificar si hay acceso a internet. Al interceptarlas
// y responder con un redirect, el dispositivo muestra automáticamente
// la página del portal cautivo.

// --- iOS (versiones actuales) ---
app.get('/hotspot-detect.html', (_req, res) => {
  res.redirect(301, '/portal');
});

app.get('/success.txt', (_req, res) => {
  res.redirect(301, '/portal');
});

app.get('/canonical.html', (_req, res) => {
  res.redirect(301, '/portal');
});

// --- iOS (versiones antiguas) ---
app.get('/library/test/success.html', (_req, res) => {
  res.redirect(301, '/portal');
});

// --- Android ---
app.get('/generate_204', (_req, res) => {
  res.redirect(301, '/portal');
});

// --- Windows ---
app.get('/connecttest.txt', (_req, res) => {
  res.redirect(301, '/portal');
});

app.get('/ncsi.txt', (_req, res) => {
  res.redirect(301, '/portal');
});

// ============================================
// Archivos estáticos del portal
// ============================================
// Sirve el contenido de la carpeta /public bajo la ruta /portal.
// Esto incluye el index.html con la página de bienvenida.
app.use('/portal', express.static(path.join(__dirname, 'public')));

// ============================================
// Ruta comodín (catch-all)
// ============================================
// Cualquier otra petición que no coincida con las rutas anteriores
// también es redirigida al portal de bienvenida.
app.get('*', (_req, res) => {
  res.redirect(301, '/portal');
});

// ============================================
// Iniciar el servidor
// ============================================
const server = app.listen(PORT, () => {
  console.log(`Servidor interceptor corriendo en puerto ${PORT}`);
});

// Manejo de errores del servidor (ej: puerto en uso)
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nError: El puerto ${PORT} ya está en uso.`);
    console.error(`Solución: Cierra el otro proceso o usa otro puerto con PORT=XXXX node server.js\n`);
  } else {
    console.error('Error al iniciar el servidor:', error.message);
  }
  process.exit(1);
});
