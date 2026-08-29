"use strict";

/* ============================================================
   RePixel — lógica pura
   Sin DOM: todo lo de este fichero es testeable en Node con pruebas.mjs,
   que lo carga entero. Una "imagen" aquí es
   { ancho, alto, datos: Uint8ClampedArray } (RGBA).
   ============================================================ */

function limitar(v, min, max) { return v < min ? min : v > max ? max : v; }

/* El número que hay escrito en un campo: si no hay ninguno (vacío, letras), el
   que se pase por defecto, y siempre dentro de los topes. */
function numeroDeCampo(texto, defecto, min, max) {
  const n = parseInt(texto, 10);
  return limitar(Number.isNaN(n) ? defecto : n, min, max);
}

/* Leer y escribir por ruta ("fondo.tolerancia"), creando de paso los objetos
   que falten al escribir. Es lo que permite que la lista de controles sea
   plana aunque las opciones estén anidadas. */
function leerRuta(obj, ruta) {
  let nodo = obj;
  for (const paso of ruta.split(".")) {
    if (nodo === undefined || nodo === null) return undefined;
    nodo = nodo[paso];
  }
  return nodo;
}

function escribirRuta(obj, ruta, valor) {
  const pasos = ruta.split(".");
  let nodo = obj;
  for (const paso of pasos.slice(0, -1)) {
    if (typeof nodo[paso] !== "object" || nodo[paso] === null) nodo[paso] = {};
    nodo = nodo[paso];
  }
  nodo[pasos[pasos.length - 1]] = valor;
  return obj;
}

function hexARgb(hex) {
  const h = String(hex).trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (/^[0-9a-f]{6}$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function rgbAHex(rgb) {
  return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/* Acepta: URL de Lospec (https://lospec.com/palette-list/slug), un slug
   suelto, o una lista de códigos hex separados por espacios/comas/saltos. */
function parsearEntradaPaleta(texto) {
  const t = String(texto || "").trim();
  if (!t) return null;
  const m = t.match(/lospec\.com\/palette-list\/([a-z0-9-]+)/i);
  if (m) return { tipo: "slug", slug: m[1].toLowerCase() };
  const trozos = t.split(/[\s,;]+/).filter(Boolean);
  if (trozos.length && trozos.every((x) => hexARgb(x) !== null)) {
    return { tipo: "hex", colores: trozos.map(hexARgb) };
  }
  if (/^[a-z0-9][a-z0-9-]*$/i.test(t)) return { tipo: "slug", slug: t.toLowerCase() };
  return null;
}

/* --- Color: sRGB → OKLab (espacio perceptual moderno) --- */
function srgbALineal(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function srgbAOklab(r, g, b) {
  const rl = srgbALineal(r), gl = srgbALineal(g), bl = srgbALineal(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function prepararPaleta(colores, metrica) {
  return {
    colores,
    metrica,
    labs: metrica === "oklab" ? colores.map((c) => srgbAOklab(c[0], c[1], c[2])) : null,
  };
}

function colorMasCercano(r, g, b, prep) {
  let mejor = 0, mejorD = Infinity;
  if (prep.metrica === "oklab") {
    const p = srgbAOklab(r, g, b);
    for (let i = 0; i < prep.labs.length; i++) {
      const q = prep.labs[i];
      const dL = p[0] - q[0], dA = p[1] - q[1], dB = p[2] - q[2];
      const d = dL * dL + dA * dA + dB * dB;
      if (d < mejorD) { mejorD = d; mejor = i; }
    }
  } else {
    // "redmean": aproximación ponderada de distancia perceptual en RGB
    for (let i = 0; i < prep.colores.length; i++) {
      const c = prep.colores[i];
      const rm = (r + c[0]) / 2;
      const dr = r - c[0], dg = g - c[1], db = b - c[2];
      const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
      if (d < mejorD) { mejorD = d; mejor = i; }
    }
  }
  return mejor;
}

const BAYER8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/* opciones: { metrica: "oklab"|"rgb", dithering: "ninguno"|"floyd"|"bayer", intensidad: 0..100 } */
function aplicarPaleta(img, colores, opciones) {
  const prep = prepararPaleta(colores, opciones.metrica);
  const { ancho, alto } = img;
  const salida = new Uint8ClampedArray(img.datos);
  const fuerza = (opciones.intensidad === undefined ? 100 : opciones.intensidad) / 100;
  const memo = new Map();
  const cercano = (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    let i = memo.get(k);
    if (i === undefined) { i = colorMasCercano(r, g, b, prep); memo.set(k, i); }
    return i;
  };

  if (opciones.dithering === "floyd") {
    // Difusión de error sobre una copia en coma flotante
    const flot = new Float32Array(ancho * alto * 3);
    for (let i = 0, j = 0; i < salida.length; i += 4, j += 3) {
      flot[j] = salida[i]; flot[j + 1] = salida[i + 1]; flot[j + 2] = salida[i + 2];
    }
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const p = (y * ancho + x) * 4, q = (y * ancho + x) * 3;
        if (salida[p + 3] === 0) continue; // transparente: ni cambia ni propaga error
        const r = limitar(Math.round(flot[q]), 0, 255);
        const g = limitar(Math.round(flot[q + 1]), 0, 255);
        const b = limitar(Math.round(flot[q + 2]), 0, 255);
        const c = prep.colores[cercano(r, g, b)];
        salida[p] = c[0]; salida[p + 1] = c[1]; salida[p + 2] = c[2];
        const er = (flot[q] - c[0]) * fuerza;
        const eg = (flot[q + 1] - c[1]) * fuerza;
        const eb = (flot[q + 2] - c[2]) * fuerza;
        const reparte = (dx, dy, f) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= ancho || ny >= alto) return;
          const n = (ny * ancho + nx) * 3;
          flot[n] += er * f; flot[n + 1] += eg * f; flot[n + 2] += eb * f;
        };
        reparte(1, 0, 7 / 16); reparte(-1, 1, 3 / 16); reparte(0, 1, 5 / 16); reparte(1, 1, 1 / 16);
      }
    }
  } else {
    const conBayer = opciones.dithering === "bayer";
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < ancho; x++) {
        const p = (y * ancho + x) * 4;
        if (salida[p + 3] === 0) continue;
        let r = salida[p], g = salida[p + 1], b = salida[p + 2];
        if (conBayer) {
          const d = (BAYER8[y % 8][x % 8] / 64 - 0.5) * 64 * fuerza;
          r = limitar(Math.round(r + d), 0, 255);
          g = limitar(Math.round(g + d), 0, 255);
          b = limitar(Math.round(b + d), 0, 255);
        }
        const c = prep.colores[cercano(r, g, b)];
        salida[p] = c[0]; salida[p + 1] = c[1]; salida[p + 2] = c[2];
      }
    }
  }
  return { ancho, alto, datos: salida };
}

