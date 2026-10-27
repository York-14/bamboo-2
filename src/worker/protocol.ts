import type { CaseParams } from '../model/params';
import type { BuildResult } from '../model/mesh';

export interface BuildRequest {
  id: number;
  params: CaseParams;
}

export type BuildResponse =
  | { id: number; ok: true; result: BuildResult; elapsedMs: number }
  | { id: number; ok: false; error: string };
