import type { CaseParams } from '../model/params';
import type { BuildResult } from '../model/mesh';
import type { BuildRequest, BuildResponse } from './protocol';

export type BuildOutcome =
  | { status: 'ok'; result: BuildResult; elapsedMs: number }
  | { status: 'error'; error: string }
  /** 後から来た要求に追い越された */
  | { status: 'stale' };

/**
 * 形状計算 Worker のラッパー。
 * 要求ごとに連番を振り、最新の要求以外の結果は 'stale' として捨てる。
 */
export class GeometryClient {
  private worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private latestId = 0;
  private pending = new Map<number, (outcome: BuildOutcome) => void>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<BuildResponse>) => {
      const res = e.data;
      const resolve = this.pending.get(res.id);
      if (!resolve) return;
      this.pending.delete(res.id);
      if (res.id !== this.latestId) resolve({ status: 'stale' });
      else if (res.ok) resolve({ status: 'ok', result: res.result, elapsedMs: res.elapsedMs });
      else resolve({ status: 'error', error: res.error });
    };
  }

  build(params: CaseParams): Promise<BuildOutcome> {
    const id = this.nextId++;
    this.latestId = id;
    const request: BuildRequest = { id, params };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(request);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
