"use strict";

/* ============================================================
   RePixel — la app
   Todo lo que toca el DOM: controles, pipeline, vista previa, descargas y
   PWA. La lógica que no necesita navegador vive en logica.js, que se carga
   antes que este fichero.
   ============================================================ */

/* ============================================================
   Configuración
   ⚠️ Subir VERSION en cada despliegue: se muestra en la esquina
   de estado para verificar qué versión corre el dispositivo.
   ============================================================ */
const VERSION = "v2026-08-30b";
const MANTENER_PANTALLA = false;
const PANTALLA_COMPLETA = false;

/* ============================================================
   Estado de la app
   ============================================================ */
const imagenes = []; // { nombre, original: {ancho, alto, datos} }
let indiceActivo = -1;
let paleta = null; // { nombre, colores: [[r,g,b], ...] }

let config = {};
try { config = JSON.parse(localStorage.getItem("repixel_config")) || {}; } catch (e) {}
let recientes = [];
try { recientes = JSON.parse(localStorage.getItem("repixel_paletas")) || []; } catch (e) {}

function guardarConfig() {
  try { localStorage.setItem("repixel_config", JSON.stringify(config)); } catch (e) {}
}
function guardarRecientes() {
  try { localStorage.setItem("repixel_paletas", JSON.stringify(recientes)); } catch (e) {}
}

const $ = (id) => document.getElementById(id);

/* ============================================================
   Idioma
   Los textos viven en idiomas.js y se pegan a la pantalla por la clave que
   lleva cada hueco en su data-i18n. Cambiar de idioma no recarga: se vuelve a
   recorrer el DOM y a repintar lo que se escribe desde JS.
   ============================================================ */
let idioma = idiomaInicial();

function idiomaInicial() {
  if (IDIOMAS[config.idioma]) return config.idioma;
  const suyo = (navigator.language || "").slice(0, 2).toLowerCase();
  return IDIOMAS[suyo] ? suyo : IDIOMA_POR_DEFECTO;
}

function t(clave, datos) {
  return traducir(IDIOMAS[idioma] && IDIOMAS[idioma].textos,
                  IDIOMAS[IDIOMA_POR_DEFECTO].textos, clave, datos);
}

function aplicarIdioma() {
  document.documentElement.lang = idioma;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
}

/* El desplegable sale de los idiomas que haya, así que añadir uno es añadirlo
   a idiomas.js y ya está. */
(function construirIdiomas() {
  const sel = $("sel-idioma");
  for (const clave of Object.keys(IDIOMAS)) {
    const o = document.createElement("option");
    o.value = clave;
    o.textContent = IDIOMAS[clave].nombre;
    sel.appendChild(o);
  }
  sel.value = idioma;
  sel.addEventListener("change", () => {
    idioma = sel.value;
    config.idioma = idioma;
    guardarConfig();
    aplicarIdioma();
    pintarPaleta();
    refrescarAhora();   // resúmenes, líneas de info y nivel de zoom
  });
})();

/* ============================================================
   Iconos
   Un puñado de SVG a trazo, dibujados con primitivas para que no haya que
   descifrar rutas: van en línea (sin fuente ni dependencia que cargar) y en
   currentColor, así que siguen el color del botón. Lo que dice cada uno va en
   su title, que sí está traducido.
   ============================================================ */
const ICONOS = {
  imagenes: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/>' +
            '<polyline points="4,18 10,12 14,16 17,13 20,16"/>',
  carpeta: '<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  vaciar: '<line x1="4" y1="7" x2="20" y2="7"/><path d="M9 7V5h6v2"/>' +
          '<path d="M6.5 7 7.5 19a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2L17.5 7"/>',
  cuentagotas: '<path d="M20 4a2.5 2.5 0 0 0-3.5 0L14 6.5 17.5 10 20 7.5A2.5 2.5 0 0 0 20 4z"/>' +
               '<path d="M14 6.5 5 15.5V19h3.5l9-9"/>',
  descargar: '<line x1="12" y1="4" x2="12" y2="14"/><polyline points="8,10 12,14 16,10"/>' +
             '<path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  archivo: '<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/>' +
           '<polyline points="13,3 13,9 19,9"/>',
  zip: '<rect x="3" y="4" width="18" height="4" rx="1"/>' +
       '<path d="M5 8h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><line x1="10" y1="13" x2="14" y2="13"/>',
  restablecer: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><polyline points="20,4 20,9.5 14.5,9.5"/>',
  zoomMenos: '<circle cx="11" cy="11" r="6"/><line x1="8.5" y1="11" x2="13.5" y2="11"/>' +
             '<line x1="15.5" y1="15.5" x2="20" y2="20"/>',
  zoomMas: '<circle cx="11" cy="11" r="6"/><line x1="8.5" y1="11" x2="13.5" y2="11"/>' +
           '<line x1="11" y1="8.5" x2="11" y2="13.5"/><line x1="15.5" y1="15.5" x2="20" y2="20"/>',
  ajustar: '<polyline points="9,4 4,4 4,9"/><polyline points="15,4 20,4 20,9"/>' +
           '<polyline points="20,15 20,20 15,20"/><polyline points="4,15 4,20 9,20"/>',
  plegarTodo: '<polyline points="7,10 12,5 17,10"/><polyline points="7,19 12,14 17,19"/>',
  desplegarTodo: '<polyline points="7,5 12,10 17,5"/><polyline points="7,14 12,19 17,14"/>',
  plegar: '<polyline points="6,9 12,15 18,9"/>',
  desplegar: '<polyline points="9,6 15,12 9,18"/>',
};

function icono(nombre) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS[nombre] + "</svg>";
}

/* Los iconos se ponen una vez: no dependen del idioma. */
(function aplicarIconos() {
  for (const el of document.querySelectorAll("[data-icono]")) el.innerHTML = icono(el.dataset.icono);
})();

function avisar(texto) {
  $("aviso").textContent = texto;
}

/* ============================================================
   Carga de imágenes (archivos, carpeta, arrastrar y soltar)
   ============================================================ */
const EXT_IMAGEN = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

function esImagen(archivo) {
  return archivo.type.startsWith("image/") || EXT_IMAGEN.test(archivo.name);
}

async function archivoAImagen(archivo) {
  const bitmap = await createImageBitmap(archivo);
  const c = document.createElement("canvas");
  c.width = bitmap.width; c.height = bitmap.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { ancho: d.width, alto: d.height, datos: d.data };
}

async function cargarArchivos(lista) {
  const validos = [...lista].filter(esImagen);
  if (!validos.length) { avisar(t("img.ninguna")); return; }
  avisar("");
  for (const archivo of validos) {
    try {
      const original = await archivoAImagen(archivo);
      imagenes.push({ nombre: archivo.name, original });
    } catch (e) {
      avisar(t("img.noSePudo", { nombre: archivo.name }));
    }
  }
  if (indiceActivo < 0 && imagenes.length) indiceActivo = 0;
  pintarMiniaturas();
  refrescar();
}

