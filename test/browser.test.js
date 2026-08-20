const { chromium } = require('playwright');
const path = require('path');
const sample = require('./sample.js');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 440, height: 950 } });
  const netCalls = [], errors = [];
  page.on('request', r => { const u = r.url(); if (!/^(file|blob|data):/.test(u)) netCalls.push(u); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto('file://' + path.resolve(__dirname, '../dist/nadheer.html'));
  await page.waitForTimeout(500);

  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
  const nav = async (route) => {
    await page.click('#burgerBtn'); await page.waitForTimeout(130);
    await page.click(`.navpanel [data-r="${route}"]`); await page.waitForTimeout(300);
  };
  const navHas = async (route) => (await page.locator(`.navpanel [data-r="${route}"]`).count()) > 0;

  console.log('\n— بوابة الدخول —');
  ok(await page.locator('#gate.open').isVisible(), 'البوابة تظهر قبل أي شيء');
  ok(!(await page.locator('#pageContent .card').count()), 'لا يُعرض أي محتوى قبل الدخول');

  await page.click('.role[data-role="admin"]'); await page.waitForTimeout(150);
  await page.fill('#gateCode', 'wrong'); await page.click('#gateGo'); await page.waitForTimeout(200);
  ok(await page.locator('#gateErr .errbox').isVisible(), 'رمز خاطئ يُرفض');

  console.log('\n— دخول عادي —');
  await page.click('.role[data-role="user"]'); await page.waitForTimeout(150);
  await page.fill('#gateName', 'فيصل'); await page.click('#gateGo'); await page.waitForTimeout(400);
  ok(!(await page.locator('#gate.open').isVisible()), 'البوابة تُغلق بعد الدخول');
  ok((await page.locator('#userName').textContent()) === 'فيصل', 'الاسم يظهر في الشريط');
  await page.click('#burgerBtn'); await page.waitForTimeout(150);
  ok(!(await navHas('admin')), 'المستخدم العادي لا يرى إعدادات المحرك');
  ok(!(await navHas('audit')), 'المستخدم العادي لا يرى سجل التتبّع');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  console.log('\n— التحليل —');
  await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(250);
  await page.fill('#paste_doc1', sample);
  await nav('dash'); await nav('upload');
  ok((await page.inputValue('#paste_doc1')).length > 100, 'النص الملصوق لا يضيع عند التنقّل');
  await page.click('#analyzeBtn'); await page.waitForTimeout(1800);
  ok(await page.locator('.risk-num').isVisible(), 'لوحة النتائج ظهرت');
  const score = +(await page.locator('.risk-num').textContent());
  ok(score > 0 && score <= 100, 'درجة الخطر: ' + score);
  const caseCode = await page.locator('.risk-hero .eyebrow').first().textContent();
  ok(/NR-\d{4}-\d{4}/.test(caseCode), 'كود التحليل صدر: ' + caseCode.split(' ')[0]);

  const kpiGaps = +(await page.locator('.kpi').first().locator('.v').textContent());
  await nav('gaps');
  const cards = await page.locator('.gap-card').count();
  ok(kpiGaps === cards, 'عدد الفجوات متطابق بين الشاشتين (' + kpiGaps + ')');
  const codes = await page.locator('.gap-card .code').allTextContents();
  ok(codes.length === cards && codes.every(c => /^G-/.test(c)), 'كل فجوة تعرض كود تتبّعها');
  ok(new Set(codes).size === codes.length, 'لا تكرار في الأكواد المعروضة');

  await page.locator('.evidence').first().click(); await page.waitForTimeout(300);
  ok(await page.locator('#viewBody mark').isVisible(), 'الاقتباس مُبرَز في المستند الأصلي');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.locator('#viewer.open').isVisible()), 'Escape يغلق العارض');

  for (const [r, sel, label] of [['risk', '.clause-grid', 'المخاطر'], ['remed', '.remed-item', 'المعالجة'],
                                 ['predict', '.pred-card', 'المواعيد'], ['report', '.report-head', 'التقرير']]) {
    await nav(r);
    ok(await page.locator(sel).first().isVisible(), 'صفحة ' + label + ' تُعرض');
  }
  await page.screenshot({ path: 'dist/test-report.png' });

  console.log('\n— دخول المدير —');
  await page.click('#burgerBtn'); await page.waitForTimeout(150);
  await page.click('#logoutBtn'); await page.waitForTimeout(350);
  ok(await page.locator('#gate.open').isVisible(), 'الخروج يعيد للبوابة');
  await page.click('.role[data-role="admin"]'); await page.waitForTimeout(150);
  await page.fill('#gateCode', '1234'); await page.click('#gateGo'); await page.waitForTimeout(400);
  ok((await page.locator('#userRole').textContent()) === 'مدير النظام', 'دخل بصلاحية مدير');
  await page.click('#burgerBtn'); await page.waitForTimeout(150);
  ok(await navHas('admin'), 'المدير يرى إعدادات المحرك');
  ok(await navHas('audit'), 'المدير يرى سجل التتبّع');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  console.log('\n— تعديل المحرك —');
  await nav('admin');
  ok(await page.locator('[data-sc="thresholds"][data-k="critical"]').isVisible(), 'صفحة الإعدادات تُعرض');
  const clausesBefore = await page.locator('[data-delclause]').count();
  await page.click('[data-delclause="0"]'); await page.waitForTimeout(300);
  ok((await page.locator('[data-delclause]').count()) === clausesBefore - 1, 'حذف بند معياري يعمل');
  await page.fill('#newClause', 'بند اختباري'); await page.click('[data-add="newClause"]'); await page.waitForTimeout(300);
  ok((await page.locator('[data-delclause]').count()) === clausesBefore, 'إضافة بند معياري تعمل');
  await page.fill('#addDeontic', 'تختص'); await page.click('[data-add="addDeontic"]'); await page.waitForTimeout(300);
  ok(await page.locator('.okbox').first().isVisible(), 'تنبيه «تعديلات غير محفوظة» يظهر');
  await page.click('#cfgSave'); await page.waitForTimeout(350);
  ok((await page.locator('#cfgMsg').textContent()).indexOf('حُفظت') > -1, 'الحفظ ينجح ويعلن عدد التعديلات');

  console.log('\n— أثر التعديل على التحليل —');
  await nav('upload');
  await page.fill('#paste_doc1', sample);
  await page.click('#analyzeBtn'); await page.waitForTimeout(1800);
  const kpi2 = await page.locator('.kpi').nth(1).locator('.v').textContent();
  ok(/\/\d+/.test(kpi2), 'قائمة البنود تتبع الإعدادات المعدّلة: ' + kpi2);

  console.log('\n— سجل التتبّع —');
  await nav('audit');
  const logs = await page.locator('.log').count();
  ok(logs >= 4, 'السجل قيّد الأحداث: ' + logs);
  const txt = await page.locator('#pageContent').textContent();
  ok(txt.indexOf('تعديل إعدادات المحرك') > -1, 'تعديل الإعدادات مقيّد في السجل');
  ok(txt.indexOf('تسجيل دخول') > -1, 'الدخول مقيّد في السجل');
  ok(txt.indexOf('تحليل مستند') > -1, 'التحليل مقيّد في السجل');
  await page.fill('#auditQ', 'NR-'); await page.waitForTimeout(400);
  ok((await page.locator('.log').count()) >= 1, 'البحث بكود التحليل يعمل');
  await page.fill('#auditQ', ''); await page.waitForTimeout(400);
  await page.click('[data-af="config"]'); await page.waitForTimeout(300);
  ok((await page.locator('.log').count()) >= 1, 'تصفية السجل بالنوع تعمل');
  await page.screenshot({ path: 'dist/test-audit.png' });

  console.log('\n— الأمان —');
  await nav('security');
  ok(await page.locator('.errbox').first().isVisible(), 'ينبّه أن الرمز الافتراضي فعّال');
  await page.fill('#oldC', '1234'); await page.fill('#newC', 'riyadh26'); await page.fill('#newC2', 'riyadh26');
  await page.click('#secSave'); await page.waitForTimeout(300);
  ok((await page.locator('#secMsg').textContent()).indexOf('تم تغيير') > -1, 'تغيير رمز المدير ينجح');
  await page.click('#burgerBtn'); await page.waitForTimeout(150);
  await page.click('#logoutBtn'); await page.waitForTimeout(350);
  await page.click('.role[data-role="admin"]'); await page.waitForTimeout(150);
  await page.fill('#gateCode', '1234'); await page.click('#gateGo'); await page.waitForTimeout(250);
  ok(await page.locator('#gateErr .errbox').isVisible(), 'الرمز القديم لم يعد يعمل');
  await page.fill('#gateCode', 'riyadh26'); await page.click('#gateGo'); await page.waitForTimeout(350);
  ok(!(await page.locator('#gate.open').isVisible()), 'الرمز الجديد يعمل');

  await nav('dash'); await page.screenshot({ path: 'dist/test-dash.png' });
  await nav('admin'); await page.screenshot({ path: 'dist/test-admin.png' });

  console.log('\n— الانعزال —');
  ok(netCalls.length === 0, 'صفر طلبات شبكة' + (netCalls.length ? ': ' + netCalls.join(', ') : ''));
  ok(errors.length === 0, 'صفر أخطاء JS' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' نجحت، ' + fail + ' فشلت\n');
  process.exit(fail ? 1 : 0);
})();
