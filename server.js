// ============================================
// server.js - Servidor de subida y descarga de archivos
// ============================================
// Servidor Express con dos portales protegidos por token:
//   - Portal de subida (TOKEN_UPLOAD)
//   - Portal de descarga (TOKEN_DOWNLOAD)
// Almacena archivos en Supabase Storage.
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
const TOKEN_UPLOAD = process.env.TOKEN_UPLOAD;
const TOKEN_DOWNLOAD = process.env.TOKEN_DOWNLOAD;
const PORT = process.env.PORT || 3000;

// ============================================
// Validar variables de entorno obligatorias
// ============================================
const variablesFaltantes = [];
if (!SUPABASE_URL) variablesFaltantes.push('SUPABASE_URL');
if (!SUPABASE_KEY) variablesFaltantes.push('SUPABASE_KEY');
if (!TOKEN_UPLOAD) variablesFaltantes.push('TOKEN_UPLOAD');
if (!TOKEN_DOWNLOAD) variablesFaltantes.push('TOKEN_DOWNLOAD');

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
const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// Middleware de autenticación por token
// ============================================
// Verifica que el query param "token" sea uno de los tokens válidos.
// Guarda el tipo de token en req.tokenType para usarlo después.
app.use((req, res, next) => {
  const token = req.query.token;

  if (token === TOKEN_UPLOAD) {
    req.tokenType = 'upload';
    next();
  } else if (token === TOKEN_DOWNLOAD) {
    req.tokenType = 'download';
    next();
  } else {
    return res.status(403).json({
      ok: false,
      error: 'Acceso no autorizado'
    });
  }
});

// ============================================
// Ruta GET /portal → Sirve la página según el token
// ============================================
// Si el token es de subida → upload.html
// Si el token es de descarga → download.html
app.get('/portal', (req, res) => {
  if (req.tokenType === 'upload') {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'download.html'));
  }
});

// ============================================
// Ruta POST /upload → Subir archivos a Supabase
// ============================================
app.post('/upload', upload.array('archivos', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No se recibieron archivos'
      });
    }

    const nombresSubidos = [];

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
// Ruta GET /files → Lista de archivos con URLs de descarga
// ============================================
app.get('/files', async (_req, res) => {
  try {
    const { data, error } = await supabase.storage
      .from('archivos')
      .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) throw new Error(error.message);

    const archivos = (data || []).filter((item) => item.id);

    const archivosList = archivos.map((a) => {
      const { data: urlData } = supabase.storage
        .from('archivos')
        .getPublicUrl(a.name);

      return {
        nombre: a.name,
        tamano: a.metadata?.size || 0,
        fecha: a.created_at,
        url: urlData.publicUrl
      };
    });

    return res.json({
      ok: true,
      archivos: archivosList
    });

  } catch (error) {
    console.error('Error en /files:', error.message);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// ============================================
// Ruta GET /storage-status → Estado del almacenamiento
// ============================================
app.get('/storage-status', async (_req, res) => {
  try {
    const { data, error } = await supabase.storage
      .from('archivos')
      .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) throw new Error(error.message);

    const archivos = (data || []).filter((item) => item.id);
    const totalBytes = archivos.reduce((acc, archivo) => acc + (archivo.metadata?.size || 0), 0);

    return res.json({
      ok: true,
      totalArchivos: archivos.length,
      usado: totalBytes,
      limite: 1073741824,
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
app.get('*', (req, res) => {
  res.redirect(`/portal?token=${req.query.token}`);
});

// ============================================
// Iniciar el servidor
// ============================================
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nError: El puerto ${PORT} ya está en uso.`);
    console.error(`Solución: Cierra el otro proceso o usa otro puerto con PORT=XXXX node server.js\n`);
  } else {
    console.error('Error al iniciar el servidor:', error.message);
  }
  process.exit(1);
});
