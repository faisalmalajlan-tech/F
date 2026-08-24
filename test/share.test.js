/* اختبار المشاركة الحقيقية: متصفحان منفصلان، خادم بينهما.
   يثبت أن ما يعمله أحدهما يصل الآخر — وهو جوهر طلب «الخادم». */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
/* https لا http: سياسة CSP تسمح بـhttps وحده، وهو الصحيح للإنتاج.
   اختبارٌ على http كان سيمرّ بقيدٍ لا يواجهه المستخدم. */
const URL_ = 'https://127.0.0.1:8788', KEY = 'test-anon-key';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const APP = 'file://' + path.resolve(__dirname, '../dist/nadheer.html');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--ignore-certificate-errors'] });
  const errs = [];
  /* سياقان منفصلان = جهازان: لكلٍّ تخزينه المحلي */
  const mk = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 900, height: 900 },
      ignoreHTTPSErrors: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.goto(APP); await p.waitForTimeout(900);
    return p;
  };
  const login = async (p, acc, code) => {
    await p.click(`.role[data-acc="${acc}"]`); await p.waitForTimeout(180);
    await p.fill('#gateCode', code); await p.click('#gateGo'); await p.waitForTimeout(600);
  };
  const nav = async (p, r) => { await p.click('#burgerBtn'); await p.waitForTimeout(150);
    await p.click(`.navpanel [data-r="${r}"]`); await p.waitForTimeout(450); };
  const connect = async (p) => {
    await nav(p, 'sync');
    await p.fill('#sbUrl', URL_); await p.fill('#sbKey', KEY);
    await p.click('#sbSave'); await p.waitForTimeout(2500);
  };
  const docCount = p => p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('nadheer:docs:v1') || '[]').length; } catch (e) { return -1; }
  });

  console.log('\n— جهاز المدير —');
  const A = await mk('A');
  await login(A, 'admin', 'ADMIN1');
  await connect(A);
  ok((await A.locator('.srv-state.on').count()) === 1, 'الجهاز الأول اتصل بالخادم');
  ok((await A.locator('#syncPill').isVisible()), 'شارة المزامنة ظهرت');
  ok(!(await A.locator('#offlinePill').isVisible()), 'وشارة «يعمل بلا إنترنت» اختفت — لأنها صارت غير صحيحة');

  await nav(A, 'docs');
  await A.click('#pageContent [data-r="upload"]'); await A.waitForTimeout(350);
  await A.fill('#docName', 'سياسة مشتركة');
  await A.fill('#paste_doc1', 'المادة الأولى: يجب على المورد التسليم قبل تاريخ 2026-12-01 وإلا غرامة قدرها 500000 ريال.');
  await A.click('#analyzeBtn'); await A.waitForTimeout(2600);
  ok((await docCount(A)) >= 1, 'حُلِّل مستند على الجهاز الأول');
  await A.waitForTimeout(2200);   // نمهل الدفع المؤجَّل

  console.log('\n— جهاز ثانٍ منفصل تمامًا —');
  const B = await mk('B');
  ok((await docCount(B)) === 0, 'الجهاز الثاني يبدأ فارغًا');
  await login(B, 'faisal', '1234FA');
  await connect(B);
  await B.waitForTimeout(1200);
  const nB = await docCount(B);
  ok(nB >= 1, 'وبعد الاتصال وصله مستند الجهاز الأول: ' + nB);
  await nav(B, 'docs');
  const namesB = await B.locator('#pageContent').textContent();
  ok(namesB.indexOf('سياسة مشتركة') > -1, 'بالاسم نفسه');

  console.log('\n— الاتجاه المعاكس —');
  await B.click('#pageContent [data-r="upload"]'); await B.waitForTimeout(350);
  await B.fill('#docName', 'مستند من الجهاز الثاني');
  await B.fill('#paste_doc1', 'المادة الثانية: يجب الإبلاغ خلال خمسة أيام عمل.');
  await B.click('#analyzeBtn'); await B.waitForTimeout(2600);
  await B.waitForTimeout(2200);

  await nav(A, 'sync');
  await A.click('#sbPull'); await A.waitForTimeout(2000);
  await nav(A, 'docs');
  const namesA = await A.locator('#pageContent').textContent();
  ok(namesA.indexOf('مستند من الجهاز الثاني') > -1, 'ومستند الجهاز الثاني وصل للأول');

  console.log('\n— الموافقات بين جهازين —');
  await nav(A, 'approvals');
  const ap = await A.locator('#pageContent').textContent();
  ok(ap.indexOf('مستند من الجهاز الثاني') > -1,
     'طلب المستخدم من جهازه وصل إلى المدير — وهذا ما كان مستحيلًا بلا خادم');

  console.log('\n— الفصل —');
  await nav(B, 'sync');
  await B.click('#sbOff'); await B.waitForTimeout(600);
  ok((await B.locator('.srv-state.off').count()) === 1, 'الفصل يعمل');
  ok((await B.locator('#offlinePill').isVisible()), 'وشارة «بلا إنترنت» رجعت');
  ok((await docCount(B)) >= 2, 'والبيانات المسحوبة باقية محليًا بعد الفصل');

  console.log('\nأخطاء JS: ' + (errs.length ? errs.join(' | ') : 'صفر'));
  ok(errs.length === 0, 'صفر أخطاء JS');
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' نجحت، ' + fail + ' فشلت');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
