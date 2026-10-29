"""Mede o modelo pequeno no gabarito humano (gab_teste, 189) e monta a tabela comparativa.

Variantes medidas, uma avaliação por vez na CPU (latência realista de quem classifica sob demanda):
- pytorch fp32 (models/radar-avaliacoes)
- onnx fp32 e onnx int8 (models/radar-avaliacoes-onnx), via onnxruntime

As linhas de referência (TF-IDF, BERTimbau com rótulos do Haiku, LLMs) vêm do estudo
avaliacoes-decisao, no mesmo gab_teste: results/referencia_gab_teste.csv.

Uso: python ml/avaliar.py [gab_teste|gab_dev]
"""
import json
import os
import sys
import time

import numpy as np
import onnxruntime as ort
import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

sys.path.insert(0, os.path.dirname(__file__))
from common import metrics, path, split  # noqa: E402
from labels import NAMES  # noqa: E402

MAX_LEN = 128


def softmax(z):
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


def rodar(nome, fn, df):
    fn(df.text.iloc[0])  # aquecimento
    preds, confs, ms = [], [], []
    rows = []
    for r in df.itertuples():
        t = time.perf_counter()
        p = fn(r.text)
        ms.append((time.perf_counter() - t) * 1000)
        preds.append(NAMES[int(p.argmax())])
        confs.append(float(p.max()))
        rows.append({"id": r.id, "pred": preds[-1], "probs": {n: round(float(v), 4) for n, v in zip(NAMES, p)}})
    m = metrics(df.label, preds, confs) | {"ms_mediana": round(float(np.median(ms)), 1)}
    return m, rows


def main():
    sp = sys.argv[1] if len(sys.argv) > 1 else "gab_teste"
    df = split(sp)
    torch.set_num_threads(os.cpu_count())
    src, onx = path("models", "radar-avaliacoes"), path("models", "radar-avaliacoes-onnx")
    tok = AutoTokenizer.from_pretrained(src)
    pt = AutoModelForSequenceClassification.from_pretrained(src).eval()

    def f_pt(text):
        with torch.no_grad():
            enc = tok(text, truncation=True, max_length=MAX_LEN, return_tensors="pt")
            return softmax(pt(**enc).logits[0].numpy())

    variantes = {"radar-pytorch-fp32": f_pt}
    for nome, arq in [("radar-onnx-fp32", "model.onnx"), ("radar-onnx-int8", "model_quantized.onnx")]:
        f = os.path.join(onx, "onnx", arq)
        if not os.path.exists(f):
            continue
        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count()
        sess = ort.InferenceSession(f, so, providers=["CPUExecutionProvider"])

        def f_onnx(text, sess=sess):
            enc = tok(text, truncation=True, max_length=MAX_LEN, return_tensors="np")
            feed = {k: enc[k].astype(np.int64) for k in ("input_ids", "attention_mask", "token_type_ids")}
            return softmax(sess.run(["logits"], feed)[0][0])

        variantes[nome] = f_onnx

    linhas = []
    for nome, fn in variantes.items():
        m, rows = rodar(nome, fn, df)
        with open(path("results", f"preds_{nome}_{sp}.jsonl"), "w") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(nome, m, flush=True)
        linhas.append({"modelo": nome, **m})
    out = pd.DataFrame(linhas)
    out.to_csv(path("results", f"radar_{sp}.csv"), index=False)
    if sp == "gab_teste":
        from sklearn.metrics import classification_report, confusion_matrix

        best = pd.read_json(path("results", f"preds_radar-onnx-int8_{sp}.jsonl"), lines=True) if "radar-onnx-int8" in variantes else None
        if best is not None:
            y = df.set_index("id").label.loc[best.id]
            rep = classification_report(y, best.pred, labels=NAMES, zero_division=0, output_dict=True)
            json.dump(rep, open(path("results", "radar_int8_por_classe_gab_teste.json"), "w"), indent=1)
            cm = pd.DataFrame(confusion_matrix(y, best.pred, labels=NAMES), index=NAMES, columns=NAMES)
            cm.to_csv(path("results", "radar_int8_confusao_gab_teste.csv"))
            print(classification_report(y, best.pred, labels=NAMES, zero_division=0))
            print(cm)


if __name__ == "__main__":
    main()
