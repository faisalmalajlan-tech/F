/* يبني dist/nadheer.html — ملف واحد مكتفٍ بذاته يعمل من file:// بلا إنترنت */
const fs = require('fs'), path = require('path');
const rd = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const b64 = p => fs.readFileSync(path.join(__dirname, p)).toString('base64');

/* بناء نحيف للّصق اليدوي: كودنا وحده بلا مكتبة PDF ولا فيديو.
   ٣ ميجابايت لا تُلصق في محرّر، و٢٩٦ كيلوبايت تُلصق.
   قراءة الـTXT وكل المحرك تبقى كاملة — يسقط رفع PDF والخلفية فقط. */
const SLIM = process.argv.includes('--slim');

const out = rd('src/index.template.html')
  .replace('/*__CSS__*/', () => rd('src/styles.css')
      .replace('/*__MESH__*/', 'url("data:image/svg+xml;base64,' +
        fs.readFileSync(path.join(__dirname, 'src/mesh.svg')).toString('base64') + '")'))
  .replace('/*__PDFJS__*/',      () => SLIM ? '/* pdf.js غير مضمَّن في البناء النحيف */' : rd('vendor/pdf.min.js'))
  .replace('/*__WORKER_B64__*/', () => SLIM ? '' : fs.readFileSync(path.join(__dirname, 'vendor/pdf.worker.min.js')).toString('base64'))
  .replace('/*__CRYPTO__*/',     () => rd('src/crypto.js'))
  .replace('/*__SYNC__*/',       () => rd('src/sync.js'))
  .replace('/*__CONFIG__*/',     () => rd('src/config.js'))
  .replace('/*__ENGINE__*/',     () => rd('src/engine.js'))
  .replace('/*__AUDIT__*/',      () => rd('src/audit.js'))
  .replace('/*__STORE__*/',      () => rd('src/store.js'))
  .replace('/*__CONFLICTS__*/',  () => rd('src/conflicts.js'))
  .replace('/*__APP__*/',        () => rd('src/app.js'))
  /* الخلفية المتحركة تُضمَّن كبيانات: الملف يبقى مكتفيًا بذاته بلا طلب شبكة.
     ضُغطت من ٢٫٥ ميجابايت إلى ٠٫٣٧ — فهي خلف حجابٍ معتم، والدقة العالية ضياع. */
  .replace('__BACKDROP_WEBM__',  () => SLIM ? '' : 'data:video/webm;base64,' + b64('src/assets/backdrop.webm'))
  .replace('__BACKDROP__',       () => SLIM ? '' : 'data:video/mp4;base64,' + b64('src/assets/backdrop.mp4'))
  .replace('__BACKDROP_POSTER__',() => SLIM ? '' : 'data:image/jpeg;base64,' + b64('src/assets/backdrop-poster.jpg'));

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, SLIM ? 'dist/nadheer-slim.html' : 'dist/nadheer.html'), out);

// ── حارس الانعزال ──
// كودنا نحن يجب أن يخلو تمامًا من أي مرجع شبكي.
/* sync.js يُستثنى من حارس الانعزال: هو الوحيد المصرَّح له بالشبكة،
   وبلا ضبطٍ من المستخدم لا يتصل بشيء. */
const ours = ['src/index.template.html', 'src/styles.css', 'src/config.js',
              'src/engine.js', 'src/audit.js', 'src/store.js', 'src/conflicts.js',
              'src/crypto.js', 'src/app.js']
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
['default-src \'none\'', 'media-src data:'].forEach(d => {
  if (!csp[1].includes(d)) { console.error('✗ CSP لا يتضمن: ' + d); process.exit(1); }
});

console.log('✓ dist/' + (SLIM ? 'nadheer-slim' : 'nadheer') + '.html — ' +
  (out.length / 1048576).toFixed(2) + ' ميجابايت' + (SLIM ? '  (بلا PDF ولا فيديو)' : ''));
console.log('✓ صفر مراجع شبكية في كودنا (' + ours.length + ' ملفات)');
/* لم يعد المنع مطلقًا: connect-src يسمح https ليصل المستخدم بخادمه.
   قولُ غير ذلك في مخرجات البناء ادّعاءٌ كاذب على أنفسنا. */
const openNet = csp[1].includes('connect-src') && /connect-src[^;]*https:/.test(csp[1]);
console.log(openNet
  ? '⚠ CSP يسمح بالاتصال بخادم المزامنة (https) — وبلا ضبطٍ من المستخدم لا يتصل بشيء'
  : '✓ CSP يمنع أي اتصال خارجي: ' + csp[1].slice(0, 58) + '…');