/* --- ReBloques: el "clash de atributos" de las máquinas de 8 bits ---
   El ZX Spectrum guarda un solo par de colores (INK y PAPER) por cada celda de
   8×8; la NES, una paleta de 4 por bloque; el MSX en SCREEN 2, dos por cada
   línea de 8×1. Da igual lo rica que sea la paleta global: dentro de la celda
   no caben más, y de ahí salen esos bordes con manchas tan reconocibles.
   Emularlo es partir la imagen en bloques y, en los que se pasan de cupo,
   quedarse con N colores y remapear el resto a su vecino más cercano.
   Dos cosas a propósito:
   · los colores elegidos salen SIEMPRE de los que ya hay en el bloque, así que
     viniendo de RePalette la salida sigue estando en la paleta por construcción
     (aquí no se inventa ningún color, igual que en ReVer);
   · los píxeles transparentes ni gastan cupo ni se tocan: el límite es para el
     dibujo, no para el fondo que ReFondo ya se ha llevado. */

function distanciaLab2(a, b) {
  const dL = a[0] - b[0], dA = a[1] - b[1], dB = a[2] - b[2];
  return dL * dL + dA * dA + dB * dB;
}

/* Qué colores se queda un bloque que no cabe. censo: Map de color → nº de
   píxeles; lab: la conversión a OKLab, memorizada por quien llama.
   · "frecuencia": los más repetidos, que es lo que hace un conversor ingenuo.
   · "error": el más repetido y, en cada vuelta, el que más error ahorra. Cuesta
     un poco más y conserva las formas: un bloque casi todo negro con un brillo
     blanco se queda el blanco, en vez de gastar la segunda plaza en otro negro
     que no se distingue del primero. */
function elegirColoresBloque(censo, maximo, criterio, lab) {
  const lista = [...censo.entries()].map(([clave, cuenta]) => ({ clave, cuenta }));
  lista.sort((a, b) => b.cuenta - a.cuenta);
  if (criterio === "frecuencia") return lista.slice(0, maximo).map((c) => c.clave);
  const labs = lista.map((c) => lab(c.clave));
  const elegidos = [0];                                   // el más repetido siempre entra
  const cerca = labs.map((l) => distanciaLab2(l, labs[0])); // error² de cada color con lo ya elegido
  while (elegidos.length < maximo) {
    let mejor = -1, mejorAhorro = 0;
    for (let i = 0; i < lista.length; i++) {
      if (cerca[i] === 0) continue;   // ya elegido (o idéntico a uno que lo está)
      let ahorro = 0;
      for (let j = 0; j < lista.length; j++) {
        const d = distanciaLab2(labs[j], labs[i]);
        if (d < cerca[j]) ahorro += lista[j].cuenta * (cerca[j] - d);
      }
      if (ahorro > mejorAhorro) { mejorAhorro = ahorro; mejor = i; }
    }
    if (mejor < 0) break;   // nadie mejora nada: no gastar plazas de más
    elegidos.push(mejor);
    for (let j = 0; j < lista.length; j++) cerca[j] = Math.min(cerca[j], distanciaLab2(labs[j], labs[mejor]));
  }
  return elegidos.map((i) => lista[i].clave);
}