/* Recorre carpetas soltadas (webkitGetAsEntry) recursivamente */
function leerEntrada(entrada) {
  return new Promise((resolver) => {
    if (entrada.isFile) {
      entrada.file((f) => resolver([f]), () => resolver([]));
    } else if (entrada.isDirectory) {
      const lector = entrada.createReader();
      const pendientes = [];
      const tanda = () => lector.readEntries(async (entradas) => {
        if (!entradas.length) {
          const anidados = await Promise.all(pendientes.map(leerEntrada));
          resolver(anidados.flat());
        } else {
          pendientes.push(...entradas);
          tanda(); // readEntries devuelve por tandas de ~100
        }
      }, () => resolver([]));
      tanda();
    } else resolver([]);
  });
}

const zona = $("zona-soltar");
zona.addEventListener("click", () => $("input-archivos").click());
zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
zona.addEventListener("drop", async (e) => {
  e.preventDefault();
  zona.classList.remove("encima");
  const items = [...(e.dataTransfer.items || [])];
  const entradas = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entradas.length) {
    const grupos = await Promise.all(entradas.map(leerEntrada));
    cargarArchivos(grupos.flat());
  } else {
    cargarArchivos(e.dataTransfer.files);
  }
});

$("btn-archivos").addEventListener("click", () => $("input-archivos").click());
$("btn-carpeta").addEventListener("click", () => $("input-carpeta").click());
$("input-archivos").addEventListener("change", (e) => { cargarArchivos(e.target.files); e.target.value = ""; });
$("input-carpeta").addEventListener("change", (e) => { cargarArchivos(e.target.files); e.target.value = ""; });
$("btn-limpiar").addEventListener("click", () => {
  imagenes.length = 0;
  indiceActivo = -1;
  pintarMiniaturas();
  refrescar();
});

function pintarMiniaturas() {
  const cont = $("lista-miniaturas");
  cont.innerHTML = "";
  imagenes.forEach((img, i) => {
    const div = document.createElement("div");
    div.className = "miniatura" + (i === indiceActivo ? " activa" : "");
    div.title = img.nombre;
    const c = document.createElement("canvas");
    c.width = img.original.ancho; c.height = img.original.alto;
    c.getContext("2d").putImageData(new ImageData(img.original.datos, img.original.ancho), 0, 0);
    const mini = document.createElement("img");
    mini.src = c.toDataURL();
    div.appendChild(mini);
    div.addEventListener("click", () => { indiceActivo = i; pintarMiniaturas(); refrescar(); });
    cont.appendChild(div);
  });
}

/* ============================================================
   Paleta (Lospec o hex manual)
   ============================================================ */
async function cargarPaleta() {
  const entrada = parsearEntradaPaleta($("in-paleta").value);
  if (!entrada) { avisar(t("paleta.noEntiendo")); return; }
  if (entrada.tipo === "hex") {
    fijarPaleta({ nombre: t("paleta.manual", { n: entrada.colores.length }), colores: entrada.colores });
    avisar("");
    return;
  }
  avisar(t("paleta.cargando"));
  const urls = [
    `https://lospec.com/palette-list/${entrada.slug}.json`,
    `https://lospec.com/palette-api/v1/palette/${entrada.slug}`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const json = await resp.json();
      const colores = (json.colors || []).map(hexARgb).filter(Boolean);
      if (!colores.length) continue;
      fijarPaleta({ nombre: json.name || entrada.slug, colores });
      avisar("");
      return;
    } catch (e) { /* probar la siguiente URL */ }
  }
  avisar(t("paleta.sinRed"));
}

function pintarPaleta() {
  const cont = $("muestras-paleta");
  cont.innerHTML = "";
  if (!paleta) { $("nombre-paleta").textContent = ""; return; }
  $("nombre-paleta").textContent = t("paleta.nombre", { nombre: paleta.nombre, n: paleta.colores.length });
  for (const c of paleta.colores) {
    const s = document.createElement("span");
    s.style.background = rgbAHex(c);
    s.title = rgbAHex(c);
    cont.appendChild(s);
  }
}

function fijarPaleta(p) {
  paleta = p;
  pintarPaleta();
  recientes = [p, ...recientes.filter((r) => r.nombre !== p.nombre)].slice(0, 6);
  guardarRecientes();
  pintarRecientes();
  config.paletaEntrada = $("in-paleta").value;
  guardarConfig();
  refrescar();
}

function pintarRecientes() {
  const cont = $("paletas-recientes");
  cont.innerHTML = "";
  for (const r of recientes) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = r.nombre;
    b.title = t("paleta.reciente");
    b.addEventListener("click", () => fijarPaleta(r));
    cont.appendChild(b);
  }
}

/* Una paleta del disco. Los ficheros de paleta los entiende logica.js; aquí
   solo se decide si el fichero es una imagen de muestras (que hay que
   decodificar) o uno de los formatos de texto o binarios. */
const MAX_COLORES_PALETA = 256;
const EXT_PALETA = /\.(gpl|pal|hex|txt|act)$/i;

async function cargarPaletaDeArchivo(archivo) {
  const base = archivo.name.replace(/\.[^.]+$/, "");
  if (/\.(ase|aseprite)$/i.test(archivo.name)) {
    avisar(t("paleta.noAse"));
    return;
  }
  try {
    // Una imagen de muestras: valen los colores distintos que tenga, en orden.
    if (esImagen(archivo) && !EXT_PALETA.test(archivo.name)) {
      const img = await archivoAImagen(archivo);
      const colores = coloresDeImagen(img, MAX_COLORES_PALETA);
      if (!colores.length) { avisar(t("paleta.imagenVacia")); return; }
      fijarPaleta({ nombre: base, colores });
      avisar(colores.length >= MAX_COLORES_PALETA ? t("paleta.recorte", { n: MAX_COLORES_PALETA }) : "");
      return;
    }
    const paleteado = parsearArchivoPaleta(new Uint8Array(await archivo.arrayBuffer()));
    if (!paleteado) {
      avisar(t("paleta.noFichero"));
      return;
    }
    fijarPaleta({ nombre: paleteado.nombre || base, colores: paleteado.colores });
    avisar("");
  } catch (e) {
    avisar(t("img.noSePudo", { nombre: archivo.name }));
  }
}

$("btn-cargar-paleta").addEventListener("click", cargarPaleta);
$("in-paleta").addEventListener("keydown", (e) => { if (e.key === "Enter") cargarPaleta(); });
$("btn-paleta-archivo").addEventListener("click", () => $("input-paleta").click());
$("input-paleta").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  // Vaciarlo deja volver a elegir el mismo fichero (si no, no hay "change").
  e.target.value = "";
  if (archivo) cargarPaletaDeArchivo(archivo);
});

