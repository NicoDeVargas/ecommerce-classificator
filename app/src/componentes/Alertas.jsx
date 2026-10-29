import { NOME } from '../engine/categorias.js';
import { dataCurta, diaMes, mesNome, num, pct, vezes } from '../formato.js';
import { BarrasH, Grade, Semanas } from './Graficos.jsx';

function Provas({ provas }) {
  if (!provas?.length) return null;
  return (
    <div className="provas">
      <div className="provas-titulo">O que os clientes escreveram</div>
      {provas.map((p, i) => (
        <blockquote key={i}>
          <p>“{p.texto}”</p>
          <footer>
            {[p.data && dataCurta(p.data), p.estado].filter(Boolean).join(' · ')}
            {p.confianca != null && <span className="conf"> · confiança {pct(p.confianca)}</span>}
          </footer>
        </blockquote>
      ))}
    </div>
  );
}

function Termos({ termos }) {
  if (!termos?.length) return null;
  return (
    <div className="termos" aria-label="Termos que se repetem">
      {termos.map((t) => (
        <span className="chip" key={t.termo}>
          {t.termo} <b>{t.n}</b>
        </span>
      ))}
    </div>
  );
}

function Vazio({ children }) {
  return <div className="vazio">{children}</div>;
}

export function AlertasAnuncio({ dados, alertas }) {
  if (!dados) return <Vazio>Para este alerta, o CSV precisa da coluna <b>produto</b>.</Vazio>;
  return (
    <section aria-labelledby="t-anuncio">
      <header className="secao-cab">
        <div>
          <h2 id="t-anuncio">Anúncios a corrigir</h2>
          <p className="secao-sub">
            Produtos em que “não é como anunciado” aparece bem acima da média ({pct(dados.taxaBase, 1)} das avaliações).
            {dados.totalAlertas > alertas.length && ` Mostrando ${alertas.length} de ${dados.totalAlertas}.`}
          </p>
        </div>
      </header>
      {!alertas.length && <Vazio>Nenhum produto com concentração anormal de “diferente do anúncio”.</Vazio>}
      <div className="cartoes">
        {alertas.map((a) => (
          <article className="cartao" key={a.produto}>
            <div className="cartao-topo">
              <span className="selo selo-anuncio">
                <IconeAlerta /> Anúncio
              </span>
              {a.departamento && <span className="depto">{a.departamento}</span>}
            </div>
            <h3>{a.produto}</h3>
            <p className="fato">
              <b>{num(a.casos)}</b> de {num(a.total)} avaliações dizem que veio diferente do anunciado:{' '}
              <b>{pct(a.taxa)}</b>, {vezes(a.vezes)} a média.
            </p>
            <Termos termos={a.termos} />
            <Provas provas={a.provas} />
            <p className="acao">
              <b>Ação:</b> revise título, fotos e especificações (medidas, cor, voltagem, itens inclusos) e corrija o anúncio.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AlertasLote({ dados, alertas }) {
  if (!dados) return <Vazio>Para este alerta, o CSV precisa das colunas <b>produto</b> e <b>data</b>.</Vazio>;
  return (
    <section aria-labelledby="t-lote">
      <header className="secao-cab">
        <div>
          <h2 id="t-lote">Possíveis lotes com problema</h2>
          <p className="secao-sub">
            Semanas em que defeito e qualidade de um produto dispararam acima do próprio histórico dele.
            {dados.totalAlertas > alertas.length && ` Mostrando ${alertas.length} de ${dados.totalAlertas}.`}
          </p>
        </div>
      </header>
      {!alertas.length && <Vazio>Nenhum pico de defeito ou qualidade fora do normal.</Vazio>}
      <div className="cartoes">
        {alertas.map((a) => (
          <article className="cartao" key={a.produto}>
            <div className="cartao-topo">
              <span className="selo selo-lote">
                <IconeAlerta /> Lote
              </span>
              {a.departamento && <span className="depto">{a.departamento}</span>}
            </div>
            <h3>{a.produto}</h3>
            <p className="fato">
              Semana de <b>{diaMes(a.semana)}</b>: <b>{num(a.casos)}</b> reclamações de defeito ou qualidade em {num(a.totalSemana)}{' '}
              avaliações (<b>{pct(a.taxa)}</b>), contra {pct(a.taxaBase)} nas outras semanas.
              {a.defeito > 0 && ` ${num(a.defeito)} chegaram com defeito.`}
            </p>
            <Semanas serie={a.serie} destaque={a.semana} rotuloCasos="defeito + qualidade" altura={90} />
            <Termos termos={a.termos} />
            <Provas provas={a.provas} />
            <p className="acao">
              <b>Ação:</b> fale com o fornecedor sobre os pedidos dessa semana e confira o estoque antes de seguir vendendo.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AlertasLogistica({ dados, alertas, estadoFiltro }) {
  if (!dados) return <Vazio>Para este alerta, o CSV precisa da coluna <b>estado</b> ou <b>data</b>.</Vazio>;
  const estados = dados.porEstado.filter((e) => e.total >= (dados.porEstado.length > 10 ? 50 : 1));
  const meses = dados.meses;
  const idx = new Map(dados.grade.map((g) => [g.estado + '|' + g.mes, g]));
  const emAlerta = new Set(dados.alertas.map((a) => a.estado + '|' + a.mes));
  const linhasGrade = estados.slice(0, 27).map((e) => e.estado);
  return (
    <section aria-labelledby="t-log">
      <header className="secao-cab">
        <div>
          <h2 id="t-log">Entrega: onde e quando</h2>
          <p className="secao-sub">
            “Não recebido” + “atraso”. Média geral: {pct(dados.taxaNacional, 1)} das avaliações.
          </p>
        </div>
      </header>
      {dados.alertas.length > 0 && (
        <div className="cartoes cartoes-compactos">
          {alertas.map((a) => (
            <article className="cartao" key={a.estado + a.mes}>
              <div className="cartao-topo">
                <span className="selo selo-log">
                  <IconeAlerta /> Logística
                </span>
              </div>
              <h3>
                {a.estado} · {mesNome(a.mes)}
              </h3>
              <p className="fato">
                <b>{pct(a.taxa, 1)}</b> das avaliações falam de entrega ({num(a.casos)} de {num(a.total)}), {vezes(a.vezes)} a média do
                mês. {num(a.nao_recebido)} ainda não tinham recebido.
              </p>
              <Provas provas={a.provas.slice(0, 2)} />
              <p className="acao">
                <b>Ação:</b> cobre a transportadora da região e avise os clientes com pedido em aberto antes que reclamem.
              </p>
            </article>
          ))}
        </div>
      )}
      {!dados.alertas.length && <Vazio>Nenhum estado com problema de entrega fora do normal no período.</Vazio>}
      <div className="paineis">
        {estados.length > 0 && (
          <div className="painel">
            <h3 className="painel-titulo">Taxa por estado</h3>
            <BarrasH
              itens={estados.slice(0, 12).map((e) => ({
                rotulo: e.estado,
                valor: e.taxa,
                extra: `(${num(e.casos)})`,
                dica: `${e.estado}: ${num(e.casos)} de ${num(e.total)} avaliações`,
              }))}
              destaque={(i) => i.rotulo === estadoFiltro}
              referencia={dados.taxaNacional}
              rotuloReferencia={`média geral ${pct(dados.taxaNacional, 1)}`}
              formatar={(v) => pct(v, 1)}
            />
          </div>
        )}
        {dados.porSemana.length > 1 && (
          <div className="painel">
            <h3 className="painel-titulo">Por semana</h3>
            <Semanas serie={dados.porSemana} rotuloCasos="entrega" />
          </div>
        )}
      </div>
      {meses.length > 0 && linhasGrade.length > 0 && (
        <div className="painel">
          <h3 className="painel-titulo">Estado × mês</h3>
          <p className="painel-nota">Contorno = alerta (bem acima da média do mês, com volume suficiente).</p>
          <Grade
            linhas={linhasGrade}
            colunas={meses}
            valor={(l, c) => idx.get(l + '|' + c)}
            rotuloColuna={mesNome}
            alerta={(l, c) => emAlerta.has(l + '|' + c)}
          />
        </div>
      )}
    </section>
  );
}

export function Panorama({ achados }) {
  const total = achados.meta.total;
  const itens = Object.entries(achados.distribuicao)
    .map(([k, v]) => ({ rotulo: NOME[k], valor: v / total, extra: `(${num(v)})` }))
    .sort((a, b) => b.valor - a.valor);
  const deptos = achados.departamentos.filter((d) => d.total >= (total > 20000 ? 500 : 1)).slice(0, 12);
  return (
    <section aria-labelledby="t-pan">
      <header className="secao-cab">
        <div>
          <h2 id="t-pan">Panorama</h2>
          <p className="secao-sub">Do que as avaliações falam, segundo o modelo.</p>
        </div>
      </header>
      <div className="paineis">
        <div className="painel">
          <h3 className="painel-titulo">Categorias</h3>
          <BarrasH itens={itens} formatar={(v) => pct(v, 1)} />
        </div>
        {deptos.length > 0 && (
          <div className="painel">
            <h3 className="painel-titulo">Avaliações com problema, por departamento</h3>
            <BarrasH
              itens={deptos
                .map((d) => ({
                  rotulo: d.departamento,
                  valor: 1 - d.elogio / d.total,
                  extra: `(${num(d.total)})`,
                }))
                .sort((a, b) => b.valor - a.valor)}
              formatar={(v) => pct(v)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function IconeAlerta() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 6v4M8 11.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
