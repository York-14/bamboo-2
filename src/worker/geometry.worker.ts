/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { buildCase } from '../model/build';
import type { BuildRequest, BuildResponse } from './protocol';

const wasmReady = Module({ locateFile: () => wasmUrl }).then((wasm) => {
  wasm.setup();
  return wasm;
});

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<BuildRequest>) => {
  const { id, params } = e.data;
  let response: BuildResponse;
  const transfer: Transferable[] = [];
  try {
    const wasm = await wasmReady;
    const start = performance.now();
    const result = buildCase(wasm, params);
    response = { id, ok: true, result, elapsedMs: performance.now() - start };
    for (const part of result.parts) {
      transfer.push(part.mesh.positions.buffer, part.mesh.indices.buffer);
    }
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  ctx.postMessage(response, transfer);
};
