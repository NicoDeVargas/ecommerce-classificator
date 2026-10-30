import { useEffect, useMemo, useRef, useState } from 'react';
import { DownloadSimple, MagnifyingGlass, Target } from '@phosphor-icons/react';
import { AlertasAnuncio, AlertasLogistica, AlertasLote, Panorama } from './componentes/Alertas.jsx';
import { Envio } from './componentes/Envio.jsx';
import { Fila } from './componentes/Fila.jsx';
import { calcularAchados } from './engine/alertas.js';
import { CATEGORIAS, NOME } from './engine/categorias.js';
import { paraCSV } from './engine/csv.js';
import { baixar, mesNome, num } from './formato.js';

const BASE = import.meta.env.BASE_URL;
// Cada seção é uma ação do vendedor; os filtros mostrados dependem do que a seção usa.
const ABAS = [
  { id: 'anuncio', nome: 'Corrigir anúncios', filtros: ['busca', 'departamento'] },
  { id: 'lote', nome: 'Falar com fornecedores', filtros: ['busca', 'departamento'] },
  { id: 'logistica', nome: 'Cobrar entregas', filtros: ['estado'] },
  { id: 'fila', nome: 'Responder clientes', filtros: ['busca', 'categoria', 'estado'] },
  { id: 'panorama', nome: 'Do que falam', filtros: [] },
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
  const totalAlertas = contagem ? (contagem.anuncio || 0) + (contagem.lote || 0) + (contagem.logistica || 0) : 0;
  const atual = ABAS.find((a) => a.id === aba);
  const mostra = (f) => atual.filtros.includes(f);
  const periodo = achados?.meta.inicio && `de ${mesNome(achados.meta.inicio.slice(0, 7))} a ${mesNome(achados.meta.fim.slice(0, 7))}`;

  return (
    <div className="app">
      <header className="topo">
        <a className="marca" href="#modo=demo&aba=anuncio" onClick={() => setModo('demo')}>
          <Target size={22} weight="duotone" aria-hidden="true" />
          Radar de avaliações
        </a>
        <nav className="modos" aria-label="Fonte dos dados">
          <button type="button" className={modo === 'demo' ? 'is-ativo' : ''} onClick={() => setModo('demo')} aria-pressed={modo === 'demo'}>
            Exemplo
          </button>
          <button type="button" className={modo === 'csv' ? 'is-ativo' : ''} onClick={() => setModo('csv')} aria-pressed={modo === 'csv'}>
            Minhas avaliações
          </button>
        </nav>
      </header>

      <main>
        {modo === 'csv' && <Envio key={meu ? meu.achados.meta.fonte + meu.linhas.length : 'novo'} aoClassificar={classificar} estado={estado} />}

        {modo === 'demo' && !demo && (
          <p className="vazio">{demoErro ? `Não foi possível carregar o exemplo (${demoErro}).` : 'Carregando o exemplo…'}</p>
        )}

        {achados && (
          <>
            <section className="resumo" aria-label="Resumo">
              <h1>{num(totalAlertas)} problemas pedem ação.</h1>
              {modo === 'demo' ? (
                <p>
                  {num(achados.meta.total)} avaliações reais da Americanas{periodo ? `, ${periodo}` : ''}.
                </p>
              ) : (
                <p>
                  {achados.meta.fonte}: {num(achados.meta.total)} avaliações classificadas no seu navegador
                  {achados.meta.msPorAvaliacao ? `, ${Math.round(achados.meta.msPorAvaliacao)} ms cada` : ''}.{' '}
                  <button type="button" className="link" onClick={exportarClassificadas}>
                    Baixar classificadas
                  </button>
                </p>
              )}
            </section>

            <div className="mesa">
              <nav className="pauta" aria-label="Ações">
                {ABAS.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`pauta-item pauta-${a.id}` + (aba === a.id ? ' is-ativa' : '')}
                    aria-current={aba === a.id ? 'page' : undefined}
                    onClick={() => setAba(a.id)}
                  >
                    <span>{a.nome}</span>
                    {contagem[a.id] != null && <span className="pauta-n">{num(contagem[a.id])}</span>}
                  </button>
                ))}
              </nav>

              <div className="conteudo">
                {atual.filtros.length > 0 && (
                  <div className="filtros" role="search">
                    {mostra('busca') && (
                      <label className="busca">
                        <MagnifyingGlass size={16} aria-hidden="true" />
                        <input
                          type="search"
                          aria-label="Buscar produto ou trecho"
                          value={filtros.busca}
                          placeholder="Buscar produto ou trecho"
                          onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                        />
                      </label>
                    )}
                    {mostra('departamento') && departamentos.length > 0 && (
                      <select
                        aria-label="Departamento"
                        value={filtros.departamento}
                        onChange={(e) => setFiltros({ ...filtros, departamento: e.target.value })}
                      >
                        <option value="">Todos os departamentos</option>
                        {departamentos.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    )}
                    {mostra('categoria') && (
                      <select aria-label="Motivo" value={filtros.categoria} onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })}>
                        <option value="">Todos os motivos</option>
                        {CATEGORIAS.filter((c) => c !== 'elogio').map((c) => (
                          <option key={c} value={c}>
                            {NOME[c]}
                          </option>
                        ))}
                      </select>
                    )}
                    {mostra('estado') && estados.length > 0 && (
                      <select aria-label="Estado" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
                        <option value="">Todos os estados</option>
                        {estados.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="btn-quieto" onClick={aba === 'fila' ? exportarFila : exportarAlertas}>
                      <DownloadSimple size={16} aria-hidden="true" /> CSV
                    </button>
                  </div>
                )}

                {aba === 'anuncio' && <AlertasAnuncio dados={achados.anuncio} alertas={filtrado.anuncio} />}
                {aba === 'lote' && <AlertasLote dados={achados.lote} alertas={filtrado.lote} />}
                {aba === 'logistica' && (
                  <AlertasLogistica dados={achados.logistica} alertas={filtrado.logistica} estadoFiltro={filtros.estado} />
                )}
                {aba === 'fila' && (
                  <Fila
                    itens={filtrado.fila}
                    respondidas={respondidas}
                    alternar={(id) => {
                      const s = new Set(respondidas);
                      s.has(id) ? s.delete(id) : s.add(id);
                      setRespondidas(s);
                    }}
                  />
                )}
                {aba === 'panorama' && <Panorama achados={achados} />}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="rodape">
        <p>
          Classificação feita por um modelo pequeno (BERTimbau int8) que roda no navegador: nenhuma avaliação sai do seu computador.{' '}
          <a href="https://github.com/NicoDeVargas/ecommerce-classificator">Como foi feito</a>. Dados do exemplo: B2W-Reviews01, CC BY 4.0.
        </p>
      </footer>
    </div>
  );
}