/* ============================================================
   Proceso: ReSize → ReVer → RePalette (→ Máscaras, rama aparte)
   ============================================================ */
/* ============================================================
   Máscaras: los tres canales de la textura RGB
   ============================================================ */
const CANALES = [
  { clave: "metallic",   canal: "r" },
  { clave: "smoothness", canal: "g" },
  { clave: "emisivo",    canal: "b" },
];

const FUENTES = ["luminancia", "maximo", "saturacion", "rojo", "verde", "azul"];

/* Los tres bloques de ajustes son iguales salvo el canal, así que se generan
   aquí en lugar de repetir el mismo HTML tres veces. */
(function construirBloquesMascaras() {
  $("bloques-mascaras").innerHTML = CANALES.map((c) => `
    <div class="bloque" id="mascara-${c.clave}">
      <label class="cabecera-bloque">
        <input type="checkbox" id="chk-${c.clave}" checked>
        <span class="canal ${c.canal}">${c.canal.toUpperCase()}</span><strong data-i18n="canal.${c.clave}"></strong>
      </label>
      <div class="cuerpo-bloque">
        <div class="fila">
          <label style="width:72px" data-i18n="mascaras.fuente"></label>
          <select id="sel-${c.clave}-fuente">${FUENTES.map((f) => `<option value="${f}" data-i18n="fuente.${f}"></option>`).join("")}</select>
        </div>
        <div class="fila"><label style="width:72px" data-i18n="mascaras.brillo"></label><input type="range" id="sl-${c.clave}-brillo" min="-100" max="100" value="0"><output id="out-${c.clave}-brillo">0</output></div>
        <div class="fila"><label style="width:72px" data-i18n="mascaras.contraste"></label><input type="range" id="sl-${c.clave}-contraste" min="-100" max="100" value="0"><output id="out-${c.clave}-contraste">0</output></div>
        <div class="fila"><label><input type="checkbox" id="chk-${c.clave}-invertir"> <span data-i18n="mascaras.invertir"></span></label></div>
        <div class="fila">
          <label><input type="checkbox" id="chk-${c.clave}-umbral"> <span data-i18n="mascaras.umbral"></span></label>
          <input type="range" id="sl-${c.clave}-umbral" min="0" max="255" value="128"><output id="out-${c.clave}-umbral">128</output>
        </div>
      </div>
    </div>`).join("");
})();

/* Los tamaños de siempre, en botones: escribir el mismo número en dos campos
   cansa. Van por plantilla desde la constante, igual que las máscaras. */
const TAMANOS = [8, 16, 32, 64, 128, 256];

(function construirTamanos() {
  const fila = $("tamanos-rapidos");
  for (const n of TAMANOS) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "boton";
    boton.id = "tam-" + n;
    boton.textContent = n;
    boton.title = n + "×" + n + " px";
    // Con «mantener proporción» esto es el cuadro donde encajar, no el tamaño
    // final: una imagen apaisada a 64 saldrá 64×36 y eso es lo que se quiere.
    boton.addEventListener("click", () => {
      $("in-ancho").value = n;
      $("in-alto").value = n;
      refrescar();
    });
    fila.appendChild(boton);
  }
})();

/* ============================================================
   Los controles, en una sola lista
   Cada control aparece aquí una vez, con la ruta que ocupa dentro de las
   opciones. El tipo, el valor por defecto y los topes salen del propio HTML
   (`type`, `defaultValue`/`defaultChecked`, `min`/`max`), así que el atributo
   de la etiqueta es la única fuente de la verdad: leerOpciones recorre esta
   lista en un sentido, restaurar en el otro y los botones de restablecer se
   apoyan en ella. Un ajuste nuevo es un control en el HTML y una fila aquí.
   ============================================================ */
const CONTROLES = [
  ["chk-resize",           "resize"],
  ["in-ancho",             "ancho"],
  ["in-alto",              "alto"],
  ["chk-proporcion",       "proporcion"],
  ["sel-metodo-resize",    "metodoResize"],
  ["chk-alfa-dura",        "alfaDura"],
  ["sl-alfa-umbral",       "alfaUmbral"],

  ["chk-fondo",            "fondo.activo"],
  ["sel-fondo-orden",      "fondo.orden"],
  // El desplegable dice "auto"/"manual" y las opciones guardan un booleano.
  ["sel-fondo-color",      "fondo.auto", { aDato: (v) => v === "auto",
                                           aControl: (d) => (d ? "auto" : "manual") }],
  ["in-fondo-color",       "fondo.hex"],
  ["sel-fondo-alcance",    "fondo.alcance"],
  ["sl-fondo-tolerancia",  "fondo.tolerancia"],
  ["sl-fondo-desvanecer",  "fondo.desvanecer"],

  ["chk-ver",              "ver"],
  ["sl-ver-brillo",        "ajustes.brillo"],
  ["sl-ver-contraste",     "ajustes.contraste"],
  ["sl-ver-saturacion",    "ajustes.saturacion"],
  ["sl-ver-tono",          "ajustes.tono"],

  ["chk-bordes",           "bordes.activos"],
  ["sel-bordes-metodo",    "bordes.metodo"],
  ["sl-bordes-umbral",     "bordes.umbral"],
  ["chk-bordes-silueta",   "bordes.silueta"],
  ["sel-bordes-modo",      "bordes.modo"],
  ["sl-bordes-influencia", "bordes.influencia"],

  ["chk-paleta",           "repalette"],
  ["sel-metrica",          "metrica"],
  ["sel-dither",           "dithering"],
  ["sl-intensidad",        "intensidad"],

  ["chk-bloques",          "bloques.activo"],
  ["in-bloques-ancho",     "bloques.ancho"],
  ["in-bloques-alto",      "bloques.alto"],
  ["in-bloques-colores",   "bloques.colores"],
  ["sel-bloques-criterio", "bloques.criterio"],

  ["chk-mascaras",         "mascaras"],
  ["in-sufijo",            "sufijo"],
  ["in-sufijo-mascara",    "sufijoMascara"],
];

// Los tres canales de máscara tienen los mismos seis controles: se generan
// igual que su HTML, desde CANALES.
for (const c of CANALES) {
  CONTROLES.push(
    ["chk-" + c.clave,               `canales.${c.clave}.activa`],
    ["sel-" + c.clave + "-fuente",   `canales.${c.clave}.fuente`],
    ["sl-" + c.clave + "-brillo",    `canales.${c.clave}.brillo`],
    ["sl-" + c.clave + "-contraste", `canales.${c.clave}.contraste`],
    ["chk-" + c.clave + "-invertir", `canales.${c.clave}.invertir`],
    ["sl-" + c.clave + "-umbral",    `canales.${c.clave}.umbral`],
    // Dos controles para un solo dato: la casilla dice si hay umbral y el
    // deslizador cuál. La casilla no guarda nada suyo —si hay número guardado
    // va marcada, y si no lo hay (null) la salta el bucle de restaurar—, así
    // que lo que queda en localStorage es lo mismo de siempre.
    ["chk-" + c.clave + "-umbral",   `canales.${c.clave}.umbral`,
                                     { soloRestaurar: true, aControl: () => true }],
  );
}