/* op: { ancho, alto, colores, criterio: "error"|"frecuencia" }
   Devuelve { imagen, mapa, bloques, tocados, cambiados }; mapa es, por píxel,
   cuánto ha cambiado su bloque (0-255), para poder ver dónde ha mordido. */
function limitarAtributos(img, op) {
  const { ancho, alto } = img;
  const datos = new Uint8ClampedArray(img.datos);
  const mapa = new Uint8ClampedArray(ancho * alto);
  const bw = limitar(Math.round((op && op.ancho) || 8), 1, 256);
  const bh = limitar(Math.round((op && op.alto) || 8), 1, 256);
  const maximo = limitar(Math.round((op && op.colores) || 2), 1, 256);
  const criterio = (op && op.criterio) || "error";
  // OKLab memorizado entre bloques: la paleta se repite por toda la imagen.
  const memo = new Map();
  const lab = (clave) => {
    let l = memo.get(clave);
    if (!l) { l = srgbAOklab((clave >> 16) & 255, (clave >> 8) & 255, clave & 255); memo.set(clave, l); }
    return l;
  };
  const claveEn = (p) => (img.datos[p] << 16) | (img.datos[p + 1] << 8) | img.datos[p + 2];
  let bloques = 0, tocados = 0, cambiados = 0;
  for (let by = 0; by < alto; by += bh) {
    for (let bx = 0; bx < ancho; bx += bw) {
      bloques++;
      const finX = Math.min(bx + bw, ancho), finY = Math.min(by + bh, alto);
      const censo = new Map();
      for (let y = by; y < finY; y++) {
        for (let x = bx; x < finX; x++) {
          const p = (y * ancho + x) * 4;
          if (img.datos[p + 3] === 0) continue;
          const clave = claveEn(p);
          censo.set(clave, (censo.get(clave) || 0) + 1);
        }
      }
      if (censo.size <= maximo) continue;   // el bloque ya cabe: ni se mira
      const elegidos = elegirColoresBloque(censo, maximo, criterio, lab);
      const labsElegidos = elegidos.map(lab);
      const destino = new Map();
      const aDonde = (clave) => {
        let d = destino.get(clave);
        if (d === undefined) {
          const l = lab(clave);
          let mejor = 0, mejorD = Infinity;
          for (let i = 0; i < labsElegidos.length; i++) {
            const dd = distanciaLab2(l, labsElegidos[i]);
            if (dd < mejorD) { mejorD = dd; mejor = i; }
          }
          d = elegidos[mejor];
          destino.set(clave, d);
        }
        return d;
      };
      let enBloque = 0;
      for (let y = by; y < finY; y++) {
        for (let x = bx; x < finX; x++) {
          const p = (y * ancho + x) * 4;
          if (img.datos[p + 3] === 0) continue;
          const d = aDonde(claveEn(p));
          if (d === claveEn(p)) continue;
          datos[p] = (d >> 16) & 255; datos[p + 1] = (d >> 8) & 255; datos[p + 2] = d & 255;
          enBloque++;
        }
      }
      if (!enBloque) continue;
      tocados++;
      cambiados += enBloque;
      const gris = Math.round(255 * enBloque / ((finX - bx) * (finY - by)));
      for (let y = by; y < finY; y++) for (let x = bx; x < finX; x++) mapa[y * ancho + x] = gris;
    }
  }
  return { imagen: { ancho, alto, datos }, mapa, bloques, tocados, cambiados };
}

/* --- Reescalado --- */
function calcularTamanoDestino(ancho, alto, anchoObj, altoObj, mantenerProporcion) {
  if (!mantenerProporcion) return [anchoObj, altoObj];
  const e = Math.min(anchoObj / ancho, altoObj / alto);
  return [Math.max(1, Math.round(ancho * e)), Math.max(1, Math.round(alto * e))];
}

/* Promedio de área ("box sampling") con cobertura fraccionaria y color
   ponderado por alfa: el mejor método genérico para reducir a 64×64. */
