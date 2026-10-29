"""Dados, divisões e métricas compartilhadas.

Divisões (as mesmas do estudo avaliacoes-decisao, para os números serem comparáveis):
- treino: 4.700 avaliações sem rótulo humano (data/treino_sem_rotulo.csv), rotuladas por LLM.
- gab_dev: 102 do gabarito humano, só para desenvolver (escrever régua, escolher lote etc.).
- gab_teste: 189 do gabarito humano, nunca usadas para decidir nada. Só medem no fim.
"""
import json
import os

import numpy as np
import pandas as pd

from labels import NAMES

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def path(*p):
    return os.path.join(ROOT, *p)


def treino():
    return pd.read_csv(path("data/treino_sem_rotulo.csv"))


def gold():
    ans = json.load(open(path("data/gabarito.json")))
    df = pd.read_csv(path("data/gold_candidatos.csv"))
    df["label"] = df.id.map(ans)
    return df[df.label.isin(NAMES)].reset_index(drop=True)


def gold_dev_test():
    """Mesma divisão do estudo original: estratificada por categoria, semente fixa."""
    g = gold()
    dev = g.groupby("label", group_keys=False).sample(frac=0.35, random_state=3)
    return dev.reset_index(drop=True), g[~g.id.isin(dev.id)].reset_index(drop=True)


def split(name):
    if name == "treino":
        return treino()
    if name == "gab_dev":
        return gold_dev_test()[0]
    if name == "gab_teste":
        return gold_dev_test()[1]
    raise ValueError(name)


def ece(conf, correct, bins=10):
    """Erro de calibração esperado: diferença média entre confiança e acerto, por faixa."""
    conf, correct = np.asarray(conf), np.asarray(correct, float)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs(conf[m].mean() - correct[m].mean())
    return total


def metrics(y_true, y_pred, conf=None):
    from sklearn.metrics import accuracy_score, f1_score

    y_true, y_pred = list(y_true), list(y_pred)
    out = {
        "n": len(y_true),
        "acerto": round(accuracy_score(y_true, y_pred), 4),
        "f1_macro": round(f1_score(y_true, y_pred, average="macro", labels=NAMES, zero_division=0), 4),
    }
    if conf is not None:
        out["ece"] = round(ece(conf, np.array(y_true) == np.array(y_pred)), 4)
    return out
