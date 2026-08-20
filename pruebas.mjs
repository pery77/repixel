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
         redimensionarArea, redimensionarVecino, aplicarAjustes, crc32, crearZip };`)();

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

/* --- aplicarAjustes --- */
const base = imagen(1, 1, [[100, 150, 200, 200]]);
const sinCambios = L.aplicarAjustes(base, { brillo: 0, contraste: 0, saturacion: 0, grises: false, invertir: false, umbral: null });
iguales([...sinCambios.datos], [100, 150, 200, 200], "ajustes neutros no cambian nada");
const brillante = L.aplicarAjustes(base, { brillo: 100, contraste: 0, saturacion: 0, grises: false, invertir: false, umbral: null });
iguales([brillante.datos[0], brillante.datos[3]], [255, 200], "brillo +100 satura a blanco sin tocar alfa");
const plano = L.aplicarAjustes(base, { brillo: 0, contraste: -100, saturacion: 0, grises: false, invertir: false, umbral: null });
iguales([plano.datos[0], plano.datos[1], plano.datos[2]], [128, 128, 128], "contraste -100 aplana a gris medio");
const grisPuro = L.aplicarAjustes(base, { brillo: 0, contraste: 0, saturacion: 0, grises: true, invertir: false, umbral: null });
asegurar(grisPuro.datos[0] === grisPuro.datos[1] && grisPuro.datos[1] === grisPuro.datos[2], "grises iguala canales");
const invertido = L.aplicarAjustes(base, { brillo: 0, contraste: 0, saturacion: 0, grises: false, invertir: true, umbral: null });
iguales([...invertido.datos].slice(0, 3), [155, 105, 55], "invertir");
const mascara = L.aplicarAjustes(base, { brillo: 0, contraste: 0, saturacion: 0, grises: false, invertir: false, umbral: 128 });
iguales([mascara.datos[0], mascara.datos[1], mascara.datos[2]], [255, 255, 255], "umbral produce blanco o negro puros");
const desaturado = L.aplicarAjustes(base, { brillo: 0, contraste: 0, saturacion: -100, grises: false, invertir: false, umbral: null });
asegurar(desaturado.datos[0] === desaturado.datos[1] && desaturado.datos[1] === desaturado.datos[2], "saturación -100 desatura del todo");

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
