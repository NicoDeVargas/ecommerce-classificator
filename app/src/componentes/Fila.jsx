import { useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { NOME } from '../engine/categorias.js';
import { dataCurta } from '../formato.js';

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
    <li className={'item fila-item' + (respondida ? ' is-respondida' : '')}>
      <div className="fila-topo">
        <p className="fila-meta">
          <b>{NOME[item.categoria]}</b>
          {[item.estado, item.data && dataCurta(item.data)].filter(Boolean).map((x) => (
            <span key={x}>{x}</span>
          ))}
          {item.revisar && <span className="revisar">motivo incerto</span>}
        </p>
        <button
          type="button"
          className={'marcar' + (respondida ? ' is-feito' : '')}
          onClick={alternar}
          aria-pressed={respondida}
          aria-label={respondida ? 'Respondida' : 'Marcar como respondida'}
          title={respondida ? 'Respondida' : 'Marcar como respondida'}
        >
          <Check size={16} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {item.produto && <h3>{item.produto}</h3>}
      <blockquote className="citacao">
        <p>{item.texto}</p>
      </blockquote>
      {!aberto && (
        <button type="button" className="btn-quieto fila-abrir" onClick={() => setAberto(true)} aria-expanded={false}>
          Responder
        </button>
      )}
      {aberto && (
        <div className="rascunho">
          <textarea aria-label="Resposta" value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} />
          <div className="rascunho-acoes">
            <button type="button" className="btn" onClick={copiar}>
              <Copy size={16} aria-hidden="true" /> {copiado ? 'Copiada' : 'Copiar'}
            </button>
            <button type="button" className="btn-quieto" onClick={() => setAberto(false)} aria-expanded={true}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function Fila({ itens, respondidas, alternar }) {
  const [limite, setLimite] = useState(30);
  const pendentes = itens.filter((i) => !respondidas.has(i.id)).length;
  return (
    <section className="secao secao-fila">
      <header className="secao-cab">
        <h2 className="so-leitor">Responder clientes</h2>
        <p>{pendentes} sem resposta, os mais graves primeiro. Cada uma já vem com um rascunho.</p>
      </header>
      {!itens.length && <p className="vazio">Nenhuma avaliação com esses filtros.</p>}
      <ol className="itens">
        {itens.slice(0, limite).map((i) => (
          <Item key={i.id} item={i} respondida={respondidas.has(i.id)} alternar={() => alternar(i.id)} />
        ))}
      </ol>
      {itens.length > limite && (
        <button type="button" className="btn btn-sec btn-largo" onClick={() => setLimite(limite + 30)}>
          Mostrar mais {Math.min(30, itens.length - limite)}
        </button>
      )}
    </section>
  );
}
