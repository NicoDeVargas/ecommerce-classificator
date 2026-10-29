"""Exporta o modelo treinado para ONNX e quantiza em int8 (pesos), no formato que o
transformers.js espera:

  models/radar-avaliacoes-onnx/
    config.json, tokenizer.json, tokenizer_config.json, ...
    onnx/model.onnx             (fp32)
    onnx/model_quantized.onnx   (int8 dinâmico; é o que o app carrega com dtype "q8")

Também copia a pasta para app/public/models/radar-avaliacoes/ (fora do git) para o app local.
"""
import os
import shutil
import sys

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification, AutoTokenizer

sys.path.insert(0, os.path.dirname(__file__))
from common import path  # noqa: E402

SRC = path("models", "radar-avaliacoes")
DST = path("models", "radar-avaliacoes-onnx")
APP = path("app", "public", "models", "radar-avaliacoes")


def main():
    os.makedirs(os.path.join(DST, "onnx"), exist_ok=True)
    tok = AutoTokenizer.from_pretrained(SRC)
    model = AutoModelForSequenceClassification.from_pretrained(SRC).eval()
    model.config.return_dict = True
    enc = tok(["Produto chegou quebrado e ninguém responde."], return_tensors="pt")
    fp32 = os.path.join(DST, "onnx", "model.onnx")
    torch.onnx.export(
        model,
        (enc["input_ids"], enc["attention_mask"], enc["token_type_ids"]),
        fp32,
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=["logits"],
        dynamic_axes={k: {0: "batch", 1: "seq"} for k in ["input_ids", "attention_mask", "token_type_ids"]}
        | {"logits": {0: "batch"}},
        opset_version=14,
        do_constant_folding=True,
        dynamo=False,
    )
    q8 = os.path.join(DST, "onnx", "model_quantized.onnx")
    quantize_dynamic(fp32, q8, weight_type=QuantType.QInt8)
    model.config.save_pretrained(DST)
    tok.save_pretrained(DST)
    for f in ["treino_info.json"]:
        if os.path.exists(os.path.join(SRC, f)):
            shutil.copy(os.path.join(SRC, f), DST)
    for f in (fp32, q8):
        print(f, f"{os.path.getsize(f) / 1e6:.1f} MB")
    # o app só precisa do int8
    if os.path.exists(APP):
        shutil.rmtree(APP)
    os.makedirs(os.path.join(APP, "onnx"))
    for f in os.listdir(DST):
        if os.path.isfile(os.path.join(DST, f)):
            shutil.copy(os.path.join(DST, f), APP)
    shutil.copy(q8, os.path.join(APP, "onnx"))
    print("copiado para", APP)


if __name__ == "__main__":
    main()
