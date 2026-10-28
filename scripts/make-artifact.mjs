// Claude の Artifact として公開するためのページを作る。
// `BASE_PATH=./ vite build --outDir dist-artifact` の結果から、Artifact が包む前提の本文
// （<!doctype>・<html>・<head>・<body> なし）を dist-artifact/artifact.html に書き出す。
// 公開時は artifact.html をページとし、dist-artifact/assets/* を同じ相対パスで添付する。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = 'dist-artifact';
const html = readFileSync(`${dir}/index.html`, 'utf8');
const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`${what} が index.html に見つかりません`);
  return m[0];
};

const title = pick(/<title>[^<]*<\/title>/, 'title');
const css = pick(/<link rel="stylesheet"[^>]*>/, 'stylesheet');
const script = pick(/<script type="module"[^>]*><\/script>/, 'module script');
for (const tag of [css, script]) {
  if (!/(href|src)="\.\/assets\//.test(tag)) throw new Error(`相対パスになっていません: ${tag}`);
}

const page = [title, css, '<div id="root"></div>', script, ''].join('\n');
writeFileSync(`${dir}/artifact.html`, page);
console.log(`${dir}/artifact.html`);
for (const f of readdirSync(`${dir}/assets`)) console.log(`  assets/${f}`);
