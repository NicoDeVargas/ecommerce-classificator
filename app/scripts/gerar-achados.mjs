// Gera os achados da demo a partir da B2W já classificada (ml/rodar_b2w.py),
// com o mesmo motor de alertas que o navegador usa para o CSV do vendedor.
//
//   node scripts/gerar-achados.mjs [entrada.csv]
//
// Saída: public/demo/achados_b2w.json (vai para o git; é o que a demo carrega).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { calcularAchados } from '../src/engine/alertas.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const entrada = process.argv[2] || join(raiz, '..', 'data', 'raw', 'b2w_classificado.csv');
const saida = join(raiz, 'public', 'demo', 'achados_b2w.json');

const t0 = Date.now();
const { data } = Papa.parse(readFileSync(entrada, 'utf8'), { header: true, skipEmptyLines: true });
const linhas = data.map((r, i) => ({
  id: 'b' + i,
  texto: r.texto,
  produto: r.produto || null,
  departamento: r.departamento || null,
  data: r.data || null,
  estado: r.estado || null,
  categoria: r.categoria,
  confianca: Number(r.confianca),
}));
const achados = calcularAchados(linhas, {
  fonte: 'B2W-Reviews01 (Americanas)',
  modelo: 'radar-avaliacoes: BERTimbau base, rótulos do Claude Opus 5.5 + régua, ONNX int8',
});
achados.meta.geradoEm = new Date().toISOString().slice(0, 10);
mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, JSON.stringify(achados));
const kb = (JSON.stringify(achados).length / 1024).toFixed(0);
console.log(
  `${linhas.length} avaliações → anúncio ${achados.anuncio.totalAlertas}, lote ${achados.lote.totalAlertas}, ` +
    `logística ${achados.logistica.totalAlertas}, fila ${achados.fila.length} · ${kb} KB · ${Date.now() - t0} ms`,
);
