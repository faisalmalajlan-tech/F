/* نذير — المزامنة مع خادم Supabase.

   المبدأ: محليٌّ أولًا. الواجهة تبقى تقرأ وتكتب في localStorage كما هي
   — لأن دوالها متزامنة والشبكة ليست كذلك، وتحويل التطبيق كله إلى
   غير متزامن إعادةُ بناءٍ لا مبرّر لها. هذه الطبقة تدفع وتسحب في
   الخلفية، فتصير البيانات مشتركة بلا أن يتغيّر سطر في الواجهة.

   وإن لم يُضبط الخادم، يعمل التطبيق كما كان تمامًا: بلا شبكة إطلاقًا. */
(function (root, factory) {
  var CR = (typeof module === 'object' && module.exports) ? require('./crypto.js') : root.NadheerCrypto;
  var api = factory(CR);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerSync = api;
})(typeof self !== 'undefined' ? self : this, function (CR) {
  'use strict';

  var CFG_KEY = 'nadheer:supabase';
  var K = { docs: 'nadheer:docs:v1', reqs: 'nadheer:requests',
            vers: 'nadheer:versions', accs: 'nadheer:accounts' };

  var state = { on: false, url: '', key: '', last: 0, busy: false,
                error: null, pulledAt: 0, pushedAt: 0 };
  var listeners = [];

  function lsGet(k, d) { try { return JSON.parse(window.localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ── الضبط ── */
  function config() {
    var c = lsGet(CFG_KEY, 'null');
    if (c && c.url && c.key) { state.on = true; state.url = c.url.replace(/\/+$/, ''); state.key = c.key; }
    else { state.on = false; state.url = ''; state.key = ''; }
    return c;
  }
  function setConfig(url, key) {
    if (!url || !key) { try { window.localStorage.removeItem(CFG_KEY); } catch (e) {} config(); return; }
    lsSet(CFG_KEY, { url: String(url).trim(), key: String(key).trim() });
    config();
  }
  var isOn = function () { return state.on; };
  var status = function () { return { on: state.on, url: state.url, busy: state.busy,
                                      error: state.error, pulledAt: state.pulledAt, pushedAt: state.pushedAt }; };
  function onChange(fn) { listeners.push(fn); }
  function fire(what) { listeners.forEach(function (f) { try { f(what); } catch (e) {} }); }

  /* رؤوس HTTP لا تقبل غير ASCII. مفتاحٌ فيه حرفٌ عربي أو علامة اتجاه
     التصقت بالنسخ يجعل fetch يرمي «Cannot convert argument to a
     ByteString» — رسالةٌ لا تعني للمستخدم شيئًا. نفحصه أولًا ونقول
     له ما الخطب بلغته. */
  var ASCII = /^[\x20-\x7E]+$/;
  function badInput(url, key) {
    if (!url || !key) return 'أدخل رابط المشروع والمفتاح.';
    if (!ASCII.test(String(key))) return 'المفتاح يحوي حروفًا غير إنجليزية — غالبًا نُسخ معه حرفٌ زائد. انسخه من Supabase → Settings → API مرة أخرى.';
    if (!ASCII.test(String(url))) return 'الرابط يحوي حروفًا غير إنجليزية — أعد نسخه.';
    if (!/^https?:\/\//.test(String(url))) return 'الرابط يجب أن يبدأ بـ https://';
    return null;
  }

  /* ── نداء واحد إلى PostgREST ── */
  function call(path, opts) {
    var bad = badInput(state.url, state.key);
    if (bad) return Promise.reject(new Error(bad));
    var o = opts || {};
    var headers = { apikey: state.key, Authorization: 'Bearer ' + state.key,
                    'Content-Type': 'application/json' };
    if (o.prefer) headers.Prefer = o.prefer;
    return fetch(state.url + '/rest/v1/' + path, {
      method: o.method || 'GET', headers: headers,
      body: o.body ? JSON.stringify(o.body) : undefined
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t.slice(0, 160)); });
      return r.status === 204 ? null : r.json();
    });
  }

  /* ── تحويل الصيغ ──
     المخزن المحلي يستعمل camelCase والجدول snake_case. التحويل هنا
     في موضعٍ واحد، فلا يتسرّب اسمٌ خاطئ إلى بقية الكود. */
  var DOC_MAP = [
    ['id','id'], ['name','name'], ['text','text'], ['refText','ref_text'],
    ['refName','ref_name'], ['docType','doc_type'], ['context','context'],
    ['caseCode','case_code'], ['fp','fp'], ['version','version'],
    ['parentId','parent_id'], ['origin','origin'], ['isDraft','is_draft'],
    ['truncated','truncated'], ['history','history'], ['tasks','tasks'],
    ['lastRisk','last_risk'], ['addedAt','added_at']
  ];
  function docOut(d) {
    var o = {}; DOC_MAP.forEach(function (p) { if (d[p[0]] !== undefined) o[p[1]] = d[p[0]]; });
    o.updated_at = new Date().toISOString();
    return o;
  }
  function docIn(r) {
    var o = {}; DOC_MAP.forEach(function (p) { if (r[p[1]] !== undefined && r[p[1]] !== null) o[p[0]] = r[p[1]]; });
    o.history = o.history || []; o.tasks = o.tasks || {};
    return o;
  }
  var REQ_MAP = [['id','id'],['at','at'],['actor','actor'],['actorId','actor_id'],
    ['action','action'],['title','title'],['detail','detail'],['code','code'],
    ['versionId','version_id'],['status','status'],['decidedAt','decided_at'],['decidedBy','decided_by']];
  function mapOut(m, x) { var o = {}; m.forEach(function (p) { if (x[p[0]] !== undefined) o[p[1]] = x[p[0]]; }); return o; }
  function mapIn(m, r) { var o = {}; m.forEach(function (p) { if (r[p[1]] !== undefined && r[p[1]] !== null) o[p[0]] = r[p[1]]; }); return o; }

  /* ── السحب: الخادم مصدر الحقيقة عند الفتح ── */
  function pull() {
    if (!state.on) return Promise.resolve({ skipped: true });
    state.busy = true; state.error = null;
    return Promise.all([
      call('docs?select=*&order=updated_at.desc'),
      call('requests?select=*&order=at.desc&limit=200'),
      call('versions?select=*&order=at.desc&limit=40'),
      call('settings?select=*&id=eq.1'),
      call('accounts?select=*')
    ]).then(function (r) {
      var remote = (r[0] || []).map(docIn);
      /* كشف التعارض: مستندٌ عُدّل هنا وهناك بعد آخر مزامنة. لا ندمج
         تلقائيًا — نحتفظ بنسخة الخادم ونُعلم المستخدم بما اصطدم، فآخرُ
         كتابةٍ تغلب صامتةً أسوأ من تحذيرٍ صريح. */
      var mine = lsGet(K.docs, '[]'), byId = {};
      mine.forEach(function (d) { byId[d.id] = d; });
      state.clashes = remote.filter(function (rd) {
        var m = byId[rd.id];
        return m && state.pulledAt &&
               JSON.stringify(m.text) !== JSON.stringify(rd.text) &&
               (m.addedAt || 0) <= (rd.addedAt || 0);
      }).map(function (d) { return d.name || d.id; });
      return (CR && CR.ready() ? CR.openAll(remote) : Promise.resolve(remote))
        .then(function (open) { return finishPull(open, r); });
    }).then(function (x) { return x; })
      .catch(function (e) {
        state.busy = false; state.error = e.message || String(e);
        fire('error'); return { ok: false, error: state.error };
      });
  }

  function finishPull(docs, r) {
    return Promise.resolve().then(function () {
      lsSet(K.docs, docs);
      lsSet(K.reqs, (r[1] || []).map(function (x) { return mapIn(REQ_MAP, x); }).reverse());
      lsSet(K.vers, (r[2] || []).map(function (v) {
        return { id: v.id, at: v.at, label: v.label, actor: v.actor, docs: (v.docs || []).map(docIn) };
      }).reverse());
      var accs = (r[4] || []).filter(function (a) { return a.code_hash; });
      if (accs.length) lsSet(K.accs, accs.map(function (a) {
        return { id: a.id, name: a.name, role: a.role, hash: a.code_hash,
                 active: a.active !== false, seedCode: a.seeded ? undefined : undefined };
      }));
      state.pulledAt = Date.now(); state.busy = false;
      fire('pull');
      var locked = docs.filter(function (d) { return d.locked; }).length;
      return { ok: true, docs: docs.length, locked: locked,
               clashes: state.clashes || [],
               settings: (r[3] && r[3][0]) ? r[3][0].config : null,
               probe: (r[3] && r[3][0]) ? r[3][0].probe : null };
    });
  }

  /* ── الدفع: بعد كل تغيير محلي ── */
  /* التعمية تسبق الإرسال دائمًا: لا يغادر نصٌّ صريحٌ هذا المتصفح
     ما دامت عبارة الفريق مضبوطة. */
  function seal(docs) {
    if (!CR || !CR.ready()) return Promise.resolve(docs);
    return CR.sealAll(docs);
  }
  function pushDocs() {
    if (!state.on) return Promise.resolve({ skipped: true });
    var docs = lsGet(K.docs, '[]');
    if (!docs.length) return Promise.resolve({ ok: true, n: 0 });
    return seal(docs).then(function (sealed) {
      return call('docs', { method: 'POST', body: sealed.map(docOut),
                            prefer: 'resolution=merge-duplicates,return=minimal' });
    }).then(function () { state.pushedAt = Date.now(); return { ok: true, n: docs.length }; });
  }
  function pushAll(actor) {
    if (!state.on) return Promise.resolve({ skipped: true });
    state.busy = true; state.error = null;
    var reqs = lsGet(K.reqs, '[]'), vers = lsGet(K.vers, '[]');
    var jobs = [pushDocs()];
    if (reqs.length) jobs.push(call('requests', { method: 'POST',
      body: reqs.map(function (x) { return mapOut(REQ_MAP, x); }),
      prefer: 'resolution=merge-duplicates,return=minimal' }));
    if (vers.length) jobs.push(call('versions', { method: 'POST',
      body: vers.map(function (v) { return { id: v.id, at: v.at, label: v.label,
                                             actor: v.actor, docs: (v.docs || []).map(docOut) }; }),
      prefer: 'resolution=merge-duplicates,return=minimal' }));
    return Promise.all(jobs).then(function () {
      state.busy = false; state.pushedAt = Date.now(); fire('push');
      return { ok: true };
    }).catch(function (e) {
      state.busy = false; state.error = e.message || String(e);
      fire('error'); return { ok: false, error: state.error };
    });
  }

  /* حذفٌ صريح: الدفع بالدمج لا يُزيل ما حُذف محليًا */
  function removeDoc(id) {
    if (!state.on) return Promise.resolve({ skipped: true });
    return call('docs?id=eq.' + encodeURIComponent(id), { method: 'DELETE', prefer: 'return=minimal' })
      .then(function () { return { ok: true }; })
      .catch(function (e) { state.error = e.message; return { ok: false, error: state.error }; });
  }

  /* ── الإعدادات المشتركة ── */
  function pushSettings(cfg, actor) {
    if (!state.on) return Promise.resolve({ skipped: true });
    return call('settings', { method: 'POST',
      body: [{ id: 1, config: cfg, updated_by: actor || '', updated_at: new Date().toISOString() }],
      prefer: 'resolution=merge-duplicates,return=minimal' })
      .then(function () { return { ok: true }; })
      .catch(function (e) { return { ok: false, error: e.message }; });
  }
  function pushAccounts(list) {
    if (!state.on) return Promise.resolve({ skipped: true });
    return call('accounts', { method: 'POST',
      body: list.map(function (a) {
        return { id: a.id, name: a.name, role: a.role, code_hash: a.hash,
                 active: a.active !== false, seeded: !!a.seedCode,
                 updated_at: new Date().toISOString() };
      }), prefer: 'resolution=merge-duplicates,return=minimal' })
      .then(function () { return { ok: true }; })
      .catch(function (e) { return { ok: false, error: e.message }; });
  }

  /* اختبار الاتصال قبل الحفظ — خيرٌ من ضبطٍ صامتٍ لا يعمل */
  function test(url, key) {
    var bad = badInput(url, key);
    if (bad) return Promise.resolve({ ok: false, error: bad });
    var u = String(url || '').replace(/\/+$/, '');
    return fetch(u + '/rest/v1/docs?select=id&limit=1',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } })
      .then(function (r) {
        if (r.ok) return { ok: true };
        return r.text().then(function (t) { return { ok: false, error: r.status + ' ' + t.slice(0, 140) }; });
      })
      .catch(function (e) { return { ok: false, error: 'تعذّر الوصول: ' + (e.message || e) }; });
  }

  config();
  return { config: config, setConfig: setConfig, isOn: isOn, status: status, badInput: badInput,
           pull: pull, pushAll: pushAll, pushDocs: pushDocs, removeDoc: removeDoc,
           pushSettings: pushSettings, pushAccounts: pushAccounts,
           test: test, onChange: onChange, KEYS: K };
});
