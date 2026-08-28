/* Pruebas de la lógica pura de RePixel.
   Ejecutar:  node pruebas.mjs
   Extrae el bloque entre los marcadores "LÓGICA PURA" de index.html
   y lo ejecuta en Node sin DOM. Lanza excepción si algo falla. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "index.html"), "utf8");

const marcaIni = html.indexOf("LÓGICA PURA — INICIO");
const marcaFin = html.indexOf("LÓGICA PURA — FIN");
if (marcaIni < 0 || marcaFin < 0) throw new Error("No encuentro los marcadores de LÓGICA PURA en index.html");
const desde = html.indexOf("*/", marcaIni) + 2;
const hasta = html.lastIndexOf("/*", marcaFin);
const codigo = html.slice(desde, hasta);

const L = new Function(codigo + `
return { limitar, hexARgb, rgbAHex, parsearEntradaPaleta, srgbALineal, srgbAOklab,
         prepararPaleta, colorMasCercano, aplicarPaleta, calcularTamanoDestino,
         redimensionarArea, redimensionarVecino, reescalar, recortarAlfa, valorFuente, calcularMascara,
         combinarMascaras, canalAImagen, crc32, crearZip,
         distanciaOklab, colorDeFondo, quitarFondo,
         luminancia, rgbAHsl, hslARgb, ajustarColor, magnitudSobel,
         detectarBordes, mediaVecindad, mezclarBordes, mapaAImagen };`)();

let total = 0;
function asegurar(condicion, mensaje) {
  total++;
  if (!condicion) throw new Error("FALLO: " + mensaje);
}
function iguales(a, b, mensaje) {
  asegurar(JSON.stringify(a) === JSON.stringify(b), `${mensaje} — esperaba ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)}`);
}
function imagen(ancho, alto, pixeles) {
  // pixeles: array de [r,g,b,a] por fila
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  pixeles.forEach((p, i) => datos.set(p, i * 4));
  return { ancho, alto, datos };
}

/* --- limitar / hex --- */
iguales(L.limitar(5, 0, 10), 5, "limitar dentro de rango");
iguales(L.limitar(-3, 0, 10), 0, "limitar por debajo");
iguales(L.limitar(99, 0, 10), 10, "limitar por encima");

iguales(L.hexARgb("#ff0000"), [255, 0, 0], "hex 6 cifras con #");
iguales(L.hexARgb("00ff80"), [0, 255, 128], "hex 6 cifras sin #");
iguales(L.hexARgb("#0f0"), [0, 255, 0], "hex 3 cifras");
iguales(L.hexARgb("zzz"), null, "hex inválido");
iguales(L.rgbAHex([255, 0, 128]), "#ff0080", "rgbAHex");
iguales(L.hexARgb(L.rgbAHex([12, 34, 56])), [12, 34, 56], "ida y vuelta hex↔rgb");

/* --- parsearEntradaPaleta --- */
iguales(L.parsearEntradaPaleta("https://lospec.com/palette-list/resurrect-64"),
  { tipo: "slug", slug: "resurrect-64" }, "URL de Lospec");
iguales(L.parsearEntradaPaleta("https://lospec.com/palette-list/Sweetie-16.json"),
  { tipo: "slug", slug: "sweetie-16" }, "URL con extensión y mayúsculas");
iguales(L.parsearEntradaPaleta("aap-64"), { tipo: "slug", slug: "aap-64" }, "slug suelto");
iguales(L.parsearEntradaPaleta("#000000 #ffffff, ff0000"),
  { tipo: "hex", colores: [[0, 0, 0], [255, 255, 255], [255, 0, 0]] }, "lista de hex");
iguales(L.parsearEntradaPaleta("  "), null, "entrada vacía");
iguales(L.parsearEntradaPaleta("esto no vale $$"), null, "entrada basura");

/* --- OKLab --- */
const blanco = L.srgbAOklab(255, 255, 255);
asegurar(Math.abs(blanco[0] - 1) < 0.001 && Math.abs(blanco[1]) < 0.001 && Math.abs(blanco[2]) < 0.001,
  "OKLab de blanco ≈ [1, 0, 0]");
const negro = L.srgbAOklab(0, 0, 0);
asegurar(Math.abs(negro[0]) < 0.001, "OKLab de negro tiene L ≈ 0");

/* --- colorMasCercano con ambas métricas --- */
const paletaRgb = [[0, 0, 0], [255, 255, 255], [255, 0, 0]];
for (const metrica of ["oklab", "rgb"]) {
  const prep = L.prepararPaleta(paletaRgb, metrica);
  iguales(L.colorMasCercano(250, 10, 10, prep), 2, `rojo casi puro → rojo (${metrica})`);
  iguales(L.colorMasCercano(10, 10, 10, prep), 0, `casi negro → negro (${metrica})`);
  iguales(L.colorMasCercano(240, 240, 240, prep), 1, `casi blanco → blanco (${metrica})`);
}

