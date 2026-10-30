// Motor de alertas: recebe avaliações já classificadas e devolve os achados.
// É o mesmo código no navegador (CSV do vendedor) e no Node (achados pré-calculados da B2W),
// para a demo mostrar exatamente o que o app calcularia.
//
// Linha de entrada: { id, texto, produto?, departamento?, data? (AAAA-MM-DD), estado? (UF),
//                     categoria, confianca }

import { CATEGORIAS, PRIORIDADE, rascunho } from './categorias.js';

const PROBLEMA_LOTE = new Set(['defeito', 'qualidade']);
const PROBLEMA_LOGISTICA = new Set(['nao_recebido', 'atraso']);

// Limiares. Bases pequenas (CSV de uma loja) usam mínimos menores que a base da B2W.
export function parametrosPara(n) {
  const grande = n >= 20000;
  return {
    anuncio: { minAvaliacoes: grande ? 20 : 5, minCasos: grande ? 5 : 2, lift: 2 },
    lote: { minCasosSemana: grande ? 4 : 2, minHistorico: grande ? 10 : 3, z: 3, lift: 2 },
    logistica: { minAvaliacoesMes: grande ? 100 : 10, minCasos: grande ? 8 : 2, lift: 1.5 },
    fila: { maxPorCategoria: grande ? 60 : 5000 },
    maxAlertas: 20,
  };
}

// Limite inferior de Wilson (unilateral, ~95%): a taxa "pelo menos isso" dado o tamanho da amostra.
export function wilsonInf(k, n, z = 1.645) {
  if (!n) return 0;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (c - m) / d);
}

