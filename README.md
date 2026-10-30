# Radar de avaliações

Vendedores de e-commerce recebem mais avaliações do que conseguem ler. O problema aparece tarde: quando o
anúncio errado já virou devolução, o lote com defeito já virou nota baixa e a transportadora de um estado já
virou reclamação no SAC. O radar lê todas as avaliações, classifica cada uma pelo problema principal e
transforma o volume em quatro listas de ação:

| Alerta | O que procura | Ação |
|---|---|---|
| **Anúncio** | Produtos com concentração anormal de “veio diferente do anunciado”, com as frases dos clientes como prova | Corrigir título, fotos e especificações |
| **Lote** | Semana em que defeito e qualidade de um produto disparam acima do histórico dele | Falar com o fornecedor |
| **Logística** | Estados e meses com “não recebido” e “atraso” bem acima da média | Cobrar a transportadora da região |
| **Fila de respostas** | Avaliações urgentes primeiro (não recebido, defeito, atendimento), com rascunho de resposta por categoria | Responder |

O app é estático. Na demo, mostra os achados pré-calculados de 132 mil avaliações reais da Americanas.
Com o CSV do vendedor, classifica tudo **no navegador**: as avaliações não saem do computador.

<!-- capturas: rode o app e veja a seção "Verificação" -->

## Arquitetura: modelo pequeno para o volume, LLM só para rotular o treino

```
                 uma vez, no treino                                  sempre, no uso
 ┌───────────────────────────────────────────────┐     ┌────────────────────────────────────────────┐
 │ 4.700 avaliações ─▶ Claude Opus 5.5 + régua    │     │ CSV do vendedor ─▶ transformers.js (WASM)   │
 │                     (lotes de 25, Batch API)   │     │                   BERTimbau int8, 110 MB    │
 │                     US$ 2,82 no total          │     │                   ─▶ categoria + confiança  │
 │                 ─▶ rótulos ─▶ BERTimbau base   │     │                   ─▶ motor de alertas (JS)  │
 │                    (fine-tuning, CPU, 30 min)  │     │                   ─▶ painel, fila, CSV      │
 │                 ─▶ ONNX ─▶ int8 (110 MB)       │     │ nada vai para servidor; custo por avaliação 0│
 └───────────────────────────────────────────────┘     └────────────────────────────────────────────┘
```

- **Por que não chamar um LLM no app?** Custo, latência e privacidade. O professor (Opus 5.5 + régua) acerta
  87% no gabarito; o aluno int8 acerta o mesmo, sem custo por avaliação, em 8 ms na CPU (Python) e sem
  mandar o texto do cliente para fora.
- **Régua:** seis regras de desempate escritas a partir de 102 avaliações de desenvolvimento (`ml/labels.py`).
  Elas importam mais que o tamanho do modelo (ver avaliação).
- **Motor de alertas:** `app/src/engine/alertas.js`. É o mesmo código no navegador e no Node: a demo da B2W
  foi gerada por ele (`npm run achados`), então mostra exatamente o que o app calcularia.

## Avaliação

Gabarito humano: 300 avaliações rotuladas à mão pelo dono do projeto, sem ver a nota nem a saída de nenhum
modelo (9 marcadas “ambíguas” e descartadas). Divididas por categoria em **102 de desenvolvimento** (usadas
para escrever a régua e decidir o tamanho do lote) e **189 de teste**, que não foram usadas para decidir nada.
Latência: uma avaliação por vez, CPU de notebook de 12 núcleos.

| Modelo | Tipo | Acerto | F1 macro | ECE ↓ | Latência | US$ / 1 mil |
|---|---|---|---|---|---|---|
| **Radar, ONNX int8** (este app) | pequeno, destilado do Opus | **87,3%** | 0,76 | **0,03** | **8 ms** | 0 |
| Radar, ONNX int8 no navegador (WASM, 1 thread) | o mesmo, no Chrome | NAVEGADOR_ACERTO | NAVEGADOR_F1 | NAVEGADOR_ECE | NAVEGADOR_MS | 0 |
| Radar, fp32 (PyTorch) | pequeno, destilado do Opus | 85,7% | 0,70 | 0,05 | 42 ms | 0 |
| Claude Opus 5.5 + régua, lotes de 25 | o professor | 87,3% | 0,79 | – | – | 1,29 (0,60 em batch) |
| Claude Opus 5.5 + régua, 1 por chamada | LLM de fronteira | 86,8% | 0,78 | 0,13 | 1,8 s | 6,94 |
| Claude Opus 5.5, instrução curta | LLM de fronteira | 82,5% | 0,75 | 0,17 | 1,9 s | 4,80 |
| Claude Haiku 5.5 + régua | LLM barato | 83,1% | 0,78 | 0,17 | 1,1 s | 0,16 |
| Claude Haiku 5.5, instrução curta | LLM barato | 73,0% | 0,59 | 0,27 | 1,1 s | 0,11 |
| BERTimbau com rótulos do Haiku sem régua | pequeno, professor fraco | 73,0% | 0,60 | 0,20 | 64 ms | 0 |
| TF-IDF + regressão logística | clássico | 69,8% | 0,56 | 0,06 | 0,6 ms | 0 |