/* Lo que vale un control ahora mismo, con el tipo, los topes y el valor por
   defecto que declara su propia etiqueta. */
function valorDeControl(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number" || el.type === "range") {
    return numeroDeCampo(el.value, parseInt(el.defaultValue, 10) || 0,
                         el.min === "" ? -Infinity : +el.min,
                         el.max === "" ? Infinity : +el.max);
  }
  return el.value;
}

function ponerControl(el, valor) {
  if (el.type === "checkbox") el.checked = !!valor;
  else el.value = valor;
}

/* Devolver un control a lo que dice el HTML. Los <select> no llevan atributo
   `selected`, así que su valor por defecto es el de la primera opción. */
function restablecerControl(el) {
  if (el.type === "checkbox") el.checked = el.defaultChecked;
  else if (el.tagName === "SELECT") el.value = ([...el.options].find((o) => o.defaultSelected) || el.options[0]).value;
  else el.value = el.defaultValue;
}

/* Restablece de golpe una rama entera de las opciones ("ajustes", "canales"). */
function restablecerRama(prefijo) {
  for (const [id, ruta] of CONTROLES) {
    if (ruta === prefijo || ruta.startsWith(prefijo + ".")) restablecerControl($(id));
  }
}

function leerOpciones() {
  const op = {};
  for (const [id, ruta, mapa] of CONTROLES) {
    if (mapa && mapa.soloRestaurar) continue;
    const v = valorDeControl($(id));
    escribirRuta(op, ruta, mapa && mapa.aDato ? mapa.aDato(v) : v);
  }
  // Lo que no sale de un control suelto: el color de fondo a mano (null = que
  // lo vote quitarFondo mirando el marco) y el umbral de cada máscara, que es
  // null si su casilla no está marcada (así lo lee calcularMascara).
  op.fondo.color = op.fondo.auto ? null : hexARgb(op.fondo.hex);
  for (const c of CANALES) {
    if (!$("chk-" + c.clave + "-umbral").checked) op.canales[c.clave].umbral = null;
  }
  return op;
}

function procesar(original, op) {
  let img = original;
  let fondo = null;
  // ReSize y ReFondo se intercambian (el porqué, en el comentario de
  // quitarFondo). Los dos van antes de mirar colores.
  const reSize = () => { if (op.resize) img = reescalar(img, op); };
  const reFondo = () => {
    if (!op.fondo.activo) return;
    fondo = quitarFondo(img, op.fondo);
    img = fondo.imagen;
  };
  if (op.fondo.orden === "despues") { reSize(); reFondo(); } else { reFondo(); reSize(); }
  // El corte de alfa es lo último del par y por eso gana siempre: si se pide
  // alfa de 1 bit no deben quedar semitransparencias, ni las del reescalado ni
  // las del desvanecido de ReFondo.
  if (op.resize && op.alfaDura) img = recortarAlfa(img, op.alfaUmbral);
  // ReVer: dos canales que salen de la MISMA imagen reescalada. El de color es
  // el que se palettiza; el de bordes no se ve, solo acentúa lo que ve RePalette.
  const fuente = img;
  let color = fuente, bordes = null;
  if (op.ver) {
    color = ajustarColor(fuente, op.ajustes);
    img = color;
    if (op.bordes.activos) {
      bordes = detectarBordes(fuente, op.bordes);
      img = mezclarBordes(color, bordes, op.bordes);
    }
  }
  const entrada = img;
  if (op.repalette && paleta) {
    img = aplicarPaleta(img, paleta.colores, {
      metrica: op.metrica, dithering: op.dithering, intensidad: op.intensidad,
    });
  }
  // ReBloques va detrás de RePalette porque cuenta colores ya definitivos, y
  // los que elige salen del propio bloque: no se sale de la paleta.
  const sinBloques = img;
  let bloques = null;
  if (op.bloques.activo) {
    bloques = limitarAtributos(img, op.bloques);
    img = bloques.imagen;
  }
  return { imagen: img, color, bordes, entrada, fondo, bloques, sinBloques };
}

/* Las tres restricciones clásicas. El desplegable no manda: se deduce de los
   números, así que tocarlos a mano cae solo en "A medida". */
const MAQUINAS = {
  spectrum: { ancho: 8, alto: 8, colores: 2 },
  msx: { ancho: 8, alto: 1, colores: 2 },
  nes: { ancho: 16, alto: 16, colores: 4 },
};

function maquinaDe(b) {
  for (const clave of Object.keys(MAQUINAS)) {
    const m = MAQUINAS[clave];
    if (m.ancho === b.ancho && m.alto === b.alto && m.colores === b.colores) return clave;
  }
  return "medida";
}

function textoBloques(op, bloques) {
  if (!bloques) return "";
  const b = op.bloques;
  return t("bloques.info", {
    ancho: b.ancho, alto: b.alto, colores: b.colores,
    criterio: t(b.criterio === "error" ? "bloques.criterioError" : "bloques.criterioFrecuencia"),
    tocados: bloques.tocados, total: bloques.bloques, cambiados: bloques.cambiados,
    porcentaje: bloques.bloques ? Math.round(bloques.tocados * 100 / bloques.bloques) : 0,
  });
}

/* Qué ha hecho ReFondo, en una línea: de qué color era el fondo, de dónde ha
   salido ese color y cuánta imagen se ha llevado por delante. */
function textoFondo(op, fondo) {
  if (!fondo) return "";
  if (!fondo.color) return t("fondo.sinColor");
  const total = fondo.imagen.ancho * fondo.imagen.alto;
  return t("fondo.info", {
    hex: rgbAHex(fondo.color),
    origen: t(op.fondo.auto ? "fondo.origenMarco" : "fondo.origenMano"),
    // En medio de una frase van en minúscula: los de la lista de arriba empiezan por mayúscula.
    alcance: t(op.fondo.alcance === "todo" ? "fondo.resumenTodo" : "fondo.resumenFuera"),
    px: fondo.quitados,
    porcentaje: Math.round(fondo.quitados * 100 / total),
  });
}

/* Qué está haciendo ReVer, en una línea: los ajustes que no están a cero y
   cuánta imagen ha marcado el canal de bordes. */
const AJUSTES = ["brillo", "contraste", "saturacion", "tono"];
const MODOS_BORDE = { oscurecer: "ver.modoOscurecer", aclarar: "ver.modoAclarar", realce: "ver.modoRealce" };

