// Testes do motor de alertas e da leitura de CSV: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularAchados, semanaDe, wilsonInf } from '../src/engine/alertas.js';
import { mapearColunas, normalizarData, normalizarEstado, prepararLinhas } from '../src/engine/csv.js';

function base() {
  const rows = [];
  let id = 0;
  const add = (n, campos) => {
    for (let i = 0; i < n; i++) rows.push({ id: 'x' + id++, texto: 'texto qualquer', confianca: 0.9, ...campos });
  };
  // 20 produtos normais, 30 avaliações cada, em 6 semanas
  for (let p = 0; p < 20; p++) {
    for (let s = 0; s < 6; s++) {
      const data = `2024-01-${String(1 + s * 7).padStart(2, '0')}`;
      add(4, { produto: 'P' + p, data, estado: 'SP', categoria: 'elogio' });
      add(1, { produto: 'P' + p, data, estado: 'RJ', categoria: 'qualidade' });
    }
  }
  // anúncio: produto com muita "divergente"
  add(10, { produto: 'Cortina', data: '2024-01-08', estado: 'MG', categoria: 'divergente', texto: 'cor diferente da foto' });
  add(10, { produto: 'Cortina', data: '2024-01-08', estado: 'MG', categoria: 'elogio' });
  // lote: pico de defeito numa semana
  for (let s = 0; s < 6; s++) add(8, { produto: 'Fone', data: `2024-01-${String(1 + s * 7).padStart(2, '0')}`, estado: 'SP', categoria: 'elogio' });
  add(8, { produto: 'Fone', data: '2024-01-29', estado: 'SP', categoria: 'defeito', texto: 'chegou sem funcionar' });
  // logística: BA com muito não recebido
  add(12, { produto: 'P1', data: '2024-01-15', estado: 'BA', categoria: 'nao_recebido' });
  add(3, { produto: 'P1', data: '2024-01-15', estado: 'BA', categoria: 'elogio' });
  return rows;
}

test('wilson e semana', () => {
  assert.equal(wilsonInf(0, 0), 0);
  assert.ok(wilsonInf(5, 10) < 0.5 && wilsonInf(5, 10) > 0.2);
  assert.equal(semanaDe('2024-01-03'), '2024-01-01'); // quarta → segunda
  assert.equal(semanaDe('2024-01-07'), '2024-01-01'); // domingo → segunda anterior
});

test('os três alertas aparecem onde foram plantados', () => {
  const a = calcularAchados(base());
  assert.equal(a.anuncio.alertas[0].produto, 'Cortina');
  assert.ok(a.anuncio.alertas[0].termos.some((t) => t.termo.includes('cor')));
  assert.equal(a.lote.alertas[0].produto, 'Fone');
  assert.equal(a.lote.alertas[0].semana, '2024-01-29');
  assert.equal(a.logistica.alertas[0].estado, 'BA');
  assert.ok(a.anuncio.alertas.every((x) => x.produto !== 'P3'));
});

test('fila: urgentes primeiro e sem elogios', () => {
  const a = calcularAchados(base());
  assert.equal(a.fila[0].categoria, 'nao_recebido');
  assert.ok(a.fila.every((f) => f.categoria !== 'elogio'));
  assert.ok(a.fila.every((f) => f.rascunho.length > 40));
});

test('sem produto/data/estado: só fila e panorama', () => {
  const rows = base().map(({ id, texto, categoria, confianca }) => ({ id, texto, categoria, confianca }));
  const a = calcularAchados(rows);
  assert.equal(a.anuncio, null);
  assert.equal(a.lote, null);
  assert.equal(a.logistica, null);
  assert.ok(a.fila.length > 0);
});

test('csv: colunas por sinônimo, datas e estados', () => {
  const c = mapearColunas(['Comentário', 'Nome Produto', 'Data', 'UF']);
  assert.equal(c.texto, 'Comentário');
  assert.equal(c.estado, 'UF');
  assert.equal(normalizarData('05/03/2024'), '2024-03-05');
  assert.equal(normalizarData('2018-01-01 00:11:28'), '2018-01-01');
  assert.equal(normalizarEstado('são paulo'), 'SP');
  assert.equal(normalizarEstado('rj'), 'RJ');
  assert.equal(normalizarEstado('xx'), null);
  const l = prepararLinhas([{ Comentário: 'ok', UF: 'sp' }, { Comentário: '' }], c);
  assert.equal(l.length, 0); // "ok" tem menos de 3 letras e a outra está vazia
  assert.throws(() => prepararLinhas([], {}), /texto/);
});
