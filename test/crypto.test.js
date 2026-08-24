/* اختبار التعمية: الأهم فيه أن المفتاح الخاطئ يفشل صراحةً
   لا يُخرج نصًّا مشوّهًا يُظنّ سليمًا. */
const store = {};
global.window = { localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; } } };
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
const C = require('../src/crypto.js');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const SECRET = 'المادة الثالثة: يجب الإبلاغ خلال ثمان وأربعين ساعة، وإلا غرامة 500000 ريال.';

(async () => {
  console.log('\n— بلا عبارة —');
  ok(!C.isOn(), 'التعمية مطفأة افتراضيًا');
  ok(await C.encrypt(SECRET) === SECRET, 'وبلا عبارة يمرّ النص كما هو');

  console.log('\n— التعمية —');
  const r = await C.setPhrase('عبارة الفريق الطويلة جدًا ٢٠٢٦');
  ok(r.ok && C.ready(), 'اشتُقّ المفتاح من العبارة');
  const blob = await C.encrypt(SECRET);
  ok(C.looksEncrypted(blob), 'الناتج معلَّم كمشفَّر');
  ok(blob.indexOf('غرامة') < 0 && blob.indexOf('ساعة') < 0,
     'ولا يحوي أي كلمة من النص الأصلي');
  ok(blob.length > 40, 'وطوله معقول: ' + blob.length + ' حرفًا');
  ok(await C.decrypt(blob) === SECRET, 'وفكّه يعيد النص حرفيًا');

  console.log('\n— كل مرة ناتج مختلف —');
  const b2 = await C.encrypt(SECRET);
  ok(b2 !== blob, 'تعميتان لنصٍّ واحد تختلفان (متجه تهيئة عشوائي)');
  ok(await C.decrypt(b2) === SECRET, 'وكلتاهما تُفكّان للنص نفسه');

  console.log('\n— العبارة الخاطئة —');
  await C.setPhrase('عبارة أخرى مختلفة تمامًا');
  let threw = false;
  try { await C.decrypt(blob); } catch (e) { threw = true; }
  ok(threw, 'العبارة الخاطئة تفشل صراحةً — لا تُخرج نصًّا مشوّهًا');

  console.log('\n— العبارة نفسها على جهاز آخر —');
  await C.setPhrase('عبارة الفريق الطويلة جدًا ٢٠٢٦');
  ok(await C.decrypt(blob) === SECRET, 'العبارة نفسها تفكّ ما عُمّي على جهازٍ آخر');

  console.log('\n— المستند كاملًا —');
  const doc = { id: 'd1', name: 'سياسة الإسناد', caseCode: 'NR-1',
                text: SECRET, refText: 'نص المرجع', lastRisk: 88 };
  const sealed = await C.sealDoc(doc);
  ok(C.looksEncrypted(sealed.text) && C.looksEncrypted(sealed.refText), 'النصّان مشفَّران');
  ok(sealed.name === 'سياسة الإسناد', 'والاسم ظاهر — ليعمل الفرز بلا فكّ كل شيء');
  ok(sealed.caseCode === 'NR-1' && sealed.lastRisk === 88, 'والكود والدرجة ظاهران');
  ok(JSON.stringify(sealed).indexOf('غرامة') < 0, 'ولا أثر للنص في المستند المُرسَل');
  const opened = await C.openDoc(sealed);
  ok(opened.text === SECRET && opened.refText === 'نص المرجع', 'والفتح يعيدهما');
  ok(!opened.locked, 'وبلا وسم قفل');

  console.log('\n— مستند بعبارة أخرى —');
  await C.setPhrase('عبارة غلط');
  const lockedDoc = await C.openDoc(sealed);
  ok(lockedDoc.locked === true, 'يُوسَم «مقفل» بدل أن يُعرض فارغًا بلا تفسير');
  ok(lockedDoc.name === 'سياسة الإسناد', 'والاسم يبقى ظاهرًا ليعرف المستخدم أيّها');

  console.log('\n— كشف العبارة الخاطئة مبكرًا —');
  await C.setPhrase('عبارة الفريق الطويلة جدًا ٢٠٢٦');
  const probe = await C.makeProbe();
  ok((await C.checkProbe(probe)).ok, 'الفحص يقبل العبارة الصحيحة');
  await C.setPhrase('عبارة غلط');
  ok(!(await C.checkProbe(probe)).ok, 'ويرفض الخاطئة فورًا — قبل عرض مستندات فارغة');
  ok((await C.checkProbe(null)).first, 'وأول مرة بلا فحصٍ سابق: يُقبل ويُنشأ');

  console.log('\n— نصٌّ قديم غير مشفَّر —');
  await C.setPhrase('أي عبارة');
  ok(await C.decrypt('نص عادي قديم') === 'نص عادي قديم',
     'المستندات القديمة غير المشفَّرة تُقرأ كما هي');

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' نجحت، ' + fail + ' فشلت');
  process.exit(fail ? 1 : 0);
})();