function textoVer(op, salida) {
  const tocados = AJUSTES
    .filter((clave) => op.ajustes[clave])
    .map((clave) => `${t("ver." + clave)} ${op.ajustes[clave] > 0 ? "+" : ""}${op.ajustes[clave]}`);
  const color = tocados.length ? tocados.join(" · ") : t("ver.resumenLimpio");
  if (!salida.bordes) return t("ver.infoSinBordes", { color });
  let marcados = 0;
  for (let i = 0; i < salida.bordes.length; i++) if (salida.bordes[i]) marcados++;
  const total = salida.color.ancho * salida.color.alto;
  return t("ver.info", {
    color, px: marcados, porcentaje: Math.round(marcados * 100 / total),
    modo: t(MODOS_BORDE[op.bordes.modo]), influencia: op.bordes.influencia,
  });
}

/* Las máscaras se calculan sobre el resultado final (con la paleta ya aplicada)
   y son una rama aparte: no tocan la imagen de color. */
function procesarMascaras(resultado, op) {
  const canales = {};
  for (const c of CANALES) canales[c.clave] = calcularMascara(resultado, op.canales[c.clave]);
  return {
    canales,
    mezcla: combinarMascaras(resultado, canales.metallic, canales.smoothness, canales.emisivo),
  };
}

/* ============================================================
   Plegar herramientas
   Cada tarjeta de la columna izquierda se pliega por su cuenta y, plegada,
   enseña en la cabecera un resumen de cómo está configurada: el objetivo es
   poder tenerlas todas cerradas y seguir viendo el pipeline de un vistazo.
   ============================================================ */
const HERRAMIENTAS = [
  { id: "tarjeta-imagenes",
    resumen: () => t("img.cuantas", { n: imagenes.length }) },
  { id: "tarjeta-fondo", chk: "chk-fondo",
    resumen: (op) => t("fondo.resumen", {
      color: op.fondo.auto ? t("fondo.resumenAuto") : op.fondo.hex,
      alcance: t(op.fondo.alcance === "todo" ? "fondo.resumenTodo" : "fondo.resumenFuera"),
      tolerancia: op.fondo.tolerancia,
    }) + (op.fondo.orden === "despues" ? t("fondo.resumenDespues") : "") },
  { id: "tarjeta-resize", chk: "chk-resize",
    resumen: (op) => t("resize.resumen", {
      ancho: op.ancho, alto: op.alto,
      metodo: t(op.metodoResize === "vecino" ? "resize.resumenVecino" : "resize.resumenArea"),
    }) + (op.alfaDura ? t("resize.resumenAlfa") : "") },
  { id: "tarjeta-ver", chk: "chk-ver",
    resumen: (op) => {
      const tocados = AJUSTES.filter((clave) => op.ajustes[clave]).length;
      return (tocados ? t("ver.resumenAjustes", { n: tocados }) : t("ver.resumenLimpio")) +
        (op.bordes.activos
          ? t("ver.resumenBordes", { metodo: op.bordes.metodo, influencia: op.bordes.influencia })
          : t("ver.resumenSinBordes"));
    } },
  { id: "tarjeta-paleta", chk: "chk-paleta",
    resumen: (op) => (paleta ? paleta.nombre : t("paleta.sinPaleta")) +
      (op.dithering === "ninguno" ? "" : ` · ${op.dithering === "floyd" ? "Floyd–Steinberg" : "Bayer"}`) },
  { id: "tarjeta-bloques", chk: "chk-bloques",
    resumen: (op) => {
      const maquina = maquinaDe(op.bloques);
      const nombre = { spectrum: "Spectrum", msx: "MSX", nes: "NES" }[maquina] || t("bloques.medida");
      return t("bloques.resumen", {
        maquina: nombre, ancho: op.bloques.ancho, alto: op.bloques.alto, colores: op.bloques.colores,
      });
    } },
  { id: "tarjeta-mascaras", chk: "chk-mascaras",
    resumen: (op) => t("mascaras.resumen", { n: CANALES.filter((c) => op.canales[c.clave].activa).length }) },
];

/* De salida cada paso apagado nace plegado: la columna arranca corta y solo se
   ve lo que está en uso. A partir de ahí manda lo que haya guardado. */
function pliegues() {
  if (!config.plegados) {
    config.plegados = {};
    for (const h of HERRAMIENTAS) if (h.chk) config.plegados[h.id] = !$(h.chk).checked;
  }
  return config.plegados;
}

function pintarPliegues(op) {
  const estado = pliegues();
  for (const herramienta of HERRAMIENTAS) {
    const plegada = !!estado[herramienta.id];
    $(herramienta.id).classList.toggle("plegada", plegada);
    herramienta.boton.innerHTML = icono(plegada ? "desplegar" : "plegar");
    herramienta.boton.title = t(plegada ? "herr.desplegar" : "herr.plegar");
    // El resumen solo tiene sentido plegada: desplegada ya se ven los controles.
    $("resumen-" + herramienta.id).textContent = !plegada ? ""
      : herramienta.chk && !$(herramienta.chk).checked ? t("herr.apagado")
      : herramienta.resumen(op);
  }
  const quedaAlgunaAbierta = HERRAMIENTAS.some((h) => !estado[h.id]);
  $("btn-plegar-todo").innerHTML = icono(quedaAlgunaAbierta ? "plegarTodo" : "desplegarTodo");
  $("btn-plegar-todo").title = t(quedaAlgunaAbierta ? "herr.plegarTodo" : "herr.desplegarTodo");
}

/* ReFondo y ReSize se intercambian de verdad en la columna: si el número del
   paso no coincidiera con el orden real, la pantalla estaría mintiendo. */
function ordenarPasos(fondoPrimero) {
  const primera = $(fondoPrimero ? "tarjeta-fondo" : "tarjeta-resize");
  const segunda = $(fondoPrimero ? "tarjeta-resize" : "tarjeta-fondo");
  if (primera.nextElementSibling !== segunda) primera.parentElement.insertBefore(primera, segunda);
  primera.querySelector(".paso").textContent = "1";
  segunda.querySelector(".paso").textContent = "2";
}

function alternarPliegue(id) {
  const estado = pliegues();
  estado[id] = !estado[id];
  guardarConfig();
  pintarPliegues(leerOpciones());   // sin esperar al refresco: plegar es instantáneo
}