Linhas sem “Radar” e sem “lotes de 25” vêm do estudo anterior (`results/referencia_gab_teste.csv`), no mesmo
gabarito e na mesma divisão. Tabela completa: `results/tabela_gab_teste.csv`; previsões por avaliação em
`results/preds_*.jsonl`.

O que a tabela mostra:

1. **O aluno alcançou o professor.** Trocar o professor (Haiku sem régua → Opus com régua) levou o mesmo
   BERTimbau de 73,0% para 85,7–87,3%. O modelo pequeno não era o gargalo; os rótulos eram.
2. **Lote de 25 não custou acerto.** No conjunto de desenvolvimento, o Opus + régua em lotes de 25 acertou
   89,2%, igual à chamada única (89,2%); no teste, 87,3% contra 86,8%. Em lote o custo cai de US$ 6,94 para
   US$ 1,29 por mil (US$ 0,60 pela Batch API).
3. **int8 não perdeu acerto.** O int8 acertou 3 avaliações a mais que o fp32 (9 previsões mudaram). É ruído:
   com 189 exemplos, o intervalo de 95% do acerto é de cerca de ±5 pontos. O ganho real é tamanho (436 → 110 MB)
   e velocidade (19 → 8 ms no ONNX Runtime).
4. **Calibração boa.** Com a temperatura ajustada na validação (T = 1,45) e embutida no classificador, o ECE
   ficou em 0,03: a confiança mostrada no app é usável para separar o que conferir à mão (< 60%).
5. **Ponto fraco: atendimento.** Recall de 1 em 7 no teste (confunde com não recebido e com qualidade).
   Defeito × qualidade também se confundem (4 de 49 “qualidade” viraram “defeito”). Por categoria:
   `results/radar_int8_por_classe_gab_teste.json` e `results/radar_int8_confusao_gab_teste.csv`.

### Custo da API

Total gasto: **US$ 4,43** (limite combinado: US$ 15), registrado chamada a chamada em `results/custo_api.jsonl`.

| Etapa | US$ |
|---|---|
| Rotular as 4.700 de treino (Opus 5.5 + régua, lotes de 25, Batch API, cache da régua) | 2,83 |
| Conferir o lote no gab_dev: lote de 25 e chamada única | 0,31 |
| Medir o professor no gab_teste (lote de 25) | 0,24 |
| Primeira tentativa no gab_dev, respostas cobradas e perdidas por erro de descompressão local (estimativa conservadora) | 1,05 |

## Achados na B2W

ACHADOS_B2W

## Como usar

**Demo:** abra o app e escolha “Demo B2W”.

**Suas avaliações:** “Minhas avaliações” → envie um CSV com a coluna `texto` (aceita também `avaliacao`,
`comentario`, `review_text`) e, se tiver, `produto`, `data` (AAAA-MM-DD ou DD/MM/AAAA) e `estado` (UF ou nome).
Há um CSV de exemplo no próprio app (`app/public/exemplo/avaliacoes-exemplo.csv`, 428 avaliações reais da B2W).
Sem `produto`, os alertas de anúncio e lote ficam de fora; sem `estado` e `data`, o de logística.
Tudo pode ser exportado em CSV: alertas, fila com rascunhos e todas as avaliações classificadas.

Na primeira vez o navegador baixa o modelo (110 MB) e guarda em cache. No navegador o modelo roda em
WebAssembly com uma thread: NAVEGADOR_MS por avaliação, ou seja, 1.000 avaliações em NAVEGADOR_MIL.

### Rodar localmente

```bash
# app (Node 20.19+)
cd app
npm install
npm test            # testes do motor de alertas
npm run dev         # http://localhost:5173

# o app espera o modelo em app/public/models/radar-avaliacoes/ (fora do git).
# Gere com o pipeline abaixo ou baixe do Hugging Face quando estiver publicado.
```