function redimensionarArea(img, anchoD, altoD) {
  const { ancho, alto, datos } = img;
  const salida = new Uint8ClampedArray(anchoD * altoD * 4);
  const ex = ancho / anchoD, ey = alto / altoD;
  for (let j = 0; j < altoD; j++) {
    const y0 = j * ey, y1 = y0 + ey;
    for (let i = 0; i < anchoD; i++) {
      const x0 = i * ex, x1 = x0 + ex;
      let sr = 0, sg = 0, sb = 0, sa = 0, sw = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        if (wy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          if (wx <= 0) continue;
          const w = wx * wy;
          const p = (yy * ancho + xx) * 4;
          const a = datos[p + 3];
          sr += datos[p] * a * w; sg += datos[p + 1] * a * w; sb += datos[p + 2] * a * w;
          sa += a * w; sw += w;
        }
      }
      const q = (j * anchoD + i) * 4;
      if (sa > 0) {
        salida[q] = Math.round(sr / sa);
        salida[q + 1] = Math.round(sg / sa);
        salida[q + 2] = Math.round(sb / sa);
        salida[q + 3] = Math.round(sa / sw);
      }
    }
  }
  return { ancho: anchoD, alto: altoD, datos: salida };
}

function redimensionarVecino(img, anchoD, altoD) {
  const { ancho, alto, datos } = img;
  const salida = new Uint8ClampedArray(anchoD * altoD * 4);
  for (let j = 0; j < altoD; j++) {
    const sy = limitar(Math.floor((j + 0.5) * alto / altoD), 0, alto - 1);
    for (let i = 0; i < anchoD; i++) {
      const sx = limitar(Math.floor((i + 0.5) * ancho / anchoD), 0, ancho - 1);
      const p = (sy * ancho + sx) * 4, q = (j * anchoD + i) * 4;
      salida[q] = datos[p]; salida[q + 1] = datos[p + 1];
      salida[q + 2] = datos[p + 2]; salida[q + 3] = datos[p + 3];
    }
  }
  return { ancho: anchoD, alto: altoD, datos: salida };
}

/* ReSize de una pieza: calcula el tamaño de destino y elige método. Si no hay
   nada que cambiar devuelve la misma imagen tal cual.
   op: { ancho, alto, proporcion, metodoResize } */
function reescalar(img, op) {
  const [w, h] = calcularTamanoDestino(img.ancho, img.alto, op.ancho, op.alto, op.proporcion);
  if (w === img.ancho && h === img.alto) return img;
  return op.metodoResize === "vecino" ? redimensionarVecino(img, w, h) : redimensionarArea(img, w, h);
}

/* A partir de este alfa un píxel cuenta como parte del sprite: el halo de
   semitransparencias que deja el promedio de área no es silueta. */
const OPACO_MINIMO = 128;

/* Alfa de 1 bit: cada píxel entra en la silueta o no entra, sin medias tintas.
   El promedio de área reparte alfa fraccionaria por el contorno, que es el
   antialias correcto para mirar la imagen pero no lo que quiere un sprite de
   juego —ahí el corte lo hace el shader, y una semitransparencia acaba en halo
   o en un borde que parpadea—. Así que se decide aquí de una vez: por encima
   del umbral, opaco del todo; por debajo, fuera y sin color que arrastre al
   PNG. Subir el umbral adelgaza la silueta y bajarlo la engorda. */
function recortarAlfa(img, umbral) {
  const n = img.ancho * img.alto;
  const datos = new Uint8ClampedArray(img.datos);
  const corte = limitar(umbral === undefined ? OPACO_MINIMO : umbral, 1, 255);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (datos[p + 3] >= corte) { datos[p + 3] = 255; continue; }
    datos[p] = datos[p + 1] = datos[p + 2] = datos[p + 3] = 0;
  }
  return { ancho: img.ancho, alto: img.alto, datos };
}

/* --- ReFondo: quitar el fondo plano ---
   Lo que suele entregar una IA cuando le pides pixel art es el dibujo sobre un
   fondo de un color liso. Quitarlo son dos preguntas: cuál es ese color y qué
   parte de la imagen es "fuera".
   · El color, por defecto, sale de votar el marco de 1 px del lienzo: el color
     opaco más repetido del borde. También se puede fijar a mano.
   · "Fuera" es, por defecto, lo que se alcanza desde el borde del lienzo sin
     salir del color de fondo (relleno por inundación a 4 vecinos). Así el mismo
     color DENTRO del dibujo —un ojo, un hueco cerrado— no se borra; con alcance
     "todo" sí, esté donde esté.
   Va antes de ReVer a propósito: el fondo no debe contar como borde ni gastar
   un color de la paleta. Con ReSize, en cambio, el orden se elige, y no da
   igual cuál va primero:
   · ReFondo PRIMERO (por defecto): el color se busca a resolución completa,
     donde el fondo todavía es plano, y quien reparte el alfa del borde es
     después el promedio de área —que ya pondera el color por alfa—, así que el
     antialias del contorno sale correcto y del color del sprite, sin fleco.
   · ReSize PRIMERO: el reescalado ya ha promediado el ruido del fondo, así que
     un fondo sucio o con degradado se detecta con menos tolerancia, y el
     relleno recorre 64×64 en vez de la imagen entera. A cambio, el halo que
     deja el promedio ya está mezclado y hay que comérselo con "desvanecer". */

