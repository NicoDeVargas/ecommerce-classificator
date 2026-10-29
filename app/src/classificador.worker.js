// Classifica as avaliações no próprio navegador (transformers.js + ONNX int8, em WebAssembly).
// Nada sai da máquina: o modelo e o runtime são servidos pelo próprio site.

import { env, pipeline } from '@huggingface/transformers';

const BASE = import.meta.env.BASE_URL;
const MODELO = import.meta.env.VITE_MODEL_ID || 'radar-avaliacoes';
const REMOTO = import.meta.env.VITE_MODEL_REMOTE === 'true';

env.allowLocalModels = !REMOTO;
env.allowRemoteModels = REMOTO;
env.localModelPath = new URL(BASE + 'models/', self.location.origin).href;
env.backends.onnx.wasm.wasmPaths = new URL(BASE + 'ort/', self.location.origin).href;

let classificar = null;

async function carregar() {
  if (!classificar) {
    classificar = await pipeline('text-classification', MODELO, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
          self.postMessage({ tipo: 'baixando', progresso: p.progress / 100, total: p.total });
        }
      },
    });
  }
  return classificar;
}

self.onmessage = async (e) => {
  const { tipo, textos } = e.data;
  try {
    const clf = await carregar();
    if (tipo === 'carregar') {
      self.postMessage({ tipo: 'pronto' });
      return;
    }
    const out = [];
    const LOTE = 8;
    const t0 = performance.now();
    for (let i = 0; i < textos.length; i += LOTE) {
      const r = await clf(textos.slice(i, i + LOTE), { top_k: 1, truncation: true, max_length: 128 });
      for (const x of r) {
        const top = Array.isArray(x) ? x[0] : x;
        out.push({ categoria: top.label, confianca: Math.round(top.score * 1000) / 1000 });
      }
      self.postMessage({ tipo: 'progresso', feitos: out.length, total: textos.length, ms: performance.now() - t0 });
    }
    self.postMessage({ tipo: 'resultado', resultado: out, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ tipo: 'erro', mensagem: String(err?.message || err) });
  }
};
