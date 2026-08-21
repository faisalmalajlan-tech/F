const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const P = f => fs.readFileSync(path.resolve(__dirname, '../samples/' + f), 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 440, height: 950 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/nadheer.html'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'dist/shot-login.png' });
  await page.click('.role[data-role="admin"]'); await page.waitForTimeout(180);
  await page.fill('#gateCode', '1234'); await page.click('#gateGo'); await page.waitForTimeout(450);

  const add = async (name, text, ref) => {
    await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(300);
    await page.fill('#docName', name); await page.fill('#paste_doc1', text);
    if (ref) await page.fill('#paste_doc2', ref);
    await page.click('#analyzeBtn'); await page.waitForTimeout(1800);
  };
  const nav = async r => { await page.click('#burgerBtn'); await page.waitForTimeout(140);
    await page.click(`.navpanel [data-r="${r}"]`); await page.waitForTimeout(420); };

  await add('إجراءات أمن المعلومات', P('02-إجراءات-داخلية-نموذج-تجريبي.txt'), P('01-سياسات-البنك-المركزي-نموذج-تجريبي.txt'));
  await nav('docs'); await add('سياسة الرسوم والعمولات',
    P('04-سياسة-الرسوم-الداخلية-نموذج-تجريبي.txt'), P('03-تعليمات-الرسوم-نموذج-تجريبي.txt'));
  await page.click('[data-tab="fix"]'); await page.waitForTimeout(450);
  await page.fill('#fxOrg', 'بنك الواحة التجاري'); await page.fill('#fxNum', '2026/14');
  await page.fill('#fxEff', '2026-09-01'); await page.fill('#fxOwner', 'قطاع الخدمات المصرفية');
  await page.fill('#fxRef', 'تعليمات الرسوم والعمولات'); await page.fill('#fxDays', '30');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'dist/shot-fix.png' });
  // التعارض الحدّي في الزوج الأمني
  await nav('docs'); await page.click('.doc-main'); await page.waitForTimeout(420);
  await page.click('[data-tab="fix"]'); await page.waitForTimeout(450);
  await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(200);
  await page.screenshot({ path: 'dist/shot-threshold.png' });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);

  // نزرع أسبوعًا من التاريخ ليظهر منحنى الخطر
  await page.evaluate(() => {
    const k='nadheer:docs:v1', all=JSON.parse(localStorage.getItem(k));
    all.forEach((d,j)=>{ const base=d.history[0].r; const h=[];
      for(let i=9;i>=1;i--) h.push({d:new Date(Date.now()-i*86400000).toISOString().slice(0,10), r: base-(i*0.9)-(j?1.4:0)+Math.sin(i)*0.5});
      d.history=h.concat(d.history); });
    localStorage.setItem(k, JSON.stringify(all));
  });
  await page.reload(); await page.waitForTimeout(1100);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
  await page.screenshot({ path: 'dist/shot-home.png' });
  await nav('docs');  await page.screenshot({ path: 'dist/shot-docs.png' });
  await nav('plan');  await page.screenshot({ path: 'dist/shot-plan.png' });
  await nav('docs'); await page.click('.doc-main'); await page.waitForTimeout(450);
  await page.screenshot({ path: 'dist/shot-doc.png' });
  await page.click('[data-tab="fix"]'); await page.waitForTimeout(450);
  await page.click('[data-tab="gaps"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'dist/shot-gaps.png' });
  console.log('أخطاء JS:', errs.length ? errs.join(' | ') : 'صفر');
  await b.close();
})();
