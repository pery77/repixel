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
         redimensionarArea, redimensionarVecino, valorFuente, calcularMascara,
         combinarMascaras, canalAImagen, crc32, crearZip };`)();

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
