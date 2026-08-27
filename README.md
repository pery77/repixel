# RePixel

Herramienta web (PWA, un solo `index.html` sin dependencias) para preparar assets de un juego pixel art. Carga una imagen o una carpeta entera y aplica un pipeline de cuatro pasos opcionales:

1. **ReSize** — reduce al tamaño elegido (por defecto 64×64). Métodos: promedio de área (cobertura fraccionaria y ponderado por alfa, el mejor para reducir fotos/renders) o vecino más cercano (para pixel art ya limpio).
2. **ReVer** — lo que ve RePixel antes de la paleta. De la imagen ya reescalada salen **dos canales**: el de **color** (brillo, contraste, saturación y tono; el tono y la saturación se tocan en HSL, así que +120° sobre un rojo da un verde) es el que se palettiza, así que es con el que decides qué colores acaba eligiendo RePalette; y el de **bordes** (Sobel, Laplaciano o diferencia de color, con umbral y con la silueta del alfa opcional), que no se ve en la salida: se mezcla con el de color —oscureciendo, aclarando o realzando el contraste local, con la influencia que le pongas— justo antes de palettizar, para acentuar los contornos. Los bordes se buscan sobre la imagen de partida y no sobre la ya ajustada, así que hundir el contraste para forzar la paleta no los mueve; y como la mezcla ocurre **antes** de RePalette, el contorno acentuado sale con colores de la paleta por construcción.
3. **RePalette** — reduce los colores a una paleta de [Lospec](https://lospec.com/palette-list): pega la URL (o el slug, o directamente códigos hex). Distancia de color perceptual **OKLab** (o RGB ponderado), dithering **Floyd–Steinberg** o **Bayer 8×8** con intensidad regulable.
4. **Máscaras RGB** — genera *una sola textura* para el shader con una máscara codificada en cada canal: **R** metallic, **G** smoothness, **B** emisivo. Cada canal tiene sus propios ajustes (fuente, brillo, contraste, invertir, umbral), se calcula sobre el resultado final y se previsualiza en grises debajo de la vista principal. Es una rama aparte: no toca la imagen de color.

La vista previa (original / resultado, más los tres visores de ReVer —canal de color, canal de bordes y lo que entra a RePalette— y los cuatro de máscaras) se actualiza en vivo y tiene **zoom y paneo sincronizados** entre todas las vistas: rueda para acercar sobre el punto del cursor, arrastrar para mover, doble clic o «Ajustar» para volver. Al ampliar, la escala se redondea a entero para que el píxel siga siendo cuadrado. Descarga el PNG de la imagen activa o un **ZIP con todas** — con las máscaras activas cada imagen saca dos ficheros, `nombre_rp.png` y `nombre_mask.png` (sufijos configurables) (escritor ZIP propio, sin dependencias). Todo se procesa en local: nada sale del navegador (salvo la descarga de la paleta desde Lospec).

## Cómo ejecutar

**Opción rápida:** doble clic en `index.html` (funciona con `file://`; sin service worker).

**Con VSCode:** extensión *Live Server* → "Go Live". Para probar en otro dispositivo por red local: `http://<ip-del-pc>:5500`. Alternativas: `npx live-server --port=8000 --no-browser` o `python -m http.server 8000`.

> Si Lospec no responde (sin conexión o CORS), usa el botón «Copy hex codes» de la página de la paleta en Lospec y pega los códigos en el campo de paleta.

## Tests

Lógica pura (parsing de paletas, OKLab, dithering, reescalado, ajustes y detección de bordes, máscaras, CRC32/ZIP) testeada en Node sin frameworks:

```
node pruebas.mjs
```

## Versión

**⚠️ Sube `VERSION`** (inicio del script de `index.html`) en cada despliegue: se muestra en la esquina inferior derecha y es la forma rápida de saber qué versión corre el dispositivo.

## Estructura

```
repixel/
├── index.html            # La app completa (autocontenida); la lógica pura va entre marcadores
├── pruebas.mjs           # Tests en Node de la lógica pura (extrae el bloque de index.html)
├── sw.js                 # Service worker: red primero, caché de respaldo (CACHE "repixel-v3")
├── manifest.webmanifest  # Instalable como PWA
├── icon-192.png          # Iconos (de relleno: regenerar con genera-iconos.html)
├── icon-512.png
├── genera-iconos.html    # Herramienta para crear los iconos (emoji → PNG)
├── .nojekyll             # Para GitHub Pages
└── CLAUDE.md             # Convenciones + estado del proyecto
```