/* --- aplicarPaleta --- */
const img21 = imagen(2, 1, [[250, 5, 5, 255], [3, 3, 3, 0]]); // rojo + transparente
for (const dithering of ["ninguno", "floyd", "bayer"]) {
  const res = L.aplicarPaleta(img21, paletaRgb, { metrica: "oklab", dithering, intensidad: 100 });
  iguales([res.datos[0], res.datos[1], res.datos[2]], [255, 0, 0], `rojo mapeado a paleta (${dithering})`);
  iguales(res.datos[7], 0, `el píxel transparente sigue transparente (${dithering})`);
}
// Invariante: con cualquier dithering, todos los colores opacos acaban en la paleta
const gris = imagen(4, 4, Array.from({ length: 16 }, () => [128, 128, 128, 255]));
for (const dithering of ["ninguno", "floyd", "bayer"]) {
  const res = L.aplicarPaleta(gris, [[0, 0, 0], [255, 255, 255]], { metrica: "rgb", dithering, intensidad: 100 });
  for (let p = 0; p < res.datos.length; p += 4) {
    const esNegro = res.datos[p] === 0 && res.datos[p + 1] === 0 && res.datos[p + 2] === 0;
    const esBlanco = res.datos[p] === 255 && res.datos[p + 1] === 255 && res.datos[p + 2] === 255;
    asegurar(esNegro || esBlanco, `todos los píxeles pertenecen a la paleta (${dithering})`);
  }
}
// Floyd sobre gris medio con paleta blanco/negro debe mezclar ambos (eso es el dithering)
const fs = L.aplicarPaleta(gris, [[0, 0, 0], [255, 255, 255]], { metrica: "rgb", dithering: "floyd", intensidad: 100 });
const negros = [...Array(16)].filter((_, i) => fs.datos[i * 4] === 0).length;
asegurar(negros > 0 && negros < 16, "Floyd–Steinberg reparte entre negro y blanco");

/* --- calcularTamanoDestino --- */
iguales(L.calcularTamanoDestino(128, 64, 64, 64, true), [64, 32], "proporción: encaja dentro");
iguales(L.calcularTamanoDestino(128, 64, 64, 64, false), [64, 64], "sin proporción: tamaño exacto");
iguales(L.calcularTamanoDestino(1000, 10, 64, 64, true), [64, 1], "proporción extrema no baja de 1 px");

/* --- redimensionarArea --- */
const bn = imagen(2, 1, [[0, 0, 0, 255], [255, 255, 255, 255]]);
const bn1 = L.redimensionarArea(bn, 1, 1);
iguales([bn1.datos[0], bn1.datos[3]], [128, 255], "área: negro+blanco → gris medio opaco");
// Ponderación por alfa: un píxel transparente no debe teñir el color
const conAlfa = imagen(2, 1, [[255, 0, 0, 0], [0, 0, 255, 255]]);
const conAlfa1 = L.redimensionarArea(conAlfa, 1, 1);
iguales([conAlfa1.datos[0], conAlfa1.datos[2], conAlfa1.datos[3]], [0, 255, 128],
  "área: el rojo transparente no tiñe, alfa promediado");

/* --- redimensionarVecino --- */
const damero = imagen(2, 2, [[0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]]);
const damero4 = L.redimensionarVecino(damero, 4, 4);
iguales(damero4.ancho, 4, "vecino: ancho de salida");
iguales([damero4.datos[0], damero4.datos[4]], [0, 0], "vecino: duplica píxeles al ampliar");

/* --- Máscaras (valorFuente / calcularMascara / combinarMascaras / canalAImagen) --- */
const base = imagen(1, 1, [[100, 150, 200, 200]]);
const neutra = { activa: true, fuente: "luminancia", brillo: 0, contraste: 0, invertir: false, umbral: null };

iguales(L.valorFuente(100, 150, 200, "rojo"), 100, "fuente: canal rojo");
iguales(L.valorFuente(100, 150, 200, "verde"), 150, "fuente: canal verde");
iguales(L.valorFuente(100, 150, 200, "azul"), 200, "fuente: canal azul");
iguales(L.valorFuente(100, 150, 200, "maximo"), 200, "fuente: valor máximo");
iguales(L.valorFuente(100, 150, 200, "saturacion"), 100, "fuente: saturación (max - min)");
iguales(Math.round(L.valorFuente(100, 150, 200, "luminancia")), 143, "fuente: luminancia");

const canalNeutro = L.calcularMascara(base, neutra);
iguales(canalNeutro.length, 1, "la máscara guarda un valor por píxel, no cuatro");
iguales(canalNeutro[0], 143, "máscara neutra = luminancia del píxel");

