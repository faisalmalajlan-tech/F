const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const P = f => fs.readFileSync(path.resolve(__dirname, '../samples/' + f), 'utf8');
const PROC = P('02-إجراءات-داخلية-نموذج-تجريبي.txt');
const POL  = P('01-سياسات-البنك-المركزي-نموذج-تجريبي.txt');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 440, height: 950 } });
  const net = [], errs = [];
  page.on('request', r => { if (!/^(file|blob|data):/.test(r.url())) net.push(r.url()); });
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
  const nav = async r => { await page.click('#burgerBtn'); await page.waitForTimeout(130);
    await page.click(`.navpanel [data-r="${r}"]`); await page.waitForTimeout(350); };
  const navCount = async () => { await page.click('#burgerBtn'); await page.waitForTimeout(130);
    const n = await page.locator('.navpanel .navlink[data-r]').count();
    await page.keyboard.press('Escape'); await page.waitForTimeout(130); return n; };
  const login = async (role, val) => {
    await page.click(`.role[data-role="${role}"]`); await page.waitForTimeout(160);
    await page.fill(role === 'admin' ? '#gateCode' : '#gateName', val);
    await page.click('#gateGo'); await page.waitForTimeout(450);
  };
  const addDoc = async (name, text, ref) => {
    await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(300);
    await page.fill('#docName', name); await page.fill('#paste_doc1', text);
    if (ref) await page.fill('#paste_doc2', ref);
    await page.click('#analyzeBtn'); await page.waitForTimeout(1800);
  };

  await page.goto('file://' + path.resolve(__dirname, '../dist/nadheer.html'));
  await page.waitForTimeout(500);

  console.log('\n— الدخول والتبسيط —');
  ok(await page.locator('#gate.open').isVisible(), 'البوابة تظهر أولًا');
  await login('user', 'فيصل');
  ok(!(await page.locator('#gate.open').isVisible()), 'الدخول العادي يعمل');
  ok((await navCount()) === 3, 'المستخدم العادي يرى ٣ صفحات فقط (كانت ٧)');

  console.log('\n— حفظ المستند —');
  await addDoc('إجراءات أمن المعلومات', PROC, POL);
  ok(await page.locator('.pagetitle').first().isVisible(), 'ينتقل لصفحة المستند بعد التحليل');
  ok((await page.locator('.pagetitle').first().textContent()).indexOf('إجراءات أمن') > -1, 'اسم المستند ظاهر');
  const risk1 = +(await page.locator('#tabBody .num').first().textContent());
  ok(risk1 > 0, 'درجة الخطر محسوبة: ' + risk1);

  await nav('docs');
  ok((await page.locator('.doc-card').count()) === 1, 'المستند ظهر في قائمة المستندات');

  console.log('\n— البقاء بعد إعادة التحميل —');
  await page.reload(); await page.waitForTimeout(900);
  ok(!(await page.locator('#gate.open').isVisible()), 'الجلسة باقية بعد إعادة التحميل');
  await nav('docs');
  ok((await page.locator('.doc-card').count()) === 1, 'المستند محفوظ فعلًا — نجا من إعادة التحميل');
  const savedName = await page.locator('.doc-name').first().textContent();
  ok(savedName.indexOf('إجراءات أمن') > -1, 'الاسم محفوظ: ' + savedName);

  console.log('\n— التحديث اليومي —');
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('nadheer:docs:v1'))[0].history);
  ok(hist.length >= 1 && hist[0].d === new Date().toISOString().slice(0, 10), 'سُجّلت نقطة خطر لتاريخ اليوم');
  ok(typeof hist[0].r === 'number', 'قيمة الخطر مخزّنة بدقة عشرية: ' + hist[0].r.toFixed(2));
  // نزرع تاريخًا سابقًا لنتحقق من ظهور الفرق ومنحنى الخطر
  await page.evaluate(() => {
    const k = 'nadheer:docs:v1', all = JSON.parse(localStorage.getItem(k));
    const t = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    all[0].history.unshift({ d: t, r: all[0].history[0].r - 6 });
    localStorage.setItem(k, JSON.stringify(all));
  });
  await page.reload(); await page.waitForTimeout(900);
  ok((await page.locator('#pageContent').textContent()).indexOf('ما تغيّر منذ آخر فتح') > -1, 'الرئيسية تعرض ما تغيّر منذ آخر فتح');
  await nav('docs');
  ok((await page.locator('.doc-spark svg').count()) === 1, 'منحنى الخطر يظهر في بطاقة المستند');

  console.log('\n— خطة المعالجة —');
  await nav('plan');
  const tasks = await page.locator('.task').count();
  ok(tasks > 0, 'كل فجوة صارت مهمة: ' + tasks);
  ok((await page.locator('.statusbar').first().isVisible()), 'لكل مهمة شريط حالة');
  const beforeRisk = await page.evaluate(() => JSON.parse(localStorage.getItem('nadheer:docs:v1'))[0].lastRisk);
  // نُنجز أعلى ٦ مهام خطرًا
  for (let i = 0; i < 6; i++) {
    await page.locator('.task .st[data-status="done"]').first().click();
    await page.waitForTimeout(220);
  }
  const afterRisk = await page.evaluate(() => JSON.parse(localStorage.getItem('nadheer:docs:v1'))[0].lastRisk);
  ok(afterRisk < beforeRisk, 'إنجاز المهام يخفض الخطر فعلًا: ' + beforeRisk + ' → ' + afterRisk);
  await page.click('[data-pf="done"]'); await page.waitForTimeout(300);
  ok((await page.locator('.task').count()) === 6, 'تصفية المكتملة تعمل');
  await page.click('[data-pf="open"]'); await page.waitForTimeout(300);

  console.log('\n— صفحة المستند —');
  await nav('docs'); await page.click('.doc-main'); await page.waitForTimeout(400);
  for (const [tab, sel, label] of [['gaps', '.gap-card', 'الفجوات'], ['dl', '.pred-card', 'المواعيد'],
                                   ['rep', '.report-head', 'التقرير'], ['sum', '.clause-grid', 'نظرة عامة']]) {
    await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(350);
    ok(await page.locator(sel).first().isVisible(), 'تبويب ' + label + ' يعمل');
  }
  ok((await page.locator('#tabBody svg').count()) > 0, 'منحنى الخطر داخل صفحة المستند');
  await page.click('[data-tab="gaps"]'); await page.waitForTimeout(350);
  ok((await page.locator('details.why').count()) > 0, 'تفاصيل الحساب مطوية افتراضيًا (تبسيط)');
  // اقتباس من مستندك
  await page.locator('.evidence:not([data-src="ref"])').first().click(); await page.waitForTimeout(300);
  ok(await page.locator('#viewBody mark').isVisible(), 'اقتباس مستندك مُبرَز في نصه');
  ok((await page.locator('#viewTitle').textContent()) === 'المستند الأصلي', 'العارض يسمّي المستند الأصلي');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // اقتباس من المرجع
  const refEv = await page.locator('.evidence[data-src="ref"]').count();
  if (refEv) {
    await page.locator('.evidence[data-src="ref"]').first().click(); await page.waitForTimeout(300);
    ok(await page.locator('#viewBody mark').isVisible(), 'اقتباس المرجع مُبرَز في المستند المرجعي');
    ok((await page.locator('#viewTitle').textContent()) === 'المستند المرجعي', 'العارض يسمّي المستند المرجعي');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }

  console.log('\n— مستند ثانٍ والمحفظة —');
  await nav('docs'); await addDoc('عقد تشغيل', PROC.replace('2026/01/15', '2026/03/20'));
  await nav('home');
  ok((await page.locator('#pageContent').textContent()).indexOf('٢ مستند') > -1 ||
     (await page.locator('#pageContent').textContent()).indexOf('2 مستند') > -1, 'الرئيسية تجمع المستندين');
  await nav('docs');
  ok((await page.locator('.doc-card').count()) === 2, 'مستندان محفوظان');

  console.log('\n— المدير —');
  await page.click('#burgerBtn'); await page.waitForTimeout(140);
  await page.click('#logoutBtn'); await page.waitForTimeout(400);
  await login('admin', '1234');
  ok((await page.locator('#userRole').textContent()) === 'مدير النظام', 'دخول المدير');
  ok((await navCount()) === 6, 'المدير يرى ٦ صفحات');
  await nav('docs');
  ok((await page.locator('.doc-card').count()) === 2, 'المستندات باقية بعد تبديل المستخدم');
  await nav('admin');
  await page.fill('#addDeontic', 'تختص'); await page.click('[data-add="addDeontic"]'); await page.waitForTimeout(300);
  await page.click('#cfgSave'); await page.waitForTimeout(500);
  const msg = await page.locator('#cfgMsg').textContent();
  ok(msg.indexOf('أُعيد حساب') > -1, 'تعديل الإعدادات يعيد حساب المستندات فورًا');
  await nav('audit');
  const logTxt = await page.locator('#pageContent').textContent();
  ok(logTxt.indexOf('تحديث مهمة معالجة') > -1, 'تحديث المهام مقيّد في السجل');
  ok(logTxt.indexOf('تعديل إعدادات المحرك') > -1, 'تعديل الإعدادات مقيّد');
  ok(logTxt.indexOf('تحليل مستند') > -1, 'التحاليل مقيّدة');

  console.log('\n— الانعزال —');
  ok(net.length === 0, 'صفر طلبات شبكة' + (net.length ? ': ' + net.join(', ') : ''));
  ok(errs.length === 0, 'صفر أخطاء JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' نجحت، ' + fail + ' فشلت\n');
  process.exit(fail ? 1 : 0);
})();
