"""Monta o CSV de exemplo do app (app/public/exemplo/avaliacoes-exemplo.csv).

São avaliações reais da B2W (CC BY 4.0), só com as colunas que um vendedor teria:
texto, produto, data, estado. Inclui os produtos de alguns alertas da demo, para o
exemplo mostrar os três tipos de alerta, e uma amostra aleatória do resto.
"""
import json
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from common import path  # noqa: E402

df = pd.read_csv(path("data/raw/b2w_classificado.csv"))
ach = json.load(open(path("app/public/demo/achados_b2w.json")))
partes = []
for a in ach["anuncio"]["alertas"][:2]:
    partes.append(df[df.produto == a["produto"]].head(40))
for a in ach["lote"]["alertas"][:1]:
    partes.append(df[df.produto == a["produto"]].head(80))
if ach["logistica"]["alertas"]:
    a = ach["logistica"]["alertas"][0]
    partes.append(df[(df.estado == a["estado"]) & df.data.str.startswith(a["mes"])].sample(60, random_state=1))
partes.append(df.sample(220, random_state=7))
ex = pd.concat(partes).drop_duplicates("texto").sample(frac=1, random_state=3)
ex = ex[["texto", "produto", "data", "estado"]]
os.makedirs(path("app/public/exemplo"), exist_ok=True)
ex.to_csv(path("app/public/exemplo/avaliacoes-exemplo.csv"), index=False)
print(len(ex), "linhas")