/* Distancia perceptual entre dos colores en OKLab: 0 es el mismo color y
   blanco↔negro ≈ 1. Es la vara de medir "se parece al fondo". */
function distanciaOklab(r, g, b, lab) {
  const p = srgbAOklab(r, g, b);
  const dL = p[0] - lab[0], dA = p[1] - lab[1], dB = p[2] - lab[2];
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

/* Vota el marco de 1 px del lienzo y devuelve el color opaco más repetido, o
   null si el borde no tiene ni un píxel opaco (imagen ya recortada). */
function colorDeFondo(img) {
  const { ancho, alto, datos } = img;
  const votos = new Map();
  const votar = (x, y) => {
    const p = (y * ancho + x) * 4;
    if (datos[p + 3] < OPACO_MINIMO) return;
    const k = (datos[p] << 16) | (datos[p + 1] << 8) | datos[p + 2];
    votos.set(k, (votos.get(k) || 0) + 1);
  };
  for (let x = 0; x < ancho; x++) { votar(x, 0); votar(x, alto - 1); }
  for (let y = 1; y < alto - 1; y++) { votar(0, y); votar(ancho - 1, y); }
  let mejor = -1, masVotado = 0;
  for (const [k, n] of votos) if (n > masVotado) { masVotado = n; mejor = k; }
  return mejor < 0 ? null : [(mejor >> 16) & 255, (mejor >> 8) & 255, mejor & 255];
}

/* La tolerancia va de 0 a 100 y se reparte sobre esta distancia OKLab. Medio
   OKLab ya es un salto enorme, así que el rango útil está en la parte baja. */
const TOLERANCIA_MAX = 0.5;

/* op: { color: [r,g,b] | null (null = automático), alcance: "fuera"|"todo",
         tolerancia: 0..100, desvanecer: 0..100 }
   Devuelve { imagen, color, mapa, quitados }: la imagen con el fondo a alfa 0,
   el color que ha usado, cuánto se le ha quitado a cada píxel (0-255, para el
   visor) y cuántos píxeles han desaparecido del todo.
   Con "desvanecer" a 0 el corte es seco. Subiéndolo, los píxeles que quedan a
   medio camino entre el fondo y el dibujo —el halo que deja el promedio de área
   al reescalar— pierden alfa en proporción a lo lejos que están del fondo, que
   es justo el alfa que les tocaba: quitar el fondo después de reescalar deja de
   costar un contorno sucio. */
function quitarFondo(img, op) {
  const { ancho, alto } = img;
  const n = ancho * alto;
  const datos = new Uint8ClampedArray(img.datos);
  const mapa = new Uint8ClampedArray(n);
  const color = (op && op.color) || colorDeFondo(img);
  if (!color) return { imagen: { ancho, alto, datos }, color: null, mapa, quitados: 0 };

  const lab = srgbAOklab(color[0], color[1], color[2]);
  const tol = limitar((op && op.tolerancia) || 0, 0, 100) / 100 * TOLERANCIA_MAX;
  const margen = limitar((op && op.desvanecer) || 0, 0, 100) / 100 * TOLERANCIA_MAX;
  const limite = tol + margen;

  // Distancia al fondo de cada píxel (memorizada por color) y quién cae dentro
  // de la franja. Lo que ya era transparente entra siempre: era fondo de antes,
  // y así el relleno lo atraviesa.
  const dist = new Float32Array(n);
  const enFranja = new Uint8Array(n);
  const memo = new Map();
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (img.datos[p + 3] === 0) { enFranja[i] = 1; continue; }
    const k = (img.datos[p] << 16) | (img.datos[p + 1] << 8) | img.datos[p + 2];
    let d = memo.get(k);
    if (d === undefined) {
      d = distanciaOklab(img.datos[p], img.datos[p + 1], img.datos[p + 2], lab);
      memo.set(k, d);
    }
    dist[i] = d;
    if (d <= limite) enFranja[i] = 1;
  }

  // "Fuera" = lo que se alcanza desde el borde del lienzo sin salir de la
  // franja. Relleno por inundación con pila propia: nada de recursión.
  let marcado = enFranja;
  if (!op || op.alcance !== "todo") {
    marcado = new Uint8Array(n);
    const pila = new Int32Array(n); // cada índice se apila como mucho una vez
    let cima = 0;
    const empujar = (i) => { if (enFranja[i] && !marcado[i]) { marcado[i] = 1; pila[cima++] = i; } };
    for (let x = 0; x < ancho; x++) { empujar(x); empujar((alto - 1) * ancho + x); }
    for (let y = 0; y < alto; y++) { empujar(y * ancho); empujar(y * ancho + ancho - 1); }
    while (cima > 0) {
      const i = pila[--cima];
      const x = i % ancho, y = (i - x) / ancho;
      if (x > 0) empujar(i - 1);
      if (x < ancho - 1) empujar(i + 1);
      if (y > 0) empujar(i - ancho);
      if (y < alto - 1) empujar(i + ancho);
    }
  }

  let quitados = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const alfa0 = img.datos[p + 3];
    if (!marcado[i] || alfa0 === 0) continue;
    // Dentro de la tolerancia es fondo puro; en el margen, alfa proporcional.
    const alfa = margen > 0 && dist[i] > tol
      ? Math.round(alfa0 * limitar((dist[i] - tol) / margen, 0, 1))
      : 0;
    if (alfa === alfa0) continue;
    datos[p + 3] = alfa;
    // Al irse del todo se limpia también el color: un píxel invisible no debe
    // arrastrar el color del fondo dentro del PNG.
    if (alfa === 0) { datos[p] = datos[p + 1] = datos[p + 2] = 0; quitados++; }
    mapa[i] = Math.round(255 * (1 - alfa / alfa0));
  }
  return { imagen: { ancho, alto, datos }, color, mapa, quitados };
}

