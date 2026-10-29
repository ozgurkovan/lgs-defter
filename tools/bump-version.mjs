// Yayından önce sürümü bir artırır: index.html'deki app.js?v= ve style.css?v= numaraları ile
// docs/version.json birlikte değişir. Açık uygulamalar version.json'dan yeni sürümü görüp kendini yeniler.
//   node tools/bump-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'docs');
const indexPath = join(docs, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const current = Math.max(...[...html.matchAll(/(?:app\.js|style\.css)\?v=(\d+)/g)].map((m) => +m[1]));
const next = current + 1;
writeFileSync(indexPath, html.replace(/(app\.js|style\.css)\?v=\d+/g, `$1?v=${next}`));
writeFileSync(join(docs, 'version.json'), JSON.stringify({ v: next }) + '\n');
console.log(`sürüm ${current} -> ${next}`);
