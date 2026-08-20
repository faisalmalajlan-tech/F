/* يولّد شبكة الخلفية: نسيج منحنٍ + تثليث بنقاط مضيئة.
   عشوائية مزروعة (seeded) ليخرج نفس الملف في كل بناء. */
const W = 1600, H = 1000;
let seed = 20260820;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/* ١. نسيج منحنٍ — أشرطة بيزيه متدرّجة توحي بسطح ثلاثي الأبعاد */
let fabric = '';
for (let b = 0; b < 3; b++) {
  const lift = 120 + b * 130, drop = 40 + b * 60;
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const y0 = H * 0.92 - t * lift, y1 = H * 0.10 + t * drop;
    const op = (0.16 - b * 0.04) * (1 - Math.abs(t - 0.45) * 0.9);
    if (op <= 0.005) continue;
    fabric += `<path d="M-40 ${y0.toFixed(1)}C${W * 0.30} ${(y0 - 190).toFixed(1)},${W * 0.62} ${(y1 + 150).toFixed(1)},${W + 40} ${y1.toFixed(1)}" stroke="#A9B6E8" stroke-width="${(0.5 + b * 0.15).toFixed(2)}" opacity="${op.toFixed(3)}"/>`;
  }
}

/* ٢. نقاط على شبكة مهتزّة، ثم وصل كل نقطة بأقرب جيرانها */
const COLS = 11, ROWS = 8, pts = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const jx = (rnd() - 0.5) * (W / COLS) * 0.85;
    const jy = (rnd() - 0.5) * (H / ROWS) * 0.85;
    pts.push({ x: (c + 0.5) * (W / COLS) + jx, y: (r + 0.5) * (H / ROWS) + jy, r: rnd() });
  }
}
const LINK = W / COLS * 1.5;
let edges = '', seen = new Set();
pts.forEach((p, i) => {
  const near = pts.map((q, j) => ({ j, d: Math.hypot(p.x - q.x, p.y - q.y) }))
    .filter(o => o.j !== i && o.d < LINK).sort((a, b) => a.d - b.d).slice(0, 4);
  near.forEach(({ j, d }) => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (seen.has(k)) return;
    seen.add(k);
    const op = (0.30 * (1 - d / LINK) + 0.05).toFixed(3);
    edges += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${pts[j].x.toFixed(1)}" y2="${pts[j].y.toFixed(1)}" opacity="${op}"/>`;
  });
});
const nodes = pts.map(p => {
  const big = p.r > 0.88;
  return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${big ? 2.6 : 1.5}" opacity="${big ? 0.85 : 0.42}"${big ? ' fill="#E6D3A6"' : ''}/>`;
}).join('');

const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
`<g fill="none" stroke-linecap="round">${fabric}</g>` +
`<g stroke="#8FA0DC" stroke-width=".55" fill="none">${edges}</g>` +
`<g fill="#CBD7FF">${nodes}</g></svg>`;

require('fs').writeFileSync(__dirname + '/mesh.svg', svg);
console.log('mesh.svg: ' + svg.length + ' حرف · ' + pts.length + ' نقطة · ' + seen.size + ' وصلة');
