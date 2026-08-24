const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const P = f => fs.readFileSync(path.resolve(__dirname, '../samples/' + f), 'utf8');
const PROC = P('02-إجراءات-داخلية-نموذج-تجريبي.txt');
const POL  = P('01-سياسات-البنك-المركزي-نموذج-تجريبي.txt');
const FEEREF = P('03-تعليمات-الرسوم-نموذج-تجريبي.txt');
const FEEPOL = P('04-سياسة-الرسوم-الداخلية-نموذج-تجريبي.txt');

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
  /* البوابة صارت أربعة حسابات لكلٍّ رمزه، بدل اختيار دورٍ مجرّد */
  const CODES = { admin: 'ADMIN1', faisal: '1234FA', rawan: 'RA12', safiah: '1313SA' };
  const login = async (acc) => {
    await page.click(`.role[data-acc="${acc}"]`); await page.waitForTimeout(180);
    await page.fill('#gateCode', CODES[acc]);
    await page.click('#gateGo'); await page.waitForTimeout(500);
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
  await login('faisal');
  ok(!(await page.locator('#gate.open').isVisible()), 'الدخول بحساب مستخدم يعمل');
  /* صارت أربعًا: أُضيفت «المزامنة» — ربطُ الجهاز بالخادم يحتاجه كل
   مستخدم على جهازه، فلا يصحّ حصره بالمدير. */
  ok((await navCount()) === 4, 'المستخدم العادي يرى ٤ صفحات (منها المزامنة)');

  console.log('\n— الخلفية المتحركة —');
  /* فيديو حقيقي لا صورة: نتحقق أن الزمن يتقدّم فعلًا */
  const bdInfo = await page.evaluate(() => {
    const v = document.getElementById('backdropVid');
    return v ? { tag: v.tagName, w: v.videoWidth, dur: v.duration, paused: v.paused,
                 src: v.currentSrc.slice(0, 16) } : null;
  });
  ok(bdInfo && bdInfo.tag === 'VIDEO', 'عنصر فيديو لا صورة');
  ok(bdInfo && bdInfo.w > 0 && bdInfo.dur > 1,
     'الفيديو مفكوك الترميز: ' + (bdInfo || {}).w + 'px · ' + ((bdInfo || {}).dur || 0).toFixed(1) + 'ث');
  ok(bdInfo && /^data:video/.test(bdInfo.src), 'مضمَّن كبيانات — لا طلب شبكة');
  const bt1 = await page.evaluate(() => document.getElementById('backdropVid').currentTime);
  await page.waitForTimeout(900);
  const bt2 = await page.evaluate(() => document.getElementById('backdropVid').currentTime);
  ok(bt2 > bt1, 'الزمن يتقدّم ⇒ يدور فعلًا: ' + bt1.toFixed(2) + ' → ' + bt2.toFixed(2));

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
                                   ['fix', '.empty, .fixcard', 'التعديلات'],
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

  console.log('\n— إصدار سياسة معدّلة وتعميم —');
  await nav('docs'); await addDoc('سياسة الرسوم والعمولات', FEEPOL, FEEREF);
  await page.click('[data-tab="fix"]'); await page.waitForTimeout(450);
  const fixes = await page.locator('.fixcard').count();
  ok(fixes === 3, 'رُصدت ٣ بنود تخالف المرجع: ' + fixes);
  const fixTxt = await page.locator('#tabBody').textContent();
  ok(fixTxt.indexOf('50 ريال') > -1, 'مبلغ الرسوم المخالف ظاهر (50 ريال)');
  ok(fixTxt.indexOf('لا تُفرض أي رسوم') > -1, 'مسودة البند البديل مولَّدة');
  ok((await page.locator('.warnbox').isVisible()), 'تحذير «مسودة تحتاج اعتمادًا» ظاهر');
  // البند المتوافق أصلًا لا يُعلَّم
  ok(fixTxt.indexOf('التحويلات الداخلية') === -1, 'البند المتوافق أصلًا لم يُعلَّم كمخالف');

  await page.fill('#fxOrg', 'بنك الواحة'); await page.waitForTimeout(200);
  await page.fill('#fxEff', '2026-09-01'); await page.waitForTimeout(300);
  const dlPromise = page.waitForEvent('download');
  await page.click('#fxCirc');
  const dl = await dlPromise;
  const circ = fs.readFileSync(await dl.path(), 'utf8');
  ok(/مسودة/.test(circ), 'التعميم يبدأ بوسم «مسودة»');
  ok(circ.indexOf('بنك الواحة') > -1, 'اسم الجهة في التعميم');
  ok(circ.indexOf('2026-09-01') > -1, 'تاريخ النفاذ في التعميم');
  ok(circ.indexOf('يُوقف فورًا تحصيل') > -1, 'التعميم يتضمن أمر إيقاف التحصيل');
  ok(circ.indexOf('المراجعة القانونية') > -1, 'خانة الاعتماد القانوني موجودة');

  const dl2Promise = page.waitForEvent('download');
  await page.click('#fxPol');
  const pol2 = fs.readFileSync(await (await dl2Promise).path(), 'utf8');
  // البند الجديد يذكر المبلغ الملغى عمدًا، فالمحكّ هو اختفاء نص الفرض الأصلي
  ok(pol2.indexOf('تُفرض رسوم إصدار بطاقة الصراف الآلي بمبلغ') === -1, 'نص فرض رسم البطاقة أُزيل من السياسة');
  ok(pol2.indexOf('وتُلغى الرسوم البالغة 50 ريال') > -1, 'البند الجديد يشير للمبلغ الملغى صراحةً');
  ok(pol2.indexOf('لا تُفرض أي رسوم أو عمولات') > -1, 'السياسة المعدّلة تحمل البند الجديد');
  ok(pol2.indexOf('المادة الأولى') > -1, 'بقية بنود السياسة سليمة');

  console.log('\n— إغلاق الحلقة: يصلح ثم يعيد التحليل ويتحقق —');
  await nav('docs'); await page.click('.doc-main'); await page.waitForTimeout(400);
  await page.click('[data-tab="fix"]'); await page.waitForTimeout(450);
  const confBefore = await page.locator('.fixcard').count();
  await page.fill('#fxRef', 'تعليمات الرسوم'); await page.fill('#fxEff', '2026-09-01');
  await page.waitForTimeout(250);
  await page.click('#fxApply'); await page.waitForTimeout(1400);
  const bannerTxt = await page.locator('#pageContent .okbox, #pageContent .errbox').first().textContent();
  ok(/زالت كل التعارضات/.test(bannerTxt), 'التحقق بعد إعادة التحليل: ' + bannerTxt.trim().slice(0, 78));
  ok((await page.locator('.pagetitle').first().textContent()).indexOf('نسخة 2') > -1, 'أُنشئت نسخة ٢ باسم مشتق');
  const originTxt = await page.locator('#tabBody').textContent();
  ok(/أصل هذه النسخة/.test(originTxt), 'بطاقة أصل النسخة معروضة');
  ok(/التعارضات المتبقية/.test(originTxt), 'تعرض التعارضات المتبقية');
  await page.click('[data-tab="fix"]'); await page.waitForTimeout(400);
  ok((await page.locator('.fixcard').count()) === 0, 'النسخة الجديدة خالية من التعارض (' + confBefore + ' ← 0)');
  await nav('docs');
  ok((await page.locator('.vtag').count()) === 1, 'النسخة موسومة «مسودة معدّلة» في القائمة');

  console.log('\n— الداشبورد التنفيذي —');
  await nav('home');
  const home = await page.locator('#pageContent').textContent();
  ok((await page.locator('.exec-cell').count()) === 4, 'أربعة أرقام تنفيذية');
  ok(home.indexOf('مشكلة انحلّت') > -1, 'يعرض كم انحلّ');
  ok(home.indexOf('ريال تعرّض مالي') > -1, 'يعرض التعرّض المالي');
  ok(home.indexOf('الغرامات — متى وكم') > -1, 'يعرض متى تأتي الغرامات وكم');
  ok(home.indexOf('100,000') > -1, 'مبلغ الغرامة مستخرج من النص');
  ok((await page.locator('.progress .pf').isVisible()), 'شريط الإنجاز ظاهر');
  ok(home.indexOf('بند يخالف المرجع') > -1, 'التعارض بارز في الداشبورد');

  console.log('\n— رسوم لوحة القيادة —');
  ok((await page.locator('.gauge .arcv').count()) === 1, 'المؤشر القوسي مرسوم');
  /* الإزاحة تعكس الدرجة: صفرٌ يعني قوسًا ممتلئًا دائمًا مهما كان الخطر */
  const off = await page.locator('.gauge .arcv').evaluate(
    e => ({ o: parseFloat(getComputedStyle(e).strokeDashoffset), l: parseFloat(getComputedStyle(e).strokeDasharray) }));
  ok(off.o > 0.5 && off.o < off.l, 'القوس يعكس الدرجة لا يمتلئ دائمًا: ' + off.o.toFixed(1) + '/' + off.l.toFixed(1));
  ok((await page.locator('.chartcard').count()) >= 3, 'ثلاث بطاقات رسم على الأقل');
  ok((await page.locator('.sevseg').count()) >= 2, 'شريط الخطورة مجزّأ');
  /* الهوية لا تكون باللون وحده: لكل جزءٍ تسميته ولكل رسمٍ جدوله */
  ok((await page.locator('.sevkey').count()) === (await page.locator('.sevseg').count()),
     'لكل جزء خطورة تسمية مكتوبة');
  ok((await page.locator('details.tabletoggle').count()) >= 1, 'لكل رسم شريطي جدول أرقام بديل');
  const bars = await page.locator('.hbar').count();
  ok(bars >= 4, 'أشرطة التوزيع مرسومة: ' + bars);
  /* العلّة التي وقعنا فيها: عنصر داخلي يتجاهل العرض فتخرج الأشرطة فارغة */
  const bw = await page.locator('.hbar .hf').first().evaluate(e => e.getBoundingClientRect().width);
  ok(bw > 4, 'الشريط له عرضٌ فعلي لا صفر: ' + bw.toFixed(0) + 'px');

  console.log('\n— التلميح التفاعلي —');
  const svg = page.locator('#trendHome svg');
  if (await svg.count()) {
    const bb = await svg.boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
    await page.waitForTimeout(220);
    ok(await page.locator('#trendHome .tip.on').count() === 1, 'التمرير يُظهر التلميح');
    const tipTxt = await page.locator('#trendHome .tip').textContent();
    ok(/\d/.test(tipTxt), 'التلميح يحمل درجة اليوم: ' + tipTxt.trim().slice(0, 30));
    await page.mouse.move(bb.x - 60, bb.y - 60); await page.waitForTimeout(200);
    ok(await page.locator('#trendHome .tip.on').count() === 0, 'ومغادرة المؤشر تُخفيه');
  }

  console.log('\n— إطفاء الحركة لا يُخفي البيانات —');
  /* حركةٌ تبدأ من الصفر وتنتهي عند القيمة تترك البيانات مخفيّة تمامًا
     لمن أطفأ الحركة. الحالة النهائية هي الأصل، والحركة تأتي إليها. */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await page.waitForTimeout(900);
  const still = await page.evaluate(() => {
    const f = document.querySelector('.hf'), a = document.querySelector('.arcv'),
          g = document.querySelector('.sevseg'), t = document.querySelector('.tline');
    const w = e => e ? e.getBoundingClientRect().width : 0;
    return { hf: w(f), seg: w(g),
             arcOff: a ? parseFloat(getComputedStyle(a).strokeDashoffset) : -1,
             lineOff: t ? parseFloat(getComputedStyle(t).strokeDashoffset) : -1 };
  });
  ok(still.hf > 4, 'الشريط الذهبي يبقى مرئيًا بلا حركة: ' + still.hf.toFixed(0) + 'px');
  ok(still.seg > 4, 'وجزء الخطورة كذلك: ' + still.seg.toFixed(0) + 'px');
  ok(still.lineOff === 0, 'ومنحنى الخطر يبقى مرسومًا كاملًا');
  ok(still.arcOff > 0.5, 'والقوس يبقى عند قيمته لا عند الصفر');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload(); await page.waitForTimeout(700);

  console.log('\n— الخلفية تظهر وتُطفأ بحسب الصفحة —');
  const bdState = async () => page.evaluate(() => ({
    on: document.getElementById('backdrop').classList.contains('on'),
    paused: document.getElementById('backdropVid').paused
  }));
  await nav('home');
  let bs = await bdState();
  ok(bs.on && !bs.paused, 'تدور في الرئيسية');
  await nav('docs');
  bs = await bdState();
  /* تُطفأ خلف الجداول: حركةٌ خلف نصٍّ يُقرأ تشتّت، وفكُّ ترميزٍ بلا فائدة */
  ok(!bs.on && bs.paused, 'تُطفأ وتتوقف في صفحة المستندات');
  await nav('plan');
  bs = await bdState();
  ok(!bs.on && bs.paused, 'وفي خطة المعالجة كذلك');
  await nav('home');
  bs = await bdState();
  ok(bs.on && !bs.paused, 'وتعود بالرجوع إلى الرئيسية');

  console.log('\n— رفع دفعة من الملفات —');
  /* الحالة الشائعة: عدة سياسات مقابل مرجع واحد، والرفع والحفظ فعلٌ واحد. */
  await nav('docs');
  await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(320);
  ok(await page.evaluate(() => document.getElementById('fi_doc1').multiple),
     'حقل المستند يقبل عدة ملفات');
  /* setInputFiles لا يُرفق ملفات في صفحة file://، فنبني FileList داخل
     الصفحة كما يفعل المتصفح عند الاختيار الحقيقي. */
  const putFiles = (sel, items) => page.evaluate(({ sel, items }) => {
    const dt = new DataTransfer();
    items.forEach(it => dt.items.add(new File([it.text], it.name, { type: 'text/plain' })));
    const el = document.querySelector(sel);
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel, items });
  const docCount = () => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nadheer:docs:v1') || '[]').length; } catch (e) { return 0; }
  });

  /* ١ — التحرير قبل الانطلاق: نوقفه، نعدّل، ثم نطلقه بالزرّ */
  await putFiles('#fi_doc2', [{ name: 'المرجع.txt', text: POL }]);
  await page.waitForTimeout(250);
  await putFiles('#fi_doc1', [
    { name: 'سياسة ألف.txt', text: PROC },
    { name: 'سياسة باء.txt', text: FEEPOL },
    { name: 'سياسة جيم.txt', text: PROC.replace('2026/01/15', '2026/05/15') }
  ]);
  await page.waitForTimeout(500);
  ok((await page.locator('.bl-row').count()) === 3, 'ثلاثة ملفات معروضة في قائمة الدفعة');
  ok((await page.locator('.auto-note').count()) === 1, 'وإشعار الانطلاق التلقائي ظاهر');
  await page.click('.auto-stop'); await page.waitForTimeout(200);
  const before = await docCount();
  await page.waitForTimeout(2600);
  ok((await docCount()) === before, 'زر الإيقاف يمنع الانطلاق');
  await page.click('.bl-x'); await page.waitForTimeout(250);
  ok((await page.locator('.bl-row').count()) === 2, 'وإزالة ملف من الدفعة تعمل');
  await page.click('#analyzeBtn'); await page.waitForTimeout(4200);
  ok((await docCount()) === before + 2, 'ثم الزرّ يحلّل الاثنين الباقيين: ' +
     before + ' → ' + (await docCount()));

  /* ٢ — الانطلاق التلقائي: نختار ولا نضغط شيئًا */
  await nav('docs');
  await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(320);
  const b2 = await docCount();
  await putFiles('#fi_doc2', [{ name: 'المرجع.txt', text: POL }]);
  await page.waitForTimeout(250);
  await putFiles('#fi_doc1', [{ name: 'سياسة دال.txt', text: FEEPOL }]);
  await page.waitForTimeout(5200);
  ok((await docCount()) === b2 + 1, 'الاختيار وحده يحلّل ويحفظ بلا ضغط زر');
  ok((await page.locator('#pageContent').textContent()).indexOf('حُلِّل') > -1,
     'ورسالة تؤكد ما حُلِّل');
  const names = await page.locator('.doc-card').allTextContents();
  ok(names.join(' ').indexOf('سياسة باء') > -1, 'كل مستند حمل اسم ملفه');
  const allHaveRef = await page.evaluate(() => {
    try {
      const all = JSON.parse(localStorage.getItem('nadheer:docs:v1') || '[]');
      return all.slice(-3).every(d => (d.refText || '').length > 20);
    } catch (e) { return false; }
  });
  ok(allHaveRef, 'والمرجع نفسه حُفظ مع كل واحد منها');

  console.log('\n— الطريق إلى مستند آخر —');
  await nav('docs');
  await page.click('.doc-main'); await page.waitForTimeout(420);
  ok((await page.locator('.doc-top [data-r="upload"]').count()) === 1,
     'صفحة المستند فيها زر «تحليل مستند آخر»');

  console.log('\n— مستند ثالث والمحفظة —');
  await nav('docs'); await addDoc('عقد تشغيل', PROC.replace('2026/01/15', '2026/03/20'));
  await nav('home');
  /* ٤ أصلية + ٣ من اختبار الدفعة */
  ok((await page.locator('#pageContent').textContent()).indexOf('7 مستند') > -1, 'الرئيسية تجمع كل المستندات');
  await nav('docs');
  ok((await page.locator('.doc-card').count()) === 7, 'سبعة مستندات محفوظة (منها نسخة معدّلة وثلاثة من دفعة)');

  console.log('\n— المدير —');
  await page.click('#burgerBtn'); await page.waitForTimeout(140);
  await page.click('#logoutBtn'); await page.waitForTimeout(400);
  await login('admin');
  ok((await page.locator('#userRole').textContent()) === 'مدير النظام', 'دخول المدير');
  ok((await navCount()) === 8, 'المدير يرى ٨ صفحات (منها الموافقات والمزامنة)');
  await nav('docs');
  ok((await page.locator('.doc-card').count()) === 7, 'المستندات باقية بعد تبديل المستخدم');
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

  console.log('\n— الحسابات والموافقات —');
  /* أربعة حسابات لكلٍّ رمزه، والمدير يراجع ما يفعله المستخدمون. */
  await page.click('#burgerBtn'); await page.waitForTimeout(140);
  await page.click('#logoutBtn'); await page.waitForTimeout(500);
  ok((await page.locator('.role[data-acc]').count()) === 4, 'البوابة تعرض أربعة حسابات');
  /* رمز خاطئ لا يدخل */
  await page.click('.role[data-acc="rawan"]'); await page.waitForTimeout(180);
  await page.fill('#gateCode', 'غلط'); await page.click('#gateGo'); await page.waitForTimeout(400);
  ok(await page.locator('#gate.open').isVisible(), 'الرمز الخاطئ لا يفتح البوابة');
  await page.fill('#gateCode', 'RA12'); await page.click('#gateGo'); await page.waitForTimeout(500);
  ok(!(await page.locator('#gate.open').isVisible()), 'والرمز الصحيح يفتحها');

  /* إجراء من مستخدم ⇒ يصل المدير */
  await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(320);
  await page.fill('#docName', 'مستند روان');
  await page.fill('#paste_doc1', 'المادة الأولى: يجب على المورد التسليم قبل تاريخ 2026-12-01.');
  await page.click('#analyzeBtn'); await page.waitForTimeout(2200);
  const docsAfterRawan = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nadheer:docs:v1') || '[]').length; } catch (e) { return 0; }
  });

  await page.click('#burgerBtn'); await page.waitForTimeout(140);
  await page.click('#logoutBtn'); await page.waitForTimeout(500);
  await login('admin');
  await nav('approvals');
  const apTxt = await page.locator('#pageContent').textContent();
  ok(apTxt.indexOf('الموافقات والنسخ') > -1, 'صفحة الموافقات تفتح فعلًا');
  ok((await page.locator('[data-ok]').count()) >= 1, 'وفيها طلب بانتظار قرار المدير');

  /* الإلغاء يرجّع الحالة السابقة فعلًا — لا مجرّد وسم */
  await page.click('[data-no]'); await page.waitForTimeout(900);
  const docsAfterRevert = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nadheer:docs:v1') || '[]').length; } catch (e) { return -1; }
  });
  ok(docsAfterRevert === docsAfterRawan - 1,
     'الإلغاء يرجّع اللقطة فيختفي المستند: ' + docsAfterRawan + ' → ' + docsAfterRevert);

  console.log('\n— الانعزال —');
  ok(net.length === 0, 'صفر طلبات شبكة' + (net.length ? ': ' + net.join(', ') : ''));
  ok(errs.length === 0, 'صفر أخطاء JS' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' نجحت، ' + fail + ' فشلت\n');
  process.exit(fail ? 1 : 0);
})();
