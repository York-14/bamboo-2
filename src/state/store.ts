import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_PARAMS, normalizeParams, type CaseParams } from '../model/params';

interface ParamsState {
  params: CaseParams;
  setBody: <K extends keyof CaseParams['body']>(key: K, value: CaseParams['body'][K]) => void;
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
