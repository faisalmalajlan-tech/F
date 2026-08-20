/* نذير — سجل التتبّع. يقيّد كل تحليل وكل تعديل على الإعدادات وكل دخول،
   بكود متسلسل قابل للإحالة. يُخزَّن محليًا ويُصدَّر كملف JSON. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerAudit = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'nadheer:audit:v1', SEQ = 'nadheer:seq:v1', MAX = 800;
  var mem = null;                       // بديل عند منع التخزين

  function read() {
    if (mem) return mem;
    try { return JSON.parse(window.localStorage.getItem(KEY) || '[]'); }
    catch (e) { mem = mem || []; return mem; }
  }
  function write(list) {
    if (list.length > MAX) list = list.slice(-MAX);
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); mem = null; }
    catch (e) { mem = list; }
    return list;
  }

  /* رقم متسلسل سنوي: NR-2026-0001 */
  function nextCode(prefix) {
    var year = new Date().getFullYear(), n = 1;
    try {
      var st = JSON.parse(window.localStorage.getItem(SEQ) || '{}');
      if (st.year !== year) st = { year: year, n: 0 };
      st.n++; n = st.n;
      window.localStorage.setItem(SEQ, JSON.stringify(st));
    } catch (e) {
      n = read().filter(function (e2) { return e2.code && e2.code.indexOf(prefix + '-' + year) === 0; }).length + 1;
    }
    return prefix + '-' + year + '-' + ('000' + n).slice(-4);
  }

  var KINDS = { analysis: 'تحليل', config: 'تعديل إعدادات', auth: 'دخول',
                security: 'أمان', data: 'بيانات' };

  function log(entry) {
    var list = read();
    var rec = {
      id: 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
      at: Date.now(),
      kind: entry.kind || 'data',
      kindLabel: KINDS[entry.kind] || 'حدث',
      actor: entry.actor || 'مجهول',
      title: entry.title || '',
      detail: entry.detail || '',
      changes: entry.changes || null,
      code: entry.code || null,
      meta: entry.meta || null
    };
    list.push(rec);
    write(list);
    return rec;
  }

  function list(filter) {
    var out = read().slice().reverse();
    if (filter && filter.kind && filter.kind !== 'all') {
      out = out.filter(function (e) { return e.kind === filter.kind; });
    }
    if (filter && filter.q) {
      var q = filter.q.toLowerCase();
      out = out.filter(function (e) {
        return (e.title + ' ' + e.detail + ' ' + (e.code || '') + ' ' + e.actor).toLowerCase().indexOf(q) > -1;
      });
    }
    return out;
  }

  function stats() {
    var all = read(), s = { total: all.length, analysis: 0, config: 0, auth: 0, lastAt: null };
    all.forEach(function (e) { if (s[e.kind] !== undefined) s[e.kind]++; });
    if (all.length) s.lastAt = all[all.length - 1].at;
    return s;
  }

  /* تتبّع كود بند عبر كل التحاليل التي ظهر فيها */
  function traceCode(code) {
    return read().filter(function (e) {
      return e.meta && e.meta.codes && e.meta.codes.indexOf(code) > -1;
    }).reverse();
  }

  function clear() { try { window.localStorage.removeItem(KEY); } catch (e) {} mem = null; }

  return { log: log, list: list, stats: stats, clear: clear, nextCode: nextCode,
           traceCode: traceCode, KINDS: KINDS, all: read };
});