const apagada = L.calcularMascara(base, { ...neutra, activa: false });
iguales(apagada[0], 0, "máscara desactivada: el canal queda a negro");

const brillante = L.calcularMascara(base, { ...neutra, brillo: 100 });
iguales(brillante[0], 255, "brillo +100 satura la máscara a blanco");

const plana = L.calcularMascara(base, { ...neutra, contraste: -100 });
iguales(plana[0], 128, "contraste -100 aplana a gris medio");

const invertida = L.calcularMascara(base, { ...neutra, invertir: true });
iguales(invertida[0], 112, "invertir la máscara (255 - 143)");

const porDebajo = L.calcularMascara(base, { ...neutra, umbral: 128 });
iguales(porDebajo[0], 255, "umbral por debajo del valor: blanco");
const porEncima = L.calcularMascara(base, { ...neutra, umbral: 200 });
iguales(porEncima[0], 0, "umbral por encima del valor: negro");

const soloRojo = L.calcularMascara(base, { ...neutra, fuente: "rojo" });
iguales(soloRojo[0], 100, "la fuente decide de qué parte la máscara");

const dosPixeles = imagen(2, 1, [[0, 0, 0, 255], [255, 255, 255, 255]]);
const canalDos = L.calcularMascara(dosPixeles, neutra);
iguales([canalDos[0], canalDos[1]], [0, 255], "la máscara recorre todos los píxeles");

const mezcla = L.combinarMascaras(base,
  new Uint8ClampedArray([10]), new Uint8ClampedArray([20]), new Uint8ClampedArray([30]));
iguales([...mezcla.datos], [10, 20, 30, 200], "mezcla: R metallic, G smoothness, B emisivo, alfa heredado");
iguales([mezcla.ancho, mezcla.alto], [1, 1], "la mezcla conserva el tamaño");

const canalSuelto = L.canalAImagen(base, new Uint8ClampedArray([77]));
iguales([...canalSuelto.datos], [77, 77, 77, 200], "un canal suelto se ve en grises y mantiene el alfa");

/* ============================================================
   Rejillas de prueba
   "." es transparente y cada letra un color, para que una prueba que falla se
   lea de un vistazo.
   ============================================================ */
const PX = { n: [0, 0, 0], o: [255, 255, 255], r: [255, 0, 0], v: [0, 76, 0] };

function rejilla(filas, mapa) {
  const m = mapa || PX;
  const alto = filas.length, ancho = filas[0].length;
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const ch = filas[y][x];
      if (ch === ".") continue;
      const p = (y * ancho + x) * 4, col = m[ch];
      datos[p] = col[0]; datos[p + 1] = col[1]; datos[p + 2] = col[2]; datos[p + 3] = 255;
    }
  }
  return { ancho, alto, datos };
}

function aFilas(valores, ancho) {
  const filas = [];
  for (let i = 0; i < valores.length; i += ancho) filas.push([...valores.slice(i, i + ancho)]);
  return filas;
}

/* ============================================================
   ReFondo: averiguar cuál es el fondo y quitarlo
   ============================================================ */
const FONDO = { f: [40, 60, 120], s: [220, 40, 40], o: [255, 255, 255],
                c: [45, 65, 125],   // azul casi idéntico al fondo (d ≈ 0.018)
                v: [0, 76, 0] };    // verde: lejísimos en color, casi igual de claro
const SIN_FONDO = { color: null, alcance: "fuera", tolerancia: 0, desvanecer: 0 };

/* --- colorDeFondo: gana el color opaco más repetido del marco --- */
const soloMarco = rejilla([
  "fffffffff",
  "fooooooof",
  "fooooooof",
  "fooooooof",
  "sooooooof",
  "fooooooof",
  "fooooooof",
  "fooooooof",
  "fffffffff",
], FONDO);
iguales(L.colorDeFondo(soloMarco), FONDO.f,
  "solo vota el marco: el blanco es mayoría en la imagen (49 px) y aun así gana el azul del borde");

iguales(L.colorDeFondo(rejilla(["....", ".oo.", ".oo.", "...."])), null,
  "sin un solo píxel opaco en el marco no hay color de fondo que deducir");
iguales(L.colorDeFondo(rejilla(["ffff"], FONDO)), FONDO.f, "una sola fila también tiene marco");

/* --- quitarFondo: qué es "fuera" ---
   El bloque de 2×2 del centro es del MISMO color que el fondo, pero está
   encerrado por el sprite: con alcance "fuera" no se toca. */
const CON_HUECO = [
  "ffffff",
  "fssssf",
  "fsffsf",
  "fsffsf",
  "fssssf",
  "ffffff",
];
const conHueco = rejilla(CON_HUECO, FONDO);
const alfaDe = (img) => [...Array(img.ancho * img.alto)].map((_, i) => img.datos[i * 4 + 3]);

