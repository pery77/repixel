# RePixel

Herramienta de escritorio (web, PWA) para preparar assets de un juego pixel art. Carga imágenes o carpetas y las pasa por un pipeline de tres pasos opcionales, en este orden:

1. **ReSize** — reducción de tamaño (por defecto 64×64) con promedio de área (cobertura fraccionaria, ponderado por alfa) o vecino más cercano.
2. **Ajustes / Máscaras** — brillo, contraste, saturación, escala de grises, invertir y umbral; pensado para sacar máscaras metallic/emissive.
3. **RePalette** — reducción de colores a una paleta de Lospec (URL/slug, con fallback a pegar códigos hex si falla CORS). Distancia perceptual OKLab (o RGB "redmean"), dithering Floyd–Steinberg o Bayer 8×8 con intensidad regulable.

Descarga PNG suelto o ZIP (escritor ZIP "store" propio, sin dependencias). La lógica pura vive entre los marcadores `LÓGICA PURA` de `index.html` y se testea con `node pruebas.mjs`.

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

**Última actualización:** 2026-08-19

- ✅ Fase 1 — App funcional: carga de imágenes/carpetas (botones y arrastrar), pipeline ReSize → Ajustes → RePalette, vista previa original/resultado, descarga PNG y ZIP, config persistida en `localStorage` (`repixel_*`), tests en `pruebas.mjs` (98 comprobaciones).
- ⬜ Fase 2 — Probar en navegador real: carga de paletas de Lospec (verificar CORS de sus endpoints), rendimiento con imágenes grandes, arrastrar carpetas anidadas.
- ⬜ Fase 3 — Iconos propios (`genera-iconos.html`), repo en GitHub y despliegue en Pages.
- Ideas sueltas: exportar la máscara junto al diffuse en una pasada, presets de ajustes con nombre, vista con zoom sincronizado.
