import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_HOLE,
  DEFAULT_PARAMS,
  DEFAULT_RETAINERS,
  normalizeParams,
  type CaseParams,
  type DividerSet,
  type HoleParams,
  type RetainerParams,
  type RetainerType,
} from '../model/params';

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const newHoleId = () => newId('h');

interface ParamsState {
  params: CaseParams;
  setBody: <K extends keyof CaseParams['body']>(key: K, value: CaseParams['body'][K]) => void;
  setLid: <K extends keyof CaseParams['lid']>(key: K, value: CaseParams['lid'][K]) => void;
  setDividers: <K extends keyof CaseParams['dividers']>(key: K, value: CaseParams['dividers'][K]) => void;
  setDividerSet: <K extends keyof DividerSet>(axis: 'x' | 'y', key: K, value: DividerSet[K]) => void;
  addHole: () => void;
  updateHole: (id: string, patch: Partial<HoleParams>) => void;
  duplicateHole: (id: string) => void;
  removeHole: (id: string) => void;
  setLayer: <K extends keyof CaseParams['layer']>(key: K, value: CaseParams['layer'][K]) => void;
  addRetainer: (type: RetainerType) => void;
  updateRetainer: (id: string, patch: Partial<RetainerParams>) => void;
  duplicateRetainer: (id: string) => void;
  removeRetainer: (id: string) => void;
  setPrint: <K extends keyof CaseParams['print']>(key: K, value: CaseParams['print'][K]) => void;
  /** JSON 読み込み時など、丸ごと置き換える（正規化してから入れる） */
  replace: (input: unknown) => void;
  reset: () => void;
}

/** localStorage が使えない環境（プライベートウィンドウ等）でも落ちないようにする */
const safeStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // 保存できなくても動作は続ける
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // 同上
    }
  },
}));

export const useParams = create<ParamsState>()(
  persist(
    (set) => ({
      params: DEFAULT_PARAMS,
      setBody: (key, value) =>
        set((s) => ({ params: { ...s.params, body: { ...s.params.body, [key]: value } } })),
      setLid: (key, value) =>
        set((s) => ({ params: { ...s.params, lid: { ...s.params.lid, [key]: value } } })),
      setDividers: (key, value) =>
        set((s) => ({ params: { ...s.params, dividers: { ...s.params.dividers, [key]: value } } })),
      setDividerSet: (axis, key, value) =>
        set((s) => {
          const dv = s.params.dividers;
          return { params: { ...s.params, dividers: { ...dv, [axis]: { ...dv[axis], [key]: value } } } };
        }),
      addHole: () =>
        set((s) => {
          // 既定の高さは手前の壁の中央
          const v = s.params.body.bottomThickness + s.params.body.innerHeight / 2;
          const hole: HoleParams = { ...DEFAULT_HOLE, v, id: newHoleId() };
          return { params: { ...s.params, holes: [...s.params.holes, hole] } };
        }),
      updateHole: (id, patch) =>
        set((s) => ({
          params: { ...s.params, holes: s.params.holes.map((h) => (h.id === id ? { ...h, ...patch } : h)) },
        })),
      duplicateHole: (id) =>
        set((s) => {
          const i = s.params.holes.findIndex((h) => h.id === id);
          if (i < 0) return s;
          const copy = { ...s.params.holes[i], id: newHoleId() };
          const holes = [...s.params.holes.slice(0, i + 1), copy, ...s.params.holes.slice(i + 1)];
          return { params: { ...s.params, holes } };
        }),
      removeHole: (id) =>
        set((s) => ({ params: { ...s.params, holes: s.params.holes.filter((h) => h.id !== id) } })),
      setLayer: (key, value) =>
        set((s) => ({ params: { ...s.params, layer: { ...s.params.layer, [key]: value } } })),
      addRetainer: (type) =>
        set((s) => {
          const r: RetainerParams = { ...DEFAULT_RETAINERS[type], id: newId('r') };
          return { params: { ...s.params, retainers: [...s.params.retainers, r] } };
        }),
      updateRetainer: (id, patch) =>
        set((s) => ({
          params: { ...s.params, retainers: s.params.retainers.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
        })),
      duplicateRetainer: (id) =>
        set((s) => {
          const i = s.params.retainers.findIndex((r) => r.id === id);
          if (i < 0) return s;
          const copy = { ...s.params.retainers[i], id: newId('r') };
          const retainers = [...s.params.retainers.slice(0, i + 1), copy, ...s.params.retainers.slice(i + 1)];
          return { params: { ...s.params, retainers } };
        }),
      removeRetainer: (id) =>
        set((s) => ({ params: { ...s.params, retainers: s.params.retainers.filter((r) => r.id !== id) } })),
      setPrint: (key, value) =>
        set((s) => ({ params: { ...s.params, print: { ...s.params.print, [key]: value } } })),
      replace: (input) => set({ params: normalizeParams(input) }),
      reset: () => set({ params: DEFAULT_PARAMS }),
    }),
    {
      name: 'bamboo-case-params',
      storage: safeStorage,
      partialize: (s) => ({ params: s.params }),
      merge: (persisted, current) => ({
        ...current,
        params: normalizeParams((persisted as { params?: unknown } | undefined)?.params),
      }),
    },
  ),
);
