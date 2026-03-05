// ============================================
// server.js - Servidor de subida de archivos
// ============================================
// Servidor Express que permite subir archivos a Supabase Storage
// protegido por autenticación mediante token en query params.
// ============================================

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ============================================
// Variables de entorno
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PORT = process.env.PORT || 3000;

// ============================================
// Validar variables de entorno obligatorias
// ============================================
const variablesFaltantes = [];
if (!SUPABASE_URL) variablesFaltantes.push('SUPABASE_URL');
if (!SUPABASE_KEY) variablesFaltantes.push('SUPABASE_KEY');
if (!ACCESS_TOKEN) variablesFaltantes.push('ACCESS_TOKEN');

if (variablesFaltantes.length > 0) {
  console.error('Error: Faltan variables de entorno obligatorias:');
  variablesFaltantes.forEach((v) => console.error(`  - ${v}`));
  console.error('\nConfigúralas en el archivo .env o en el panel de tu hosting (ej: Render).');
  process.exit(1);
}

// ============================================
// Inicializar cliente de Supabase
// ============================================
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Configurar Multer (almacenamiento en memoria)
// ============================================
// Los archivos se mantienen en memoria como Buffer
// antes de ser enviados a Supabase Storage.
const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// Middleware de autenticación por token
// ============================================
// Verifica que el query param "token" coincida con ACCESS_TOKEN.
// Se aplica a TODAS las rutas del servidor.
app.use((req, res, next) => {
  const token = req.query.token;

  if (token !== ACCESS_TOKEN) {
    return res.status(403).json({
      ok: false,
      error: 'Acceso no autorizado'
    });
  }

  next();
});

// ============================================
// Ruta GET /portal → Sirve la página principal
// ============================================
app.get('/portal', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Ruta POST /upload → Subir archivos a Supabase
// ============================================
// Acepta hasta 10 archivos simultáneos con el campo "archivos".
// Cada archivo se sube al bucket "archivos" en Supabase Storage
// con un nombre único basado en timestamp + nombre original.
app.post('/upload', upload.array('archivos', 10), async (req, res) => {
  try {
    // Verificar que se recibieron archivos
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No se recibieron archivos'
      });
    }

    const nombresSubidos = [];

    // Subir cada archivo a Supabase Storage
    for (const archivo of req.files) {
      const nombreArchivo = `${Date.now()}-${archivo.originalname}`;

      const { error } = await supabase.storage
        .from('archivos')
        .upload(nombreArchivo, archivo.buffer, {
          contentType: archivo.mimetype,
          upsert: false
        });

      if (error) {
        throw new Error(`Error al subir "${archivo.originalname}": ${error.message}`);
      }

      nombresSubidos.push(nombreArchivo);
    }

    // Respuesta exitosa con la lista de nombres subidos
    return res.json({
      ok: true,
      archivos: nombresSubidos
    });

  } catch (error) {
    console.error('Error en /upload:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ============================================
// Ruta GET /storage-status → Estado del almacenamiento
// ============================================
// Lista todos los archivos en el bucket y calcula el uso total.
app.get('/storage-status', async (_req, res) => {
  try {
    // Listar todos los archivos del bucket "archivos"
    const { data, error } = await supabase.storage
      .from('archivos')
      .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      throw new Error(error.message);
    }

    // Filtrar solo archivos (excluir carpetas placeholder)
    const archivos = (data || []).filter((item) => item.id);

    // Calcular el tamaño total usado
    const totalBytes = archivos.reduce((acc, archivo) => acc + (archivo.metadata?.size || 0), 0);

    return res.json({
      ok: true,
      totalArchivos: archivos.length,
      usado: totalBytes,
      limite: 1073741824, // 1 GB en bytes (plan gratuito Supabase)
      archivos: archivos.map((a) => ({
        nombre: a.name,
        tamano: a.metadata?.size || 0,
        fecha: a.created_at
      }))
    });

  } catch (error) {
    console.error('Error en /storage-status:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ============================================
// Ruta comodín (catch-all)
// ============================================
// Cualquier otra ruta redirige al portal con el token incluido.
app.get('*', (req, res) => {
  res.redirect(`/portal?token=${req.query.token}`);
});

// ============================================
// Iniciar el servidor
// ============================================
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
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
