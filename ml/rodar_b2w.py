"""Classifica as 132 mil avaliações da B2W com o modelo int8 (ONNX) e grava a base classificada.

Saída (fora do git, é grande): data/raw/b2w_classificado.csv, com
texto, produto_id, produto, departamento, data, estado, nota, categoria, confianca.
Os achados (alertas) são calculados depois pelo mesmo motor do app:
  node app/scripts/gerar-achados.mjs
"""
import os
import sys
import time

import numpy as np
import onnxruntime as ort
import pandas as pd
from transformers import AutoTokenizer

sys.path.insert(0, os.path.dirname(__file__))
from common import path  # noqa: E402
from labels import NAMES  # noqa: E402

MAX_LEN, BS = 128, 64
ONNX_DIR = path("models", "radar-avaliacoes-onnx")


def main():
    df = pd.read_parquet(path("data/raw/b2w.parquet"))
    df["texto"] = (df.review_title.fillna("").str.strip() + ". " + df.review_text.fillna("").str.strip()).str.strip(". ")
    df = df[df.texto.str.len() >= 3].reset_index(drop=True)
    print(len(df), "avaliações", flush=True)

    tok = AutoTokenizer.from_pretrained(ONNX_DIR)
    so = ort.SessionOptions()
    so.intra_op_num_threads = os.cpu_count()
    sess = ort.InferenceSession(os.path.join(ONNX_DIR, "onnx", "model_quantized.onnx"), so, providers=["CPUExecutionProvider"])

    texts = df.texto.tolist()
    order = np.argsort([len(t) for t in texts])
    probs = np.zeros((len(texts), len(NAMES)), np.float32)
    t0 = time.time()
    for i in range(0, len(order), BS):
        ids = order[i : i + BS]
        enc = tok([texts[j] for j in ids], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="np")
        feed = {k: enc[k].astype(np.int64) for k in ("input_ids", "attention_mask", "token_type_ids")}
        z = sess.run(["logits"], feed)[0]
        z = z - z.max(1, keepdims=True)
        e = np.exp(z)
        probs[ids] = e / e.sum(1, keepdims=True)
        if (i // BS) % 200 == 0:
            print(f"{i}/{len(order)} · {time.time() - t0:.0f} s", flush=True)
    dt = time.time() - t0
    print(f"classificadas em {dt / 60:.1f} min ({dt / len(texts) * 1000:.2f} ms por avaliação em lote)", flush=True)

    out = pd.DataFrame(
        {
            "texto": df.texto,
            "produto_id": df.product_id,
            "produto": df.product_name,
            "departamento": df.site_category_lv1,
            "data": pd.to_datetime(df.submission_date).dt.strftime("%Y-%m-%d"),
            "estado": df.reviewer_state,
            "nota": df.overall_rating,
            "categoria": [NAMES[i] for i in probs.argmax(1)],
            "confianca": probs.max(1).round(3),
        }
    )
    out.to_csv(path("data/raw/b2w_classificado.csv"), index=False)
    print(out.categoria.value_counts(normalize=True).round(3).to_dict())
    with open(path("results", "b2w_inferencia.txt"), "w") as f:
        f.write(f"{len(out)} avaliações; {dt / 60:.1f} min na CPU; {dt / len(texts) * 1000:.2f} ms/avaliação em lotes de {BS}\n")
        f.write(out.categoria.value_counts().to_string() + "\n")


if __name__ == "__main__":
    main()