// Segunda-feira da semana (AAAA-MM-DD), em UTC para não depender do fuso.
export function semanaDe(data) {
  const d = new Date(data + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

const STOP = new Set(
  (
    'a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem que se nao não ' +
    'e é ou mas mais muito muita pouco ja já foi ser ter tem tinha estava esta está estou era são sao ' +
    'eu ele ela eles elas meu minha meus minhas seu sua seus suas isso esse essa este esta aquele ' +
    'como quando onde porque pois tambem também so só ainda ate até sobre entre depois antes ' +
    'produto produtos compra comprei comprado veio chegou recebi pedido loja americanas site ' +
    'bom boa ruim otimo ótimo pessimo péssimo recomendo nada tudo todo toda bem mal vez dia dias ' +
    'qual quais isso aqui ali lá la fiz faz fazer pode posso deu dar vem vou vai ficou fica'
  ).split(/\s+/),
);

function palavras(texto) {
  return (
    String(texto)
      .toLowerCase()
      .normalize('NFC')
      .match(/[a-záàâãéêíóôõúüç0-9]+/g) || []
  );
}

// Termos que mais se repetem nas reclamações de um produto (fora palavras vazias e o nome do produto).
function termosFrequentes(textos, produto, max = 5) {
  const doNome = new Set(palavras(produto || ''));
  const conta = new Map();
  for (const t of textos) {
    const ws = palavras(t).filter((w) => w.length >= 3 && !STOP.has(w) && !doNome.has(w));
    const vistos = new Set();
    for (let i = 0; i < ws.length; i++) {
      vistos.add(ws[i]);
      if (i + 1 < ws.length) vistos.add(ws[i] + ' ' + ws[i + 1]);
    }
    for (const v of vistos) conta.set(v, (conta.get(v) || 0) + 1);
  }
  const min = Math.max(2, Math.ceil(textos.length * 0.15));
  const cand = [...conta.entries()].filter(([, c]) => c >= min);
  // bigrama ganha da palavra solta quando aparece quase tanto quanto ela
  cand.sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length);
  const out = [];
  for (const [t, c] of cand) {
    if (out.some((o) => o.termo.includes(t) || t.includes(o.termo))) continue;
    out.push({ termo: t, n: c });
    if (out.length >= max) break;
  }
  return out;
}

function prova(r, max = 320) {
  const t = String(r.texto || '');
  return {
    texto: t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t,
    data: r.data || null,
    estado: r.estado || null,
    confianca: r.confianca,
  };
}

function melhoresProvas(rows, n = 3) {
  const vistos = new Set();
  return [...rows]
    .sort((a, b) => b.confianca - a.confianca || String(b.data).localeCompare(String(a.data)))
    .filter((r) => {
      // a mesma avaliação às vezes aparece duplicada na base: mostra uma vez só
      const k = String(r.texto).trim().toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, n)
    .map((r) => prova(r));
}

function agrupar(rows, chave) {
  const m = new Map();
  for (const r of rows) {
    const k = chave(r);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

function contar(rows) {
  const c = Object.fromEntries(CATEGORIAS.map((k) => [k, 0]));
  for (const r of rows) c[r.categoria] = (c[r.categoria] || 0) + 1;
  return c;
}

function moda(vals) {
  const m = new Map();
  for (const v of vals) if (v) m.set(v, (m.get(v) || 0) + 1);
  let best = null;
  let bn = 0;
  for (const [k, n] of m) if (n > bn) [best, bn] = [k, n];
  return best;
}

// 1. Anúncio: produtos com concentração anormal de "divergente".
function alertasAnuncio(rows, P) {
  const base = rows.filter((r) => r.categoria === 'divergente').length / rows.length;
  const porProduto = agrupar(rows, (r) => r.produto);
  const out = [];
  for (const [produto, rs] of porProduto) {
    if (rs.length < P.minAvaliacoes) continue;
    const div = rs.filter((r) => r.categoria === 'divergente');
    if (div.length < P.minCasos) continue;
    const taxa = div.length / rs.length;
    const inf = wilsonInf(div.length, rs.length);
    if (inf <= base * P.lift) continue;
    out.push({
      produto,
      departamento: moda(rs.map((r) => r.departamento)),
      total: rs.length,
      casos: div.length,
      taxa,
      taxaBase: base,
      vezes: taxa / base,
      excesso: div.length - rs.length * base,
      termos: termosFrequentes(div.map((r) => r.texto), produto),
      provas: melhoresProvas(div),
    });
  }
  out.sort((a, b) => b.excesso - a.excesso);
  return { taxaBase: base, alertas: out };
}

// 2. Lote: semana em que defeito + qualidade de um produto disparam acima do histórico dele.
function alertasLote(rows, P) {
  const comData = rows.filter((r) => r.data && semanaDe(r.data));
  if (!comData.length) return { taxaBase: null, alertas: [] };
  const pg = comData.filter((r) => PROBLEMA_LOTE.has(r.categoria)).length / comData.length;
  const out = [];
  for (const [produto, rs] of agrupar(comData, (r) => r.produto)) {
    const sem = agrupar(rs, (r) => semanaDe(r.data));
    if (sem.size < 2) continue;
    const N = rs.length;
    const K = rs.filter((r) => PROBLEMA_LOTE.has(r.categoria)).length;
    let melhor = null;
    for (const [semana, ws] of sem) {
      const k = ws.filter((r) => PROBLEMA_LOTE.has(r.categoria)).length;
      const n = ws.length;
      if (k < P.minCasosSemana || N - n < P.minHistorico) continue;
      // taxa no resto do histórico do produto, puxada para a média geral com 10 avaliações fictícias
      const po = (K - k + pg * 10) / (N - n + 10);
      const z = (k - n * po) / Math.sqrt(Math.max(n * po * (1 - po), 1e-9));
      if (z < P.z || k / n < po * P.lift) continue;
      const exc = k - n * po;
      if (!melhor || exc > melhor.excesso) melhor = { semana, n, k, po, z, excesso: exc, ws };
    }
    if (!melhor) continue;
    const serie = [...sem.entries()]
      .map(([s, ws]) => ({ semana: s, total: ws.length, casos: ws.filter((r) => PROBLEMA_LOTE.has(r.categoria)).length }))
      .sort((a, b) => a.semana.localeCompare(b.semana));
    const casosSemana = melhor.ws.filter((r) => PROBLEMA_LOTE.has(r.categoria));
    out.push({
      produto,
      departamento: moda(rs.map((r) => r.departamento)),
      semana: melhor.semana,
      totalSemana: melhor.n,
      casos: melhor.k,
      defeito: casosSemana.filter((r) => r.categoria === 'defeito').length,
      qualidade: casosSemana.filter((r) => r.categoria === 'qualidade').length,
      taxa: melhor.k / melhor.n,
      taxaBase: melhor.po,
      z: melhor.z,
      excesso: melhor.excesso,
      totalProduto: N,
      serie,
      termos: termosFrequentes(casosSemana.map((r) => r.texto), produto),
      provas: melhoresProvas(casosSemana),
    });
  }
  // ordem: excesso sobre o histórico, com "chegou com defeito" pesando o dobro (é o sinal mais claro de lote)
  out.sort((a, b) => b.excesso + b.defeito - (a.excesso + a.defeito));
  return { taxaBase: pg, alertas: out };
}

// 3. Logística: não recebido + atraso por estado e por mês.
function alertasLogistica(rows, P) {
  const eh = (r) => PROBLEMA_LOGISTICA.has(r.categoria);
  const nacional = rows.filter(eh).length / rows.length;
  const comData = rows.filter((r) => r.data && semanaDe(r.data));
  const porSemana = [...agrupar(comData, (r) => semanaDe(r.data)).entries()]
    .map(([semana, rs]) => ({
      semana,
      total: rs.length,
      casos: rs.filter(eh).length,
      nao_recebido: rs.filter((r) => r.categoria === 'nao_recebido').length,
      atraso: rs.filter((r) => r.categoria === 'atraso').length,
    }))
    .sort((a, b) => a.semana.localeCompare(b.semana));
  const comEstado = rows.filter((r) => r.estado);
  const porEstado = [...agrupar(comEstado, (r) => r.estado).entries()]
    .map(([estado, rs]) => {
      const k = rs.filter(eh).length;
      return {
        estado,
        total: rs.length,
        casos: k,
        nao_recebido: rs.filter((r) => r.categoria === 'nao_recebido').length,
        atraso: rs.filter((r) => r.categoria === 'atraso').length,
        taxa: k / rs.length,
        inf: wilsonInf(k, rs.length),
      };
    })
    .sort((a, b) => b.taxa - a.taxa);
  const meses = [...new Set(comData.map((r) => r.data.slice(0, 7)))].sort();
  const doMes = Object.fromEntries(
    meses.map((m) => {
      const rs = comData.filter((r) => r.data.startsWith(m));
      return [m, { n: rs.length, k: rs.filter(eh).length }];
    }),
  );
  const taxaMes = Object.fromEntries(meses.map((m) => [m, doMes[m].k / doMes[m].n]));
  const alertas = [];
  const grade = [];
  for (const [chave, rs] of agrupar(
    comData.filter((r) => r.estado),
    (r) => r.estado + '|' + r.data.slice(0, 7),
  )) {
    const [estado, mes] = chave.split('|');
    const k = rs.filter(eh).length;
    grade.push({ estado, mes, total: rs.length, casos: k, taxa: k / rs.length });
    if (rs.length < P.minAvaliacoesMes || k < P.minCasos) continue;
    const inf = wilsonInf(k, rs.length);
    // referência: os outros estados no mesmo mês (sem contar o próprio estado)
    const outrosN = doMes[mes].n - rs.length;
    if (outrosN < P.minAvaliacoesMes) continue;
    const ref = Math.max((doMes[mes].k - k) / outrosN, 0.005);
    if (inf <= ref * P.lift) continue;
    alertas.push({
      estado,
      mes,
      total: rs.length,
      casos: k,
      nao_recebido: rs.filter((r) => r.categoria === 'nao_recebido').length,
      atraso: rs.filter((r) => r.categoria === 'atraso').length,
      taxa: k / rs.length,
      taxaMes: ref,
      vezes: k / rs.length / ref,
      excesso: k - rs.length * ref,
      provas: melhoresProvas(rs.filter(eh)),
    });
  }
  alertas.sort((a, b) => b.excesso - a.excesso);
  return { taxaNacional: nacional, taxaMes, meses, porSemana, porEstado, grade, alertas };
}

// 4. Fila de respostas: urgentes primeiro, mais recentes antes, com rascunho por categoria.
function filaRespostas(rows, P) {
  const usados = {};
  return rows
    .filter((r) => PRIORIDADE[r.categoria])
    .sort(
      (a, b) =>
        PRIORIDADE[a.categoria] - PRIORIDADE[b.categoria] ||
        String(b.data || '').localeCompare(String(a.data || '')) ||
        b.confianca - a.confianca,
    )
    .filter((r) => (usados[r.categoria] = (usados[r.categoria] || 0) + 1) <= P.maxPorCategoria)
    .map((r) => ({
      id: r.id,
      texto: r.texto,
      produto: r.produto || null,
      departamento: r.departamento || null,
      data: r.data || null,
      estado: r.estado || null,
      categoria: r.categoria,
      confianca: r.confianca,
      revisar: r.confianca < 0.6,
      rascunho: rascunho(r.categoria, r.produto),
    }));
}

export function calcularAchados(rows, { fonte = 'csv', modelo = null, parametros = null } = {}) {
  const P = parametros || parametrosPara(rows.length);
  const temProduto = rows.some((r) => r.produto);
  const temData = rows.some((r) => r.data);
  const temEstado = rows.some((r) => r.estado);
  const datas = rows.map((r) => r.data).filter(Boolean).sort();
  const distribuicao = contar(rows);
  const deptos = [...agrupar(rows, (r) => r.departamento).entries()]
    .map(([departamento, rs]) => ({ departamento, total: rs.length, ...contar(rs) }))
    .sort((a, b) => b.total - a.total);
  const anuncio = temProduto ? alertasAnuncio(rows, P.anuncio) : null;
  const lote = temProduto && temData ? alertasLote(rows, P.lote) : null;
  const logistica = temData || temEstado ? alertasLogistica(rows, P.logistica) : null;
  return {
    meta: {
      fonte,
      modelo,
      total: rows.length,
      produtos: temProduto ? new Set(rows.map((r) => r.produto).filter(Boolean)).size : 0,
      inicio: datas[0] || null,
      fim: datas[datas.length - 1] || null,
      colunas: { produto: temProduto, data: temData, estado: temEstado },
      parametros: P,
    },
    distribuicao,
    departamentos: deptos,
    anuncio: anuncio && { ...anuncio, totalAlertas: anuncio.alertas.length, alertas: anuncio.alertas.slice(0, P.maxAlertas) },
    lote: lote && { ...lote, totalAlertas: lote.alertas.length, alertas: lote.alertas.slice(0, P.maxAlertas) },
    logistica: logistica && { ...logistica, totalAlertas: logistica.alertas.length, alertas: logistica.alertas.slice(0, P.maxAlertas) },
    fila: filaRespostas(rows, P.fila),
  };
}
