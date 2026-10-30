import { useState } from 'react';
import { NOME, URGENTES } from '../engine/categorias.js';
import { dataCurta, pct } from '../formato.js';

function Item({ item, respondida, alternar }) {
  const [texto, setTexto] = useState(item.rascunho);
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sem permissão de área de transferência: o texto continua visível para copiar à mão */
    }
  };
  return (
    <li className={'fila-item' + (respondida ? ' is-respondida' : '')}>
      <div className="fila-meta">
        <span className={`cat cat-${item.categoria}`}>
          {URGENTES.has(item.categoria) && <span className="ponto" aria-hidden="true" />}
          {NOME[item.categoria]}
        </span>
        {item.data && <span>{dataCurta(item.data)}</span>}
        {item.estado && <span>{item.estado}</span>}
        <span className="conf" title="Confiança do modelo nesta categoria">
          {pct(item.confianca)}
        </span>
        {item.revisar && <span className="revisar">conferir categoria</span>}
      </div>
      {item.produto && <div className="fila-produto">{item.produto}</div>}
      <p className="fila-texto">{item.texto}</p>
      <div className="fila-acoes">
        <button type="button" className="btn btn-sec" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
          {aberto ? 'Fechar rascunho' : 'Ver rascunho'}
        </button>
        <button type="button" className="btn btn-sec" onClick={alternar} aria-pressed={respondida}>
          {respondida ? 'Respondida ✓' : 'Marcar respondida'}
        </button>
      </div>
      {aberto && (
        <div className="rascunho">
          <label>
            <span className="rotulo-campo">Rascunho de resposta (edite antes de enviar)</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} />
          </label>
          <button type="button" className="btn" onClick={copiar}>
            {copiado ? 'Copiado' : 'Copiar resposta'}
          </button>
        </div>
      )}
    </li>
  );
}

export function Fila({ itens, total, respondidas, alternar, exportar, nota }) {
  const [limite, setLimite] = useState(30);
  const pendentes = itens.filter((i) => !respondidas.has(i.id)).length;
  return (
    <section aria-labelledby="t-fila">
      <header className="secao-cab">
        <div>
          <h2 id="t-fila">Fila de respostas</h2>
          <p className="secao-sub">
            Urgentes primeiro (não recebido, defeito, atendimento), depois as mais recentes. {pendentes} pendentes
            {total > itens.length ? ` de ${itens.length} filtradas` : ''}.{nota && ` ${nota}`}
          </p>
        </div>
        <button type="button" className="btn btn-sec" onClick={exportar}>
          Exportar fila (CSV)
        </button>
      </header>
      {!itens.length && <div className="vazio">Nenhuma avaliação na fila com esses filtros.</div>}
      <ol className="fila">
        {itens.slice(0, limite).map((i) => (
          <Item key={i.id} item={i} respondida={respondidas.has(i.id)} alternar={() => alternar(i.id)} />
        ))}
      </ol>
      {itens.length > limite && (
        <button type="button" className="btn btn-sec btn-largo" onClick={() => setLimite(limite + 30)}>
          Mostrar mais ({itens.length - limite} restantes)
        </button>
      )}
    </section>
  );
}