const soloFuera = L.quitarFondo(conHueco, SIN_FONDO);
iguales(soloFuera.color, FONDO.f, "el color sale del marco sin que se lo digan");
iguales(soloFuera.quitados, 20, "se van los 20 px del anillo de fuera");
iguales(soloFuera.imagen.datos[(2 * 6 + 2) * 4 + 3], 255,
  "el hueco encerrado es del color del fondo pero se queda: no se llega a él desde el borde");
iguales([...soloFuera.imagen.datos.slice((1 * 6 + 1) * 4, (1 * 6 + 1) * 4 + 4)], [...FONDO.s, 255],
  "el sprite sale intacto");
iguales([...soloFuera.imagen.datos.slice(0, 4)], [0, 0, 0, 0],
  "un píxel que se va se queda además sin color: nada de arrastrar el fondo dentro del PNG");
iguales([soloFuera.mapa[0], soloFuera.mapa[2 * 6 + 2], soloFuera.mapa[1 * 6 + 1]], [255, 0, 0],
  "el mapa marca en blanco lo quitado y deja a 0 lo que sobrevive");

const todoElColor = L.quitarFondo(conHueco, { ...SIN_FONDO, alcance: "todo" });
iguales(todoElColor.quitados, 24, "con alcance «todo» también caen los 4 px del hueco");
iguales(todoElColor.imagen.datos[(2 * 6 + 2) * 4 + 3], 0, "el hueco encerrado se va");

/* --- Tolerancia: un fondo que no es exactamente el mismo color --- */
const CASI = ["ffcfff", "fssssf", "ffffff"];
const casi = rejilla(CASI, FONDO);
iguales(L.quitarFondo(casi, SIN_FONDO).imagen.datos[2 * 4 + 3], 255,
  "con tolerancia 0 un azul casi igual (d≈0.018) no cuenta como fondo");
iguales(L.quitarFondo(casi, { ...SIN_FONDO, tolerancia: 10 }).imagen.datos[2 * 4 + 3], 0,
  "con tolerancia 10 sí, y el sprite (a d≈0.35 del fondo) sigue lejos");
iguales(alfaDe(L.quitarFondo(casi, { ...SIN_FONDO, tolerancia: 10 }).imagen).slice(7, 11),
  [255, 255, 255, 255], "subir la tolerancia hasta ahí no se come el sprite");

/* --- Color a mano: manda sobre lo que diga el marco --- */
const aMano = L.quitarFondo(conHueco, { ...SIN_FONDO, color: FONDO.s });
iguales([aMano.color, aMano.quitados], [FONDO.s, 0],
  "pedir el color del sprite no quita nada: el sprite no toca el borde, así que no hay por dónde entrar");

/* --- Un sprite pegado al borde no es semilla, así que sobrevive --- */
const PEGADO = ["sfff", "sfff", "sfff"];
const pegado = L.quitarFondo(rejilla(PEGADO, FONDO), SIN_FONDO);
iguales(alfaDe(pegado.imagen), [255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0],
  "la columna de sprite pegada al borde izquierdo se queda entera");

/* --- Desvanecer: el halo pierde alfa en proporción a lo lejos que está ---
   Sobre negro, dos grises a media distancia y un blanco fuera de la franja. */
const rampa = imagen(4, 1, [[0, 0, 0, 255], [40, 40, 40, 255], [80, 80, 80, 255], [255, 255, 255, 255]]);
iguales(alfaDe(L.quitarFondo(rampa, SIN_FONDO).imagen), [0, 255, 255, 255],
  "con desvanecer 0 el corte es seco: solo se va el negro exacto");
const suave = alfaDe(L.quitarFondo(rampa, { ...SIN_FONDO, desvanecer: 100 }).imagen);
iguales([suave[0], suave[3]], [0, 255], "el fondo puro se va del todo y el blanco no se toca");
asegurar(suave[1] > 0 && suave[1] < suave[2] && suave[2] < 255,
  `los grises quedan a medio alfa y en orden (obtuve ${suave[1]} y ${suave[2]})`);

/* --- Sin color de fondo que deducir, la imagen sale tal cual --- */
const nadaQueHacer = L.quitarFondo(rejilla(["....", ".oo.", ".oo.", "...."]), SIN_FONDO);
iguales([nadaQueHacer.color, nadaQueHacer.quitados], [null, 0], "sin marco opaco no se toca nada");

/* --- reescalar: ReSize de una pieza --- */
const paraReducir = rejilla(["oooo", "oooo"], FONDO);
iguales(L.reescalar(paraReducir, { ancho: 4, alto: 2, proporcion: false, metodoResize: "area" }), paraReducir,
  "si el tamaño ya es el pedido, reescalar devuelve la misma imagen sin copiarla");