### Refazer o pipeline de ML

```bash
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt
# base B2W: https://huggingface.co/datasets/ruanchaves/b2w-reviews01 → data/raw/b2w.parquet
export ANTHROPIC_API_KEY=...                           # só para rotular; nunca vai para o repositório
.venv/bin/python ml/rotular_opus.py gab_dev --lote 1   # referência: uma avaliação por chamada
.venv/bin/python ml/rotular_opus.py gab_dev --lote 25  # o mesmo em lote, para comparar
.venv/bin/python ml/rotular_opus.py treino --lote 25 --batches   # treino pela Batch API
.venv/bin/python ml/treinar.py                         # BERTimbau, ~30 min na CPU
.venv/bin/python ml/exportar_onnx.py                   # ONNX fp32 + int8; copia para o app
.venv/bin/python ml/avaliar.py gab_teste               # mede no gabarito
.venv/bin/python ml/rotular_opus.py gab_teste --lote 25 --final  # professor no gabarito (medição final)
.venv/bin/python ml/tabela.py                          # tabela comparativa
.venv/bin/python ml/rodar_b2w.py                       # classifica as 132 mil (~20 min)
(cd app && npm run achados)                            # gera app/public/demo/achados_b2w.json
.venv/bin/python ml/exemplo_csv.py                     # CSV de exemplo do app
.venv/bin/python ml/preparar_hf.py                     # monta models/hf/ para o Hugging Face (não envia)
```

`rotular_opus.py` projeta o custo antes de chamar a API e para se o total passar de `ORCAMENTO_USD` (15 por padrão).

### Publicar (pendente, revisão do dono)

- **Modelo:** `ml/preparar_hf.py` monta `models/hf/` com o model card de `model-card/README.md`. Para subir:
  `huggingface-cli upload NicoDeVargas/radar-avaliacoes-bertimbau models/hf . --repo-type model`.
- **App:** `.github/workflows/pages.yml` só roda à mão (Actions → Run workflow). Antes: ative o Pages com
  origem “GitHub Actions” e crie a variável `HF_MODEL_REPO` com o repositório do modelo. Nessa build o
  navegador baixa o modelo do Hugging Face (só o modelo; as avaliações continuam locais) e o runtime WASM
  do próprio site.

## Estrutura

```
ml/            rotulagem (professor), treino, export ONNX, avaliação, inferência na B2W
data/          amostra de treino, rótulos do Opus, gabarito humano (a base bruta fica fora do git)
results/       previsões, métricas, custos da API, tabela comparativa
app/           Vite + React; src/engine/ = motor de alertas e leitura de CSV (mesmo código no Node)
model-card/    README pronto para o Hugging Face
```

## Limites

- **Teste pequeno e um anotador.** 189 avaliações: diferenças de 2–3 pontos estão dentro do ruído.
  `atraso` tem 2 exemplos no teste e `atendimento` 7, então as métricas dessas classes são frágeis.
  O gabarito foi escrito por uma pessoa só; a régua foi escrita olhando só o conjunto de desenvolvimento.
- **Professor LLM.** Os rótulos de treino vêm do Opus; o aluno herda as fronteiras de categoria dele.
- **Base geral de 2018.** Americanas, janeiro a maio de 2018. Outros segmentos e outros anos têm outro vocabulário.
- **Uma categoria por avaliação.** Reclamação de preço cai em “qualidade”; produto falsificado cai em
  “divergente”. Por isso cada alerta mostra as frases reais: a decisão final é de quem lê.
- **Alertas são estatística simples** (limite inferior de Wilson contra a média, z-score por semana contra o
  histórico do produto). Os limiares estão em `parametrosPara()` e mudam para bases pequenas.
- **Velocidade no navegador.** Uma thread de WebAssembly; bases de dezenas de milhares de avaliações pedem o
  pipeline em Python.

## Créditos e licença

Licença do código e dos pesos: a definir pelo dono antes de publicar (o model card sugere MIT). Dados: [B2W-Reviews01](https://huggingface.co/datasets/ruanchaves/b2w-reviews01)
(Real et al., 2019, CC BY 4.0). Modelo base: [BERTimbau](https://huggingface.co/neuralmind/bert-base-portuguese-cased).
Estudo de origem (comparação de tipos de modelo): repositório local `avaliacoes-decisao`.
