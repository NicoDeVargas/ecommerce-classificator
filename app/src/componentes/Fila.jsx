import { useState } from 'react';
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
      <p className="fila-meta">
        <span className={`motivo motivo-${item.categoria}`}>{NOME[item.categoria]}</span>
        {[item.estado, item.data && dataCurta(item.data)].filter(Boolean).join(', ')}
        {item.revisar && <span className="revisar"> · motivo incerto, confira</span>}
      </p>
      {item.produto && <h3>{item.produto}</h3>}
      <blockquote className="citacao">
        <p>{item.texto}</p>
      </blockquote>
      <div className="fila-acoes">
        <button type="button" className="btn" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
          {aberto ? 'Fechar resposta' : 'Escrever resposta'}
        </button>
        <button type="button" className="btn btn-sec" onClick={alternar} aria-pressed={respondida}>
          {respondida ? 'Respondida' : 'Marcar como respondida'}
        </button>
      </div>
      {aberto && (
        <div className="rascunho">
          <label className="rotulo" htmlFor={'r-' + item.id}>
            Rascunho pronto para editar
          </label>
          <textarea id={'r-' + item.id} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} />
          <button type="button" className="btn" onClick={copiar}>
            {copiado ? 'Copiada' : 'Copiar resposta'}
          </button>
        </div>
      )}
    </li>
  );
}

export function Fila({ itens, respondidas, alternar, nota }) {
  const [limite, setLimite] = useState(30);
  const pendentes = itens.filter((i) => !respondidas.has(i.id)).length;
  return (
    <section className="secao secao-fila">
      <header className="secao-cab">
        <h2>Responder clientes</h2>
        <p>
          {pendentes} sem resposta. Primeiro quem não recebeu, recebeu com defeito ou ficou sem atendimento.{nota && ` ${nota}`}
        </p>
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
