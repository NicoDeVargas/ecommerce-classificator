import { NOME } from '../engine/categorias.js';
import { dataCurta, diaMes, mesNome, num, pct, vezes } from '../formato.js';
import { BarrasH, Grade, Semanas } from './Graficos.jsx';

// A frase do cliente é a prova principal do alerta; as outras ficam recolhidas.
function Citacao({ prova }) {
  if (!prova) return null;
  return (
    <blockquote className="citacao">
      <p>{prova.texto}</p>
      <cite>{[prova.estado, prova.data && dataCurta(prova.data)].filter(Boolean).join(', ')}</cite>
    </blockquote>
  );
}

function Mais({ provas, termos, children }) {
  const resto = provas?.slice(1) || [];
  if (!resto.length && !termos?.length && !children) return null;
  const partes = resto.length ? `+${resto.length} ${resto.length === 1 ? 'comentário' : 'comentários'}` : 'Palavras que se repetem';
  return (
    <details className="mais">
      <summary>{children ? 'Semana a semana' : partes}</summary>
      {children}
      {termos?.length > 0 && (
        <p className="termos">
          {termos.map((t) => (
            <span key={t.termo}>
              {t.termo} <small>{t.n}</small>
            </span>
          ))}
        </p>
      )}
      {resto.map((p, i) => (
        <Citacao key={i} prova={p} />
      ))}
    </details>
  );
}

function Cabecalho({ titulo, children }) {
  return (
    <header className="secao-cab">
      <h2 className="so-leitor">{titulo}</h2>
      <p>{children}</p>
    </header>
  );
}

function Vazio({ children }) {
  return <p className="vazio">{children}</p>;
}

