import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertasAnuncio, AlertasLogistica, AlertasLote, Panorama } from './componentes/Alertas.jsx';
import { Envio } from './componentes/Envio.jsx';
import { Fila } from './componentes/Fila.jsx';
import { calcularAchados } from './engine/alertas.js';
import { CATEGORIAS, NOME } from './engine/categorias.js';
import { paraCSV } from './engine/csv.js';
import { baixar, dataCurta, num, pct } from './formato.js';

const BASE = import.meta.env.BASE_URL;
const ABAS = [
  { id: 'anuncio', nome: 'Anúncio' },
  { id: 'lote', nome: 'Lote' },
  { id: 'logistica', nome: 'Logística' },
  { id: 'fila', nome: 'Fila de respostas' },
  { id: 'panorama', nome: 'Panorama' },
];

function lerHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  return { modo: h.get('modo') === 'csv' ? 'csv' : 'demo', aba: ABAS.some((a) => a.id === h.get('aba')) ? h.get('aba') : 'anuncio' };
}

export default function App() {
  const inicial = lerHash();
  const [modo, setModo] = useState(inicial.modo);
  const [aba, setAba] = useState(inicial.aba);
  const [demo, setDemo] = useState(null);
  const [demoErro, setDemoErro] = useState(null);
  const [meu, setMeu] = useState(null); // { achados, linhas }
  const [estado, setEstado] = useState(null);
  const [filtros, setFiltros] = useState({ busca: '', departamento: '', estado: '', categoria: '' });
  const [respondidas, setRespondidas] = useState(new Set());
  const worker = useRef(null);

  useEffect(() => {
    history.replaceState(null, '', `#modo=${modo}&aba=${aba}`);
  }, [modo, aba]);

  useEffect(() => {
    fetch(BASE + 'demo/achados_b2w.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setDemo)
      .catch((e) => setDemoErro(e.message));
  }, []);

  const achados = modo === 'demo' ? demo : meu?.achados;

  useEffect(() => {
    setFiltros({ busca: '', departamento: '', estado: '', categoria: '' });
    setRespondidas(new Set());
  }, [achados]);

  const classificar = ({ linhas, nome }) => {
    worker.current?.terminate();
    const w = new Worker(new URL('./classificador.worker.js', import.meta.url), { type: 'module' });
    worker.current = w;
    setEstado({ fase: 'carregando' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'baixando') setEstado({ fase: 'baixando', progresso: m.progresso });
      else if (m.tipo === 'progresso') setEstado({ fase: 'classificando', feitos: m.feitos, total: m.total, ms: m.ms });
      else if (m.tipo === 'erro') setEstado({ fase: 'erro', mensagem: 'Não foi possível classificar: ' + m.mensagem });
      else if (m.tipo === 'resultado') {
        setEstado({ fase: 'alertas' });
        const classificadas = linhas.map((l, i) => ({ ...l, ...m.resultado[i] }));
        const a = calcularAchados(classificadas, { fonte: nome, modelo: 'radar-avaliacoes (int8, no navegador)' });
        a.meta.msPorAvaliacao = m.ms / linhas.length;
        setMeu({ achados: a, linhas: classificadas });
        setEstado(null);
        setAba('anuncio');
        w.terminate();
      }
    };
    w.postMessage({ tipo: 'classificar', textos: linhas.map((l) => l.texto) });
  };

  const filtrado = useMemo(() => {
    if (!achados) return null;
    const b = filtros.busca.trim().toLowerCase();
    const ok = (x) =>
      (!b || (x.produto || '').toLowerCase().includes(b) || (x.texto || '').toLowerCase().includes(b)) &&
      (!filtros.departamento || x.departamento === filtros.departamento);
    return {
      anuncio: achados.anuncio?.alertas.filter(ok) || [],
      lote: achados.lote?.alertas.filter(ok) || [],
      logistica: achados.logistica?.alertas.filter((a) => !filtros.estado || a.estado === filtros.estado) || [],
      fila: achados.fila.filter(
        (x) => ok(x) && (!filtros.estado || x.estado === filtros.estado) && (!filtros.categoria || x.categoria === filtros.categoria),
      ),
    };
  }, [achados, filtros]);

  const departamentos = useMemo(
    () => (achados ? achados.departamentos.map((d) => d.departamento).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')) : []),
    [achados],
  );
  const estados = useMemo(
    () => (achados?.logistica ? achados.logistica.porEstado.map((e) => e.estado).sort() : []),
    [achados],
  );

  const exportarFila = () =>
    baixar(
      'fila-de-respostas.csv',
      paraCSV(filtrado.fila, [
        { titulo: 'categoria', valor: (l) => NOME[l.categoria] },
        { titulo: 'confianca', valor: 'confianca' },
        { titulo: 'data', valor: 'data' },
        { titulo: 'estado', valor: 'estado' },
        { titulo: 'produto', valor: 'produto' },
        { titulo: 'avaliacao', valor: 'texto' },
        { titulo: 'rascunho_resposta', valor: 'rascunho' },
        { titulo: 'respondida', valor: (l) => (respondidas.has(l.id) ? 'sim' : 'nao') },
      ]),
    );

  const exportarAlertas = () => {
    const linhas = [
      ...filtrado.anuncio.map((a) => ({
        tipo: 'anuncio',
        alvo: a.produto,
        quando: '',
        casos: a.casos,
        total: a.total,
        taxa: a.taxa.toFixed(3),
        referencia: a.taxaBase.toFixed(3),
        acao: 'Corrigir o anúncio',
        exemplo: a.provas[0]?.texto,
      })),
      ...filtrado.lote.map((a) => ({
        tipo: 'lote',
        alvo: a.produto,
        quando: 'semana de ' + a.semana,
        casos: a.casos,
        total: a.totalSemana,
        taxa: a.taxa.toFixed(3),
        referencia: a.taxaBase.toFixed(3),
        acao: 'Falar com o fornecedor',
        exemplo: a.provas[0]?.texto,
      })),
      ...filtrado.logistica.map((a) => ({
        tipo: 'logistica',
        alvo: a.estado,
        quando: a.mes,
        casos: a.casos,
        total: a.total,
        taxa: a.taxa.toFixed(3),
        referencia: a.taxaMes.toFixed(3),
        acao: 'Cobrar a transportadora da região',
        exemplo: a.provas[0]?.texto,
      })),
    ];
    const cols = ['tipo', 'alvo', 'quando', 'casos', 'total', 'taxa', 'referencia', 'acao', 'exemplo'].map((c) => ({ titulo: c, valor: c }));
    baixar('alertas.csv', paraCSV(linhas, cols));
  };

  const exportarClassificadas = () =>
    baixar(
      'avaliacoes-classificadas.csv',
      paraCSV(meu.linhas, [
        { titulo: 'texto', valor: 'texto' },
        { titulo: 'produto', valor: 'produto' },
        { titulo: 'data', valor: 'data' },
        { titulo: 'estado', valor: 'estado' },
        { titulo: 'categoria', valor: 'categoria' },
        { titulo: 'categoria_nome', valor: (l) => NOME[l.categoria] },
        { titulo: 'confianca', valor: 'confianca' },
      ]),
    );

  const contagem = achados && {
    anuncio: achados.anuncio?.totalAlertas ?? null,
    lote: achados.lote?.totalAlertas ?? null,
    logistica: achados.logistica?.totalAlertas ?? null,
    fila: achados.fila.length,
  };
  const problemas = achados ? 1 - achados.distribuicao.elogio / achados.meta.total : null;

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2" opacity=".35" />
            <circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" opacity=".6" />
            <path d="M16 16 27 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="22.5" cy="11.6" r="2.4" fill="var(--alerta)" />
          </svg>
          <div>
            <h1>Radar de avaliações</h1>
            <p>Transforma avaliações de clientes em ações: corrigir anúncio, falar com o fornecedor, cobrar a entrega, responder.</p>
          </div>
        </div>
        <nav className="modos" aria-label="Fonte dos dados">
          <button type="button" className={modo === 'demo' ? 'is-ativo' : ''} onClick={() => setModo('demo')} aria-pressed={modo === 'demo'}>
            Demo B2W
          </button>
          <button type="button" className={modo === 'csv' ? 'is-ativo' : ''} onClick={() => setModo('csv')} aria-pressed={modo === 'csv'}>
            Minhas avaliações
          </button>
        </nav>
      </header>

      <main>
        {modo === 'csv' && <Envio aoClassificar={classificar} estado={estado} />}

        {modo === 'demo' && !demo && (
          <div className="vazio">{demoErro ? `Não foi possível carregar a demo (${demoErro}).` : 'Carregando a demo…'}</div>
        )}

        {achados && (
          <>
            <div className="contexto">
              {modo === 'demo' ? (
                <p>
                  <b>Demo:</b> {num(achados.meta.total)} avaliações reais da Americanas (base B2W-Reviews01,{' '}
                  {dataCurta(achados.meta.inicio)} a {dataCurta(achados.meta.fim)}), classificadas pelo modelo deste projeto.
                </p>
              ) : (
                <p>
                  <b>{achados.meta.fonte}:</b> {num(achados.meta.total)} avaliações classificadas no navegador
                  {achados.meta.msPorAvaliacao ? ` (${Math.round(achados.meta.msPorAvaliacao)} ms por avaliação)` : ''}.{' '}
                  <button type="button" className="link" onClick={exportarClassificadas}>
                    Baixar todas classificadas (CSV)
                  </button>
                </p>
              )}
            </div>

            <div className="kpis">
              <div className="kpi">
                <span className="kpi-rotulo">Avaliações</span>
                <span className="kpi-valor">{num(achados.meta.total)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-rotulo">Com algum problema</span>
                <span className="kpi-valor">{pct(problemas)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-rotulo">Alertas de anúncio · lote · logística</span>
                <span className="kpi-valor">
                  {[contagem.anuncio, contagem.lote, contagem.logistica].map((c) => (c == null ? '–' : num(c))).join(' · ')}
                </span>
              </div>
              <div className="kpi">
                <span className="kpi-rotulo">Urgentes na fila</span>
                <span className="kpi-valor">
                  {num(achados.fila.filter((f) => ['nao_recebido', 'defeito', 'atendimento'].includes(f.categoria)).length)}
                </span>
              </div>
            </div>

            <div className="filtros" role="search">
              <label className="campo campo-busca">
                <span className="rotulo-campo">Buscar produto ou texto</span>
                <input
                  type="search"
                  value={filtros.busca}
                  placeholder="ex.: fone, cortina, voltagem"
                  onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                />
              </label>
              {departamentos.length > 0 && (
                <label className="campo">
                  <span className="rotulo-campo">Departamento</span>
                  <select value={filtros.departamento} onChange={(e) => setFiltros({ ...filtros, departamento: e.target.value })}>
                    <option value="">Todos</option>
                    {departamentos.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              {estados.length > 0 && (
                <label className="campo">
                  <span className="rotulo-campo">Estado</span>
                  <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
                    <option value="">Todos</option>
                    {estados.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="campo">
                <span className="rotulo-campo">Categoria (fila)</span>
                <select value={filtros.categoria} onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}>
                  <option value="">Todas</option>
                  {CATEGORIAS.filter((c) => c !== 'elogio').map((c) => (
                    <option key={c} value={c}>
                      {NOME[c]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-sec" onClick={exportarAlertas}>
                Exportar alertas (CSV)
              </button>
            </div>

            <nav className="abas" aria-label="Seções">
              {ABAS.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={aba === a.id ? 'is-ativa' : ''}
                  aria-current={aba === a.id ? 'page' : undefined}
                  onClick={() => setAba(a.id)}
                >
                  {a.nome}
                  {contagem[a.id] != null && <span className="contador">{num(contagem[a.id])}</span>}
                </button>
              ))}
            </nav>

            <div className="conteudo">
              {aba === 'anuncio' && <AlertasAnuncio dados={achados.anuncio} alertas={filtrado.anuncio} />}
              {aba === 'lote' && <AlertasLote dados={achados.lote} alertas={filtrado.lote} />}
              {aba === 'logistica' && (
                <AlertasLogistica dados={achados.logistica} alertas={filtrado.logistica} estadoFiltro={filtros.estado} />
              )}
              {aba === 'fila' && (
                <Fila
                  itens={filtrado.fila}
                  total={achados.fila.length}
                  respondidas={respondidas}
                  alternar={(id) => {
                    const s = new Set(respondidas);
                    s.has(id) ? s.delete(id) : s.add(id);
                    setRespondidas(s);
                  }}
                  exportar={exportarFila}
                />
              )}
              {aba === 'panorama' && <Panorama achados={achados} />}
            </div>
          </>
        )}
      </main>

      <footer className="rodape">
        <p>
          Modelo pequeno (BERTimbau, 110 M parâmetros, int8) treinado com rótulos do Claude Opus 5.5 e medido contra um gabarito humano.
          A classificação roda no navegador; nenhuma avaliação é enviada para servidor.{' '}
          <a href="https://github.com/NicoDeVargas/ecommerce-classificator">Código e avaliação</a>
        </p>
        <p>Dados da demo: B2W-Reviews01 (Americanas), licença CC BY 4.0.</p>
      </footer>
    </div>
  );
}
