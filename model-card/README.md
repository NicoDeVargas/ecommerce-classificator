---
language:
- pt
license: mit
library_name: transformers.js
pipeline_tag: text-classification
base_model: neuralmind/bert-base-portuguese-cased
datasets:
- ruanchaves/b2w-reviews01
tags:
- e-commerce
- reviews
- portuguese
- brazilian-portuguese
- onnx
- distillation
metrics:
- accuracy
- f1
---

# radar-avaliacoes-bertimbau

Classificador de avaliações de clientes de e-commerce em português do Brasil. Lê uma avaliação e devolve a
categoria do problema principal, para o vendedor saber o que fazer com ela. É o modelo do
[Radar de avaliações](https://github.com/NicoDeVargas/ecommerce-classificator), que roda no navegador
com transformers.js.

| Categoria | Quando |
|---|---|
| `atraso` | Chegou, mas depois do prazo. |
| `nao_recebido` | Não chegou, extraviou ou foi entregue no lugar errado. |
| `defeito` | Chegou quebrado, avariado ou sem funcionar. |
| `divergente` | Veio errado, incompleto ou diferente do anunciado. |
| `atendimento` | SAC, troca, devolução, reembolso ou cancelamento. |
| `qualidade` | Funcionou, mas decepcionou ou durou pouco (sem defeito de chegada). |
| `elogio` | Cliente satisfeito, sem problema relevante. |

Desempates (régua usada para rotular): defeito só quando chegou quebrado; se quebrou com o uso é qualidade;
se ainda não chegou é não recebido, mesmo que o cliente fale em atraso; elogio com ressalva pequena é elogio;
problema do produto seguido de reclamação do SAC vale o problema original; falta de recurso que o anúncio não
prometia é qualidade, não divergente; com vários problemas, vale o do título.

## Uso

```js
import { pipeline } from '@huggingface/transformers';

const clf = await pipeline('text-classification', 'NicoDeVargas/radar-avaliacoes-bertimbau', { dtype: 'q8' });
await clf('Chegou com a tela trincada. Não liga.');
// [{ label: 'defeito', score: 0.91 }]  (saída do modelo fp32; o int8 pode variar na segunda casa)
```

```python
from transformers import pipeline
clf = pipeline("text-classification", model="NicoDeVargas/radar-avaliacoes-bertimbau")
```

Entrada: título + ". " + texto da avaliação (como no treino). Textos com mais de 128 tokens foram truncados no treino.

## Arquivos

- `onnx/model_quantized.onnx`: int8 dinâmico (110 MB), o que o app usa no navegador.
- `onnx/model.onnx`: fp32 (436 MB).
- `model.safetensors`: pesos PyTorch fp32.
- A temperatura de calibração (T = 1,45, ajustada na validação) já está embutida na camada de classificação:
  o softmax da saída é a confiança calibrada.

## Como foi treinado

- **Base:** `neuralmind/bert-base-portuguese-cased` (BERTimbau base, 110 M parâmetros).
- **Dados:** 4.700 avaliações da [B2W-Reviews01](https://huggingface.co/datasets/ruanchaves/b2w-reviews01)
  (Americanas, CC BY 4.0), amostra com mais avaliações negativas. 4.400 para treinar, 300 para validar e calibrar.
- **Rótulos:** destilação. O professor foi o Claude Opus 5.5 com a régua de desempate acima, em lotes de 25
  avaliações por chamada (Message Batches API). Custo dos rótulos: US$ 2,82 para as 4.700.
- **Treino:** 3 épocas, lr 3e-5, lote 16, máx. 128 tokens, AdamW, CPU (30 min num notebook de 12 núcleos).

## Avaliação

Gabarito humano: 189 avaliações rotuladas à mão por uma pessoa, sem ver a nota nem a saída de nenhum modelo,
nunca usadas para treinar nem para escolher nada (conjunto `gab_teste`). Latência: uma avaliação por vez, CPU de notebook.

| Modelo | Acerto | F1 macro | ECE | Latência | US$ / 1 mil |
|---|---|---|---|---|---|
| **Este modelo, ONNX int8** | **87,3%** | **0,76** | **0,03** | **8 ms** | 0 |
| Este modelo, fp32 (PyTorch) | 85,7% | 0,70 | 0,05 | 42 ms | 0 |
| Claude Opus 5.5 + régua, lotes de 25 (o professor) | 87,3% | 0,79 | – | – | 1,29 (0,60 em batch) |
| Claude Opus 5.5 + régua, uma chamada por avaliação | 86,8% | 0,78 | 0,13 | 1,8 s | 6,94 |
| Claude Haiku 5.5 + régua | 83,1% | 0,78 | 0,17 | 1,1 s | 0,16 |
| BERTimbau com rótulos do Haiku sem régua | 73,0% | 0,60 | 0,20 | 64 ms | 0 |
| TF-IDF + regressão logística | 69,8% | 0,56 | 0,06 | 0,6 ms | 0 |

O int8 acertou 3 avaliações a mais que o fp32 (9 previsões mudaram): é ruído, não ganho da quantização.
Com 189 exemplos, o intervalo de 95% do acerto é de cerca de ±5 pontos.

Por categoria (int8): `elogio` F1 0,97, `nao_recebido` 0,94, `qualidade` 0,80, `divergente` 0,71,
`defeito` 0,67, `atendimento` 0,25 (acertou 1 de 7: confunde com não recebido e qualidade), `atraso` 1,00 (só 2 exemplos).

## Limites

- Teste pequeno (189) e um único anotador. `atraso` tem 2 exemplos e `atendimento` 7: as métricas dessas classes são frágeis.
- Os rótulos de treino vêm de um LLM; o modelo herda as fronteiras de categoria do professor.
- Base de e-commerce geral de 2018 (Americanas). Outros segmentos e outras épocas podem mudar o vocabulário.
- Uma categoria por avaliação: quando há dois problemas, só o principal aparece.
- `atendimento` tem recall baixo: não use o modelo como único filtro para casos de SAC.

## Licença e créditos

Pesos sob MIT. Base BERTimbau (MIT), dados B2W-Reviews01 (CC BY 4.0, Real et al., 2019).