(function construirPliegues() {
  for (const herramienta of HERRAMIENTAS) {
    const cabecera = $(herramienta.id).querySelector(".cabecera");
    const resumen = document.createElement("span");
    resumen.className = "resumen";
    resumen.id = "resumen-" + herramienta.id;
    herramienta.boton = document.createElement("button");
    herramienta.boton.type = "button";
    herramienta.boton.className = "boton plegar";
    herramienta.boton.addEventListener("click", (e) => {
      // La cabecera de los pasos es un <label>: sin esto, plegar cambiaría
      // además la casilla de encender o apagar el paso.
      e.preventDefault();
      e.stopPropagation();
      alternarPliegue(herramienta.id);
    });
    cabecera.appendChild(resumen);
    cabecera.appendChild(herramienta.boton);
    if (herramienta.chk) {
      // Apagar un paso lo pliega y encenderlo lo abre: si no se usa, estorba.
      $(herramienta.chk).addEventListener("change", () => {
        pliegues()[herramienta.id] = !$(herramienta.chk).checked;
        guardarConfig();
        pintarPliegues(leerOpciones());
      });
    } else {
      cabecera.addEventListener("click", () => alternarPliegue(herramienta.id));
    }
  }
})();

$("btn-plegar-todo").addEventListener("click", () => {
  const estado = pliegues();
  const plegar = HERRAMIENTAS.some((t) => !estado[t.id]);
  for (const h of HERRAMIENTAS) estado[h.id] = plegar;
  guardarConfig();
  pintarPliegues(leerOpciones());
});

/* ============================================================
   Vista previa
   ============================================================ */
/* Estado de vista compartido por los seis visores. El zoom es un multiplicador
   sobre la escala de ajuste (1 = la imagen entera cabe en su marco) y (cx, cy)
   es el punto de la imagen que se ancla al centro, en coordenadas 0..1. Al ser
   normalizado, original y resultado quedan sincronizados aunque midan distinto. */
const vista = { zoom: 1, cx: 0.5, cy: 0.5 };
const ZOOM_MIN = 1, ZOOM_MAX = 64;

/* Escala a la que se ve un lienzo. Al ampliar se redondea a entero para que el
   píxel siga siendo cuadrado: en pixel art eso importa más que el zoom exacto. */
function escalaDe(marco, ancho, alto) {
  const maxW = marco.clientWidth - 8, maxH = marco.clientHeight - 8;
  if (maxW <= 0 || maxH <= 0) return 0;
  let escala = Math.min(maxW / ancho, maxH / alto) * vista.zoom;
  if (escala >= 1) escala = Math.floor(escala);
  return Math.max(escala, 0.02);
}

/* Centrado si la imagen cabe entera; si no, anclado en (cx, cy) y sin dejar
   que se despegue de los bordes del marco. */
function colocar(canvas) {
  const marco = canvas.parentElement;
  if (!canvas.width || !canvas.height) return;
  const escala = escalaDe(marco, canvas.width, canvas.height);
  if (!escala) return;
  const w = canvas.width * escala, h = canvas.height * escala;
  const cw = marco.clientWidth, ch = marco.clientHeight;
  canvas.style.width = Math.max(1, Math.round(w)) + "px";
  canvas.style.height = Math.max(1, Math.round(h)) + "px";
  canvas.style.left = Math.round(w <= cw ? (cw - w) / 2 : limitar(cw / 2 - vista.cx * w, cw - w, 0)) + "px";
  canvas.style.top = Math.round(h <= ch ? (ch - h) / 2 : limitar(ch / 2 - vista.cy * h, ch - h, 0)) + "px";
}

function recolocarTodo() {
  for (const canvas of document.querySelectorAll(".visor canvas")) colocar(canvas);
  const res = $("canvas-resultado");
  if (!res.width) { $("nivel-zoom").textContent = ""; return; }
  const escala = escalaDe(res.parentElement, res.width, res.height);
  const texto = escala >= 1 ? `${Math.round(escala)}×` : `1/${Math.round(1 / escala)}`;
  $("nivel-zoom").textContent = texto + (vista.zoom === ZOOM_MIN ? t("vista.ajustado") : "");
}

/* Cambia el zoom dejando quieto el punto de la imagen que hay bajo el cursor.
   Sin cursor (los botones) se conserva el punto anclado. */
function aplicarZoom(nuevo, marco, clientX, clientY) {
  const z = limitar(nuevo, ZOOM_MIN, ZOOM_MAX);
  if (z === vista.zoom) return false;
  const canvas = marco && marco.querySelector("canvas");
  const rc = canvas && canvas.width ? canvas.getBoundingClientRect() : null;
  if (rc && rc.width && rc.height && clientX !== undefined) {
    const ux = limitar((clientX - rc.left) / rc.width, 0, 1);
    const uy = limitar((clientY - rc.top) / rc.height, 0, 1);
    const rm = marco.getBoundingClientRect();
    vista.zoom = z;
    const escala = escalaDe(marco, canvas.width, canvas.height);
    const w = canvas.width * escala, h = canvas.height * escala;
    vista.cx = limitar(ux + (rm.width / 2 - (clientX - rm.left)) / w, 0, 1);
    vista.cy = limitar(uy + (rm.height / 2 - (clientY - rm.top)) / h, 0, 1);
  } else {
    vista.zoom = z;
  }
  recolocarTodo();
  return true;
}

function ajustarVista() {
  vista.zoom = ZOOM_MIN;
  vista.cx = vista.cy = 0.5;
  recolocarTodo();
}

function conectarVista(marco) {
  marco.addEventListener("wheel", (e) => {
    const nuevo = limitar(vista.zoom * (e.deltaY < 0 ? 1.25 : 1 / 1.25), ZOOM_MIN, ZOOM_MAX);
    // Ya ajustada y alejando: deja pasar la rueda para que la columna scrollee.
    if (nuevo === vista.zoom) return;
    e.preventDefault();
    aplicarZoom(nuevo, marco, e.clientX, e.clientY);
  }, { passive: false });

  marco.addEventListener("dblclick", ajustarVista);

  let arrastrando = false, ultimoX = 0, ultimoY = 0;
  marco.addEventListener("pointerdown", (e) => {
    const canvas = marco.querySelector("canvas");
    if (!canvas || !canvas.width) return;
    arrastrando = true;
    ultimoX = e.clientX; ultimoY = e.clientY;
    marco.setPointerCapture(e.pointerId);
    marco.classList.add("agarrando");
  });
  marco.addEventListener("pointermove", (e) => {
    if (!arrastrando) return;
    const rc = marco.querySelector("canvas").getBoundingClientRect();
    if (rc.width) vista.cx = limitar(vista.cx - (e.clientX - ultimoX) / rc.width, 0, 1);
    if (rc.height) vista.cy = limitar(vista.cy - (e.clientY - ultimoY) / rc.height, 0, 1);
    ultimoX = e.clientX; ultimoY = e.clientY;
    recolocarTodo();
  });
  const soltar = (e) => {
    if (!arrastrando) return;
    arrastrando = false;
    marco.classList.remove("agarrando");
    if (marco.hasPointerCapture(e.pointerId)) marco.releasePointerCapture(e.pointerId);
  };
  marco.addEventListener("pointerup", soltar);
  marco.addEventListener("pointercancel", soltar);
}