iguales(L.reescalar(paraReducir, { ancho: 2, alto: 1, proporcion: false, metodoResize: "vecino" }).ancho, 2,
  "y si no, reduce con el método elegido");

/* --- El orden con ReSize importa, y se nota justo en el borde ---
   Un cuadro de 3×3 que NO encaja en la rejilla del reescalado: al reducir 8×8 a
   4×4 quedan bloques mitad sprite mitad fondo, que es donde se ve la diferencia.

     · fondo → resize: el fondo desaparece a resolución completa y es el
       promedio de área quien reparte el alfa. Como ya pondera el color por
       alfa, cada píxel del contorno sale del color EXACTO del sprite y con el
       alfa que le toca: antialias correcto.
     · resize → fondo: el promedio ya ha mezclado sprite y fondo, así que el
       contorno queda de un color intermedio que no es ninguno de los dos —el
       fleco— y encima opaco del todo. */
const OCHO = ["ffffffff", "ffffffff", "ffsssfff", "ffsssfff",
              "ffsssfff", "ffffffff", "ffffffff", "ffffffff"];
const A_CUATRO = { ancho: 4, alto: 4, proporcion: false, metodoResize: "area" };
const original8 = rejilla(OCHO, FONDO);
const fondoAntes = L.reescalar(L.quitarFondo(original8, SIN_FONDO).imagen, A_CUATRO);
const fondoDespues = L.quitarFondo(L.reescalar(original8, A_CUATRO), SIN_FONDO).imagen;

const pixeles = (img) => [...Array(img.ancho * img.alto)].map((_, i) =>
  [...img.datos.slice(i * 4, i * 4 + 4)]);
const esSprite = (p) => p[0] === FONDO.s[0] && p[1] === FONDO.s[1] && p[2] === FONDO.s[2];
const esFondo = (p) => p[0] === FONDO.f[0] && p[1] === FONDO.f[1] && p[2] === FONDO.f[2];

const visiblesAntes = pixeles(fondoAntes).filter((p) => p[3] > 0);
asegurar(visiblesAntes.length > 0 && visiblesAntes.every(esSprite),
  "quitando el fondo primero, todo lo que se ve es del color exacto del sprite: ni un píxel de fleco");
asegurar(visiblesAntes.some((p) => p[3] > 0 && p[3] < 255),
  "y el contorno queda con alfa intermedio, que es el antialias que le toca");

const visiblesDespues = pixeles(fondoDespues).filter((p) => p[3] > 0);
asegurar(visiblesDespues.some((p) => !esSprite(p) && !esFondo(p)),
  "quitándolo después queda fleco: píxeles de un color intermedio que no es ni el sprite ni el fondo");
asegurar(visiblesDespues.every((p) => p[3] === 255),
  "y encima opacos del todo, porque el reescalado ya había fundido los dos colores en uno");

/* --- recortarAlfa: la silueta se decide de una vez --- */
const escalera = imagen(5, 1, [[10, 20, 30, 0], [10, 20, 30, 127], [10, 20, 30, 128],
                               [10, 20, 30, 200], [10, 20, 30, 255]]);
iguales(alfaDe(L.recortarAlfa(escalera, 128)), [0, 0, 255, 255, 255],
  "el umbral corta por >=: 127 se cae y 128 se queda opaco del todo");
iguales(alfaDe(L.recortarAlfa(escalera)), [0, 0, 255, 255, 255],
  "sin umbral usa OPACO_MINIMO, el mismo 128 que ya decide qué es silueta");
iguales(alfaDe(L.recortarAlfa(escalera, 255)), [0, 0, 0, 0, 255],
  "umbral 255: solo sobrevive lo que ya era opaco del todo (silueta al mínimo)");
iguales(alfaDe(L.recortarAlfa(escalera, 0)), [0, 255, 255, 255, 255],
  "el umbral se limita a 1: ni con 0 se vuelve opaco lo que era transparente");
iguales([...L.recortarAlfa(escalera, 128).datos.slice(4, 12)], [0, 0, 0, 0, 10, 20, 30, 255],
  "lo que se cae se va sin color y lo que se queda conserva el suyo");

/* --- La combinación que buscábamos: ReFondo primero + alfa de 1 bit ---
   Quitar el fondo antes deja el contorno del color exacto del sprite (solo le
   falta el alfa entero); el corte se lo da. Al revés no hay corte que valga:
   el fleco ya está pintado en el color, y volverlo opaco solo lo empeora. */
const perfecto = L.recortarAlfa(fondoAntes, 128);
const visiblesPerfecto = pixeles(perfecto).filter((p) => p[3] > 0);
asegurar(pixeles(perfecto).every((p) => p[3] === 0 || p[3] === 255),
  "tras el corte no queda ni una semitransparencia");
