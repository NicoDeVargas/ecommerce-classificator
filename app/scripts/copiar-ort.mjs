// Copia o runtime WebAssembly do ONNX para public/ort/, para o app não depender de CDN.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(raiz, 'node_modules/@huggingface/transformers/dist');
const destino = join(raiz, 'public/ort');
mkdirSync(destino, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  if (!existsSync(join(origem, f))) throw new Error('não achei ' + f + ' (rode npm install)');
  copyFileSync(join(origem, f), join(destino, f));
}
console.log('runtime ONNX copiado para public/ort/');
