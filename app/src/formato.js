export const pct = (x, casas = 0) =>
  x == null || Number.isNaN(x) ? '–' : (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas }) + '%';

export const num = (x) => (x == null ? '–' : Math.round(x).toLocaleString('pt-BR'));

export const vezes = (x) => (x == null ? '–' : x.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '×');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dataCurta(iso) {
  if (!iso) return '–';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

export function mesNome(ym) {
  if (!ym) return '–';
  const [a, m] = ym.split('-');
  return `${MESES[+m - 1]}/${a.slice(2)}`;
}

export function diaMes(iso) {
  if (!iso) return '–';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
