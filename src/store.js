/* نذير — مخزن المستندات. يحفظ نص كل مستند ومهامه وتاريخ خطره،
   حتى يُعاد تحليله كل يوم بتاريخ اليوم فيتحرك الخطر مع اقتراب المواعيد. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerStore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'nadheer:docs:v1';
  var MAX_TEXT = 80000;      // سقف لكل مستند حتى لا يمتلئ التخزين بمستند واحد
  var MAX_HISTORY = 400;     // ~سنة من النقاط اليومية
  var mem = null;            // بديل عند منع التخزين

  function read() {
    if (mem) return mem;
    try { return JSON.parse(window.localStorage.getItem(KEY) || '[]'); }
    catch (e) { mem = mem || []; return mem; }
  }
  function write(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); mem = null; return { ok: true }; }
    catch (e) {
      mem = list;
      return { ok: false, full: /quota|exceed/i.test(e.name + e.message) };
    }
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function id() { return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function list() {
    return read().sort(function (a, b) { return (b.lastRisk || 0) - (a.lastRisk || 0); });
  }
  function get(docId) {
    var all = read();
    for (var i = 0; i < all.length; i++) if (all[i].id === docId) return all[i];
    return null;
  }

  function add(doc) {
    var all = read();
    var rec = {
      id: id(), name: doc.name || 'مستند بلا اسم',
      addedAt: Date.now(),
      text: (doc.text || '').slice(0, MAX_TEXT),
      refText: (doc.refText || '').slice(0, MAX_TEXT),
      refName: doc.refName || '', docType: doc.docType || 'فحص كل البنود',
      context: doc.context || '',
      caseCode: doc.caseCode || '', fp: doc.fp || '',
      truncated: (doc.text || '').length > MAX_TEXT,
      history: [], tasks: {}
    };
    all.push(rec);
    var res = write(all);
    return { doc: rec, saved: res.ok, full: res.full };
  }

  function update(docId, patch) {
    var all = read(), i;
    for (i = 0; i < all.length; i++) {
      if (all[i].id !== docId) continue;
      Object.keys(patch).forEach(function (k) { all[i][k] = patch[k]; });
      return write(all);
    }
    return { ok: false };
  }

  function remove(docId) {
    return write(read().filter(function (d) { return d.id !== docId; }));
  }

  /* نقطة خطر واحدة لكل يوم. تُستدعى عند كل فتح، فتبني منحنى الخطر تلقائيًا. */
  function recordRisk(docId, risk) {
    var all = read(), i;
    for (i = 0; i < all.length; i++) {
      if (all[i].id !== docId) continue;
      var h = all[i].history || [], t = today();
      var last = h[h.length - 1];
      if (last && last.d === t) last.r = risk;
      else h.push({ d: t, r: risk });
      if (h.length > MAX_HISTORY) h = h.slice(-MAX_HISTORY);
      all[i].history = h;
      all[i].lastRisk = Math.round(risk);
      all[i].lastSeen = Date.now();
      return write(all);
    }
    return { ok: false };
  }

  /* فرق الخطر عن آخر يوم سابق لليوم الحالي */
  function delta(doc) {
    var h = (doc && doc.history) || [], t = today();
    var cur = null, prev = null, i;
    for (i = h.length - 1; i >= 0; i--) {
      if (cur === null && h[i].d === t) { cur = h[i].r; continue; }
      if (h[i].d !== t) { prev = h[i]; break; }
    }
    if (cur === null || !prev) return null;
    var days = Math.max(1, Math.round((new Date(t) - new Date(prev.d)) / 86400000));
    return { diff: cur - prev.r, days: days, from: prev.r, to: cur };
  }

  function setTask(docId, code, patch) {
    var all = read(), i;
    for (i = 0; i < all.length; i++) {
      if (all[i].id !== docId) continue;
      all[i].tasks = all[i].tasks || {};
      var t = all[i].tasks[code] || { status: 'todo' };
      Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
      t.at = Date.now();
      all[i].tasks[code] = t;
      return write(all);
    }
    return { ok: false };
  }
  function taskOf(doc, code) {
    return (doc && doc.tasks && doc.tasks[code]) || { status: 'todo' };
  }

  /* تقدير المساحة المستخدمة — لتحذير المستخدم قبل امتلاء التخزين */
  function usage() {
    var bytes = 0;
    try { bytes = (window.localStorage.getItem(KEY) || '').length * 2; } catch (e) {}
    return { bytes: bytes, mb: bytes / 1048576, docs: read().length };
  }

  function clear() { try { window.localStorage.removeItem(KEY); } catch (e) {} mem = null; }

  return { list: list, get: get, add: add, update: update, remove: remove,
           recordRisk: recordRisk, delta: delta, setTask: setTask, taskOf: taskOf,
           usage: usage, clear: clear, today: today, MAX_TEXT: MAX_TEXT };
});
