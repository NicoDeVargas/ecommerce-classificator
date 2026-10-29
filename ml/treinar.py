"""Aluno: BERTimbau base com fine-tuning nos rótulos do professor (Opus 5.5 + régua), na CPU.

- 4.700 avaliações rotuladas pelo professor: 4.400 para treinar, 300 para validar (rótulo do
  professor) e ajustar a temperatura da calibração.
- gab_dev (humano) é acompanhado a cada época, só para olhar; a escolha final não usa gab_teste.
- A temperatura é embutida na camada de classificação (pesos / T) antes de salvar, para que o
  softmax do modelo exportado já saia calibrado, no Python e no navegador.

Uso: python ml/treinar.py [--epocas 3] [--pesos-classe]
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

sys.path.insert(0, os.path.dirname(__file__))
from common import metrics, path, split  # noqa: E402
from labels import NAMES  # noqa: E402

BASE = "neuralmind/bert-base-portuguese-cased"
MAX_LEN, BATCH, LR = 128, 16, 3e-5
IDX = {n: i for i, n in enumerate(NAMES)}


def dados():
    tr = split("treino")
    lab = pd.read_json(path("data/treino_rotulado_opus.jsonl"), lines=True).drop_duplicates("id")
    df = tr.merge(lab, on="id")
    val = df.sample(300, random_state=11)
    return df[~df.id.isin(val.id)].reset_index(drop=True), val.reset_index(drop=True)


def logits_de(model, tok, texts, bs=32):
    """Inferência em lotes ordenados por tamanho (padding dinâmico), na ordem original."""
    order = np.argsort([len(t) for t in texts])
    out = np.zeros((len(texts), len(NAMES)), np.float32)
    model.eval()
    with torch.no_grad():
        for i in range(0, len(texts), bs):
            ids = order[i : i + bs]
            enc = tok([texts[j] for j in ids], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
            out[ids] = model(**enc).logits.numpy()
    return out


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def ajustar_temperatura(logits, y):
    """Busca a temperatura que minimiza a log-loss no conjunto de validação."""
    best = (1.0, 1e9)
    for t in np.arange(0.5, 4.01, 0.05):
        p = softmax(logits / t)
        nll = -np.log(p[np.arange(len(y)), y] + 1e-12).mean()
        if nll < best[1]:
            best = (float(t), nll)
    return best[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epocas", type=int, default=3)
    ap.add_argument("--pesos-classe", action="store_true")
    ap.add_argument("--saida", default=path("models", "radar-avaliacoes"))
    a = ap.parse_args()
    torch.manual_seed(42)
    torch.set_num_threads(os.cpu_count())

    train, val = dados()
    print("treino", len(train), train.label.value_counts().to_dict(), flush=True)
    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE, num_labels=len(NAMES), id2label=dict(enumerate(NAMES)), label2id=IDX
    )
    y = np.array([IDX[l] for l in train.label])
    weight = None
    if a.pesos_classe:
        cnt = np.bincount(y, minlength=len(NAMES)).astype(float)
        weight = torch.tensor((cnt.sum() / (len(NAMES) * np.maximum(cnt, 1))) ** 0.5, dtype=torch.float)
        print("pesos", dict(zip(NAMES, weight.numpy().round(2))), flush=True)
    lossf = torch.nn.CrossEntropyLoss(weight=weight)

    # lotes de tamanhos parecidos: padding dinâmico deixa o treino na CPU bem mais rápido
    texts = list(train.text)
    steps_per_epoch = (len(texts) + BATCH - 1) // BATCH
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * steps_per_epoch * a.epocas), steps_per_epoch * a.epocas)
    dev = split("gab_dev")
    rng = np.random.default_rng(0)
    t0 = time.time()
    hist = []
    for ep in range(a.epocas):
        model.train()
        order = np.argsort(np.array([len(t) for t in texts]) + rng.uniform(0, 40, len(texts)))
        batches = [order[i : i + BATCH] for i in range(0, len(order), BATCH)]
        rng.shuffle(batches)
        for step, ids in enumerate(batches):
            enc = tok([texts[j] for j in ids], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
            loss = lossf(model(**enc).logits, torch.tensor(y[ids]))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(), sched.step(), opt.zero_grad()
            if step % 50 == 0:
                print(f"época {ep + 1} passo {step}/{len(batches)} loss {loss.item():.3f} · {time.time() - t0:.0f} s", flush=True)
        lv = logits_de(model, tok, list(val.text))
        ld = logits_de(model, tok, list(dev.text))
        r = {
            "epoca": ep + 1,
            "val_professor": metrics(val.label, [NAMES[i] for i in lv.argmax(1)]),
            "gab_dev": metrics(dev.label, [NAMES[i] for i in ld.argmax(1)]),
        }
        hist.append(r)
        print(r, flush=True)

    # calibração por temperatura no conjunto de validação (rótulos do professor)
    lv = logits_de(model, tok, list(val.text))
    T = ajustar_temperatura(lv, np.array([IDX[l] for l in val.label]))
    with torch.no_grad():
        model.classifier.weight /= T
        model.classifier.bias /= T
    print(f"temperatura {T:.2f} embutida no classificador", flush=True)
    os.makedirs(a.saida, exist_ok=True)
    model.save_pretrained(a.saida)
    tok.save_pretrained(a.saida)
    info = {
        "base": BASE,
        "professor": "claude-opus-5-5 + régua, lotes de 25",
        "n_treino": len(train),
        "n_val": len(val),
        "epocas": a.epocas,
        "pesos_classe": a.pesos_classe,
        "temperatura": T,
        "minutos_treino": round((time.time() - t0) / 60, 1),
        "historico": hist,
    }
    json.dump(info, open(os.path.join(a.saida, "treino_info.json"), "w"), ensure_ascii=False, indent=2)
    print(json.dumps(info, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