asegurar(visiblesPerfecto.length > 0 && visiblesPerfecto.every(esSprite),
  "y todo lo visible sigue siendo del color exacto del sprite: silueta binaria y limpia");

const remendado = L.recortarAlfa(fondoDespues, 128);
asegurar(pixeles(remendado).filter((p) => p[3] > 0).some((p) => !esSprite(p) && !esFondo(p)),
  "en el orden contrario el corte no arregla nada: el fleco sigue ahí, ahora opaco");

/* --- La promesa del paso: quitarlo ANTES cambia lo que ven los siguientes ---
   Con el fondo puesto, a RePalette le llega el lienzo entero y se gasta un
   color de la paleta en algo que no se ve. */
const conFondo = rejilla(["ffff", "fssf", "ffff"], FONDO);
const limpia = L.quitarFondo(conFondo, SIN_FONDO).imagen;
iguales(alfaDe(limpia).filter((a) => a > 0).length, 2,
  "a RePalette solo le llega el sprite: el fondo ya no gasta un color de la paleta");

/* Y un sprite verde sobre fondo azul es un salto de color enorme (d ≈ 0.20)
   pero casi el mismo brillo (60 contra 54): con el fondo puesto, Sobel no ve
   nada. Quitándolo antes, el contorno sale solo de la silueta del alfa. */
const camuflado = rejilla(["ffff", "fvvf", "ffff"], FONDO);
const BORDES_SILUETA = { metodo: "sobel", umbral: 24, silueta: true };
const marcados = (m) => [...m].filter((v) => v > 0).length;
const sinQuitar = L.detectarBordes(camuflado, BORDES_SILUETA);
const yaQuitado = L.detectarBordes(L.quitarFondo(camuflado, { ...SIN_FONDO, tolerancia: 10 }).imagen, BORDES_SILUETA);
asegurar(marcados(sinQuitar) === 0 && marcados(yaQuitado) > 0,
  "sobre el fondo no había borde que ver; sin él, la silueta lo marca sola");

/* ============================================================
   ReVer: el canal de color y el canal de bordes
   ============================================================ */

/* --- HSL: la ida y vuelta tiene que devolver el color exacto --- */
for (const col of [[0, 0, 0], [255, 255, 255], [96, 112, 194], [255, 0, 0], [0, 128, 64], [10, 10, 11]]) {
  const hsl = L.rgbAHsl(col[0], col[1], col[2]);
  iguales(L.hslARgb(hsl[0], hsl[1], hsl[2]), col, `rgb→hsl→rgb devuelve ${col} tal cual`);
}
iguales(L.rgbAHsl(255, 0, 0)[0], 0, "el rojo puro está en el tono 0");
iguales(L.rgbAHsl(128, 128, 128)[1], 0, "un gris no tiene saturación");
iguales(L.hslARgb(0.5, 0, 0.5), [128, 128, 128], "sin saturación sale gris, mire donde mire el tono");
iguales(L.hslARgb(1.25, 1, 0.5), L.hslARgb(0.25, 1, 0.5), "el tono es circular: 1.25 y 0.25 son el mismo");

/* --- ajustarColor: los sliders clásicos --- */
const NEUTRO = { brillo: 0, contraste: 0, saturacion: 0, tono: 0 };
const rojo = imagen(1, 1, [[255, 0, 0, 255]]);
const grisMedio = imagen(1, 1, [[100, 100, 100, 255]]);

iguales([...L.ajustarColor(imagen(1, 1, [[10, 20, 30, 128]]), NEUTRO).datos], [10, 20, 30, 128],
  "todo a cero es la identidad, alfa incluido");
iguales([...L.ajustarColor(grisMedio, { ...NEUTRO, brillo: 20 }).datos], [151, 151, 151, 255], "brillo +20 suma 51");
iguales([...L.ajustarColor(grisMedio, { ...NEUTRO, brillo: 100 }).datos], [255, 255, 255, 255], "brillo +100 satura a blanco");
iguales([...L.ajustarColor(grisMedio, { ...NEUTRO, contraste: 100 }).datos], [0, 0, 0, 255],
  "contraste +100 empuja un gris oscuro al negro");
iguales([...L.ajustarColor(rojo, { ...NEUTRO, saturacion: -100 }).datos], [128, 128, 128, 255],
  "saturación -100 deja el gris de la misma luz");
iguales([...L.ajustarColor(rojo, { ...NEUTRO, tono: 120 }).datos], [0, 255, 0, 255], "tono +120 lleva el rojo al verde");
iguales([...L.ajustarColor(rojo, { ...NEUTRO, tono: -120 }).datos], [0, 0, 255, 255], "tono -120 lo lleva al azul");
iguales([...L.ajustarColor(rojo, { ...NEUTRO, tono: 360 }).datos], [255, 0, 0, 255], "una vuelta entera no cambia nada");
iguales([...L.ajustarColor(imagen(1, 1, [[10, 20, 30, 0]]), { ...NEUTRO, brillo: 100 }).datos], [10, 20, 30, 0],
  "un píxel transparente no se ajusta: no hay color que ajustar");