/* --- ReVer: lo que ve RePixel antes de la paleta ---
   De la imagen ya reescalada salen dos canales:
   · el de COLOR (brillo, contraste, saturación, tono) es el que se palettiza,
     así que es el que decide qué colores acaba eligiendo RePalette;
   · el de BORDES no se ve en la salida: se mezcla con el de color justo antes
     de RePalette para acentuar los contornos.
   Los bordes se buscan sobre la imagen de partida y no sobre la ya ajustada a
   propósito: hundir el contraste para forzar la paleta no debe mover los bordes.
   Y como la mezcla ocurre ANTES de palettizar, el contorno acentuado sale con
   colores de la paleta por construcción: aquí no se inventa ningún color final. */

function luminancia(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

/* RGB 0-255 ↔ HSL (h, s, l en 0..1). La saturación y el tono se tocan en HSL y
   no con una matriz sobre RGB para que el tono gire como en cualquier editor:
   +120° sobre un rojo da un verde, no un verde apagado. */
function rgbAHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslARgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t) => {
    t -= Math.floor(t); // el tono es circular: da igual si se sale de 0..1
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(canal(h + 1 / 3) * 255), Math.round(canal(h) * 255), Math.round(canal(h - 1 / 3) * 255)];
}

/* Los sliders de toda la vida. aj: { brillo, contraste, saturacion, tono },
   todo a 0 = identidad. Los píxeles transparentes no se tocan: no hay color
   que ajustar y así el ajuste nunca se cuela en el halo del reescalado. */
function ajustarColor(img, aj) {
  const { ancho, alto } = img;
  const datos = new Uint8ClampedArray(img.datos);
  const brillo = ((aj && aj.brillo) || 0) * 2.55;
  const c = ((aj && aj.contraste) || 0) * 2.55;
  const sat = 1 + ((aj && aj.saturacion) || 0) / 100;
  const tono = ((aj && aj.tono) || 0) / 360;
  if (!brillo && !c && sat === 1 && !tono) return { ancho, alto, datos };
  // Fórmula clásica del contraste: pivota en el gris medio y satura suave.
  const fContraste = (259 * (c + 255)) / (255 * (259 - c));
  const n = ancho * alto;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (img.datos[p + 3] === 0) continue;
    let r = img.datos[p], g = img.datos[p + 1], b = img.datos[p + 2];
    if (brillo) { r += brillo; g += brillo; b += brillo; }
    if (c) {
      r = fContraste * (r - 128) + 128;
      g = fContraste * (g - 128) + 128;
      b = fContraste * (b - 128) + 128;
    }
    r = limitar(r, 0, 255); g = limitar(g, 0, 255); b = limitar(b, 0, 255);
    if (sat !== 1 || tono) {
      const hsl = rgbAHsl(r, g, b);
      const rgb = hslARgb(hsl[0] + tono, limitar(hsl[1] * sat, 0, 1), hsl[2]);
      r = rgb[0]; g = rgb[1]; b = rgb[2];
    }
    datos[p] = Math.round(r); datos[p + 1] = Math.round(g); datos[p + 2] = Math.round(b);
  }
  return { ancho, alto, datos };
}

const VECINOS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* Sobel 3×3 sobre una función que da el valor de cada vecino, normalizado a
   0-255: el gradiente máximo de un salto de 0 a 255 es 4×255. */
function magnitudSobel(valorEn) {
  const gx = (valorEn(1, -1) + 2 * valorEn(1, 0) + valorEn(1, 1)) -
             (valorEn(-1, -1) + 2 * valorEn(-1, 0) + valorEn(-1, 1));
  const gy = (valorEn(-1, 1) + 2 * valorEn(0, 1) + valorEn(1, 1)) -
             (valorEn(-1, -1) + 2 * valorEn(0, -1) + valorEn(1, -1));
  return Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4);
}

