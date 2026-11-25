# Amelia Satellite — informes PDF V2

## Uso
En Amelia Cloud, seleccionar finca y lote, abrir Acciones del lote > Generar informe PDF. Configurar 30, 90, 180 o 365 días, informe técnico (90 días por defecto) o ejecutivo y las nueve secciones. Un único botón solicita el documento al VPS con la sesión existente; el navegador solo descarga la respuesta. No hay vista previa ni impresión local.

## Arquitectura desplegada
La API privada de TAYULABS (Node HTTP nativo) verifica sesión, organización, módulo satelital y acceso al lote; consulta exclusivamente sus observaciones, escenas, mapas y exclusiones. Un worker procesa el modelo y lo envía por la red privada Docker al Report Service 1.2.0, con clave interna. Chromium se ejecuta en Debian como usuario no root, con sandbox activo. No se publican puertos del generador ni se almacenan PDFs de forma persistente.

Solicitud JSON a POST /satellite/reports/pdf: field_id, days, type, sections. Respuesta JSON: report_id, mime_type, pdf_base64. Límite de PDF: 15 MiB. No confiar en datos, HTML ni URLs suministrados por clientes.

El archivo satellite-report-route.cjs de esta carpeta es un prototipo Express histórico, no el módulo de producción. No instalarlo en la API nativa. stage-v2.sh es el script de construcción y prueba utilizado para preparar imágenes candidatas en /opt/tayu-platform; no recrea los contenedores en producción. Su ejecución es exclusiva de operadores autorizados del VPS.

## Validación
- node --test tests/satellite-report.test.cjs
- V2 probada en el VPS con raster sintético y PDF real autenticado de SAT-005 (13 páginas, sin páginas vacías, logos, histórico óptico, zonas y cambio común).
- Pruebas simuladas de aislamiento por organización y finca, y HTTP 401 sin autenticación.
- Pendiente prueba del nuevo botón en sesión autenticada en escritorio/móvil, pruebas de otros periodos y roles reales, límites y concurrencia.
- El fondo cartográfico y las tipografías corporativas quedan pendientes.

## Alcance agronómico
NDVI, NDMI, NDRE y EVI son orientativos; no equivalen a diagnósticos ni prescripciones. Los cuartiles clasifican el área válida relativa. El cambio NDVI común requiere dimensiones, extensión y versión de procesamiento compatibles, y supone coincidencia de rejilla; solo representa los píxeles válidos comunes tras exclusiones. El umbral ±0,05 es exploratorio. Si no hay datos compatibles, se identifica la limitación. El periodo solicitado no garantiza cobertura histórica completa. Copernicus Sentinel data, procesado por Amelia Cloud.
