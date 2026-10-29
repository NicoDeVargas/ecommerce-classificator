// Leitura do CSV do vendedor: acha as colunas pelo nome e normaliza data e estado.

const SINONIMOS = {
  texto: ['texto', 'avaliacao', 'avaliação', 'comentario', 'comentário', 'review', 'review_text', 'text', 'mensagem', 'opiniao', 'opinião'],
  titulo: ['titulo', 'título', 'review_title', 'title'],
  produto: ['produto', 'product', 'product_name', 'nome_produto', 'sku', 'anuncio', 'anúncio', 'item'],
  departamento: ['departamento', 'categoria_produto', 'site_category_lv1', 'department', 'secao', 'seção'],
  data: ['data', 'date', 'submission_date', 'data_avaliacao', 'data_avaliação', 'criado_em', 'created_at'],
  estado: ['estado', 'uf', 'reviewer_state', 'state'],
};

const UFS = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF',
  'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const SIGLAS = new Set(Object.values(UFS));

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function mapearColunas(cabecalho) {
  const norm = cabecalho.map((c) => semAcento(c).replace(/\s+/g, '_'));
  const out = {};
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    const alvo = nomes.map((n) => semAcento(n).replace(/\s+/g, '_'));
    const i = norm.findIndex((c) => alvo.includes(c));
    if (i >= 0) out[campo] = cabecalho[i];
  }
  return out;
}

export function normalizarEstado(v) {
  if (!v) return null;
  const s = semAcento(v);
  if (SIGLAS.has(s.toUpperCase())) return s.toUpperCase();
  return UFS[s] || null;
}

export function normalizarData(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Recebe as linhas do Papa.parse (header: true) e devolve linhas prontas para classificar.
export function prepararLinhas(linhas, colunas) {
  if (!colunas.texto) throw new Error('O CSV precisa de uma coluna "texto" com as avaliações.');
  const out = [];
  linhas.forEach((l, i) => {
    const corpo = String(l[colunas.texto] ?? '').trim();
    const titulo = colunas.titulo ? String(l[colunas.titulo] ?? '').trim() : '';
    const texto = [titulo, corpo].filter(Boolean).join('. ');
    if (texto.length < 3) return;
    out.push({
      id: `l${i + 2}`,
      texto,
      produto: colunas.produto ? String(l[colunas.produto] ?? '').trim() || null : null,
      departamento: colunas.departamento ? String(l[colunas.departamento] ?? '').trim() || null : null,
      data: colunas.data ? normalizarData(l[colunas.data]) : null,
      estado: colunas.estado ? normalizarEstado(l[colunas.estado]) : null,
    });
  });
  return out;
}

function celula(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function paraCSV(linhas, colunas) {
  const cab = colunas.map((c) => c.titulo).join(',');
  const corpo = linhas.map((l) => colunas.map((c) => celula(typeof c.valor === 'function' ? c.valor(l) : l[c.valor])).join(','));
  // BOM para o Excel abrir acentos corretamente
  return '﻿' + [cab, ...corpo].join('\r\n');
}
