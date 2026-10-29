"""Professor: rotula avaliações com Claude Opus 5.5 + régua, em lotes.

A régua e as categorias vão uma vez por chamada, no system (com cache), e as avaliações
do lote vão na mensagem. A resposta sai por structured outputs (JSON com esquema fixo),
porque o Opus 5.5 não aceita ferramenta forçada.

Uso:
  python ml/rotular_opus.py gab_dev --lote 1     # referência: uma avaliação por chamada
  python ml/rotular_opus.py gab_dev --lote 25    # mesmo modo em lote, para comparar
  python ml/rotular_opus.py treino --lote 25 --batches   # treino inteiro pela Message Batches API (50% do preço)

Cada chamada grava tokens e custo em results/custo_api.jsonl. Antes de começar, o script
projeta o custo e para se o total passar do ORCAMENTO_USD.
A chave vem de ANTHROPIC_API_KEY no ambiente (nunca do repositório).
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import anthropic

sys.path.insert(0, os.path.dirname(__file__))
from common import metrics, path, split  # noqa: E402
from labels import LABELS, NAMES, RUBRIC  # noqa: E402

MODEL = "claude-opus-5-5"
ORCAMENTO_USD = float(os.environ.get("ORCAMENTO_USD", "15"))
# US$ por milhão de tokens (Opus 5.5): entrada, escrita de cache (1,25x), leitura de cache, saída
PRECO = {"in": 4.0, "cache_write": 5.0, "cache_read": 0.20, "out": 20.0}
CUSTO_LOG = path("results", "custo_api.jsonl")

GUIDE = "\n".join(f"- {k}: {v}" for k, v in LABELS.items())
SYSTEM = (
    "Você classifica avaliações de clientes de um e-commerce brasileiro. Para cada avaliação, "
    "escolha UMA categoria, a do problema principal:\n" + GUIDE + "\n\n" + RUBRIC + "\n\n"
    "Cada avaliação vem como [id] texto. Classifique cada uma de forma independente e devolva "
    "todas, com o mesmo id."
)
SCHEMA = {
    "type": "object",
    "properties": {
        "rotulos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "categoria": {"type": "string", "enum": NAMES}},
                "required": ["id", "categoria"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["rotulos"],
    "additionalProperties": False,
}


def params(rows):
    return dict(
        model=MODEL,
        max_tokens=16000,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": "\n".join(f"[{r.id}] {r.text}" for r in rows.itertuples())}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    )


def custo(u, desconto=1.0):
    usd = (
        u.get("input_tokens", 0) * PRECO["in"]
        + (u.get("cache_creation_input_tokens") or 0) * PRECO["cache_write"]
        + (u.get("cache_read_input_tokens") or 0) * PRECO["cache_read"]
        + u.get("output_tokens", 0) * PRECO["out"]
    ) / 1e6
    return usd * desconto


def gasto_total():
    if not os.path.exists(CUSTO_LOG):
        return 0.0
    return sum(json.loads(l)["usd"] for l in open(CUSTO_LOG))


def registrar(split_name, lote, modo, u, n, desconto=1.0):
    os.makedirs(path("results"), exist_ok=True)
    u = {k: (u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens")}
    rec = {"split": split_name, "lote": lote, "modo": modo, "n": n, **u, "usd": round(custo(u, desconto), 5)}
    with open(CUSTO_LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")
    return rec["usd"]


def parse(msg):
    if msg.stop_reason != "end_turn":
        raise ValueError(f"stop_reason={msg.stop_reason}")
    txt = next(b.text for b in msg.content if b.type == "text")
    return {r["id"]: r["categoria"] for r in json.loads(txt)["rotulos"] if r["categoria"] in NAMES}


def chamar(client, rows, split_name, lote):
    for tentativa in range(4):
        msg = client.messages.create(**params(rows))
        registrar(split_name, lote, "sincrono", msg.usage.model_dump(), len(rows))
        try:
            return parse(msg)
        except (ValueError, KeyError, StopIteration, json.JSONDecodeError) as e:
            print(f"resposta inválida ({e}), repetindo", flush=True)
            time.sleep(2 * (tentativa + 1))
    return {}


def out_file(split_name, lote):
    if split_name == "treino":
        return path("data", "treino_rotulado_opus.jsonl")
    return path("results", f"preds_opus-regua-lote{lote}_{split_name}.jsonl")


def ja_feitos(f):
    if not os.path.exists(f):
        return {}
    return {r["id"]: r["label"] for r in map(json.loads, open(f))}


def salvar(f, labels):
    with open(f, "a") as fh:
        for i, l in labels.items():
            fh.write(json.dumps({"id": i, "label": l}, ensure_ascii=False) + "\n")


def projetar(n_lotes, usd_por_lote):
    gasto = gasto_total()
    proj = gasto + n_lotes * usd_por_lote
    print(f"gasto até agora US$ {gasto:.2f}; projeção com este passo US$ {proj:.2f} (limite {ORCAMENTO_USD})", flush=True)
    if proj > ORCAMENTO_USD:
        raise SystemExit("projeção passa do orçamento: parando antes de chamar a API")


def sincrono(client, df, split_name, lote, f):
    feitos = ja_feitos(f)
    # embaralha: o gab_dev vem agrupado por categoria e lotes homogêneos enviesariam a comparação
    todo = df[~df.id.isin(feitos)].sample(frac=1, random_state=0)
    chunks = [todo.iloc[i : i + lote] for i in range(0, len(todo), lote)]
    projetar(len(chunks), 0.012 * lote + 0.02)  # estimativa conservadora antes de medir
    with ThreadPoolExecutor(4) as ex:
        for res in ex.map(lambda c: chamar(client, c, split_name, lote), chunks):
            salvar(f, res)
    return ja_feitos(f)


def via_batches(client, df, split_name, lote, f):
    """Message Batches API: mesmo pedido, metade do preço, resposta em até 24 h."""
    estado = path("results", f"batch_{split_name}_lote{lote}.json")
    feitos = ja_feitos(f)
    if os.path.exists(estado):
        bid = json.load(open(estado))["id"]
    else:
        todo = df[~df.id.isin(feitos)].sample(frac=1, random_state=0)
        chunks = {f"{split_name}-{i:04d}": todo.iloc[i : i + lote] for i in range(0, len(todo), lote)}
        # custo por lote medido no gab_dev (síncrono), com o desconto de 50%
        medido = [json.loads(l) for l in open(CUSTO_LOG) if json.loads(l)["lote"] == lote and json.loads(l)["modo"] == "sincrono"]
        por_lote = (sum(r["usd"] for r in medido) / len(medido)) * 0.5 if medido else 0.15
        projetar(len(chunks), por_lote * 1.3)
        batch = client.messages.batches.create(
            requests=[{"custom_id": k, "params": params(v)} for k, v in chunks.items()]
        )
        bid = batch.id
        json.dump({"id": bid, "n_lotes": len(chunks)}, open(estado, "w"))
        print(f"batch criado: {bid} ({len(chunks)} lotes)", flush=True)
    while True:
        b = client.messages.batches.retrieve(bid)
        c = b.request_counts
        print(f"{b.processing_status}: ok {c.succeeded} · erro {c.errored} · processando {c.processing}", flush=True)
        if b.processing_status == "ended":
            break
        time.sleep(60)
    for r in client.messages.batches.results(bid):
        if r.result.type != "succeeded":
            continue
        msg = r.result.message
        registrar(split_name, lote, "batches", msg.usage.model_dump(), lote, desconto=0.5)
        try:
            salvar(f, parse(msg))
        except (ValueError, KeyError, StopIteration, json.JSONDecodeError) as e:
            print(f"{r.custom_id}: resposta inválida ({e})", flush=True)
    # o que faltou (erro ou id perdido) vai pelo modo síncrono
    faltam = df[~df.id.isin(ja_feitos(f))]
    if len(faltam):
        print(f"faltaram {len(faltam)}; completando no modo síncrono", flush=True)
        sincrono(client, faltam, split_name, lote, f)
    return ja_feitos(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("split", choices=["gab_dev", "treino", "gab_teste"])
    ap.add_argument("--final", action="store_true", help="exigido para gab_teste: só para a medição final")
    ap.add_argument("--lote", type=int, default=25)
    ap.add_argument("--batches", action="store_true")
    a = ap.parse_args()
    # gzip: o pacote brotli antigo do ambiente quebra a descompressão do httpx2
    client = anthropic.Anthropic(max_retries=6, default_headers={"Accept-Encoding": "gzip, deflate"})
    df = split(a.split)
    f = out_file(a.split, a.lote)
    t0 = time.time()
    labels = (via_batches if a.batches else sincrono)(client, df, a.split, a.lote, f)
    print(f"{len(labels)}/{len(df)} rotuladas em {time.time() - t0:.0f} s", flush=True)
    if "label" in df:
        d = df[df.id.isin(labels)]
        print(a.split, f"lote {a.lote}", metrics(d.label, d.id.map(labels)), flush=True)
    print(f"gasto total na API: US$ {gasto_total():.2f}", flush=True)


if __name__ == "__main__":
    main()
