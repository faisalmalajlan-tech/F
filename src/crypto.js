/* نذير — التعمية من طرف إلى طرف.

   المشكلة: من يعرف رابط المشروع ومفتاحه العام يقرأ كل ما في الجداول.
   وسياساتُكم ليست بيانات عامة.

   الحل: يُشفَّر نصّ كل مستند في المتصفح قبل أن يُرسل، بمفتاح فريقٍ
   لا يُرسل إلى الخادم أبدًا. فمن يفتح قاعدة البيانات — أو يسرّبها —
   لا يجد إلا رموزًا.

   AES-GCM ٢٥٦ بت، ومفتاحه مشتقّ من عبارة الفريق بـPBKDF2 (٢١٠ آلاف
   دورة، وهي توصية OWASP لـSHA-256). المِلح ثابت للفريق حتى يشتقّ
   الجميعُ المفتاحَ نفسه من العبارة نفسها؛ وهذا يُضعف مقاومة الجداول
   المحسوبة مسبقًا، فالعبارة يجب أن تكون طويلة. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerCrypto = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY_STORE = 'nadheer:teamkey';   // العبارة نفسها، في هذا الجهاز وحده
  var ITER = 210000;
  var subtle = null, key = null, phrase = '';

  function sub() {
    if (subtle) return subtle;
    var c = (typeof window !== 'undefined' && window.crypto) ||
            (typeof globalThis !== 'undefined' && globalThis.crypto);
    subtle = c && c.subtle ? c.subtle : null;
    return subtle;
  }
  function rnd(n) {
    var c = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
    return c.getRandomValues(new Uint8Array(n));
  }
  var enc = function (s) { return new TextEncoder().encode(s); };
  var dec = function (b) { return new TextDecoder().decode(b); };

  function b64(buf) {
    var a = new Uint8Array(buf), s = '';
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  /* المِلح مشتقّ من العبارة نفسها لا عشوائي: أفراد الفريق يكتبون
     العبارة على أجهزتهم المختلفة ويجب أن يخرج المفتاح نفسه. */
  function saltOf(p) {
    return sub().digest('SHA-256', enc('nadheer-salt-v1:' + p))
      .then(function (h) { return new Uint8Array(h).slice(0, 16); });
  }

  function derive(p) {
    if (!sub()) return Promise.reject(new Error('متصفحك لا يدعم التعمية (WebCrypto).'));
    return saltOf(p).then(function (salt) {
      return sub().importKey('raw', enc(p), 'PBKDF2', false, ['deriveKey'])
        .then(function (base) {
          return sub().deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        });
    });
  }

  function setPhrase(p) {
    phrase = String(p || '');
    key = null;
    try {
      if (phrase) window.localStorage.setItem(KEY_STORE, phrase);
      else window.localStorage.removeItem(KEY_STORE);
    } catch (e) {}
    if (!phrase) return Promise.resolve({ ok: true, off: true });
    return derive(phrase).then(function (k) { key = k; return { ok: true }; })
      .catch(function (e) { return { ok: false, error: e.message }; });
  }
  function loadPhrase() {
    try { phrase = window.localStorage.getItem(KEY_STORE) || ''; } catch (e) { phrase = ''; }
    if (!phrase) return Promise.resolve(false);
    return derive(phrase).then(function (k) { key = k; return true; }).catch(function () { return false; });
  }
  var isOn = function () { return !!phrase; };
  var ready = function () { return !!key; };

  var MARK = 'nadheer-enc-v1:';

  function encrypt(text) {
    if (!key || text === null || text === undefined || text === '') return Promise.resolve(text);
    var iv = rnd(12);
    return sub().encrypt({ name: 'AES-GCM', iv: iv }, key, enc(String(text)))
      .then(function (ct) { return MARK + b64(iv) + '.' + b64(ct); });
  }
  var looksEncrypted = function (v) { return typeof v === 'string' && v.indexOf(MARK) === 0; };

  function decrypt(blob) {
    if (!looksEncrypted(blob)) return Promise.resolve(blob);   // نصٌّ قديم غير مشفَّر
    if (!key) return Promise.reject(new Error('locked'));
    var body = blob.slice(MARK.length), i = body.indexOf('.');
    if (i < 0) return Promise.reject(new Error('تالف'));
    var iv = unb64(body.slice(0, i)), ct = unb64(body.slice(i + 1));
    return sub().decrypt({ name: 'AES-GCM', iv: iv }, key, ct).then(dec);
  }

  /* الحقول الحسّاسة وحدها تُشفَّر: النصوص. أما الأسماء والأكواد
     والدرجات فتبقى ظاهرة ليعمل الفرز والعرض بلا فكّ كل شيء. */
  var FIELDS = ['text', 'refText'];

  function sealDoc(d) {
    if (!key) return Promise.resolve(d);
    var out = {}, jobs = [];
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
    FIELDS.forEach(function (f) {
      if (typeof d[f] === 'string' && d[f] && !looksEncrypted(d[f])) {
        jobs.push(encrypt(d[f]).then(function (v) { out[f] = v; }));
      }
    });
    return Promise.all(jobs).then(function () { out.enc = true; return out; });
  }
  function openDoc(d) {
    var out = {}, jobs = [], failed = false;
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
    FIELDS.forEach(function (f) {
      if (looksEncrypted(d[f])) {
        jobs.push(decrypt(d[f]).then(function (v) { out[f] = v; },
                                     function () { failed = true; out[f] = ''; }));
      }
    });
    return Promise.all(jobs).then(function () {
      if (failed) out.locked = true;
      return out;
    });
  }
  function sealAll(list) { return Promise.all((list || []).map(sealDoc)); }
  function openAll(list) { return Promise.all((list || []).map(openDoc)); }

  /* تحقّقٌ من صحة العبارة: نُعمّي كلمةً معلومة ونحفظ الناتج على الخادم،
     فمن يكتب عبارةً خاطئة يُكتشف فورًا بدل أن يرى مستندات فارغة. */
  var PROBE = 'نذير-تحقق';
  function makeProbe() { return encrypt(PROBE); }
  function checkProbe(blob) {
    if (!blob) return Promise.resolve({ ok: true, first: true });
    return decrypt(blob).then(function (v) { return { ok: v === PROBE }; },
                              function () { return { ok: false }; });
  }

  return { setPhrase: setPhrase, loadPhrase: loadPhrase, isOn: isOn, ready: ready,
           encrypt: encrypt, decrypt: decrypt, looksEncrypted: looksEncrypted,
           sealDoc: sealDoc, openDoc: openDoc, sealAll: sealAll, openAll: openAll,
           makeProbe: makeProbe, checkProbe: checkProbe, FIELDS: FIELDS, ITER: ITER };
});
