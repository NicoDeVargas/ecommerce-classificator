import { useState } from 'react';
import { diaMes, num, pct } from '../formato.js';

// Barras horizontais com rótulo e valor diretos (uma série: a cor não carrega identidade).
export function BarrasH({ itens, max, formatar = pct, destaque, referencia, rotuloReferencia }) {
  const m = max ?? Math.max(...itens.map((i) => i.valor), referencia || 0, 1e-9);
  return (
    <div className="barras" role="table">
      {itens.map((i) => (
        <div className="barras-linha" role="row" key={i.rotulo} title={i.dica || `${i.rotulo}: ${formatar(i.valor)}`}>
          <span className="barras-rotulo" role="cell">
            {i.rotulo}
          </span>
          <span className="barras-trilho" role="cell">
            <span
              className={'barras-barra' + (destaque?.(i) ? ' is-alerta' : '')}
              style={{ width: `${Math.max(0.5, (i.valor / m) * 100)}%` }}
            />
            {referencia != null && (
              <span className="barras-ref" style={{ left: `${(referencia / m) * 100}%` }} aria-hidden="true" />
            )}
          </span>
          <span className="barras-valor" role="cell">
            {formatar(i.valor)}
            {i.extra && <small> {i.extra}</small>}
          </span>
        </div>
      ))}
      {referencia != null && (
        <div className="barras-legenda">
          <span className="barras-ref-amostra" aria-hidden="true" /> {rotuloReferencia}
        </div>
      )}
    </div>
  );
}

// Colunas semanais: total de avaliações (claro) e casos (escuro), com a semana do alerta marcada.
export function Semanas({ serie, destaque, altura = 120, rotuloCasos = 'casos' }) {
  const [hover, setHover] = useState(null);
  if (!serie?.length) return null;
  const max = Math.max(...serie.map((s) => s.total), 1);
  const w = 100 / serie.length;
  const atual = hover != null ? serie[hover] : serie.find((s) => s.semana === destaque) || serie[serie.length - 1];
  return (
    <figure className="semanas">
      <div className="semanas-dica" aria-live="polite">
        Semana de {diaMes(atual.semana)}: <b>{num(atual.casos)}</b> {rotuloCasos} em {num(atual.total)} avaliações (
        {pct(atual.casos / atual.total)})
      </div>
      <svg viewBox={`0 0 100 ${altura}`} preserveAspectRatio="none" style={{ height: altura }} onMouseLeave={() => setHover(null)}>
        {serie.map((s, i) => {
          const ht = (s.total / max) * (altura - 2);
          const hc = (s.casos / max) * (altura - 2);
          const marcada = s.semana === destaque;
          return (
            <g key={s.semana} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={i * w} y={0} width={w} height={altura} fill="transparent" />
              <rect className={'col-total' + (marcada ? ' is-marcada' : '')} x={i * w + w * 0.15} y={altura - ht} width={w * 0.7} height={ht} rx="0.6" />
              <rect className={'col-casos' + (marcada ? ' is-marcada' : '')} x={i * w + w * 0.15} y={altura - hc} width={w * 0.7} height={hc} rx="0.6" />
              {hover === i && <rect x={i * w} y={0} width={w} height={altura} className="col-hover" />}
            </g>
          );
        })}
      </svg>
      <figcaption className="semanas-eixo">
        <span>{diaMes(serie[0].semana)}</span>
        <span className="semanas-legenda">
          <i className="leg-total" /> avaliações <i className="leg-casos" /> {rotuloCasos}
        </span>
        <span>{diaMes(serie[serie.length - 1].semana)}</span>
      </figcaption>
    </figure>
  );
}

// Grade estado × mês (taxa de problemas de entrega), escala sequencial de um tom.
export function Grade({ linhas, colunas, valor, rotuloColuna, alerta, max }) {
  const m = max ?? Math.max(...linhas.flatMap((l) => colunas.map((c) => valor(l, c)?.taxa ?? 0)), 1e-9);
  return (
    <div className="grade-rolagem">
      <table className="grade">
        <thead>
          <tr>
            <th scope="col">UF</th>
            {colunas.map((c) => (
              <th scope="col" key={c}>
                {rotuloColuna(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              {colunas.map((c) => {
                const v = valor(l, c);
                if (!v) return <td key={c} className="grade-vazia">–</td>;
                const t = Math.min(1, v.taxa / m);
                const forte = t > 0.55;
                return (
                  <td
                    key={c}
                    className={(forte ? 'is-forte' : '') + (alerta(l, c) ? ' is-alerta' : '')}
                    style={{ '--t': t }}
                    title={`${l}, ${rotuloColuna(c)}: ${num(v.casos)} de ${num(v.total)} (${pct(v.taxa, 1)})`}
                  >
                    {pct(v.taxa, 1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