/* Mapa de bordes: un valor 0-255 por píxel (0 = liso), uno por píxel y no
   cuatro, igual que las máscaras.
   op: { metodo: "sobel"|"laplaciano"|"color", umbral: 0..255, silueta: bool }
   · sobel: el gradiente de toda la vida; marca el borde ancho y gradual.
   · laplaciano: la segunda derivada; línea más fina y más ruidosa.
   · color: la mayor diferencia de canal con los 4 vecinos; pilla los cambios de
     tono que la luminancia no ve (un rojo y un verde igual de claros).
   Los píxeles transparentes no participan en el gradiente de color —para el
   contorno del sprite está la opción de silueta, que mira solo el alfa—, y
   fuera del lienzo se repite el píxel central: sin vecino real no hay gradiente
   que medir, así que un sprite que llega al borde no se rodea de marco. */
function detectarBordes(img, op) {
  const { ancho, alto, datos } = img;
  const n = ancho * alto;
  const lum = new Float32Array(n);
  const dentro = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    lum[i] = luminancia(datos[p], datos[p + 1], datos[p + 2]);
    dentro[i] = datos[p + 3] >= OPACO_MINIMO ? 1 : 0;
  }
  const metodo = (op && op.metodo) || "sobel";
  const umbral = limitar(op && op.umbral !== undefined ? op.umbral : 0, 0, 255);
  const conSilueta = !!(op && op.silueta);
  const salida = new Uint8ClampedArray(n);
  const vecino = (x, y, i) => {
    if (x < 0 || x >= ancho || y < 0 || y >= alto) return i;
    const j = y * ancho + x;
    return dentro[j] ? j : i;
  };
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      let v = 0;
      if (dentro[i]) {
        if (metodo === "color") {
          const p = i * 4;
          for (const [dx, dy] of VECINOS4) {
            const q = vecino(x + dx, y + dy, i) * 4;
            v = Math.max(v, Math.abs(datos[p] - datos[q]),
                            Math.abs(datos[p + 1] - datos[q + 1]),
                            Math.abs(datos[p + 2] - datos[q + 2]));
          }
        } else if (metodo === "laplaciano") {
          // Se divide entre 2 y no entre 4 para que un escalón de 0 a 255 (que
          // solo tiene un vecino distinto) marque medio canal en vez de un
          // cuarto; una mota suelta satura, que es justo lo que se quiere ver.
          let suma = 0;
          for (const [dx, dy] of VECINOS4) suma += lum[vecino(x + dx, y + dy, i)];
          v = Math.abs(4 * lum[i] - suma) / 2;
        } else {
          v = magnitudSobel((dx, dy) => lum[vecino(x + dx, y + dy, i)]);
        }
      }
      if (conSilueta) {
        v = Math.max(v, magnitudSobel((dx, dy) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= ancho || ny < 0 || ny >= alto) return dentro[i] * 255;
          return dentro[ny * ancho + nx] * 255;
        }));
      }
      // Corte seco: por debajo del umbral no es un borde, es ruido.
      salida[i] = v >= umbral ? Math.round(v) : 0;
    }
  }
  return salida;
}

/* Media 3×3 de cada canal contando solo los píxeles opacos (el central
   incluido): la referencia contra la que empuja el modo "realce". */
function mediaVecindad(img) {
  const { ancho, alto, datos } = img;
  const media = new Float32Array(ancho * alto * 3);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      let sr = 0, sg = 0, sb = 0, cuenta = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= alto) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= ancho) continue;
          const q = (ny * ancho + nx) * 4;
          if (datos[q + 3] === 0) continue;
          sr += datos[q]; sg += datos[q + 1]; sb += datos[q + 2]; cuenta++;
        }
      }
      const m = (y * ancho + x) * 3;
      if (cuenta) { media[m] = sr / cuenta; media[m + 1] = sg / cuenta; media[m + 2] = sb / cuenta; }
    }
  }
  return media;
}

/* Mezcla el canal de bordes con el de color. Con influencia 0 no toca nada.
   op: { modo: "oscurecer"|"aclarar"|"realce", influencia: 0..100 } */
function mezclarBordes(img, bordes, op) {
  const { ancho, alto } = img;
  const n = ancho * alto;
  const datos = new Uint8ClampedArray(img.datos);
  const k = limitar((op && op.influencia !== undefined ? op.influencia : 0) / 100, 0, 1);
  if (!k) return { ancho, alto, datos };
  const modo = (op && op.modo) || "oscurecer";
  const media = modo === "realce" ? mediaVecindad(img) : null;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (img.datos[p + 3] === 0) continue;
    const e = (bordes[i] / 255) * k;
    if (e <= 0) continue;
    for (let ch = 0; ch < 3; ch++) {
      const v = img.datos[p + ch];
      if (modo === "aclarar") datos[p + ch] = Math.round(v + (255 - v) * e);
      // Realce: aleja el píxel de la media de su vecindad. El ×2 es para que el
      // empujón se note antes de que RePalette lo redondee a la paleta.
      else if (modo === "realce") datos[p + ch] = Math.round(v + (v - media[i * 3 + ch]) * e * 2);
      else datos[p + ch] = Math.round(v * (1 - e));
    }
  }
  return { ancho, alto, datos };
}

