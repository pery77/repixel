# RePixel

Herramienta de escritorio (web, PWA) para preparar assets de un juego pixel art. Carga imágenes o carpetas y las pasa por un pipeline de cuatro pasos opcionales, en este orden:

1. **ReSize** — reducción de tamaño (por defecto 64×64) con promedio de área (cobertura fraccionaria, ponderado por alfa) o vecino más cercano.
2. **ReVer** — lo que ve RePixel antes de la paleta. De la imagen ya reescalada salen **dos canales**: el de **color** (`ajustarColor`: brillo y contraste sobre RGB, saturación y tono en HSL) es el que se palettiza, y el de **bordes** (`detectarBordes`: Sobel, Laplaciano o diferencia de color, con umbral y silueta del alfa opcional) que no se ve en la salida y se mezcla con el anterior (`mezclarBordes`: oscurecer, aclarar o realce local, con influencia 0-100 %) justo antes de RePalette. Dos decisiones a propósito: los bordes se buscan sobre la imagen de partida y **no** sobre la ajustada (tocar el contraste para forzar la paleta no debe moverlos), y la mezcla ocurre **antes** de palettizar (así el contorno acentuado sale dentro de la paleta por construcción).
3. **RePalette** — reducción de colores a una paleta de Lospec (URL/slug, con fallback a pegar códigos hex si falla CORS). Distancia perceptual OKLab (o RGB "redmean"), dithering Floyd–Steinberg o Bayer 8×8 con intensidad regulable.
4. **Máscaras RGB** — una textura para el shader con una máscara por canal: R metallic, G smoothness, B emisivo. **Rama aparte**: no modifica el diffuse. Se calcula sobre el resultado final. Cada canal tiene fuente (luminancia, máximo, saturación o un canal suelto), brillo, contraste, invertir y umbral, y se genera por plantilla desde `CANALES` para no repetir el HTML tres veces.

Descarga PNG suelto o ZIP (escritor ZIP "store" propio, sin dependencias); con máscaras activas salen dos ficheros por imagen (`_rp` y `_mask`). La lógica pura vive entre los marcadores `LÓGICA PURA` de `index.html` y se testea con `node pruebas.mjs`.

## Convenciones del proyecto

- **Git**: estos proyectos acaban públicos en GitHub. Los commits van SIEMPRE con la cuenta personal — al crear el repo, antes del primer commit: `git config user.name "pery77"` y `git config user.email "pery77@users.noreply.github.com"` (verifícalo con `git config user.email` antes de commitear). Mensajes de commit en español y **sin trailer** de Co-Authored-By. Claude ofrece los comandos de git; los ejecuta el usuario salvo que pida lo contrario.
- **Nada sensible en el repo**: ni emails reales, ni rutas con datos personales, ni claves. Todo lo que se commitea se asume público.
- **Todo en español**: código, comentarios, commits y UI (nombres de funciones y variables incluidos).
- **`index.html` autocontenido**: sin dependencias, sin build, sin frameworks. Si crece demasiado, antes de dividir en archivos, plantéalo.
- **Cero scroll** en la pantalla principal cuando la app sea de tipo "panel": todo cabe en una pantalla.
- **⚠️ Subir la constante `VERSION`** (inicio del script de `index.html`) en cada despliegue: se muestra en la esquina de estado para verificar qué versión corre el dispositivo.
- **`localStorage` con prefijo propio de la app** (p. ej. `miapp_datos`) y lectura tolerante a fallos (`try/catch` + valor por defecto).
- **Nombre de caché del service worker único por app** (`sw.js`, constante `CACHE`): dos apps en el mismo dominio no deben compartirlo.
- **Probar lógica pura con tests en Node** usando stubs de DOM cuando haya lógica no trivial (ranking, parsing, paginación…): sin frameworks de test, un script que lanza excepciones si algo falla.
- Desarrollo en PC, prueba en el dispositivo real por red local (Live Server / `python -m http.server`). Las APIs de PWA (service worker, Wake Lock, fullscreen) solo se activan con HTTPS o localhost; el código ya lo detecta.

## Estado del proyecto (actualizar al avanzar)

**Última actualización:** 2026-08-27

- ✅ Fase 1 — App funcional: carga de imágenes/carpetas (botones y arrastrar), pipeline ReSize → ReVer → RePalette, vista previa original/resultado, descarga PNG y ZIP, config persistida en `localStorage` (`repixel_*`), tests en `pruebas.mjs` (154 comprobaciones).
- ✅ Layout de dos columnas independientes: la de herramientas scrollea sola y la vista previa se queda fija (la página en sí no scrollea).
- ✅ Máscaras RGB para el shader (R metallic, G smoothness, B emisivo), con cuatro visores debajo del preview y descarga `_mask` junto al diffuse.
- ✅ Repo público en GitHub: `pery77/repixel`.
- ✅ Vista previa con **zoom y paneo sincronizados** en los nueve visores (original y resultado, los tres de ReVer y los cuatro de máscaras): estado normalizado `{zoom, cx, cy}` (por eso original y resultado quedan sincronizados aunque midan distinto), escala entera al ampliar, y el marco recorta y coloca el lienzo a mano en vez de usar el scroll del navegador.
- ✅ Paso 2 **ReVer**: canal de color (brillo, contraste, saturación, tono) + canal de bordes (Sobel / Laplaciano / diferencia de color, umbral, silueta) mezclado antes de RePalette, con tres visores propios bajo la vista principal.
- 🗑️ **RePulir descartado** (era el antiguo paso 3: alfa binaria, huérfanos, colores residuales y simetría de silueta sobre la imagen indexada). El enfoque —corregir la salida a posteriori— no convencía; ReVer ataca lo mismo desde antes de la paleta. Si alguna regla vuelve, que vuelva por ahí, no como una pasada de limpieza al final.
- ⬜ Fase 2 — Probar en navegador real: carga de paletas de Lospec (verificar CORS de sus endpoints), rendimiento con imágenes grandes, arrastrar carpetas anidadas.
- ⬜ Fase 3 — Iconos propios (`genera-iconos.html`), repo en GitHub y despliegue en Pages.
- Ideas sueltas: exportar la máscara junto al diffuse en una pasada, presets de ajustes con nombre.
