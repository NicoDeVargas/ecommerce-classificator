import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { mapearColunas, prepararLinhas } from '../engine/csv.js';
import { num } from '../formato.js';

const BASE = import.meta.env.BASE_URL;

export function Envio({ aoClassificar, estado }) {
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState(null);
  const [previa, setPrevia] = useState(null);
  const input = useRef(null);

  const ler = (arquivo) => {
    setErro(null);
    setPrevia(null);
    Papa.parse(arquivo, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        try {
          const cab = res.meta.fields || [];
          const colunas = mapearColunas(cab);
          const linhas = prepararLinhas(res.data, colunas);
          if (!linhas.length) throw new Error('Nenhuma avaliação com texto encontrada no arquivo.');
          setPrevia({ nome: arquivo.name, colunas, linhas });
        } catch (e) {
          setErro(e.message);
        }
      },
      error: (e) => setErro(e.message),
    });
  };

  const ocupado = estado && estado.fase !== 'erro';
  return (
    <section className="envio" aria-labelledby="t-envio">
      <div className="envio-texto">
        <h2 id="t-envio">Analise as suas avaliações</h2>
        <p>
          Envie um CSV com a coluna <code>texto</code> e, se tiver, <code>produto</code>, <code>data</code> e <code>estado</code>.
          A classificação roda <b>no seu navegador</b>: as avaliações não saem do seu computador.
        </p>
        <p className="envio-nota">
          Na primeira vez o navegador baixa o modelo (cerca de 110 MB) e guarda em cache. Uma loja com 1.000 avaliações leva alguns
          minutos num notebook.{' '}
          <a href={BASE + 'exemplo/avaliacoes-exemplo.csv'} download>
            Baixar CSV de exemplo
          </a>
        </p>
      </div>
      <div
        className={'soltar' + (arrastando ? ' is-arrastando' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          data-testid="arquivo"
          onChange={(e) => e.target.files[0] && ler(e.target.files[0])}
        />
        {!previa && (
          <>
            <button type="button" className="btn" onClick={() => input.current.click()} disabled={ocupado}>
              Escolher CSV
            </button>
          </>
        )}
        {previa && (
          <div className="previa">
            <p>
              <b>{previa.nome}</b>: {num(previa.linhas.length)} avaliações.
            </p>
            <ul className="colunas-achadas">
              {['texto', 'produto', 'data', 'estado', 'departamento'].map((c) => (
                <li key={c} className={previa.colunas[c] ? 'ok' : 'falta'}>
                  {previa.colunas[c] ? '✓' : '–'} {c}
                  {previa.colunas[c] && previa.colunas[c] !== c ? ` (${previa.colunas[c]})` : ''}
                </li>
              ))}
            </ul>
            <div className="previa-acoes">
              <button type="button" className="btn" disabled={ocupado} onClick={() => aoClassificar(previa)}>
                Classificar {num(previa.linhas.length)} avaliações
              </button>
              <button type="button" className="btn btn-sec" disabled={ocupado} onClick={() => setPrevia(null)}>
                Trocar arquivo
              </button>
            </div>
          </div>
        )}
        {estado && estado.fase !== 'erro' && <Progresso estado={estado} />}
        {(erro || estado?.fase === 'erro') && (
          <p className="erro" role="alert">
            {erro || estado.mensagem}
          </p>
        )}
      </div>
    </section>
  );
}

function Progresso({ estado }) {
  const { fase, progresso = 0, feitos, total, ms } = estado;
  const rotulo =
    fase === 'baixando'
      ? `Baixando o modelo… ${Math.round(progresso * 100)}%`
      : fase === 'carregando'
        ? 'Preparando o modelo…'
        : fase === 'classificando'
          ? `Classificando ${num(feitos)} de ${num(total)}` + (ms && feitos ? ` · ${Math.round(ms / feitos)} ms por avaliação` : '')
          : 'Calculando alertas…';
  const valor = fase === 'baixando' ? progresso : fase === 'classificando' ? feitos / total : null;
  return (
    <div className="progresso" role="status" aria-live="polite">
      <span>{rotulo}</span>
      <div className="progresso-trilho">
        <div className={'progresso-barra' + (valor == null ? ' is-indeterminado' : '')} style={{ width: `${(valor ?? 1) * 100}%` }} />
      </div>
    </div>
  );
}
