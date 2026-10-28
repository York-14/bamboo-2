import { strToU8, zipSync } from 'fflate';

// ファイルの保存。
// Claude の Artifact として開かれているときは、ページから直接ダウンロードできないため
// downloads 機能（閲覧者に確認を出して保存する）を使う。それ以外は通常のブラウザのダウンロード。

interface DownloadsApi {
  save(req: { filename: string; data: Blob | ArrayBuffer | string }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsApi | null>;
}

let downloadsPromise: Promise<DownloadsApi | null> | null = null;

/** Artifact の downloads 機能。Artifact 外（手元・通常の Web サーバー）では null */
function artifactDownloads(): Promise<DownloadsApi | null> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return Promise.resolve(null);
  downloadsPromise ??= host.use('downloads').catch(() => null);
  return downloadsPromise;
}

function browserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SaveOutcome = 'saved' | 'declined' | 'failed';

export interface SaveFile {
  name: string;
  data: Uint8Array;
}

/** 複数ファイルを 1 つの zip にまとめる（無圧縮。STL は小さいので十分） */
export function makeZip(files: SaveFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.name, [f.data, { level: 0 }]])));
}

export function textFile(name: string, text: string): SaveFile {
  return { name, data: strToU8(text) };
}

/**
 * ファイルを保存する。Artifact では、その拡張子が許可されていなければ（STL など）
 * 同じ名前の zip に入れて保存する。
 */
export async function saveFile(file: SaveFile, mime: string): Promise<SaveOutcome> {
  const downloads = await artifactDownloads();
  if (!downloads) {
    browserDownload(new Blob([file.data as BlobPart], { type: mime }), file.name);
    return 'saved';
  }
  const attempt = async (filename: string, data: Uint8Array): Promise<SaveOutcome | 'rejected_extension'> => {
    try {
      await downloads.save({ filename, data: new Blob([data as BlobPart]) });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'rejected_extension') return 'rejected_extension';
      return code === 'declined' ? 'declined' : 'failed';
    }
  };
  const first = await attempt(file.name, file.data);
  if (first !== 'rejected_extension') return first;
  const zipName = file.name.replace(/\.[^.]+$/, '') + '.zip';
  const second = await attempt(zipName, makeZip([file]));
  return second === 'rejected_extension' ? 'failed' : second;
}

/** ファイル名用の数値表記（小数点はファイル名で扱いやすいよう p に置き換える） */
export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', 'p');
}
