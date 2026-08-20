# RePixel

Herramienta web (PWA, un solo `index.html` sin dependencias) para preparar assets de un juego pixel art. Carga una imagen o una carpeta entera y aplica un pipeline de tres pasos opcionales:

1. **ReSize** — reduce al tamaño elegido (por defecto 64×64). Métodos: promedio de área (cobertura fraccionaria y ponderado por alfa, el mejor para reducir fotos/renders) o vecino más cercano (para pixel art ya limpio).
2. **Ajustes / Máscaras** — brillo, contraste, saturación, escala de grises, invertir y umbral. Pensado para generar máscaras metallic/emissive a partir del sprite.
3. **RePalette** — reduce los colores a una paleta de [Lospec](https://lospec.com/palette-list): pega la URL (o el slug, o directamente códigos hex). Distancia de color perceptual **OKLab** (o RGB ponderado), dithering **Floyd–Steinberg** o **Bayer 8×8** con intensidad regulable.

La vista previa (original / resultado) se actualiza en vivo. Descarga el PNG de la imagen activa o un **ZIP con todas** (escritor ZIP propio, sin dependencias). Todo se procesa en local: nada sale del navegador (salvo la descarga de la paleta desde Lospec).

## Cómo ejecutar

**Opción rápida:** doble clic en `index.html` (funciona con `file://`; sin service worker).

**Con VSCode:** extensión *Live Server* → "Go Live". Para probar en otro dispositivo por red local: `http://<ip-del-pc>:5500`. Alternativas: `npx live-server --port=8000 --no-browser` o `python -m http.server 8000`.

> Si Lospec no responde (sin conexión o CORS), usa el botón «Copy hex codes» de la página de la paleta en Lospec y pega los códigos en el campo de paleta.

## Tests

Lógica pura (parsing de paletas, OKLab, dithering, reescalado, ajustes, CRC32/ZIP) testeada en Node sin frameworks:

```
node pruebas.mjs
```

## Desplegar en GitHub Pages

En GitHub: Settings → Pages → Deploy from branch → `main` / root. El `.nojekyll` ya está incluido.

**⚠️ Sube `VERSION`** (inicio del script de `index.html`) en cada despliegue: se muestra en la esquina inferior derecha y es la forma rápida de saber qué versión corre el dispositivo.

## Estructura

```
repixel/
├── index.html            # La app completa (autocontenida); la lógica pura va entre marcadores
├── pruebas.mjs           # Tests en Node de la lógica pura (extrae el bloque de index.html)
├── sw.js                 # Service worker: red primero, caché de respaldo (CACHE "repixel-v1")
├── manifest.webmanifest  # Instalable como PWA
├── icon-192.png          # Iconos (de relleno: regenerar con genera-iconos.html)
├── icon-512.png
├── genera-iconos.html    # Herramienta para crear los iconos (emoji → PNG)
├── .nojekyll             # Para GitHub Pages
└── CLAUDE.md             # Convenciones + estado del proyecto
```
