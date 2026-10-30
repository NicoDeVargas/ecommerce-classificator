"""Monta a pasta pronta para subir ao Hugging Face (models/hf/). NÃO envia nada.

  models/hf/
    README.md                 (model-card/README.md)
    config.json, tokenizer*, vocab.txt, model.safetensors
    onnx/model.onnx, onnx/model_quantized.onnx

Para publicar (o dono faz, depois de revisar):
  huggingface-cli login
  huggingface-cli upload NicoDeVargas/radar-avaliacoes-bertimbau models/hf . --repo-type model
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import path  # noqa: E402

PT = path("models", "radar-avaliacoes")
ONNX = path("models", "radar-avaliacoes-onnx")
DST = path("models", "hf")

if os.path.exists(DST):
    shutil.rmtree(DST)
os.makedirs(os.path.join(DST, "onnx"))
for f in os.listdir(PT):
    if f != "treino_info.json":
        shutil.copy(os.path.join(PT, f), DST)
# o tokenizer da pasta ONNX tem model_max_length = 128 (o corte do treino)
for f in ["tokenizer_config.json", "tokenizer.json", "special_tokens_map.json", "vocab.txt"]:
    shutil.copy(os.path.join(ONNX, f), DST)
for f in os.listdir(os.path.join(ONNX, "onnx")):
    shutil.copy(os.path.join(ONNX, "onnx", f), os.path.join(DST, "onnx"))
shutil.copy(path("model-card", "README.md"), DST)
for raiz, _, arqs in os.walk(DST):
    for a in sorted(arqs):
        f = os.path.join(raiz, a)
        print(f"{os.path.relpath(f, DST):32s} {os.path.getsize(f) / 1e6:8.1f} MB")
