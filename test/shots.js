const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport: { width: 440, height: 950 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/nadheer.html'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'dist/shot-login.png' });            // شاشة الدخول
  await page.click('.role[data-role="admin"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: 'dist/shot-login-admin.png' });
  await page.fill('#gateCode', '1234'); await page.click('#gateGo'); await page.waitForTimeout(400);

  const proc = fs.readFileSync(path.resolve(__dirname, '../samples/02-إجراءات-داخلية-نموذج-تجريبي.txt'), 'utf8');
  const pol  = fs.readFileSync(path.resolve(__dirname, '../samples/01-سياسات-البنك-المركزي-نموذج-تجريبي.txt'), 'utf8');
  await page.click('#pageContent [data-r="upload"]'); await page.waitForTimeout(250);
  await page.fill('#paste_doc1', proc); await page.fill('#paste_doc2', pol);
  await page.click('#analyzeBtn'); await page.waitForTimeout(2000);
  await page.screenshot({ path: 'dist/shot-dash.png' });
  const nav = async r => { await page.click('#burgerBtn'); await page.waitForTimeout(140);
    await page.click(`.navpanel [data-r="${r}"]`); await page.waitForTimeout(400); };
  await nav('gaps');    await page.screenshot({ path: 'dist/shot-gaps.png' });
  await nav('risk');    await page.screenshot({ path: 'dist/shot-risk.png', fullPage: false });
  await nav('predict'); await page.screenshot({ path: 'dist/shot-predict.png' });
  const score = await page.evaluate(() => document.body.innerText.match(/التغطية مقابل المرجع — (\d+)/)?.[1]);
  console.log('أخطاء JS:', errs.length ? errs.join(' | ') : 'صفر');
  await b.close();
})();
