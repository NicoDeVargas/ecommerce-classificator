"""Monta results/tabela_gab_teste.csv: referências do estudo anterior + professor em lote + modelo do radar."""
import json
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from common import metrics, path, split  # noqa: E402

df = split("gab_teste")
ref = pd.read_csv(path("results/referencia_gab_teste.csv"))
ref["fonte"] = "estudo avaliacoes-decisao"
custo = [json.loads(l) for l in open(path("results/custo_api.jsonl"))]
c = [r for r in custo if r["split"] == "gab_teste" and r["lote"] == 25]
usd_1k = sum(r["usd"] for r in c) / len(df) * 1000
treino = [r for r in custo if r["split"] == "treino" and r["modo"] == "batches"]
usd_1k_batches = sum(r["usd"] for r in treino) / 4700 * 1000
prof = {j["id"]: j["label"] for j in map(json.loads, open(path("results/preds_opus-regua-lote25_gab_teste.jsonl")))}
m = metrics(df.label, df.id.map(prof))
linhas = [
    {"modelo": "llm-claude-opus-5-5-regua-lote25", **m, "ece": None, "ms_mediana": None,
     "usd_por_1k": round(usd_1k, 3), "usd_por_1k_batches": round(usd_1k_batches, 3), "fonte": "este repositório (professor)"}
]
radar = pd.read_csv(path("results/radar_gab_teste.csv"))
for r in radar.to_dict("records"):
    linhas.append({**r, "usd_por_1k": 0.0, "fonte": "este repositório (aluno)"})
out = pd.concat([ref.rename(columns={"usd_por_1k": "usd_por_1k"}), pd.DataFrame(linhas)], ignore_index=True)
out.to_csv(path("results/tabela_gab_teste.csv"), index=False)
print(out[["modelo", "acerto", "f1_macro", "ece", "ms_mediana", "usd_por_1k", "fonte"]].to_string(index=False))
print(f"professor: US$ {usd_1k:.2f}/1k síncrono, US$ {usd_1k_batches:.2f}/1k pela Batches API")
