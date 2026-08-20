/* يبني dist/nadheer.html — ملف واحد مكتفٍ بذاته يعمل من file:// بلا إنترنت */
const fs = require('fs'), path = require('path');
const rd = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

const out = rd('src/index.template.html')
  .replace('/*__CSS__*/',        () => rd('src/styles.css'))
  .replace('/*__PDFJS__*/',      () => rd('vendor/pdf.min.js'))
  .replace('/*__WORKER_B64__*/', () => fs.readFileSync(path.join(__dirname, 'vendor/pdf.worker.min.js')).toString('base64'))
  .replace('/*__ENGINE__*/',     () => rd('src/engine.js'))
  .replace('/*__APP__*/',        () => rd('src/app.js'));

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/nadheer.html'), out);

// ── حارس الانعزال ──
// كودنا نحن يجب أن يخلو تمامًا من أي مرجع شبكي.
const ours = ['src/index.template.html', 'src/styles.css', 'src/engine.js', 'src/app.js']
  .map(f => ({ f, src: rd(f) }));
const NET = [/https?:\/\/(?!www\.w3\.org)[^\s"'`)]+/g, /\bfetch\s*\(/g, /XMLHttpRequest/g,
             /WebSocket/g, /navigator\.sendBeacon/g, /EventSource/g, /import\s*\(/g];
const bad = [];
ours.forEach(({ f, src }) => NET.forEach(re => {
  const m = src.match(re);
  if (m) [...new Set(m)].forEach(h => bad.push(f + ' → ' + h));
}));
if (bad.length) { console.error('✗ مراجع شبكية في كودنا:\n  ' + bad.join('\n  ')); process.exit(1); }

// pdf.js المضمَّن يحوي مسارات شبكية لا نسلكها (نمرّر ArrayBuffer مباشرة، لا رابطًا).
// خط الدفاع الفعلي هو الـCSP في القالب — يمنع المتصفحُ أي اتصال خارجي حتى لو استُدعي.
const csp = rd('src/index.template.html').match(/Content-Security-Policy" content="([^"]+)"/);
if (!csp) { console.error('✗ وسم CSP مفقود من القالب'); process.exit(1); }
['default-src \'none\'', 'connect-src blob: data:'].forEach(d => {
  if (!csp[1].includes(d)) { console.error('✗ CSP لا يتضمن: ' + d); process.exit(1); }
});

console.log('✓ dist/nadheer.html — ' + (out.length / 1048576).toFixed(2) + ' ميجابايت');
console.log('✓ صفر مراجع شبكية في كودنا (' + ours.length + ' ملفات)');
console.log('✓ CSP يمنع أي اتصال خارجي: ' + csp[1].slice(0, 58) + '…');
