const { chromium } = require('playwright');
const path = require('path');
const sample = require('./sample.js');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 430, height: 940 } });

  const netCalls = [], errors = [];
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('blob:') && !u.startsWith('data:')) netCalls.push(u); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, '../dist/nadheer.html'));
  await page.waitForTimeout(600);

  // التنقّل عبر القائمة الجانبية (روابطها مخفية حتى تُفتح)
  const nav = async (route) => {
    await page.click('#burgerBtn');
    await page.waitForTimeout(120);
    await page.click(`.navpanel [data-r="${route}"]`);
    await page.waitForTimeout(260);
  };

  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

  ok(await page.locator('text=ابدأ بمستند').isVisible(), 'الشاشة الأولى تُعرض');

  await page.click('#pageContent [data-r="upload"]');
  await page.waitForTimeout(200);
  ok(await page.locator('#paste_doc1').isVisible(), 'صفحة الرفع تُعرض');

  // النص الملصوق يبقى بعد التنقل بعيدًا والعودة
  await page.fill('#paste_doc1', sample);
  await nav('dash'); await nav('upload');
  ok((await page.inputValue('#paste_doc1')).length > 100, 'النص الملصوق لا يضيع عند التنقّل');

  await page.click('#analyzeBtn');
  await page.waitForTimeout(1600);
  ok(await page.locator('.risk-num').isVisible(), 'لوحة النتائج ظهرت بعد التحليل');
  const score = await page.locator('.risk-num').textContent();
  ok(+score > 0 && +score <= 100, 'درجة الخطر معروضة: ' + score);

  // اتساق الأعداد بين الرئيسية وصفحة الفجوات
  const kpiGaps = +(await page.locator('.kpi').first().locator('.v').textContent());
  await nav('gaps');
  const cards = await page.locator('.gap-card').count();
  ok(kpiGaps === cards, 'عدد الفجوات متطابق بين الشاشتين (' + kpiGaps + ' = ' + cards + ')');
  ok(await page.locator('.mathbox').first().isVisible(), 'معادلة الخطر ظاهرة في كل بطاقة');

  // عارض المستند يبرز الاقتباس فعلًا
  await page.locator('.evidence').first().click();
  await page.waitForTimeout(300);
  ok(await page.locator('#viewer.open').isVisible(), 'عارض المستند يُفتح');
  ok(await page.locator('#viewBody mark').isVisible(), 'الاقتباس مُبرَز في النص الأصلي');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.locator('#viewer.open').isVisible()), 'Escape يغلق العارض');

  for (const [route, sel, label] of [['risk', '.clause-grid', 'المخاطر والبنود المعيارية'],
                                     ['remed', '.remed-item', 'خطة المعالجة'],
                                     ['predict', '.pred-card', 'المواعيد القادمة'],
                                     ['report', '.report-head', 'التقرير']]) {
    await nav(route);
    ok(await page.locator(sel).first().isVisible(), 'صفحة ' + label + ' تُعرض');
  }
  await page.screenshot({ path: 'dist/screenshot-report.png' });
  await nav('dash');
  await page.screenshot({ path: 'dist/screenshot-dash.png' });
  await nav('gaps');
  await page.screenshot({ path: 'dist/screenshot-gaps.png' });

  ok(netCalls.length === 0, 'صفر طلبات شبكة' + (netCalls.length ? ': ' + netCalls.join(', ') : ''));
  ok(errors.length === 0, 'صفر أخطاء JS' + (errors.length ? ': ' + errors.slice(0,3).join(' | ') : ''));

  await browser.close();
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' نجحت، ' + fail + ' فشلت\n');
  process.exit(fail ? 1 : 0);
})();
