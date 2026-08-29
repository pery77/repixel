# RePixel

Herramienta web (PWA, un solo `index.html` sin dependencias) para preparar assets de un juego pixel art. Carga una imagen o una carpeta entera y aplica un pipeline de seis pasos opcionales:

1. **ReFondo** — borra el fondo liso que suele traer el pixel art generado por IA. Primero hay que averiguar **cuál es**: por defecto gana el color opaco más repetido del *marco* de 1 px del lienzo (y se puede fijar a mano, o copiar el detectado al selector para retocarlo). Y luego **qué es «fuera»**: por defecto, lo que se alcanza desde el borde del lienzo sin salir de ese color (relleno por inundación a 4 vecinos), así que ese mismo color *dentro* del dibujo —un ojo, un hueco cerrado— no se borra; con alcance «todo» sí, esté donde esté. La comparación es distancia **OKLab** con tolerancia regulable, y **desvanecer** hace que los píxeles a medio camino entre el fondo y el dibujo (el halo que deja el promedio de área al reescalar) pierdan alfa en proporción en vez de quedarse enteros. Va antes de ReVer y de RePalette a propósito: el fondo no debe contar como borde ni gastar un color de la paleta. **El orden con ReSize se elige** (selector «Cuándo»), y no da igual: por defecto ReFondo va **primero**, a resolución completa, porque así el color se busca donde el fondo todavía es plano y es después el promedio de área —que ya pondera el color por alfa— quien reparte el alfa del contorno, con lo que el borde sale del color exacto del sprite y con antialias correcto. Puesto **después**, trabaja sobre la imagen ya suavizada (mejor si el fondo trae ruido o degradado, y más rápido: recorre 64×64 en vez de la imagen entera), pero el reescalado ya ha fundido sprite y fondo en un fleco opaco que hay que comerse con «desvanecer». Al cambiarlo, **las dos tarjetas y sus números se intercambian en la columna**: si el número no coincidiera con el orden real, la pantalla estaría mintiendo. El resto del pipeline no se reordena, y es a propósito — ReVer tiene que ir antes de RePalette (es su promesa) y las máscaras se calculan sobre el resultado final.
2. **ReSize** — reduce al tamaño elegido (por defecto 64×64). Botones de tamaño rápido (8, 16, 32, 64, 128 y 256) para no escribir el mismo número en dos campos. Métodos: promedio de área (cobertura fraccionaria y ponderado por alfa, el mejor para reducir fotos/renders) o vecino más cercano (para pixel art ya limpio). Trae además **alfa de 1 bit** (activo por defecto): el promedio de área reparte alfa fraccionaria por el contorno —bonito de mirar, pero un sprite de juego la quiere binaria, que el corte ya lo hace el shader—, así que cada píxel entra en la silueta o no entra, con un umbral regulable que la adelgaza o la engorda. Se aplica al final de ReSize + ReFondo, así que no quedan semitransparencias vengan de donde vengan.
3. **ReVer** — lo que ve RePixel antes de la paleta. De la imagen ya reescalada salen **dos canales**: el de **color** (brillo, contraste, saturación y tono; el tono y la saturación se tocan en HSL, así que +120° sobre un rojo da un verde) es el que se palettiza, así que es con el que decides qué colores acaba eligiendo RePalette; y el de **bordes** (Sobel, Laplaciano o diferencia de color, con umbral y con la silueta del alfa opcional), que no se ve en la salida: se mezcla con el de color —oscureciendo, aclarando o realzando el contraste local, con la influencia que le pongas— justo antes de palettizar, para acentuar los contornos. Los bordes se buscan sobre la imagen de partida y no sobre la ya ajustada, así que hundir el contraste para forzar la paleta no los mueve; y como la mezcla ocurre **antes** de RePalette, el contorno acentuado sale con colores de la paleta por construcción.
4. **RePalette** — reduce los colores a una paleta de [Lospec](https://lospec.com/palette-list): pega la URL (o el slug, o directamente códigos hex). Distancia de color perceptual **OKLab** (o RGB ponderado), dithering **Floyd–Steinberg** o **Bayer 8×8** con intensidad regulable.
5. **ReBloques** — emula el **clash de atributos** de las máquinas de 8 bits: la imagen se parte en bloques y dentro de cada uno no caben más de N colores, por rica que sea la paleta. Trae los presets clásicos —**ZX Spectrum** (8×8, 2 colores), **MSX SCREEN 2** (8×1, 2) y **NES** (16×16, 4)— y también tamaño de bloque y cupo libres; el desplegable de máquina se deduce de los números, así que tocarlos a mano cae solo en «A medida». Puedes elegir qué colores se salvan: *los más repetidos* (lo que hace un conversor ingenuo) o *los que menos error dejan* (un bloque casi todo negro con un brillo blanco se queda el blanco, en vez de gastar la segunda plaza en otro negro). Como los colores salen de los que ya hay en el bloque, viniendo de RePalette la salida sigue estando en la paleta. Los píxeles transparentes ni gastan cupo ni se tocan.
6. **Máscaras RGB** — genera *una sola textura* para el shader con una máscara codificada en cada canal: **R** metallic, **G** smoothness, **B** emisivo. Cada canal tiene sus propios ajustes (fuente, brillo, contraste, invertir, umbral), se calcula sobre el resultado final y se previsualiza en grises debajo de la vista principal. Es una rama aparte: no toca la imagen de color.

La vista previa (original / resultado, más los dos visores de ReFondo —lo que se ha quitado y la imagen sin fondo—, los tres de ReVer —canal de color, canal de bordes y lo que entra a RePalette—, los dos de ReBloques —la imagen sin límite y un mapa de cuánto ha mordido cada bloque— y los cuatro de máscaras) se actualiza en vivo y tiene **zoom y paneo sincronizados** entre todas las vistas: rueda para acercar sobre el punto del cursor, arrastrar para mover, doble clic o «Ajustar» para volver. Al ampliar, la escala se redondea a entero para que el píxel siga siendo cuadrado. Descarga el PNG de la imagen activa o un **ZIP con todas** — con las máscaras activas cada imagen saca dos ficheros, `nombre_rp.png` y `nombre_mask.png` (sufijos configurables) (escritor ZIP propio, sin dependencias). Todo se procesa en local: nada sale del navegador (salvo la descarga de la paleta desde Lospec).

La pantalla **se ajusta al ancho de la ventana**: no hay ancho máximo y las tarjetas se reparten en tantas columnas como quepan, tanto las herramientas (una, dos o tres sub-columnas según la pantalla) como los visores de cada paso, que en pantalla ancha se ven a la vez en vez de uno debajo de otro. La vista principal se queda todo el alto que sobre, así que en un monitor grande el sprite se ve más grande en vez de dejar hueco.

La columna de herramientas es **plegable**: cada tarjeta se cierra por su cuenta con el chevrón de su cabecera y, plegada, resume ahí mismo cómo está configurada (`64×64 · área`, `auto · solo fuera · tol 8`, `apagado`…), de forma que se puede trabajar con todas cerradas sin perder de vista el pipeline. Apagar un paso lo pliega solo y encenderlo lo abre; el botón «Plegar todo» las cierra de golpe y lo que dejes plegado se recuerda entre sesiones.

## Cómo ejecutar

**Opción rápida:** doble clic en `index.html` (funciona con `file://`; sin service worker).

**Con VSCode:** extensión *Live Server* → "Go Live". Para probar en otro dispositivo por red local: `http://<ip-del-pc>:5500`. Alternativas: `npx live-server --port=8000 --no-browser` o `python -m http.server 8000`.

> Si Lospec no responde (sin conexión o CORS), usa el botón «Copy hex codes» de la página de la paleta en Lospec y pega los códigos en el campo de paleta.

## Tests

Lógica pura (parsing de paletas, OKLab, dithering, reescalado y corte de alfa, detección y borrado del fondo, clash de atributos, ajustes y detección de bordes, máscaras, CRC32/ZIP) testeada en Node sin frameworks:

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