const ajusteConAlfa = L.ajustarColor(imagen(2, 1, [[10, 20, 30, 77], [200, 100, 50, 255]]), { ...NEUTRO, brillo: 30, tono: 40 });
iguales([ajusteConAlfa.datos[3], ajusteConAlfa.datos[7]], [77, 255], "ajustar el color nunca toca el alfa");

/* --- detectarBordes --- */
const MITADES = ["nnnooo", "nnnooo", "nnnooo", "nnnooo", "nnnooo"];
const mitades = rejilla(MITADES);
const sobel = L.detectarBordes(mitades, { metodo: "sobel", umbral: 0, silueta: false });
iguales(sobel.length, mitades.ancho * mitades.alto, "el mapa de bordes trae un valor por píxel, no cuatro");
iguales(aFilas(sobel, 6)[2], [0, 0, 255, 255, 0, 0], "sobel marca las dos columnas del escalón y nada más");
const lap = L.detectarBordes(mitades, { metodo: "laplaciano", umbral: 0, silueta: false });
asegurar(lap[2 * 6 + 2] > 0 && lap[2 * 6 + 3] > 0, "el laplaciano también encuentra el escalón");
iguales([lap[2 * 6 + 0], lap[2 * 6 + 5]], [0, 0], "y deja liso lo que es liso");
asegurar(lap[2 * 6 + 2] < sobel[2 * 6 + 2], "pero responde menos: por eso es la línea fina");

const liso = rejilla(["oooo", "oooo", "oooo"]);
iguales([...L.detectarBordes(liso, { metodo: "sobel", umbral: 0, silueta: true })].filter(Boolean).length, 0,
  "una imagen lisa que llena el lienzo no tiene ni un borde (ni marco por el recorte)");

const conUmbral = L.detectarBordes(mitades, { metodo: "sobel", umbral: 255, silueta: false });
iguales([...conUmbral].filter((v) => v > 0).length, 6,
  "el umbral corta en seco: en el escalón solo llegan a 255 las tres filas centrales");
iguales([...conUmbral].filter((v) => v > 0 && v !== 255).length, 0,
  "y lo que pasa el corte conserva su fuerza: el umbral no recorta, descarta");

/* Un rojo y un verde de la misma luminancia: el gradiente de luz no los
   distingue y el de color sí. Es justo para lo que está esa opción. */
const mismaLuz = rejilla(["rrvv", "rrvv", "rrvv"]);
iguales([...L.detectarBordes(mismaLuz, { metodo: "sobel", umbral: 0, silueta: false })].filter(Boolean).length, 0,
  "sobel no ve el salto entre dos colores igual de claros");
asegurar(L.detectarBordes(mismaLuz, { metodo: "color", umbral: 0, silueta: false })[1 * 4 + 1] > 200,
  "la diferencia de color sí lo ve");

/* La silueta se mira solo con el alfa: un sprite macizo sobre transparente no
   tiene bordes de color, pero sí contorno. */
const CUADRO = ["......", "......", "..oo..", "..oo..", "......", "......"];
const cuadro = rejilla(CUADRO);
iguales([...L.detectarBordes(cuadro, { metodo: "sobel", umbral: 0, silueta: false })].filter(Boolean).length, 0,
  "sin la silueta, un sprite macizo no tiene ningún borde");
const conSilueta = L.detectarBordes(cuadro, { metodo: "sobel", umbral: 0, silueta: true });
iguales([conSilueta[2 * 6 + 2], conSilueta[3 * 6 + 3]], [255, 255], "con la silueta, el contorno del sprite sí marca");
iguales(conSilueta[0], 0, "y lejos del sprite sigue sin haber nada");

/* --- mezclarBordes --- */
const dosGrises = imagen(2, 1, [[200, 200, 200, 255], [200, 200, 200, 255]]);
const soloElPrimero = new Uint8ClampedArray([255, 0]);
iguales([...L.mezclarBordes(dosGrises, soloElPrimero, { modo: "oscurecer", influencia: 0 }).datos],
  [...dosGrises.datos], "influencia 0 no toca nada");
iguales([...L.mezclarBordes(dosGrises, soloElPrimero, { modo: "oscurecer", influencia: 50 }).datos],
  [100, 100, 100, 255, 200, 200, 200, 255], "oscurecer al 50 % baja a la mitad solo donde hay borde");
iguales([...L.mezclarBordes(dosGrises, soloElPrimero, { modo: "aclarar", influencia: 50 }).datos],
  [228, 228, 228, 255, 200, 200, 200, 255], "aclarar sube la mitad de lo que le queda hasta el blanco");