/* Un mapa de 0-255 como imagen en grises opaca, para poder mirar el canal de
   bordes entero: también donde la imagen es transparente. */
function mapaAImagen(ancho, alto, valores) {
  const n = ancho * alto;
  const datos = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    datos[p] = datos[p + 1] = datos[p + 2] = valores[i];
    datos[p + 3] = 255;
  }
  return { ancho, alto, datos };
}

/* --- Máscaras: la textura RGB para el shader (R metallic, G smoothness, B emisivo) ---
   Cada canal se calcula por separado a partir de la imagen final y sus propios
   ajustes, y se combina al final. Son grises: un solo valor 0-255 por píxel. */

/* Valor 0-255 del que parte la máscara, según la fuente elegida. */
function valorFuente(r, g, b, fuente) {
  switch (fuente) {
    case "rojo": return r;
    case "verde": return g;
    case "azul": return b;
    case "maximo": return Math.max(r, g, b);
    case "saturacion": return Math.max(r, g, b) - Math.min(r, g, b);
    default: return luminancia(r, g, b);
  }
}

/* Calcula un canal de máscara. Devuelve ancho*alto valores (uno por píxel).
   Si la máscara está desactivada el canal queda a 0 (negro). */
function calcularMascara(img, aj) {
  const n = img.ancho * img.alto;
  const canal = new Uint8ClampedArray(n);
  if (!aj || aj.activa === false) return canal;
  const desplBrillo = (aj.brillo || 0) * 2.55;
  const c = (aj.contraste || 0) * 2.55;
  const fContraste = (259 * (c + 255)) / (255 * (259 - c));
  const conUmbral = aj.umbral !== null && aj.umbral !== undefined;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let v = valorFuente(img.datos[p], img.datos[p + 1], img.datos[p + 2], aj.fuente);
    v += desplBrillo;
    v = fContraste * (v - 128) + 128;
    if (aj.invertir) v = 255 - v;
    v = limitar(v, 0, 255);
    if (conUmbral) v = v >= aj.umbral ? 255 : 0;
    canal[i] = Math.round(v);
  }
  return canal;
}

/* Combina los tres canales en la textura RGB final.
   El alfa se hereda de la imagen para conservar la silueta del sprite. */
function combinarMascaras(img, canalR, canalG, canalB) {
  const n = img.ancho * img.alto;
  const datos = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    datos[p] = canalR[i];
    datos[p + 1] = canalG[i];
    datos[p + 2] = canalB[i];
    datos[p + 3] = img.datos[p + 3];
  }
  return { ancho: img.ancho, alto: img.alto, datos };
}

/* Un canal suelto como imagen en grises (para la vista previa de cada máscara). */
function canalAImagen(img, canal) {
  const n = img.ancho * img.alto;
  const datos = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    datos[p] = datos[p + 1] = datos[p + 2] = canal[i];
    datos[p + 3] = img.datos[p + 3];
  }
  return { ancho: img.ancho, alto: img.alto, datos };
}

/* --- ZIP sin compresión (método "store"): suficiente para PNGs, sin dependencias --- */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(datos) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* archivos: [{ nombre, datos: Uint8Array }] → Uint8Array con el .zip completo */
function crearZip(archivos) {
  const cod = new TextEncoder();
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const FECHA_DOS = ((2026 - 1980) << 9) | (8 << 5) | 19; // fecha fija: solo informativa
  const partes = [], centrales = [];
  let offset = 0;
  for (const { nombre, datos } of archivos) {
    const nom = cod.encode(nombre);
    const crc = crc32(datos);
    // flag 0x0800: nombre de archivo en UTF-8
    const comun = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(FECHA_DOS),
                   ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nom.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034b50), ...comun, ...nom]);
    partes.push(local, datos);
    centrales.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...comun,
                                   ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nom]));
    offset += local.length + datos.length;
  }
  const inicioCentral = offset;
  let tamCentral = 0;
  for (const c of centrales) tamCentral += c.length;
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
                              ...u16(archivos.length), ...u16(archivos.length),
                              ...u32(tamCentral), ...u32(inicioCentral), ...u16(0)]);
  const zip = new Uint8Array(inicioCentral + tamCentral + fin.length);
  let pos = 0;
  for (const parte of [...partes, ...centrales, fin]) { zip.set(parte, pos); pos += parte.length; }
  return zip;
}
