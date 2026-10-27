import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaseParams } from '../model/params';
import type { BuildResult } from '../model/mesh';
import { hasError, validate, type Issue } from '../model/validate';
import { GeometryClient } from '../worker/client';

const DEBOUNCE_MS = 120;

export interface GeometryState {
  /** 最後に生成に成功した結果。入力エラー中も直前の形状を表示し続ける */
  result: BuildResult | null;
  issues: Issue[];
  buildError: string | null;
  busy: boolean;
  elapsedMs: number | null;
}

/** パラメータの変更を間引いて Worker に形状生成を依頼する */
export function useGeometry(params: CaseParams): GeometryState {
  const clientRef = useRef<GeometryClient | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const issues = useMemo(() => validate(params), [params]);
  const blocked = hasError(issues);

  useEffect(() => {
    const client = new GeometryClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (blocked) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const client = clientRef.current;
      if (!client) return;
      setBusy(true);
      const outcome = await client.build(params);
      if (cancelled || outcome.status === 'stale') return;
      setBusy(false);
      if (outcome.status === 'ok') {
        setResult(outcome.result);
        setElapsedMs(outcome.elapsedMs);
        setBuildError(null);
      } else {
        setBuildError(outcome.error);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params, blocked]);

  return { result, issues, buildError, busy: busy && !blocked, elapsedMs };
}
