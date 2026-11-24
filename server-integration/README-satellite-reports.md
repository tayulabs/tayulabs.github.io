# Amelia Satellite — informes PDF

## Alcance de esta versión
Frontend: Acciones del lote > Generar informe PDF. Periodos de 30, 90, 180 y 365 días. Informe técnico (predeterminado, 90 días) o ejecutivo; nueve secciones personalizables, anexos si se necesitan. La vista previa abre un documento A4 con un botón Imprimir / Guardar como PDF. Seleccionar A4, guardar como PDF, sin encabezados/pies del navegador. La descarga directa en el VPS no se activa hasta instalar el endpoint.

No se hacen nuevos procesos satelitales, no se usa IA y no se modifica la base de datos. Se consultan los endpoints autorizados de observaciones, adquisiciones, mapas y exclusiones. Si faltan datos se indica; el periodo de consulta no garantiza que toda la ventana esté disponible. No se crea un archivo de informes persistente en esta versión.

## Instalación backend (pendiente de verificar el proyecto real del VPS)
1. Identificar aplicación API, runtime, contenedor y mecanismo de despliegue efectivos. No asumir la ruta /opt ni el framework.
2. Copiar cloud-client-satellite-report.js y server-integration/satellite-report-route.cjs manteniendo sus rutas relativas en el proyecto privado. Instalar dependencias puppeteer y pngjs con el gestor y lockfile del proyecto. Chromium debe ejecutarse como usuario no root, con sandbox activo y sus dependencias del sistema.
3. Integrar el adaptador con el middleware de autenticación y permisos satelitales existente. **No publicar una ruta sin verificar organización, sitio y acceso al lote.** La función resolveContext(req, fieldId) debe devolver el lote obtenido en servidor y un getApi de alcance exclusivo de la petición (con timeout), o null si no está autorizado. No confiar en objetos de lote, organización, HTML, mapas o URLs enviados por el cliente. Opcionalmente proveer logo data:image/png;base64 desde el archivo corporativo confiable.
4. Ejemplo de integración Express (adaptar al framework real, nombres ilustrativos):

```js
const puppeteer = require('puppeteer');
const { PNG } = require('pngjs');
const { makeSatelliteReportHandler } = require('./server-integration/satellite-report-route.cjs');
app.post('/satellite/reports/pdf',
  existingAuthentication, existingSatellitePermission,
  makeSatelliteReportHandler({ puppeteer, PNG, logo, resolveContext }));
```

Solicitud JSON: {"field_id":"id-del-lote","days":90,"type":"technical","sections":["summary","indices","maps","areas","history","compare","radar","recommendations","methodology"]}.
Respuesta JSON privada: report_id, mime_type y pdf_base64. Se eligió JSON para reutilizar el cliente autenticado existente; el botón convierte el resultado a un archivo PDF. Configurar límites de tiempo, rate limit, memoria y proxy en el VPS según pruebas. No guardar tokens, HTML ni PDF en logs. El adaptador limita generaciones simultáneas y el tamaño del resultado.

## Validación antes de publicar
- node --test tests/satellite-report.test.cjs
- Probar en sesión autenticada con un lote de maíz y Sentinel-2 + Sentinel-1, datos ausentes, nubes, dos escenas compatibles y exclusiones.
- Generar PDF A4 en Chromium, comprobar que cada página tenga su pie correcto, que no existan hojas en blanco ni recortes, que los mapas y escalas correspondan a la escena. Probar 30, 90, 180 y 365 días.
- Probar roles de otra organización y un lote no autorizado, sesión vencida, límites y concurrencia.
- Probar desde escritorio y móvil. El botón de vista previa requiere permitir ventanas emergentes.
- Validar instalación y respuesta del endpoint en staging antes de habilitar descarga directa. No fusionar automáticamente sin prueba.
- La historia de PDFs y redescarga desde otras sesiones requiere almacenamiento privado con aislamiento por organización, retención y políticas de eliminación; no se crea sin revisar el esquema de base de datos.

## Alcance agronómico
NDVI/NDMI/NDRE/EVI son índices orientativos. NDMI no equivale a humedad volumétrica del suelo. Comparación de promedios no equivale a cambio sobre máscara común; las dos imágenes solo se muestran si escala y extensión coinciden. Cuartiles sobre píxeles válidos, no diagnóstico ni hectáreas enfermas. Umbral ±0,05 puntos NDVI exploratorio. Copernicus Sentinel data, procesado por Amelia Cloud.