document.querySelectorAll(".visor .marco").forEach(conectarVista);
$("btn-zoom-mas").addEventListener("click", () => aplicarZoom(vista.zoom * 1.5));
$("btn-zoom-menos").addEventListener("click", () => aplicarZoom(vista.zoom / 1.5));
$("btn-zoom-ajustar").addEventListener("click", ajustarVista);

function dibujar(canvas, img) {
  canvas.width = img.ancho;
  canvas.height = img.alto;
  canvas.getContext("2d").putImageData(new ImageData(img.datos, img.ancho), 0, 0);
  colocar(canvas);
}

// Último color que ReFondo dedujo del marco, para poder pasarlo al selector
// manual y retocarlo desde ahí.
let ultimoFondoDetectado = null;

$("btn-fondo-tomar").addEventListener("click", () => {
  if (!ultimoFondoDetectado) return;
  $("sel-fondo-color").value = "manual";
  $("in-fondo-color").value = rgbAHex(ultimoFondoDetectado);
  refrescar();
});

let temporizador = null;
function refrescar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(refrescarAhora, 100);
}

function refrescarAhora() {
  const hay = indiceActivo >= 0 && !!imagenes[indiceActivo];
  $("btn-descargar").disabled = !hay;
  $("btn-descargar-zip").disabled = imagenes.length === 0;
  $("out-intensidad").textContent = $("sl-intensidad").value;
  for (const campo of AJUSTES) $("out-ver-" + campo).textContent = $("sl-ver-" + campo).value;
  $("out-alfa-umbral").textContent = $("sl-alfa-umbral").value;
  $("sl-alfa-umbral").disabled = !$("chk-alfa-dura").checked;
  $("out-fondo-tolerancia").textContent = $("sl-fondo-tolerancia").value;
  $("out-fondo-desvanecer").textContent = $("sl-fondo-desvanecer").value;
  const fondoAuto = $("sel-fondo-color").value === "auto";
  $("in-fondo-color").disabled = fondoAuto;
  $("out-bordes-umbral").textContent = $("sl-bordes-umbral").value;
  $("out-bordes-influencia").textContent = $("sl-bordes-influencia").value;
  $("bloque-bordes").classList.toggle("inactiva", !$("chk-bordes").checked);
  for (const c of CANALES) {
    for (const campo of ["brillo", "contraste", "umbral"]) {
      $("out-" + c.clave + "-" + campo).textContent = $("sl-" + c.clave + "-" + campo).value;
    }
    $("mascara-" + c.clave).classList.toggle("inactiva", !$("chk-" + c.clave).checked);
  }
  for (const [tarjeta, chk] of [["tarjeta-resize", "chk-resize"], ["tarjeta-fondo", "chk-fondo"],
                                ["tarjeta-ver", "chk-ver"], ["tarjeta-paleta", "chk-paleta"],
                                ["tarjeta-bloques", "chk-bloques"], ["tarjeta-mascaras", "chk-mascaras"]]) {
    $(tarjeta).classList.toggle("inactiva", !$(chk).checked);
  }
  const verFondo = $("chk-fondo").checked;
  $("vista-fondo").style.display = verFondo ? "" : "none";
  const verBloques = $("chk-bloques").checked;
  $("vista-bloques").style.display = verBloques ? "" : "none";
  const verVer = $("chk-ver").checked;
  $("vista-ver").style.display = verVer ? "" : "none";
  const verMascaras = $("chk-mascaras").checked;
  $("vista-mascaras").style.display = verMascaras ? "" : "none";
  $("in-sufijo-mascara").style.display = $("etiqueta-sufijo-mascara").style.display = verMascaras ? "" : "none";
  // Con los cuatro apagados el contenedor sobra: si no, deja su hueco entre tarjetas.
  $("vistas-extra").style.display = verFondo || verBloques || verVer || verMascaras ? "" : "none";
  const op = leerOpciones();
  for (const n of TAMANOS) $("tam-" + n).classList.toggle("activo", op.ancho === n && op.alto === n);
  $("sel-bloques-maquina").value = maquinaDe(op.bloques);
  config.opciones = op;
  guardarConfig();
  ordenarPasos(op.fondo.orden !== "despues");
  pintarPliegues(op);
  if (!hay) {
    for (const id of ["original", "resultado", "mezcla", "fondo-mapa", "fondo-sin",
                      "bloques-antes", "bloques-mapa", "ver-color", "ver-bordes", "ver-entrada",
                      ...CANALES.map((c) => "m-" + c.clave)]) {
      const lienzo = $("canvas-" + id);
      lienzo.width = lienzo.height = 0;
    }
    $("info-original").textContent = "";
    $("info-resultado").textContent = "";
    $("info-mascaras").textContent = "";
    $("info-ver").textContent = "";
    $("info-fondo").textContent = "";
    $("info-bloques").textContent = "";
    $("btn-fondo-tomar").disabled = true;
    $("nivel-zoom").textContent = "";
    return;
  }
  const item = imagenes[indiceActivo];
  dibujar($("canvas-original"), item.original);
  $("info-original").textContent = `${item.nombre} — ${item.original.ancho}×${item.original.alto}`;
  const salida = procesar(item.original, op);
  const resultado = salida.imagen;
  dibujar($("canvas-resultado"), resultado);
  const conPaleta = op.repalette && paleta ? t("vista.infoColores", { n: paleta.colores.length }) : "";
  $("info-resultado").textContent =
    `${nombreSalida(item.nombre, op.sufijo)} — ${resultado.ancho}×${resultado.alto}${conPaleta}`;

  if (verFondo && salida.fondo) {
    // El mapa se mira entero (también donde ya era transparente), así que va en
    // grises opacos: blanco es lo que ReFondo se ha llevado.
    const f = salida.fondo;
    dibujar($("canvas-fondo-mapa"), mapaAImagen(f.imagen.ancho, f.imagen.alto, f.mapa));
    dibujar($("canvas-fondo-sin"), f.imagen);
    if (op.fondo.auto) ultimoFondoDetectado = f.color;
    $("info-fondo").textContent = textoFondo(op, f);
  }
  $("btn-fondo-tomar").disabled = !fondoAuto || !ultimoFondoDetectado;

  if (verVer) {
    dibujar($("canvas-ver-color"), salida.color);
    dibujar($("canvas-ver-entrada"), salida.entrada);
    const lienzoBordes = $("canvas-ver-bordes");
    // El canal de bordes se mira entero, también fuera de la silueta, así que
    // va en grises opacos y no hereda el alfa de la imagen.
    if (salida.bordes) dibujar(lienzoBordes, mapaAImagen(salida.color.ancho, salida.color.alto, salida.bordes));
    else lienzoBordes.width = lienzoBordes.height = 0;
    $("info-ver").textContent = textoVer(op, salida);
  }

  if (verBloques && salida.bloques) {
    dibujar($("canvas-bloques-antes"), salida.sinBloques);
    // El mapa se mira entero, también fuera de la silueta: grises opacos.
    dibujar($("canvas-bloques-mapa"),
            mapaAImagen(resultado.ancho, resultado.alto, salida.bloques.mapa));
    $("info-bloques").textContent = textoBloques(op, salida.bloques);
  }

  if (verMascaras) {
    const m = procesarMascaras(resultado, op);
    for (const c of CANALES) dibujar($("canvas-m-" + c.clave), canalAImagen(resultado, m.canales[c.clave]));
    dibujar($("canvas-mezcla"), m.mezcla);
    const apagados = CANALES.filter((c) => !op.canales[c.clave].activa).map((c) => t("canal." + c.clave));
    $("info-mascaras").textContent = nombreSalida(item.nombre, op.sufijoMascara) +
      (apagados.length ? t("mascaras.aNegro", { canales: apagados.join(", ") }) : "");
  }
  recolocarTodo();
}