export function AlertasAnuncio({ dados, alertas }) {
  if (!dados) return <Vazio>Para achar anúncios a corrigir, o CSV precisa da coluna produto.</Vazio>;
  return (
    <section className="secao secao-anuncio">
      <Cabecalho titulo="Corrigir anúncios">
        Muitos clientes dizem que veio diferente do anunciado. Revise título, fotos e especificações.
      </Cabecalho>
      {!alertas.length && <Vazio>Nenhum produto com reclamação fora do normal de “diferente do anúncio”.</Vazio>}
      <ol className="itens">
        {alertas.map((a) => (
          <li className="item" key={a.produto}>
            <h3>{a.produto}</h3>
            <p className="fato">
              <b>{pct(a.taxa)}</b> das {num(a.total)} avaliações dizem que veio diferente do anúncio ({vezes(a.vezes)} a média).
            </p>
            <Citacao prova={a.provas[0]} />
            <Mais provas={a.provas} termos={a.termos} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AlertasLote({ dados, alertas }) {
  if (!dados) return <Vazio>Para achar lotes com problema, o CSV precisa das colunas produto e data.</Vazio>;
  return (
    <section className="secao secao-lote">
      <Cabecalho titulo="Falar com fornecedores">
        As queixas de defeito dispararam numa semana. Confira o lote antes de seguir vendendo.
      </Cabecalho>
      {!alertas.length && <Vazio>Nenhum pico de defeito ou qualidade fora do normal.</Vazio>}
      <ol className="itens">
        {alertas.map((a) => (
          <li className="item" key={a.produto}>
            <h3>{a.produto}</h3>
            <p className="fato">
              Na semana de {diaMes(a.semana)}, <b>{pct(a.taxa)}</b> das avaliações reclamaram de defeito ou qualidade. Nas outras semanas,{' '}
              {pct(a.taxaBase)}.
            </p>
            <Citacao prova={a.provas[0]} />
            <Mais provas={a.provas} termos={a.termos}>
              <Semanas serie={a.serie} destaque={a.semana} rotuloCasos="defeito ou qualidade" altura={80} />
            </Mais>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AlertasLogistica({ dados, alertas, estadoFiltro }) {
  if (!dados) return <Vazio>Para achar problemas de entrega, o CSV precisa da coluna estado ou data.</Vazio>;
  const grande = dados.porEstado.reduce((t, e) => t + e.total, 0) >= 20000;
  const estados = dados.porEstado.filter((e) => e.total >= (grande ? 50 : 10));
  const idx = new Map(dados.grade.map((g) => [g.estado + '|' + g.mes, g]));
  const emAlerta = new Set(dados.alertas.map((a) => a.estado + '|' + a.mes));
  const linhasGrade = estados.slice(0, 27).map((e) => e.estado);
  const minimoGrade = grande ? 30 : 5;
  return (
    <section className="secao secao-logistica">
      <Cabecalho titulo="Cobrar entregas">
        “Não recebi” e “atrasou” bem acima dos outros estados. Cobre a transportadora da região.
      </Cabecalho>
      {!alertas.length && <Vazio>Nenhum estado com problema de entrega fora do normal no período.</Vazio>}
      <ol className="itens">
        {alertas.map((a) => (
          <li className="item" key={a.estado + a.mes}>
            <h3>
              {a.estado} em {mesNome(a.mes)}
            </h3>
            <p className="fato">
              <b>{pct(a.taxa, 1)}</b> das avaliações falam de entrega ({vezes(a.vezes)} os outros estados), e {num(a.nao_recebido)} clientes ainda não tinham recebido.
            </p>
            <Citacao prova={a.provas[0]} />
          </li>
        ))}
      </ol>
      {estados.length > 0 && (
        <details className="mais mais-solto">
          <summary>Todos os estados</summary>
          <BarrasH
            itens={estados.slice(0, 12).map((e) => ({
              rotulo: e.estado,
              valor: e.taxa,
              extra: num(e.casos),
              dica: `${e.estado}: ${num(e.casos)} de ${num(e.total)} avaliações`,
            }))}
            destaque={(i) => i.rotulo === estadoFiltro}
            referencia={dados.taxaNacional}
            rotuloReferencia={`média geral, ${pct(dados.taxaNacional, 1)}`}
            formatar={(v) => pct(v, 1)}
          />
          {dados.meses.length > 0 && linhasGrade.length > 0 && (
            <>
              <h4>Mês a mês</h4>
              <p className="nota">Contorno marca o alerta. Ponto: menos de {minimoGrade} avaliações no mês.</p>
              <Grade
                linhas={linhasGrade}
                colunas={dados.meses}
                valor={(l, c) => idx.get(l + '|' + c)}
                rotuloColuna={mesNome}
                alerta={(l, c) => emAlerta.has(l + '|' + c)}
                minimo={minimoGrade}
              />
            </>
          )}
        </details>
      )}
    </section>
  );
}

export function Panorama({ achados }) {
  const total = achados.meta.total;
  const itens = Object.entries(achados.distribuicao)
    .map(([k, v]) => ({ rotulo: NOME[k], valor: v / total, extra: num(v) }))
    .sort((a, b) => b.valor - a.valor);
  const deptos = achados.departamentos.filter((d) => d.total >= (total > 20000 ? 500 : 1)).slice(0, 12);
  const problemas = 1 - achados.distribuicao.elogio / total;
  return (
    <section className="secao secao-panorama">
      <Cabecalho titulo="Do que falam">
        {pct(problemas)} das avaliações relatam algum problema.
      </Cabecalho>
      <BarrasH itens={itens} formatar={(v) => pct(v, 1)} />
      {deptos.length > 0 && (
        <>
          <h4>Avaliações com problema, por departamento</h4>
          <BarrasH
            itens={deptos
              .map((d) => ({ rotulo: d.departamento, valor: 1 - d.elogio / d.total, extra: num(d.total) }))
              .sort((a, b) => b.valor - a.valor)}
            formatar={(v) => pct(v)}
          />
        </>
      )}
    </section>
  );
}
