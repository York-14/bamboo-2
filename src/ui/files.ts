export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** ファイル名用の数値表記（小数点はファイル名で扱いやすいよう p に置き換える） */
export function fmt(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', 'p');
}