/* Cualquier cambio en los controles reprocesa la vista previa */
document.querySelectorAll("input, select").forEach((el) => {
  el.addEventListener("input", refrescar);
  el.addEventListener("change", refrescar);
});

$("btn-reset-ajustes").addEventListener("click", () => {
  restablecerRama("ajustes");
  refrescar();
});

$("sel-bloques-maquina").addEventListener("change", () => {
  const m = MAQUINAS[$("sel-bloques-maquina").value];
  if (!m) return;   // "A medida" no toca nada: es donde se cae al editar a mano
  $("in-bloques-ancho").value = m.ancho;
  $("in-bloques-alto").value = m.alto;
  $("in-bloques-colores").value = m.colores;
  refrescar();
});

$("btn-reset-mascaras").addEventListener("click", () => {
  restablecerRama("canales");
  refrescar();
});

/* ============================================================
   Descargas (PNG suelto o ZIP con todas)
   ============================================================ */
function nombreSalida(nombre, sufijo) {
  return nombre.replace(/\.[^.]+$/, "") + (sufijo || "") + ".png";
}

function imagenAPngBlob(img) {
  return new Promise((resolver) => {
    const c = document.createElement("canvas");
    c.width = img.ancho; c.height = img.alto;
    c.getContext("2d").putImageData(new ImageData(img.datos, img.ancho), 0, 0);
    c.toBlob(resolver, "image/png");
  });
}

function descargarBlob(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* Ficheros que salen de una imagen: el diffuse y, si están activas,
   la textura RGB de máscaras. */
function salidasDe(item, op) {
  const resultado = procesar(item.original, op).imagen;
  const salidas = [{ nombre: nombreSalida(item.nombre, op.sufijo), img: resultado }];
  if (op.mascaras) {
    salidas.push({
      nombre: nombreSalida(item.nombre, op.sufijoMascara),
      img: procesarMascaras(resultado, op).mezcla,
    });
  }
  return salidas;
}

$("btn-descargar").addEventListener("click", async () => {
  const item = imagenes[indiceActivo];
  if (!item) return;
  const op = leerOpciones();
  for (const salida of salidasDe(item, op)) {
    descargarBlob(await imagenAPngBlob(salida.img), salida.nombre);
  }
});

$("btn-descargar-zip").addEventListener("click", async () => {
  if (!imagenes.length) return;
  const boton = $("btn-descargar-zip");
  boton.disabled = true;
  const contenidoOriginal = boton.innerHTML;
  const op = leerOpciones();
  const archivos = [];
  const usados = new Map();
  try {
    for (let i = 0; i < imagenes.length; i++) {
      boton.textContent = t("salida.procesando", { i: i + 1, n: imagenes.length });
      for (const salida of salidasDe(imagenes[i], op)) {
        const blob = await imagenAPngBlob(salida.img);
        let nombre = salida.nombre;
        const veces = (usados.get(nombre) || 0) + 1;
        usados.set(nombre, veces);
        if (veces > 1) nombre = nombre.replace(/\.png$/, `_${veces}.png`);
        archivos.push({ nombre, datos: new Uint8Array(await blob.arrayBuffer()) });
      }
    }
    const zip = crearZip(archivos);
    descargarBlob(new Blob([zip], { type: "application/zip" }), "repixel.zip");
  } finally {
    boton.innerHTML = contenidoOriginal;
    boton.disabled = false;
  }
});

/* ============================================================
   Restaurar configuración guardada
   ============================================================ */
/* El idioma antes que nada: así la primera pintada ya sale traducida. */
aplicarIdioma();

(function restaurar() {
  const op = config.opciones;
  if (op) {
    for (const [id, ruta, mapa] of CONTROLES) {
      const v = leerRuta(op, ruta);
      // Lo que no se guardó —o se guardó a null, como el umbral de una máscara
      // sin marcar— lo dice el HTML: no se toca el control y manda su atributo.
      if (v === undefined || v === null) continue;
      ponerControl($(id), mapa ? mapa.aControl(v) : v);
    }
  }
  if (config.paletaEntrada) $("in-paleta").value = config.paletaEntrada;
  pintarRecientes();
  if (recientes.length) fijarPaleta(recientes[0]);
  else pintarPaleta();
  refrescarAhora();
})();

window.addEventListener("resize", refrescar);

/* ============================================================
   Esquina de estado
   ============================================================ */
document.getElementById("estado").textContent = VERSION;

/* ============================================================
   PWA: pantalla encendida, pantalla completa y offline
   (requieren HTTPS o localhost; en desarrollo por http://IP no se activan)
   ============================================================ */
let bloqueoPantalla = null;
async function mantenerPantallaEncendida() {
  if (!MANTENER_PANTALLA) return;
  if (!("wakeLock" in navigator) || bloqueoPantalla) return;
  try {
    bloqueoPantalla = await navigator.wakeLock.request("screen");
    bloqueoPantalla.addEventListener("release", () => { bloqueoPantalla = null; });
  } catch (e) { /* sin soporte o sin HTTPS: no pasa nada */ }
}

function ponerPantallaCompleta() {
  if (!PANTALLA_COMPLETA) return;
  if (location.protocol !== "https:") return;
  if (document.fullscreenElement) return;
  if (matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) return;
  const p = document.documentElement.requestFullscreen &&
            document.documentElement.requestFullscreen({ navigationUI: "hide" });
  if (p && p.catch) p.catch(() => {});
}

document.addEventListener("pointerdown", mantenerPantallaEncendida);
window.addEventListener("keydown", mantenerPantallaEncendida);
document.addEventListener("pointerdown", ponerPantallaCompleta);
window.addEventListener("keydown", ponerPantallaCompleta);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) mantenerPantallaEncendida();
});

if ("serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js");
}