iguales([...L.mezclarBordes(dosGrises, soloElPrimero, { modo: "oscurecer", influencia: 100 }).datos].slice(0, 4),
  [0, 0, 0, 255], "al 100 % el borde se va al negro");

const transparente = imagen(2, 1, [[200, 200, 200, 0], [200, 200, 200, 255]]);
iguales([...L.mezclarBordes(transparente, new Uint8ClampedArray([255, 255]), { modo: "oscurecer", influencia: 100 }).datos],
  [200, 200, 200, 0, 0, 0, 0, 255], "lo transparente se queda como está: el borde solo pinta dentro del sprite");

/* Realce: aleja cada píxel de la media de su vecindad, así que separa los dos
   lados del borde en vez de pintar una línea encima. */
const escalon = imagen(3, 1, [[100, 100, 100, 255], [160, 160, 160, 255], [160, 160, 160, 255]]);
const bordesEscalon = L.detectarBordes(escalon, { metodo: "sobel", umbral: 0, silueta: false });
const realzado = L.mezclarBordes(escalon, bordesEscalon, { modo: "realce", influencia: 100 });
asegurar(realzado.datos[0] < 100, "el lado oscuro del escalón se oscurece más");
asegurar(realzado.datos[4] > 160, "y el claro se aclara: el contraste local sube");
const media = L.mediaVecindad(escalon);
iguales([media[0], media[3]], [130, 140], "la media 3×3 solo cuenta los píxeles opacos");

/* --- mapaAImagen: el canal de bordes se mira entero --- */
const enGrises = L.mapaAImagen(2, 1, new Uint8ClampedArray([40, 200]));
iguales([...enGrises.datos], [40, 40, 40, 255, 200, 200, 200, 255],
  "el mapa se ve en grises opacos, también donde la imagen era transparente");

/* --- La promesa del paso: acentuar bordes no inventa colores ---
   La mezcla ocurre ANTES de RePalette, así que lo que sale sigue estando en la
   paleta por construcción, por mucho que se fuercen los ajustes. */
const PALETA = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 76, 0]];
const fuente = rejilla(["rrvv", "nnoo", "rvno"]);
const ajustada = L.ajustarColor(fuente, { brillo: 15, contraste: 40, saturacion: 30, tono: 25 });
const bordesFuente = L.detectarBordes(fuente, { metodo: "color", umbral: 16, silueta: true });
const entrada = L.mezclarBordes(ajustada, bordesFuente, { modo: "oscurecer", influencia: 80 });
const palettizada = L.aplicarPaleta(entrada, PALETA, { metrica: "oklab", dithering: "ninguno", intensidad: 100 });
let fuera = 0;
for (let p = 0; p < palettizada.datos.length; p += 4) {
  const dentro = PALETA.some((c) => c[0] === palettizada.datos[p] && c[1] === palettizada.datos[p + 1] &&
                                    c[2] === palettizada.datos[p + 2]);
  if (!dentro) fuera++;
}
iguales(fuera, 0, "tras acentuar los bordes, todos los píxeles siguen siendo de la paleta");
asegurar(entrada.datos.some((v, i) => i % 4 !== 3 && v !== ajustada.datos[i]),
  "y los bordes han cambiado de verdad la imagen que ve RePalette");

/* --- crc32 y crearZip --- */
const bytes123 = new TextEncoder().encode("123456789");
asegurar(L.crc32(bytes123) === 0xCBF43926, "crc32 del vector de prueba estándar");

const contenido = new TextEncoder().encode("hola pixel");
const zip = L.crearZip([{ nombre: "a.txt", datos: contenido }]);
iguales([zip[0], zip[1], zip[2], zip[3]], [0x50, 0x4b, 0x03, 0x04], "cabecera local PK\\x03\\x04");
const tamEsperado = (30 + 5 + contenido.length) + (46 + 5) + 22; // local + central + fin
iguales(zip.length, tamEsperado, "tamaño total del zip (store)");
const finSig = zip.length - 22;
iguales([zip[finSig], zip[finSig + 1], zip[finSig + 2], zip[finSig + 3]], [0x50, 0x4b, 0x05, 0x06], "firma de fin de directorio central");
const crcEsperado = L.crc32(contenido);
const crcEnZip = zip[14] | (zip[15] << 8) | (zip[16] << 16) | ((zip[17] << 24) >>> 0);
asegurar((crcEnZip >>> 0) === crcEsperado, "crc32 escrito en la cabecera local");
const zip2 = L.crearZip([{ nombre: "a.png", datos: contenido }, { nombre: "b.png", datos: bytes123 }]);
iguales(zip2[zip2.length - 12] | (zip2[zip2.length - 11] << 8), 2, "el fin de directorio cuenta 2 archivos");

console.log(`OK — ${total} comprobaciones superadas.`);
