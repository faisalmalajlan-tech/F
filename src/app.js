/* نذير — الواجهة. لا يوجد أي طلب شبكة في هذا الملف. */
(function () {
  'use strict';
  var E = window.NadheerEngine, NC = window.NadheerConfig,
      AU = window.NadheerAudit, ST = window.NadheerStore, CF = window.NadheerConflicts;

  var S = { session: null, cfg: null, cfgDraft: null, route: 'home',
            docs: [], analyses: {}, openDoc: null, docTab: 'sum',
            draft: { doc1: '', doc2: '', ctx: '', name: '', type: 'فحص كل البنود' }, files: {},
            gapFilter: 'all', planFilter: 'open', auditFilter: 'all', auditQ: '',
            storageOK: true, sourceText: '', banner: null };

  /* ═══ أدوات ═══ */
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g,
    function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); };
  var $ = function (i) { return document.getElementById(i); };
  /* يربط حدثًا على كل ما يطابق المحدِّد داخل عنصر. يغني عن حلقة يدوية
     وغلاف IIFE في كل موضع ربط — وكانت ثلاثة عشر. */
  function on(root, sel, ev, fn) {
    Array.prototype.forEach.call((root || document).querySelectorAll(sel), function (n) {
      n.addEventListener(ev, function (e) { fn(n, e); });
    });
  }
  var sevColor = function (s) { return s === 'critical' ? 'var(--danger)' : s === 'medium' ? 'var(--warning)' : 'var(--success)'; };
  var sevLabel = function (s) { return s === 'critical' ? 'حرجة' : s === 'medium' ? 'متوسطة' : 'منخفضة'; };
  var sevBadge = function (s) { return s === 'critical' ? 'high' : s === 'medium' ? 'med' : 'low'; };
  var riskColor = function (r) {
    var t = (S.cfg || NC.DEFAULTS).scoring.thresholds;
    return r >= t.critical ? 'var(--danger)' : r >= t.medium ? 'var(--warning)' : 'var(--success)';
  };
  var riskWord = function (r) {
    var t = (S.cfg || NC.DEFAULTS).scoring.thresholds;
    return r >= t.critical ? 'مرتفع' : r >= t.medium ? 'متوسط' : 'منخفض';
  };
  var fmtDate = function (ts) {
    var d = new Date(ts);
    return d.toISOString().slice(0, 10) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  };
  var STATUS = { todo: 'لم يبدأ', doing: 'قيد التنفيذ', done: 'مكتمل' };

  var I = {
    doc:'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
    docs:'<path d="M15 2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V6z"/><path d="M15 2v4h4"/><path d="M3 7v13a2 2 0 0 0 2 2h9"/>',
    shield:'<path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    burger:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    back:'<path d="M15 18l-6-6 6-6"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>'
  };
  function ico(n, sz) {
    return '<svg width="' + (sz || 17) + '" height="' + (sz || 17) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + I[n] + '</svg>';
  }
  function logo(size, sw) {
    var w = sw || 1.15;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 1.8 22.2 12 12 22.2 1.8 12Z" stroke-width="' + w + '" opacity=".55"/>' +
      '<path d="M6.9 16.4a5.15 5.15 0 0 1 10.2 0" stroke-width="' + w + '" opacity=".45"/>' +
      '<path d="M8.85 16.4a3.2 3.2 0 0 1 6.3 0" stroke-width="' + (w * 1.15) + '" opacity=".8"/>' +
      '<circle cx="12" cy="16.5" r="1.45" fill="currentColor" stroke="none"/></svg>';
  }

  /* ═══ الخلفية المتحركة ═══
     تظهر في البوابة وفي الرئيسية فقط — لا خلف جداول التحليل، فالحركة
     خلف نصٍّ يُقرأ تشتّت. عنصرٌ واحد يُنقل لا يُعاد إنشاؤه، حتى لا
     يُفكّ ترميز الفيديو من جديد في كل تنقّل. */
  function backdrop(on, where) {
    var bd = $('backdrop'); if (!bd) return;
    bd.classList.toggle('on', !!on);
    var v = $('backdropVid');
    if (v) {
      // إيقافه وهو مخفيّ يوفّر فكّ ترميزٍ متصلًا بلا فائدة
      if (on) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else v.pause();
    }
    var gate = $('gate');
    if (gate) gate.classList.toggle('over-backdrop', on && where === 'gate');
  }

  /* ═══ الجلسة ═══ */
  var ADMIN_KEY = 'nadheer:adminhash', DEFAULT_CODE = '1234';
  function codeHash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function adminHash() {
    try { return window.localStorage.getItem(ADMIN_KEY) || codeHash(DEFAULT_CODE); }
    catch (e) { return codeHash(DEFAULT_CODE); }
  }
  var isDefaultCode = function () { return adminHash() === codeHash(DEFAULT_CODE); };
  var isAdmin = function () { return S.session && S.session.role === 'admin'; };

  var gateRole = 'user';
  function renderGate() {
    $('gate').classList.add('open');
    document.body.classList.add('gated');
    backdrop(true, 'gate');
    $('gate').innerHTML = '<div class="gate-card">' +
      '<div class="gate-mark">' + logo(40, 1.05) + '</div>' +
      '<h1>نذير</h1><div class="tag">ذكاء الامتثال الاستباقي</div>' +
      '<div class="roles">' +
      '<button type="button" class="role' + (gateRole === 'user' ? ' sel' : '') + '" data-role="user">' +
        ico('user', 21) + '<div class="rn">دخول عادي</div><div class="rd">تحليل ومتابعة وتصدير</div></button>' +
      '<button type="button" class="role' + (gateRole === 'admin' ? ' sel' : '') + '" data-role="admin">' +
        ico('shield', 21) + '<div class="rn">مدير النظام</div><div class="rd">تعديل المحرك والتتبّع</div></button>' +
      '</div><div id="gateFields"></div>' +
      '<div style="margin-top:16px"><button class="btn" id="gateGo">دخول</button></div><div id="gateErr"></div>' +
      '<div class="gate-note">' + ico('lock', 12) + ' هذا فصل أدوار للاستخدام، لا حاجز أمني. ' +
      'الملف يعمل من القرص بلا خادم، فمن يفتحه بمحرر نصوص يستطيع تجاوز الرمز. ' +
      'للحماية الفعلية شغّله من خادم داخلي بمصادقة.</div></div>';
    on($('gate'), '.role', 'click', function (b) { gateRole = b.dataset.role; renderGate(); });
    $('gateFields').innerHTML = gateRole === 'admin'
      ? '<label class="field-label" for="gateCode">رمز المدير</label><input type="password" id="gateCode" autocomplete="off">' +
        (isDefaultCode() ? '<div style="font-size:10px;color:var(--warning);margin-top:8px;line-height:1.7">الرمز الافتراضي ما زال فعّالًا — غيّره من صفحة الأمان بعد الدخول.</div>' : '')
      : '<label class="field-label" for="gateName">الاسم (اختياري — يظهر في سجل التتبّع)</label><input type="text" id="gateName" autocomplete="off">';
    var go = function () {
      if (gateRole === 'admin') {
        if (codeHash($('gateCode').value || '') !== adminHash()) {
          $('gateErr').innerHTML = '<div class="errbox">رمز غير صحيح.</div>';
          AU.log({ kind: 'security', actor: 'مجهول', title: 'محاولة دخول فاشلة', detail: 'رمز مدير غير صحيح' });
          return;
        }
        S.session = { role: 'admin', name: 'مدير النظام' };
      } else S.session = { role: 'user', name: (($('gateName').value || '').trim() || 'مستخدم') };
      try { window.sessionStorage.setItem('nadheer:session', JSON.stringify(S.session)); } catch (e) {}
      AU.log({ kind: 'auth', actor: S.session.name, title: 'تسجيل دخول',
               detail: isAdmin() ? 'بصلاحية مدير النظام' : 'بصلاحية مستخدم' });
      $('gate').classList.remove('open');
      document.body.classList.remove('gated');
      backdrop(false);
      startApp();
    };
    $('gateGo').addEventListener('click', go);
    var inp = $('gateCode') || $('gateName');
    if (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); inp.focus(); }
  }
  function logout() {
    AU.log({ kind: 'auth', actor: S.session ? S.session.name : '—', title: 'تسجيل خروج', detail: '' });
    try { window.sessionStorage.removeItem('nadheer:session'); } catch (e) {}
    S.session = null; S.analyses = {}; S.openDoc = null;
    S.draft = { doc1: '', doc2: '', ctx: '', name: '', type: 'فحص كل البنود' }; S.files = {};
    renderGate();
  }

  /* ═══════════ التحديث اليومي ═══════════
     كل مستند يُعاد تحليله بتاريخ اليوم عند كل فتح. الخطر يتحرك وحده مع
     اقتراب المواعيد، وتُسجَّل نقطة واحدة في تاريخه لكل يوم.            */
  function analyzeDoc(doc) {
    var res = E.analyze({ docText: doc.text, refText: doc.refText, context: doc.context,
                          config: S.cfg, docType: doc.docType });
    res.docId = doc.id; res.docName = doc.name; res.caseCode = doc.caseCode;

    /* لكل قاعدةٍ عنوانُها وشرحها: «منع مقابل فرض» وصفٌ صادق للقاعدة
       الأولى وحدها، وإطلاقُه على تعارض النطاق أو التعريف أو التسلسل
       يقول للمراجع غيرَ ما رصده المحرك. */
    res.conflicts = doc.refText ? CF.detect({ docText: doc.text, refText: doc.refText, config: S.cfg }).conflicts : [];
    var ci = S.cfg.conflict.impact;
    res.conflicts.forEach(function (c) {
      var risk = E.itemRisk(0.95, ci, null, S.cfg.scoring);
      var isNum = c.rule === 'حدّي';
      res.gaps.unshift({
        code: c.code, key: 'تعارض|' + c.key, type: 'تعارض مع المرجع',
        title: conflictTitle(c),
        description: conflictDesc(c) + ' تطابق الموضوع ' + c.score + '٪.',
        recommendation: 'أصدر البند المعدَّل والتعميم من صفحة «التعديلات».',
        evidence: c.docQuote, evidenceType: 'quote',
        probability: 0.95, impact: ci, decay: 1, risk: risk,
        severity: E.sevFromRisk(risk, S.cfg.scoring), conflict: c
      });
    });
    res.gaps.sort(function (a, b) { return b.risk - a.risk; });
    // الفجوات المُنجزة تخرج من الحساب — إغلاق مهمة يخفض الخطر فعلًا
    var open = res.gaps.filter(function (g) { return ST.taskOf(doc, g.code).status !== 'done'; });
    res.openGaps = open;
    res.doneCount = res.gaps.length - open.length;
    var risks = open.map(function (g) { return g.risk; })
                  .concat(res.preds.map(function (p) { return p.risk; }));
    res.effRisk = E.aggregateRisk(risks, S.cfg.scoring);
    res.stats = { critical: 0, medium: 0, low: 0 };
    open.forEach(function (g) { res.stats[g.severity]++; });
    return res;
  }
  function refreshAll() {
    S.docs = ST.list();
    S.analyses = {};
    var moved = 0;
    S.docs.forEach(function (d) {
      var res = analyzeDoc(d);
      S.analyses[d.id] = res;
      var before = ST.delta(d);
      ST.recordRisk(d.id, res.effRisk);
      if (before === null && (d.history || []).length) moved++;
    });
    S.docs = ST.list();
    return moved;
  }
  function portfolioRisk() {
    var rs = S.docs.map(function (d) { return (S.analyses[d.id] || {}).effRisk || 0; });
    return E.aggregateRisk(rs, S.cfg.scoring);
  }
  /* كل المواعيد القادمة عبر كل المستندات، مرتّبة بالأقرب */
  function allDeadlines() {
    var out = [];
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      r.preds.forEach(function (p) { out.push({ doc: d, p: p }); });
    });
    return out.sort(function (a, b) { return a.p.daysRemaining - b.p.daysRemaining; });
  }
  function allOverdue() {
    var out = [];
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      r.openGaps.filter(function (g) { return g.type === 'موعد متجاوز'; })
        .forEach(function (g) { out.push({ doc: d, g: g }); });
    });
    return out;
  }
  /* أرقام الداشبورد التنفيذي — تُجمَع من كل المستندات */
  function exec() {
    var openGaps = 0, doneGaps = 0, totalGaps = 0, conflicts = 0;
    var accruing = [], upcoming = [], uncounted = [];
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      totalGaps += r.gaps.length; openGaps += r.openGaps.length; doneGaps += r.doneCount;
      conflicts += (r.conflicts || []).length;
      r.obligations.forEach(function (o) {
        if (o.exposure === null || o.exposure === undefined) {
          if (o.exposureNote) uncounted.push({ doc: d, o: o });   // سقف نسبي بلا قيمة عقد
          return;
        }
        (o.exposureAccruing ? accruing : upcoming).push({ doc: d, o: o });
      });
    });
    accruing.sort(function (a, b) { return b.o.exposure - a.o.exposure; });
    upcoming.sort(function (a, b) { return a.o.daysRemaining - b.o.daysRemaining; });
    var sum = function (l) { return l.reduce(function (a, x) { return a + x.o.exposure; }, 0); };
    return {
      openGaps: openGaps, doneGaps: doneGaps, totalGaps: totalGaps, conflicts: conflicts,
      pctDone: totalGaps ? Math.round(doneGaps / totalGaps * 100) : 0,
      accruing: accruing, upcoming: upcoming, uncounted: uncounted,
      accruingSum: sum(accruing), upcomingSum: sum(upcoming),
      nextFine: upcoming.length ? upcoming[0] : null
    };
  }
  var money = function (n) {
    return Math.round(n).toLocaleString('en-US');
  };

  function allTasks() {
    var out = [];
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      r.gaps.forEach(function (g) {
        var t = ST.taskOf(d, g.code);
        out.push({ doc: d, gap: g, task: t });
      });
    });
    return out.sort(function (a, b) {
      var rank = { doing: 0, todo: 1, done: 2 };
      return (rank[a.task.status] - rank[b.task.status]) || (b.gap.risk - a.gap.risk);
    });
  }

  /* ═══ التنقّل ═══ */
  var NAV = [
    { r: 'home',  t: 'الرئيسية' },
    { r: 'docs',  t: 'المستندات' },
    { r: 'plan',  t: 'خطة المعالجة' },
    { sep: 'الإدارة', admin: true },
    { r: 'admin', t: 'إعدادات المحرك', admin: true },
    { r: 'audit', t: 'سجل التتبّع', admin: true },
    { r: 'security', t: 'الأمان والدخول', admin: true }
  ];
  var routes = { home: renderHome, docs: renderDocs, doc: renderDoc, upload: renderUpload,
                 plan: renderPlan, admin: renderAdmin, audit: renderAudit, security: renderSecurity };
  function renderNav() {
    var html = '<div class="hdr">التنقّل</div>';
    NAV.forEach(function (n) {
      if (n.admin && !isAdmin()) return;
      html += n.sep ? '<div class="navsep">' + n.sep + '</div>'
                    : '<button class="navlink" type="button" data-r="' + n.r + '">' + n.t + '</button>';
    });
    html += '<div class="navsep">الجلسة</div><button class="navlink" type="button" id="logoutBtn">تسجيل الخروج</button>';
    $('navPanel').innerHTML = html;
    on($('navPanel'), '.navlink[data-r]', 'click', function (l) { go(l.dataset.r); });
    $('logoutBtn').addEventListener('click', logout);
  }
  function go(route, arg) {
    if (!S.session) { renderGate(); return; }
    if (['admin', 'audit', 'security'].indexOf(route) > -1 && !isAdmin()) route = 'home';
    if (route === 'doc' && arg) { S.openDoc = arg; S.docTab = 'sum'; }
    S.route = route;
    $('navOverlay').classList.remove('open');
    Array.prototype.forEach.call($('navPanel').querySelectorAll('.navlink[data-r]'), function (l) {
      l.classList.toggle('active', l.dataset.r === route);
    });
    window.scrollTo(0, 0);
    (routes[route] || renderHome)();
  }
  /* ربط واحد لكل ما تنتجه الصفحات: التنقّل، الاقتباسات، وحالات المهام. */
  function wire(el) {
    on(el, '[data-r]', 'click', function (b) { go(b.dataset.r, b.dataset.id); });
    on(el, '.evidence', 'click', function (e) { openViewer(e.dataset.q, e.dataset.src); });
    on(el, '[data-status]', 'click', function (b) {
      ST.setTask(b.dataset.doc, b.dataset.code, { status: b.dataset.status, by: S.session.name });
      AU.log({ kind: 'data', actor: S.session.name, code: b.dataset.code,
               title: 'تحديث مهمة معالجة', detail: 'الحالة: ' + STATUS[b.dataset.status] });
      refreshAll();
      (S.route === 'plan' ? renderPlan : renderDoc)();
    });
    wireTrend(el);
  }
  function banner() {
    if (!S.banner) return '';
    var b = '<div class="' + (S.banner.bad ? 'errbox' : 'okbox') + '">' + esc(S.banner.msg) + '</div>';
    S.banner = null; return b;
  }

  /* ═══ عارض المستند ═══ */
  /* اقتباس «متطلب غير مغطى» مأخوذ من المستند المرجعي لا من مستندك،
     فالبحث عنه في النص الأساسي يفشل دائمًا — لذلك يحمل كل اقتباس مصدره. */
  function openViewer(quote, src) {
    var isRef = src === 'ref';
    var text = isRef ? (S.refText || '') : S.sourceText;
    $('viewTitle').textContent = isRef ? 'المستند المرجعي' : 'المستند الأصلي';
    var hit = E.locateQuote(text, quote), body = $('viewBody');
    if (!hit) body.innerHTML = '<div class="empty">تعذّر تحديد موضع هذا الاقتباس في النص.</div>';
    else {
      var t = text, from = Math.max(0, hit.start - 900), to = Math.min(t.length, hit.end + 900);
      body.innerHTML = (from > 0 ? '…' : '') + esc(t.slice(from, hit.start)) +
        '<mark id="hl">' + esc(t.slice(hit.start, hit.end)) + '</mark>' + esc(t.slice(hit.end, to)) + (to < t.length ? '…' : '');
    }
    $('viewer').classList.add('open');
    var hl = $('hl'); if (hl) hl.scrollIntoView({ block: 'center' });
  }
  function closeOverlays() { $('viewer').classList.remove('open'); $('navOverlay').classList.remove('open'); }

  /* ═══════════ ١. الرئيسية ═══════════ */
  function renderHome() {
    var el = $('pageContent');
    backdrop(true, 'home');
    if (!S.docs.length) {
      el.innerHTML = banner() + '<div class="card" style="text-align:center;padding:46px 22px">' +
        '<div style="color:var(--gold);display:flex;justify-content:center;margin-bottom:18px">' + logo(38, 1) + '</div>' +
        '<div style="font-weight:300;font-size:21px;margin-bottom:10px">ابدأ بمستند</div>' +
        '<p style="color:var(--text2);font-size:12.5px;margin:0 auto 22px;line-height:2;font-weight:300;max-width:42ch">' +
        'ارفع عقدًا أو لائحة أو سياسة. نذير يحفظه، ويعيد حسابه كل يوم، ويخبرك بما سيستحق قبل أن يستحق.</p>' +
        '<div style="max-width:240px;margin:0 auto"><button class="btn" data-r="upload">تحليل مستند جديد</button></div></div>';
      wire(el); return;
    }

    var pr = portfolioRisk(), x = exec(), over = allOverdue();
    var moves = [];
    S.docs.forEach(function (d) {
      var dd = ST.delta(d);
      if (dd && Math.abs(dd.diff) >= 0.05) moves.push({ doc: d, d: dd });
    });
    moves.sort(function (a, b) { return b.d.diff - a.d.diff; });

    var html = banner();

    /* عتبات الجوهرية غير مضبوطة ⇒ كل غرامة تُقاس على أرقامٍ افتراضية
       لا تخصّ هذه الجهة. تنبيهٌ صريح خيرٌ من درجةٍ تبدو موثوقة وليست. */
    var mat = (S.cfg.scoring || {}).materiality;
    if (mat && !mat.calibrated) {
      html += '<div class="calib">' + ico('shield', 14) +
        '<div><b>عتبات الجوهرية لم تُضبط بعد.</b> جسامة الغرامات تُقاس الآن ' +
        'على أرقامٍ افتراضية (' + money(mat.bands[0].upTo) + ' فأقلّ = منخفض جدًا، ' +
        'أكثر من ' + money(mat.bands[mat.bands.length - 2].upTo) + ' = مرتفع جدًا). ' +
        'لا معيار عالمي لهذه العتبات — تختلف بحجم الجهة. ' +
        '<button type="button" class="lnk" data-r="admin">اضبطها من إعدادات المحرك</button></div></div>';
    }

    /* ١ — الحالة: مؤشر قوسي بدل رقمٍ مجرّد، ومنحنى المحفظة بجانبه */
    var series = portfolioSeries();
    html += '<div class="risk-hero over-backdrop"><div class="top">' +
      '<div style="flex:1;min-width:180px">' +
      '<div class="eyebrow">لوحة الامتثال · ' + S.docs.length + ' مستند · ' + ST.today() + '</div>' +
      '<div class="risk-title">وضعك اليوم<br><b>' + riskWord(pr) + '</b></div>' +
      (x.conflicts ? '<div class="risk-badges"><span class="badge high">' + x.conflicts +
        ' بند يخالف المرجع</span></div>' : '') +
      '</div>' +
      '<div style="min-width:200px">' + gauge(pr) + '</div>' +
      '</div></div>';



    /* ٢ — أربعة أرقام تنفيذية: الحصيلة قبل التفصيل */
    html += '<div class="exec">' +
      execCell(x.openGaps, 'مشكلة مفتوحة', x.totalGaps + ' إجمالًا', 'var(--warning)') +
      execCell(x.doneGaps, 'مشكلة انحلّت', x.pctDone + '٪ من الكل', 'var(--success)') +
      execCell(money(x.accruingSum + x.upcomingSum), 'ريال تعرّض مالي',
        (x.accruingSum ? money(x.accruingSum) + ' جارية' : 'كلها محتملة'), 'var(--danger)') +
      execCell(x.nextFine ? x.nextFine.o.daysRemaining : '—', 'يومًا لأقرب غرامة',
        x.nextFine ? money(x.nextFine.o.exposure) + ' ريال' : 'لا غرامة مؤرّخة', 'var(--gold)') +
      '</div>';

    /* ٣ — الرسوم: مؤشر، منحنى، توزيع الخطورة، توزيع التعارضات */
    var byRule = conflictsByRule(), byType = gapsByType(), stats = allStats();
    var cards = [];
    if (series.length >= 2) {
      var first = series[0].r, lastP = series[series.length - 1].r, dlt = lastP - first;
      cards.push('<div class="chartcard"><div class="chart-head">' +
        '<div class="chart-title">مسار الخطر</div>' +
        '<div class="chart-sub">' + series.length + ' يومًا · ' +
        (dlt > 0.5 ? '▲ ' : dlt < -0.5 ? '▼ ' : '') + Math.abs(dlt).toFixed(1) + '</div></div>' +
        trend(series, 'trendHome') +
        '<div class="chart-note">مرّر لقراءة درجة أي يوم. الدرجة مجمّعة من كل المستندات.</div></div>');
    }
    if (stats.critical + stats.medium + stats.low) {
      cards.push('<div class="chartcard"><div class="chart-head">' +
        '<div class="chart-title">خطورة الفجوات المفتوحة</div>' +
        '<div class="chart-sub">' + x.openGaps + ' مفتوحة</div></div>' +
        sevBar(stats) +
        '<div class="chart-note">اضغط أي جزء للانتقال إلى خطة المعالجة.</div></div>');
    }
    if (byRule.length) {
      cards.push('<div class="chartcard"><div class="chart-head">' +
        '<div class="chart-title">التعارضات بحسب القاعدة</div>' +
        '<div class="chart-sub">' + x.conflicts + ' تعارضًا</div></div>' +
        hbars(byRule, { head: ['القاعدة', 'التعارضات'] }) + '</div>');
    }
    if (byType.length) {
      cards.push('<div class="chartcard"><div class="chart-head">' +
        '<div class="chart-title">الفجوات بحسب النوع</div>' +
        '<div class="chart-sub">' + x.openGaps + ' مفتوحة</div></div>' +
        hbars(byType, { head: ['النوع', 'الفجوات'] }) + '</div>');
    }
    if (cards.length) html += '<div class="dashgrid">' + cards.join('') + '</div>';

    /* شريط الإنجاز */
    html += '<div class="card"><div class="sectitle">أين وصلت المعالجة</div>' +
      '<div class="progress"><div class="pf" style="width:' + x.pctDone + '%"></div></div>' +
      '<div class="progress-lbl"><span>' + x.doneGaps + ' انحلّت</span>' +
      '<span>' + x.openGaps + ' ما زالت مفتوحة</span></div></div>';

    /* ٣ — متى تأتي الغرامات وكم تكون */
    if (x.accruing.length || x.upcoming.length) {
      html += '<div class="card"><div class="sectitle">الغرامات — متى وكم</div>';
      if (x.accruing.length) {
        html += '<div class="grouplbl" style="margin-top:0">جارية الآن</div>' +
          x.accruing.slice(0, 4).map(function (f) {
            return '<button class="linkrow" type="button" data-r="doc" data-id="' + f.doc.id + '">' +
              '<span class="lr-tag" style="color:var(--danger);border-color:var(--danger)">' +
              money(f.o.exposure) + '</span><span class="lr-body">' +
              '<b>متأخر ' + Math.abs(f.o.daysRemaining) + ' يومًا' +
              (f.o.penaltyPerDay ? ' · ' + money(f.o.penaltyAmount) + ' ريال يوميًا' : '') + '</b>' +
              '<i>' + esc(f.doc.name) + '</i></span></button>';
          }).join('');
      }
      if (x.upcoming.length) {
        html += '<div class="grouplbl">قادمة</div>' +
          x.upcoming.slice(0, 5).map(function (f) {
            return '<button class="linkrow" type="button" data-r="doc" data-id="' + f.doc.id + '">' +
              '<span class="lr-tag" style="color:var(--warning);border-color:var(--warning)">' +
              money(f.o.exposure) + '</span><span class="lr-body">' +
              '<b>بعد ' + f.o.daysRemaining + ' يومًا · ' +
              new Date(f.o.deadlineTS).toISOString().slice(0, 10) + '</b>' +
              '<i>' + esc(f.doc.name) + '</i></span></button>';
          }).join('');
      }
      if (x.uncounted.length) {
        html += '<div class="grouplbl">غير محسوبة</div>' +
          x.uncounted.slice(0, 3).map(function (f) {
            return '<button class="linkrow" type="button" data-r="doc" data-id="' + f.doc.id + '">' +
              '<span class="lr-tag" style="color:var(--text3);border-color:var(--line2)">؟</span>' +
              '<span class="lr-body"><b>' + esc(f.o.exposureNote) + '</b><i>' + esc(f.doc.name) + '</i></span></button>';
          }).join('');
      }
      html += '<div class="note">تقدير مستخرج من نصوص الجزاءات، لا التزام محاسبي. ' +
        'الغرامة اليومية تُضرب في أيام التأخر، وتُقصر على السقف المنصوص إن وُجد. ' +
        'الغرامة ذات السقف النسبي لا تُحسب ما لم تُذكر قيمة العقد في المستند.</div></div>';
    }

    /* ٤ — المتجاوز */
    if (over.length) {
      html += '<div class="card"><div class="sectitle">مواعيد انقضت</div>' +
        over.slice(0, 4).map(function (o) {
          return '<button class="linkrow" type="button" data-r="doc" data-id="' + o.doc.id + '">' +
            '<span class="lr-tag" style="color:var(--danger);border-color:var(--danger)">متجاوز</span>' +
            '<span class="lr-body"><b>' + esc(o.g.title) + '</b><i>' + esc(o.doc.name) + '</i></span></button>';
        }).join('') + '</div>';
    }

    /* ٥ — ما تحرّك */
    if (moves.length) {
      html += '<div class="card"><div class="sectitle">ما تغيّر منذ آخر فتح</div>' +
        moves.slice(0, 4).map(function (m) {
          var up = m.d.diff > 0;
          return '<button class="linkrow" type="button" data-r="doc" data-id="' + m.doc.id + '">' +
            '<span class="lr-tag" style="color:' + (up ? 'var(--danger)' : 'var(--success)') + ';border-color:transparent">' +
            (up ? '▲' : '▼') + ' ' + Math.abs(m.d.diff).toFixed(1) + '</span>' +
            '<span class="lr-body"><b>' + esc(m.doc.name) + '</b><i>' +
            (m.d.days === 1 ? 'منذ أمس' : 'خلال ' + m.d.days + ' أيام') + ' · من ' +
            m.d.from.toFixed(0) + ' إلى ' + m.d.to.toFixed(0) + '</i></span></button>';
        }).join('') + '</div>';
    }

    html += '<button class="btn ghost" data-r="upload" style="margin-top:4px">تحليل مستند جديد</button>';
    el.innerHTML = html; wire(el);
  }
  function execCell(v, l, s2, c) {
    return '<div class="exec-cell"><div class="v num" style="color:' + c + '">' + v + '</div>' +
      '<div class="l">' + l + '</div><div class="s">' + esc(s2) + '</div></div>';
  }


  /* ═══════════ رسوم لوحة القيادة ═══════════
     كلها SVG مضمّن وحركة CSS — لا مكتبة ولا طلب شبكة، وقاعدة
     prefers-reduced-motion العامة تُسكِّنها لمن طلب ذلك.
     الهوية لا تُحمَل باللون وحده: لكل رسمٍ تسمياتٌ مباشرة وجدولٌ بديل. */

  var CH = { crit: 'var(--c-crit)', warn: 'var(--c-warn)', good: 'var(--c-good)' };
  /* درجة الخطر تختار لونها من عتبات الإعدادات نفسها لا من رقمٍ مثبَّت */
  function chartRiskColor(r) {
    var t = (S.cfg || NC.DEFAULTS).scoring.thresholds;
    return r >= t.critical ? CH.crit : r >= t.medium ? CH.warn : CH.good;
  }
  /* نقف عند الدرجة الثانية: الأظلم تكاد تختفي على سطحٍ بهذا القتام،
     والأشرطة الصغيرة أولى الناس بأن تُرى. */
  var SEQ = ['var(--seq-6)', 'var(--seq-5)', 'var(--seq-4)',
             'var(--seq-3)', 'var(--seq-2)'];
  /* المقدار الأكبر يأخذ أفتح درجة: على سطحٍ داكن يكون الأفتح أبرز */
  function seqStep(rank, total) {
    if (total <= 1) return SEQ[0];
    var i = Math.round(rank / (total - 1) * (SEQ.length - 1));
    return SEQ[Math.min(SEQ.length - 1, Math.max(0, i))];
  }

  /* ── المؤشر القوسي: نسبةٌ واحدة مقابل حدّ ──
     يمضي من اليمين إلى اليسار كاتجاه القراءة، كما يمضي منحنى الخطر. */
  function gauge(pct, opts) {
    var o = opts || {}, R = 76, CX = 96, CY = 88, SW = 14;
    var p = Math.max(0, Math.min(100, pct));
    // زاوية صفرٍ عن اليمين، وتزيد باتجاه اليسار مرورًا بالأعلى
    var at = function (frac) {
      var a = Math.PI * frac;
      return (CX + R * Math.cos(a)).toFixed(2) + ' ' + (CY - R * Math.sin(a)).toFixed(2);
    };
    var full = 'M ' + at(0) + ' A ' + R + ' ' + R + ' 0 0 0 ' + at(1);
    var len = Math.PI * R;
    var col = chartRiskColor(p);
    var ticks = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
      var a = Math.PI * f, r1 = R - SW / 2 - 3, r2 = R - SW / 2 - 8;
      return '<line class="tick" x1="' + (CX + r1 * Math.cos(a)).toFixed(1) +
             '" y1="' + (CY - r1 * Math.sin(a)).toFixed(1) +
             '" x2="' + (CX + r2 * Math.cos(a)).toFixed(1) +
             '" y2="' + (CY - r2 * Math.sin(a)).toFixed(1) + '"/>';
    }).join('');
    return '<div class="gauge"><svg width="192" height="100" viewBox="0 0 192 100" ' +
      'role="img" aria-label="درجة الخطر ' + Math.round(p) + ' من 100 — ' + esc(riskWord(p)) + '">' +
      '<path d="' + full + '" fill="none" stroke="rgba(255,255,255,.07)" ' +
        'stroke-width="' + SW + '" stroke-linecap="round"/>' +
      ticks +
      '<path class="arcv" d="' + full + '" fill="none" stroke="' + col + '" ' +
        'stroke-width="' + SW + '" style="--len:' + len.toFixed(1) +
        ';--off:' + (len * (1 - p / 100)).toFixed(1) + '"/>' +
      '</svg>' +
      '<div class="gauge-mid"><div class="gauge-num" style="color:' + col + '">' + Math.round(p) + '</div>' +
      '<div class="gauge-word" style="color:' + col + '">' + esc(o.word || riskWord(p)) + '</div></div>' +
      '</div><div class="gauge-scale"><span>0</span><span>50</span><span>100</span></div>';
  }

  /* ── منحنى الخطر عبر الزمن، بتقاطعٍ وتلميحٍ عند التمرير ── */
  function trend(series, id) {
    if (!series || series.length < 2) return '';
    var W = 320, H = 108, PL = 6, PR = 6, PT = 10, PB = 16;
    var lo = 100, hi = 0;
    series.forEach(function (p) { lo = Math.min(lo, p.r); hi = Math.max(hi, p.r); });
    if (hi - lo < 8) { hi = Math.min(100, hi + 4); lo = Math.max(0, lo - 4); }
    var n = series.length;
    // المحور الزمني يمضي من اليمين لليسار كاتجاه القراءة
    var X = function (i) { return W - PR - (i / (n - 1)) * (W - PL - PR); };
    var Y = function (v) { return PT + (1 - (v - lo) / (hi - lo || 1)) * (H - PT - PB); };
    var d = series.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.r).toFixed(1); }).join(' ');
    var area = d + ' L ' + X(n - 1).toFixed(1) + ' ' + (H - PB) + ' L ' + X(0).toFixed(1) + ' ' + (H - PB) + ' Z';
    var pts = series.map(function (p, i) {
      return '{"x":' + X(i).toFixed(1) + ',"y":' + Y(p.r).toFixed(1) +
             ',"r":' + p.r.toFixed(1) + ',"d":"' + p.d + '"}';
    }).join(',');
    var gid = 'tgrad' + id;
    return '<div class="trend" id="' + id + '" data-pts=\'[' + pts + ']\'>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'role="img" aria-label="منحنى درجة الخطر عبر الزمن">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="var(--gold)" stop-opacity=".22"/>' +
      '<stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>' +
      '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) +
        '" stroke="var(--chart-grid)" stroke-width="1"/>' +
      '<path class="tarea" d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path class="tline" d="' + d + '" style="--len:' + (W * 2) + '"/>' +
      '<circle class="tdot" cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(series[n - 1].r).toFixed(1) + '" r="3.4"/>' +
      '<line class="cross" x1="0" y1="' + PT + '" x2="0" y2="' + (H - PB) + '"/>' +
      '<circle class="cdot" cx="0" cy="0" r="4"/>' +
      '<rect class="hit" x="0" y="0" width="' + W + '" height="' + H + '"/></svg>' +
      '<div class="tip"></div></div>';
  }

  /* يربط التتبّع على منحنًى مرسوم. النقاط في السمة لا في المتغيّرات
     حتى يبقى الرسم صحيحًا بعد أي إعادة رسم للصفحة. */
  function wireTrend(root) {
    on(root, '.trend', 'mousemove', function (box, e) {
      var pts; try { pts = JSON.parse(box.dataset.pts); } catch (err) { return; }
      var svg = box.querySelector('svg'), rc = svg.getBoundingClientRect();
      var vb = svg.viewBox.baseVal, ux = (e.clientX - rc.left) / rc.width * vb.width;
      var best = pts[0], bd = 1e9;
      pts.forEach(function (p) { var dd = Math.abs(p.x - ux); if (dd < bd) { bd = dd; best = p; } });
      box.classList.add('on');
      var cl = box.querySelector('.cross'), cd = box.querySelector('.cdot');
      cl.setAttribute('x1', best.x); cl.setAttribute('x2', best.x);
      cd.setAttribute('cx', best.x); cd.setAttribute('cy', best.y);
      var tip = box.querySelector('.tip');
      tip.innerHTML = '<b>' + Math.round(best.r) + '</b> درجة خطر<i>' + esc(best.d) + '</i>';
      tip.classList.add('on');
      var px = best.x / vb.width * rc.width;
      tip.style.left = Math.max(4, Math.min(rc.width - 120, px - 56)) + 'px';
      var ty = best.y / vb.height * rc.height - 54;
      tip.style.top = (ty < 2 ? best.y / vb.height * rc.height + 16 : ty) + 'px';
    });
    on(root, '.trend', 'mouseleave', function (box) {
      box.classList.remove('on');
      box.querySelector('.tip').classList.remove('on');
    });
  }

  /* ── أشرطة أفقية: مقارنة مقادير ── */
  function hbars(rows, opts) {
    var o = opts || {};
    if (!rows.length) return '';
    var max = rows.reduce(function (a, r) { return Math.max(a, r.v); }, 0) || 1;
    var sorted = rows.slice().sort(function (a, b) { return b.v - a.v; });
    return '<div class="hbars">' + sorted.map(function (r, i) {
      var w = Math.max(2, r.v / max * 100);
      return '<button type="button" class="hbar"' +
        (r.nav ? ' data-r="' + r.nav + '"' : '') + (r.id ? ' data-id="' + r.id + '"' : '') +
        ' title="' + esc(r.label + ': ' + r.v + (o.unit || '')) + '">' +
        '<span class="hl">' + esc(r.label) + '</span>' +
        '<span class="ht"><span class="hf" style="width:' + w.toFixed(1) + '%;background:' +
          seqStep(i, sorted.length) + ';animation-delay:' + (i * 55) + 'ms"></span></span>' +
        '<span class="hv">' + r.v + '</span></button>';
    }).join('') + '</div>' + chartTable(sorted, o.head || ['البند', 'العدد']);
  }

  /* الجدول البديل يرافق كل رسم: من لا يميّز الألوان يقرأ الأرقام */
  function chartTable(rows, head) {
    return '<details class="tabletoggle"><summary>عرض الأرقام جدولًا</summary>' +
      '<table class="charttable"><thead><tr><th>' + esc(head[0]) + '</th><th>' + esc(head[1]) +
      '</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td>' + r.v + '</td></tr>';
      }).join('') + '</tbody></table></details>';
  }

  /* ── شريط الخطورة المجزّأ: ألوان حالة محجوزة، ومعها تسمياتها دائمًا ── */
  function sevBar(st) {
    var tot = st.critical + st.medium + st.low;
    if (!tot) return '<div class="empty">لا فجوات مفتوحة.</div>';
    var segs = [
      { k: 'critical', l: 'حرجة', v: st.critical, c: CH.crit },
      { k: 'medium', l: 'متوسطة', v: st.medium, c: CH.warn },
      { k: 'low', l: 'منخفضة', v: st.low, c: CH.good }
    ].filter(function (s) { return s.v > 0; });
    return '<div class="sevbar">' + segs.map(function (s, i) {
      return '<button type="button" class="sevseg" style="flex:' + s.v + ';background:' + s.c +
        ';animation-delay:' + (i * 90) + 'ms" title="' + esc(s.l + ': ' + s.v) +
        '" aria-label="' + esc(s.l + ' ' + s.v) + '" data-r="plan"></button>';
    }).join('') + '</div>' +
    '<div class="sevkeys">' + segs.map(function (s) {
      return '<span class="sevkey"><i style="background:' + s.c + '"></i>' +
        esc(s.l) + ' <b>' + s.v + '</b></span>';
    }).join('') + '</div>';
  }

  /* منحنى المحفظة: الخطر المجمَّع في كل يومٍ سُجّل فيه شيء.
     نأخذ آخر قراءة لكل مستند حتى ذلك اليوم — لا قراءة اليوم نفسه فقط،
     وإلا هبط المجموع كلما غاب مستندٌ عن التسجيل. */
  function portfolioSeries() {
    var days = {}, i;
    S.docs.forEach(function (d) {
      ((d.history) || []).forEach(function (p) { days[p.d] = 1; });
    });
    var ds = Object.keys(days).sort();
    if (ds.length < 2) return [];
    return ds.slice(-30).map(function (day) {
      var rs = [];
      S.docs.forEach(function (d) {
        var h = d.history || [], last = null;
        for (i = 0; i < h.length; i++) if (h[i].d <= day) last = h[i].r;
        if (last !== null) rs.push(last);
      });
      return { d: day, r: E.aggregateRisk(rs, S.cfg.scoring) };
    });
  }

  /* توزيع التعارضات على القواعد السبع */
  function conflictsByRule() {
    var c = {};
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      (r.conflicts || []).forEach(function (x) { c[x.rule] = (c[x.rule] || 0) + 1; });
    });
    return Object.keys(c).map(function (k) {
      return { label: RULE_LABEL[k] || k, v: c[k] };
    });
  }

  /* خطورة الفجوات المفتوحة عبر المحفظة. نعدّ المفتوحة وحدها لأن
     العنوان يقول «مفتوحة» — و r.stats في المحرك يعدّ الكل بما أُنجز. */
  function allStats() {
    var st = { critical: 0, medium: 0, low: 0 };
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      (r.openGaps || []).forEach(function (g) { if (st[g.severity] !== undefined) st[g.severity]++; });
    });
    return st;
  }

  /* توزيع الفجوات المفتوحة على أنواعها */
  function gapsByType() {
    var c = {};
    S.docs.forEach(function (d) {
      var r = S.analyses[d.id]; if (!r) return;
      (r.openGaps || []).forEach(function (g) { c[g.type] = (c[g.type] || 0) + 1; });
    });
    return Object.keys(c).map(function (k) { return { label: k, v: c[k] }; });
  }

  /* ═══════════ ٢. المستندات ═══════════ */
  function spark(hist, w, h) {
    if (!hist || hist.length < 2) return '';
    var pts = hist.slice(-40), max = 0, min = 100;
    pts.forEach(function (p) { max = Math.max(max, p.r); min = Math.min(min, p.r); });
    if (max - min < 4) { max = Math.min(100, max + 2); min = Math.max(0, min - 2); }
    var d = pts.map(function (p, i) {
      var x = w - (i / (pts.length - 1)) * w;               // من اليمين لليسار
      var y = h - ((p.r - min) / (max - min || 1)) * (h - 3) - 1.5;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join('');
    var last = pts[pts.length - 1].r, first = pts[0].r;
    var c = last > first ? 'var(--danger)' : last < first ? 'var(--success)' : 'var(--text3)';
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none">' +
      '<path d="' + d + '" stroke="' + c + '" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function renderDocs() {
    backdrop(false);
    var el = $('pageContent'), u = ST.usage();
    var html = banner() + '<div class="eyebrow">المحفظة</div><h2 class="pagetitle">المستندات</h2>' +
      '<p class="pagesub">محفوظة في هذا الجهاز، ويُعاد حساب خطر كل واحد بتاريخ اليوم عند كل فتح.</p>' +
      '<div style="margin-bottom:18px"><button class="btn" data-r="upload">' + ico('plus', 15) + ' &nbsp;تحليل مستند جديد</button></div>';

    html += S.docs.length ? S.docs.map(function (d) {
      var r = S.analyses[d.id] || {}, dd = ST.delta(d);
      var open = (r.openGaps || []).length, done = r.doneCount || 0;
      var next = (r.preds || [])[0];
      return '<div class="doc-card">' +
        '<button class="doc-main" type="button" data-r="doc" data-id="' + d.id + '">' +
        '<div class="doc-head"><div class="doc-name">' + esc(d.name) +
        (d.isDraft ? ' <span class="vtag">مسودة معدّلة</span>' : '') + '</div>' +
        '<div class="doc-risk num" style="color:' + riskColor(r.effRisk || 0) + '">' + (r.effRisk || 0) + '</div></div>' +
        '<div class="doc-meta">' + open + ' فجوة مفتوحة' + (done ? ' · ' + done + ' مكتملة' : '') +
        (next ? ' · أقرب استحقاق خلال ' + next.daysRemaining + ' يومًا' : '') + '</div>' +
        '<div class="doc-foot"><span class="code">' + esc(d.caseCode) + '</span>' +
        (dd && Math.abs(dd.diff) >= 0.05
          ? '<span style="font-size:10px;color:' + (dd.diff > 0 ? 'var(--danger)' : 'var(--success)') + '">' +
            (dd.diff > 0 ? '▲' : '▼') + ' ' + Math.abs(dd.diff).toFixed(1) + '</span>' : '') +
        '<span class="doc-spark">' + spark(d.history, 74, 22) + '</span></div></button>' +
        '<button class="doc-del" type="button" data-del="' + d.id + '" aria-label="حذف">' + ico('trash', 15) + '</button>' +
        '</div>';
    }).join('') : '<div class="card"><div class="empty">لا توجد مستندات محفوظة بعد.</div></div>';

    if (u.docs) html += '<div style="font-size:10px;color:var(--text3);text-align:center;margin-top:14px;line-height:1.9">' +
      u.docs + ' مستند · ' + u.mb.toFixed(2) + ' ميجابايت من مساحة المتصفح</div>';
    el.innerHTML = html; wire(el);
    on(el, '[data-del]', 'click', function (b) {
      var d = ST.get(b.dataset.del);
      if (!window.confirm('حذف «' + (d ? d.name : '') + '» ومهامه وتاريخ خطره؟')) return;
      ST.remove(b.dataset.del);
      AU.log({ kind: 'data', actor: S.session.name, title: 'حذف مستند', detail: d ? d.name : '' });
      refreshAll(); S.banner = { msg: 'حُذف المستند.' }; renderDocs();
    });
  }

  /* ═══════════ ٣. صفحة المستند ═══════════ */
  var TABS = [['sum', 'نظرة عامة'], ['gaps', 'الفجوات'], ['dl', 'المواعيد'],
              ['fix', 'التعديلات'], ['rep', 'التقرير']];
  function renderDoc() {
    backdrop(false);
    var el = $('pageContent'), doc = ST.get(S.openDoc);
    if (!doc) { go('docs'); return; }
    var r = S.analyses[doc.id] || analyzeDoc(doc);
    S.sourceText = doc.text; S.refText = doc.refText || '';

    var html = banner() +
      '<button class="backlink" type="button" data-r="docs">' + ico('back', 13) + ' كل المستندات</button>' +
      '<h2 class="pagetitle">' + esc(doc.name) + '</h2>' +
      '<p class="pagesub"><span class="code">' + esc(doc.caseCode) + '</span> &nbsp; ' +
      (doc.truncated ? 'اقتُطع النص عند ' + ST.MAX_TEXT.toLocaleString('en-US') + ' حرف · ' : '') +
      'حُدِّث اليوم ' + ST.today() + '</p>' +
      '<div class="filters">' + TABS.map(function (t) {
        var n = t[0] === 'fix' ? (r.conflicts || []).length : 0;
        return '<button class="filter-btn' + (S.docTab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' +
          t[1] + (n ? ' <b style="color:var(--danger);font-weight:600">' + n + '</b>' : '') + '</button>';
      }).join('') + '</div><div id="tabBody"></div>';
    el.innerHTML = html; wire(el);
    on(el, '[data-tab]', 'click', function (b) { S.docTab = b.dataset.tab; renderDoc(); });
    ({ sum: tabSum, gaps: tabGaps, dl: tabDeadlines, fix: tabFix, rep: tabReport })[S.docTab](doc, r);
  }

  function tabSum(doc, r) {
    var present = r.clauseReport.filter(function (c) { return c.present; }).length;
    var over = r.openGaps.filter(function (g) { return g.type === 'موعد متجاوز'; }).length;
    var html = '<div class="card" style="text-align:center;padding:28px 20px">' +
      '<div class="num" style="font-size:64px;color:' + riskColor(r.effRisk) + '">' + r.effRisk + '</div>' +
      '<div style="font-size:10px;color:var(--text3);letter-spacing:.14em;margin:10px 0 16px">خطر ' + riskWord(r.effRisk) + '</div>' +
      (doc.history && doc.history.length > 1
        ? '<div style="display:flex;justify-content:center;margin-bottom:6px">' + spark(doc.history, 220, 40) + '</div>' +
          '<div style="font-size:9.5px;color:var(--text3);letter-spacing:.08em">منحنى الخطر · ' + doc.history.length + ' يوم</div>'
        : '<div style="font-size:10px;color:var(--text3);line-height:1.8">افتح المستند غدًا ليبدأ منحنى الخطر بالظهور.</div>') +
      '</div>';

    html += '<div class="kpi-grid">' +
      '<div class="kpi" style="cursor:default"><div class="v" style="color:var(--warning)">' + r.openGaps.length + '</div>' +
        '<div class="l">فجوة مفتوحة</div><div class="s">' + r.stats.critical + ' حرجة · ' + r.stats.medium + ' متوسطة</div></div>' +
      '<div class="kpi" style="cursor:default"><div class="v" style="color:' + (over ? 'var(--danger)' : 'var(--success)') + '">' + over + '</div>' +
        '<div class="l">موعد متجاوز</div><div class="s">' + r.preds.length + ' موعد قادم</div></div>' +
      '</div>';

    if (doc.origin) {
      var parent = ST.get(doc.parentId);
      html += '<div class="card"><div class="sectitle">أصل هذه النسخة</div>' +
        '<div style="font-size:12px;line-height:2;color:var(--text2);font-weight:300">' +
        'نسخة ' + (doc.version || 2) + '، أُنشئت من ' +
        (parent ? '«' + esc(parent.name) + '» (' + esc(doc.origin.from) + ')' : esc(doc.origin.from)) +
        ' بتعديل ' + doc.origin.applied + ' بندًا متعارضًا.<br>' +
        'التعارضات المتبقية: <b style="color:' + (r.conflicts.length ? 'var(--danger)' : 'var(--success)') +
        '">' + r.conflicts.length + '</b>' +
        (parent ? ' · خطر الأصل ' + (parent.lastRisk || '—') + ' · خطر هذه النسخة ' + r.effRisk : '') +
        '</div>' +
        (parent ? '<div style="margin-top:12px"><button class="btn ghost sm" data-r="doc" data-id="' +
                  parent.id + '">افتح النسخة الأصلية</button></div>' : '') +
        '<div class="note">مسودة معدَّلة آليًا — تُراجَع قانونيًا قبل اعتمادها رسميًا.</div></div>';
    }

    html += '<div class="card"><div class="sectitle">الخلاصة</div>' +
      '<div style="font-size:13px;line-height:2.15;color:var(--text2);font-weight:300">' + esc(summary(r)) + '</div></div>';

    html += '<div class="card"><div class="sectitle">البنود المعيارية — ' + present + '/' + r.clauseReport.length + '</div>' +
      '<label class="field-label" for="dType" style="margin-top:0">نوع المستند</label>' +
      '<select id="dType">' + Object.keys(S.cfg.docTypes).map(function (t) {
        return '<option' + (t === (doc.docType || 'فحص كل البنود') ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>' +
      '<div class="clause-grid" style="margin-top:14px">' + r.clauseReport.map(function (c) {
        return '<div class="clause ' + (c.present ? 'ok' : 'miss') + '"><span class="mk">' + (c.present ? '✓' : '✕') + '</span>' + esc(c.title) + '</div>';
      }).join('') + '</div>' +
      (isAdmin() ? '<div style="margin-top:14px"><button class="btn ghost sm" data-r="admin">تعديل القائمة</button></div>' : '') +
      '</div>';

    if (r.coverage) {
      html += '<div class="card"><div class="sectitle">التغطية مقابل المرجع — ' + r.coverage.score + '٪</div>' +
        '<p style="font-size:10.5px;color:var(--text3);line-height:1.9;margin:0 0 14px;font-weight:300">' +
        'تطابق لفظي بين متطلبات المرجع وبنود مستندك، لا رأيًا قانونيًا.</p>' +
        r.coverage.requirements.map(function (q) {
          return '<div style="padding:11px 0;border-bottom:1px solid var(--line)">' +
            '<div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start">' +
            '<div style="font-size:12px;line-height:1.8;flex:1;font-weight:300">' + esc(q.requirement.slice(0, 180)) + '</div>' +
            '<span class="badge ' + (q.met ? 'low' : 'med') + '">' + q.score + '٪</span></div></div>';
        }).join('') + '</div>';
    }
    $('tabBody').innerHTML = html; wire($('tabBody'));
    $('dType').addEventListener('change', function () {
      ST.update(doc.id, { docType: this.value });
      AU.log({ kind: 'data', actor: S.session.name, code: doc.caseCode,
               title: 'تغيير نوع المستند', detail: doc.name + ' ← ' + this.value });
      refreshAll(); renderDoc();
    });
  }

  var gapTypeInfo = {
    'بند مفقود': { icon: 'shield', label: 'بند مفقود', desc: 'بند معياري لم يُعالج في المستند' },
    'موعد متجاوز': { icon: 'doc', label: 'موعد متجاوز', desc: 'التزام مضى موعده' },
    'التزام بلا موعد': { icon: 'doc', label: 'التزام بلا موعد', desc: 'التزام بلا تاريخ أو مدة محددة' },
    'صياغة فضفاضة': { icon: 'doc', label: 'صياغة فضفاضة', desc: 'عبارة غير قابلة للقياس أو التحقق' },
    'متطلب غير مغطى': { icon: 'doc', label: 'متطلب غير مغطى', desc: 'متطلب من المرجع لم يُعالج كفاية' }
  };
  /* ═══ وصف التعارض بحسب قاعدته ═══ */
  var RULE_LABEL = {
    'حدّي':   'قيمة تخالف حدًّا',
    'فعل':    'منع مقابل فرض',
    'نطاق':   'نطاق أضيق',
    'تعريف':  'تعريف أضيق',
    'تسلسل':  'ترتيب مقلوب',
    'إفراغ':  'إفراغ بالغموض'
  };
  function ruleLabel(c) { return RULE_LABEL[c.rule] || c.rule; }

  var REF_SIDE = {
    'حدّي': 'المرجع يشترط', 'فعل': 'المرجع يمنع', 'نطاق': 'المرجع يشمل',
    'تعريف': 'المرجع يعرّفه', 'تسلسل': 'المرجع يوجبه قبل', 'إفراغ': 'المرجع يوجبه شمولًا'
  };
  var DOC_SIDE = {
    'حدّي': 'سياستك تنص على', 'فعل': 'سياستك تفرض', 'نطاق': 'سياستك تستثنيه',
    'تعريف': 'سياستك تعرّفه', 'تسلسل': 'سياستك تجعله بعد', 'إفراغ': 'سياستك تعلّقه على التقدير'
  };
  function refSideLabel(c) { return REF_SIDE[c.rule] || 'المرجع'; }
  function docSideLabel(c) { return DOC_SIDE[c.rule] || 'سياستك'; }

  function conflictTitle(c) {
    if (c.rule === 'حدّي')  return 'قيمة تخالف المرجع: ' + c.quantity.docOrig + ' مقابل ' + c.quantity.refOrig;
    if (c.rule === 'نطاق')  return 'نطاق أضيق من المرجع: ' + c.core;
    if (c.rule === 'تعريف') return 'تعريف أضيق من المرجع: ' + c.core;
    if (c.rule === 'تسلسل') return 'ترتيب مقلوب حول «' + c.core + '»';
    if (c.rule === 'إفراغ') return 'التزام شامل صار تقديريًا: «' + c.core + '»';
    return 'بند يخالف المرجع: ' + c.core;
  }
  function conflictDesc(c) {
    if (c.rule === 'حدّي')
      return c.why + ' — المرجع يشترط «' + c.quantity.refOrig +
             '» وسياستك تنص على «' + c.quantity.docOrig + '».';
    if (c.rule === 'نطاق')
      return 'المرجع يُدخل «' + c.scope.refEntity + '» في النطاق، وسياستك تستثنيه — ' +
             'فيسقط الالتزام عن هذه الطائفة كاملةً.';
    if (c.rule === 'تعريف')
      return 'المرجع يعمّم التعريف، وسياستك تقيّده بعتبة «' + c.definition.threshold +
             '» — فكل بندٍ يستعمل المصطلح يضيق نطاقه تبعًا له.';
    if (c.rule === 'تسلسل')
      return 'المرجع يشترط الإجراء قبل «' + c.sequence.anchor + '»، وسياستك تجعله بعده — ' +
             'فتتحول الرقابة السابقة إلى إخطارٍ لاحق.';
    if (c.rule === 'إفراغ')
      return 'المرجع يوجب الالتزام شمولًا، وسياستك تعلّقه على «' + c.hollowing.vagueTerm +
             '» — فالبند حاضرٌ لفظًا غائبٌ حكمًا.';
    return 'المرجع يمنع ما ينص عليه هذا البند' + (c.amount ? ' (' + c.amount + ')' : '') + '.';
  }

  function gapCard(doc, g) {
    var t = ST.taskOf(doc, g.code);
    var info = gapTypeInfo[g.type] || { icon: 'doc', label: g.type, desc: '' };
    var ev = g.evidenceType === 'absence'
      ? '<div class="absence"><span class="lb">غياب موثّق</span>لم يرد في المستند أيٌّ من الصيغ الشائعة لهذا البند.</div>'
      : '<button type="button" class="evidence" data-q="' + esc(g.evidence) + '"' +
        (g.evidenceType === 'reference' ? ' data-src="ref"' : '') + '><span class="lb">' +
        (g.evidenceType === 'reference' ? 'من المستند المرجعي — اضغط لعرض الموضع' : 'من نص مستندك — اضغط لعرض الموضع') +
        '</span>«' + esc(g.evidence) + '»</button>';
    var typeTag = '<span class="gap-type-tag" title="' + esc(info.desc) + '">' +
      ico(info.icon, 13) + '<span>' + esc(info.label) + '</span></span>';
    return '<div class="gap-card ' + (t.status === 'done' ? 'done' : g.severity) + '">' +
      '<div class="gap-head"><div><div class="gap-title">' + esc(g.title) + '</div>' +
      '<div class="gap-meta"><span class="code">' + g.code + '</span>' + typeTag + '</div></div>' +
      '<span class="badge ' + (t.status === 'done' ? 'mute' : sevBadge(g.severity)) + '">' +
      (t.status === 'done' ? 'مكتمل' : g.risk) + '</span></div>' +
      '<div class="gap-desc">' + esc(g.description) + '</div>' + ev +
      '<div class="gap-rec">' + ico('doc', 14) + '<div><div class="rec-label">الإجراء المطلوب:</div><div>' + esc(g.recommendation) + '</div></div></div>' +
      '<details class="why"><summary>كيف حُسبت الدرجة؟</summary>' +
      '<div class="mathbox">احتمالية <b>' + g.probability.toFixed(2) + '</b><span class="op">×</span>' +
      'أثر <b>' + g.impact.toFixed(2) + '</b><span class="op">×</span>زمن <b>' + g.decay.toFixed(2) + '</b>' +
      '<span class="out num" style="color:' + sevColor(g.severity) + '">' + g.risk + '</span></div></details>' +
      statusBar(doc.id, g.code, t) + '</div>';
  }
  function statusBar(docId, code, t) {
    return '<div class="statusbar">' + Object.keys(STATUS).map(function (k) {
      return '<button type="button" class="st' + (t.status === k ? ' on ' + k : '') + '" ' +
        'data-doc="' + docId + '" data-code="' + code + '" data-status="' + k + '">' + STATUS[k] + '</button>';
    }).join('') + '</div>';
  }
  function tabGaps(doc, r) {
    var st = r.stats;
    var legend = '<div class="gap-legend">' +
      '<div class="legend-title">أنواع الفجوات:</div>' +
      '<div class="legend-items">' +
      '<div class="legend-item"><span class="legend-tag">' + ico('shield', 11) + 'بند مفقود</span><span class="legend-desc">بند معياري لم يُعالج</span></div>' +
      '<div class="legend-item"><span class="legend-tag">' + ico('doc', 11) + 'موعد متجاوز</span><span class="legend-desc">التزام مضى موعده</span></div>' +
      '<div class="legend-item"><span class="legend-tag">' + ico('doc', 11) + 'صياغة فضفاضة</span><span class="legend-desc">عبارة غير قابلة للقياس</span></div>' +
      '<div class="legend-item"><span class="legend-tag">' + ico('doc', 11) + 'التزام بلا موعد</span><span class="legend-desc">بلا تاريخ أو مدة محددة</span></div>' +
      '<div class="legend-item"><span class="legend-tag">' + ico('doc', 11) + 'متطلب غير مغطى</span><span class="legend-desc">متطلب من المرجع بلا معادل</span></div>' +
      '</div></div>';
    var html = legend + '<div class="filters" id="gf">' +
      fbtn('all', 'الكل', r.openGaps.length) + fbtn('critical', 'حرجة', st.critical) +
      fbtn('medium', 'متوسطة', st.medium) + fbtn('low', 'منخفضة', st.low) +
      (r.doneCount ? fbtn('done', 'مكتملة', r.doneCount) : '') + '</div><div id="gl"></div>';
    $('tabBody').innerHTML = html;
    var draw = function () {
      var list = S.gapFilter === 'all' ? r.openGaps
        : S.gapFilter === 'done' ? r.gaps.filter(function (g) { return ST.taskOf(doc, g.code).status === 'done'; })
        : r.openGaps.filter(function (g) { return g.severity === S.gapFilter; });
      var box = $('gl');
      box.innerHTML = list.length ? list.map(function (g) { return gapCard(doc, g); }).join('')
                                  : '<div class="empty">لا شيء في هذا التصنيف.</div>';
      wire(box);
    };
    on($('gf'), '.filter-btn', 'click', function (b) {
      Array.prototype.forEach.call($('gf').querySelectorAll('.filter-btn'),
        function (o) { o.classList.remove('active'); });
      b.classList.add('active'); S.gapFilter = b.dataset.f; draw();
    });
    S.gapFilter = 'all'; draw();
  }
  function fbtn(f, label, n) {
    return '<button class="filter-btn' + (f === 'all' ? ' active' : '') + '" data-f="' + f + '">' + label + ' (' + n + ')</button>';
  }

  function tabDeadlines(doc, r) {
    if (!r.preds.length) { $('tabBody').innerHTML = '<div class="card"><div class="empty">لم يرد في المستند موعد قادم محدد التاريخ.</div></div>'; return; }
    var maxD = Math.max(90, r.preds[r.preds.length - 1].daysRemaining);
    var html = '<div class="timeline">';
    [7, 14, 30, 60, 90, 180, 365].filter(function (m) { return m <= maxD; }).forEach(function (m) {
      html += '<div class="tl-mark" style="right:' + (m / maxD * 100) + '%"><span>' + m + ' يوم</span></div>';
    });
    r.preds.forEach(function (p) {
      html += '<div class="tl-dot" style="right:' + Math.max(0, Math.min(99, p.daysRemaining / maxD * 100)) +
        '%;background:' + sevColor(p.severity) + '"></div>';
    });
    html += '</div>' + r.preds.map(function (p) {
      return '<div class="pred-card"><div class="pred-days">' +
        '<div class="n" style="color:' + sevColor(p.severity) + '">' + p.daysRemaining + '</div><div class="u">يومًا</div></div>' +
        '<div class="pred-body"><div class="pred-title2">' + esc(p.trigger) + ' → ' + p.deadlineISO +
        (p.approxDate ? ' (هجري تقريبي)' : '') + '</div>' +
        '<div class="gap-meta"><span class="code">' + p.code + '</span></div>' +
        '<div class="pred-cons"><b>ما يترتب:</b> ' + esc(p.consequence) + '</div>' +
        '<button type="button" class="evidence" data-q="' + esc(p.evidence) + '">' +
        '<span class="lb">من نص مستندك</span>«' + esc(p.evidence.slice(0, 190)) + '»</button>' +
        '<div class="pred-rec">' + esc(p.recommendation) + '</div></div></div>';
    }).join('');
    $('tabBody').innerHTML = html; wire($('tabBody'));
  }

  /* ═══ تبويب التعديلات: إصدار بند معدَّل وتعميم ═══ */
  function tabFix(doc, r) {
    var body = $('tabBody');
    if (!doc.refText) {
      body.innerHTML = '<div class="card"><div class="empty">' +
        'كشف التعارض يحتاج مرجعًا تنظيميًا لمقارنة سياستك به.<br>الصق نص المرجع هنا ليُفحص المستند فورًا.</div>' +
        '<textarea id="addRef" placeholder="الصق نص المرجع التنظيمي..." style="min-height:120px"></textarea>' +
        '<button class="btn" id="saveRef" style="margin-top:12px">افحص التعارض</button></div>';
      $('saveRef').addEventListener('click', function () {
        var t = ($('addRef').value || '').trim();
        if (!t) return;
        ST.update(doc.id, { refText: t.slice(0, ST.MAX_TEXT) });
        AU.log({ kind: 'data', actor: S.session.name, code: doc.caseCode,
                 title: 'إضافة مرجع تنظيمي', detail: doc.name });
        refreshAll(); renderDoc();
      });
      return;
    }
    if (!r.conflicts.length) {
      body.innerHTML = '<div class="card"><div class="empty">' +
        'لم نجد في هذا المستند ما يخالف المرجع.<br><br>' +
        'يُرصد التعارض في ثلاث حالات: أن يمنع المرجعُ شيئًا وتفعله سياستك، ' +
        'أو يوجبه ويمنعه سياستك، أو أن تخالف قيمةٌ في سياستك حدًّا في المرجع ' +
        '(مدةً أو مبلغًا أو نسبة).</div></div>';
      return;
    }

    var v = doc.fixVars || {};
    var f = function (id, label, val, ph) {
      return '<div><label class="field-label" for="' + id + '">' + label + '</label>' +
        '<input type="text" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + ph + '"></div>';
    };
    var html = '<div class="warnbox">هذه مسودات قالبية تُولَّد من نصّي سياستك والمرجع. ' +
      'راجعها قانونيًا وعدّلها قبل الاعتماد — نذير لا يصدر تعاميم، بل يجهّز مسودتها.</div>';

    html += '<div class="card"><div class="sectitle">بيانات الإصدار</div><div class="fixgrid">' +
      f('fxOrg', 'اسم الجهة', v.org, 'مثال: بنك الواحة') +
      f('fxNum', 'رقم التعميم', v.number, '2026/14') +
      f('fxEff', 'تاريخ النفاذ', v.effectiveDate, 'YYYY-MM-DD') +
      f('fxOwner', 'الإدارة المختصة', v.owner, 'قطاع الخدمات المصرفية') +
      f('fxRef', 'اسم المرجع', v.refName, 'تعليمات الرسوم') +
      f('fxDays', 'مهلة التحديث (أيام)', v.days, '30') +
      '</div></div>';

    html += r.conflicts.map(function (c, i) {
      var skipped = (v.skip || {})[c.code];
      return '<div class="fixcard' + (skipped ? ' off' : '') + '">' +
        '<div class="gap-head"><div><div class="gap-title">' + esc(c.core) + '</div>' +
        '<div class="gap-meta"><span class="code">' + c.code + '</span>' +
        '<span class="gap-type">' + esc(ruleLabel(c)) + (c.why ? ' — ' + esc(c.why) : '') +
        ' · تطابق ' + c.score + '٪' + (c.amount ? ' · ' + esc(c.amount) : '') +
        (c.tentative ? ' · محتمل — يحتاج مراجعة' : '') + '</span></div></div>' +
        '<label class="tick"><input type="checkbox" data-skip="' + c.code + '"' + (skipped ? '' : ' checked') + '> تضمين</label></div>' +
        (c.rule === 'حدّي'
          ? '<div class="qcmp"><span class="q bad">' + esc(c.quantity.docOrig) + '</span>' +
            '<span class="qar">←</span><span class="q good">' + esc(c.quantity.refOrig) + '</span></div>'
          : '') +
        '<div class="fixside"><div class="fs-lbl">' + esc(refSideLabel(c)) + '</div>' +
        '<button type="button" class="evidence" data-q="' + esc(c.refQuote) + '" data-src="ref">' +
        '<span class="lb">' + esc(c.refArticle || 'من المرجع') + '</span>«' + esc(c.refQuote) + '»</button></div>' +
        '<div class="fixside"><div class="fs-lbl bad">' + esc(docSideLabel(c)) + '</div>' +
        '<button type="button" class="evidence" data-q="' + esc(c.docQuote) + '">' +
        '<span class="lb">' + esc(c.docArticle || 'من سياستك') + '</span>«' + esc(c.docQuote) + '»</button></div>' +
        '<div class="fixside"><div class="fs-lbl good">البند بعد التعديل — حرّره كما تشاء</div>' +
        '<textarea class="fixprop" data-prop="' + c.code + '"' +
        ((v.edits || {})[c.code] ? ' data-touched="1"' : '') + ' style="min-height:104px">' +
        esc((v.edits || {})[c.code] || CF.proposeClause(c, v)) + '</textarea></div></div>';
    }).join('');

    html += '<div class="row-btns"><button class="btn" id="fxApply">اعتمد النسخة المعدّلة وأعد تحليلها</button></div>' +
      '<div class="row-btns"><button class="btn ghost" id="fxCirc">تنزيل التعميم</button>' +
      '<button class="btn ghost" id="fxPol">تنزيل السياسة المعدّلة</button></div><div id="fxMsg"></div>';
    body.innerHTML = html; wire(body);

    /* لا نُعيد رسم الصفحة عند تغيير أي حقل: إعادة الرسم تُتلف الحقل الذي
       انتقل إليه المستخدم للتو فيضيع ما كتبه. نحفظ بصمت فقط. */
    var persist = function () {
      var nv = fixVars(), edits = {}, skip = {};
      var ta = body.querySelectorAll('[data-prop]');
      for (var i = 0; i < ta.length; i++) {
        if (ta[i].dataset.touched) edits[ta[i].dataset.prop] = ta[i].value;
      }
      var cb = body.querySelectorAll('[data-skip]');
      for (var j = 0; j < cb.length; j++) if (!cb[j].checked) skip[cb[j].dataset.skip] = 1;
      nv.edits = edits; nv.skip = skip;
      ST.update(doc.id, { fixVars: nv });
      return nv;
    };
    ['fxOrg', 'fxNum', 'fxEff', 'fxOwner', 'fxRef', 'fxDays'].forEach(function (id) {
      $(id).addEventListener('change', persist);
    });
    on(body, '[data-skip]', 'change', function (cb) {
      var card = cb.closest ? cb.closest('.fixcard') : null;
      if (card) card.classList.toggle('off', !cb.checked);
      persist();
    });
    on(body, '[data-prop]', 'input', function (ta) { ta.dataset.touched = '1'; });
    on(body, '[data-prop]', 'blur', persist);

    /* المسودة غير المحرَّرة تُعاد توليدها وقت التصدير بأحدث البيانات،
       والمحرَّرة تبقى كما كتبها المستخدم. */
    var chosen = function (nv) {
      return r.conflicts.filter(function (c) { return !(nv.skip || {})[c.code]; })
        .map(function (c) {
          var cc = {}; Object.keys(c).forEach(function (k2) { cc[k2] = c[k2]; });
          cc.editedProposal = (nv.edits || {})[c.code] || null;
          return cc;
        });
    };
    $('fxCirc').addEventListener('click', function () {
      var nv = persist(), list = chosen(nv);
      if (!list.length) { $('fxMsg').innerHTML = '<div class="errbox">لم تُضمّن أي بند.</div>'; return; }
      saveText('nadheer-تعميم-' + doc.caseCode + '.txt', CF.buildCircular(list, nv));
      AU.log({ kind: 'data', actor: S.session.name, code: doc.caseCode,
               title: 'إصدار مسودة تعميم', detail: list.length + ' بندًا · ' + doc.name });
      $('fxMsg').innerHTML = '<div class="okbox">نُزّلت مسودة التعميم — راجعها واعتمدها قبل الإصدار.</div>';
    });
    /* إغلاق الحلقة: يُعاد إدخال النسخة المعدّلة إلى النظام كنسخة جديدة،
       فتُحلَّل بالمعايير نفسها ويُتحقَّق أن التعارض زال فعلًا لا ظنًّا. */
    $('fxApply').addEventListener('click', function () {
      var nv = persist(), list = chosen(nv);
      if (!list.length) { $('fxMsg').innerHTML = '<div class="errbox">لم تُضمّن أي بند.</div>'; return; }
      var built = CF.buildAmendedPolicy(doc.text, list, nv, true);
      if (!built.applied) {
        $('fxMsg').innerHTML = '<div class="errbox">تعذّر تطبيق أي تعديل — تأكد أن نص البند لم يُغيَّر.</div>';
        return;
      }
      var beforeRisk = r.effRisk, beforeConf = r.conflicts.length;
      var code = AU.nextCode('NR');
      var saved = ST.add({
        name: doc.name + ' — نسخة ' + ((doc.version || 1) + 1),
        text: built.text, refText: doc.refText, refName: doc.refName,
        docType: doc.docType, caseCode: code,
        version: (doc.version || 1) + 1, parentId: doc.id, isDraft: true,
        origin: { from: doc.caseCode, applied: built.applied, at: Date.now() }
      });
      refreshAll();
      var after = S.analyses[saved.doc.id] || {};
      var afterConf = (after.conflicts || []).length;
      AU.log({ kind: 'data', actor: S.session.name, code: code,
        title: 'اعتماد نسخة معدّلة', code2: doc.caseCode,
        detail: doc.name + ' · عُدِّل ' + built.applied + ' بندًا · التعارضات ' +
                beforeConf + ' ← ' + afterConf + ' · الخطر ' + beforeRisk + ' ← ' + (after.effRisk || 0) });
      S.banner = afterConf === 0
        ? { msg: 'اعتُمدت النسخة وأُعيد تحليلها: زالت كل التعارضات (' + beforeConf + ' ← 0)، ' +
                 'والخطر ' + beforeRisk + ' ← ' + (after.effRisk || 0) + '.' }
        : { bad: true, msg: 'اعتُمدت النسخة، لكن بقي ' + afterConf + ' تعارضًا من ' + beforeConf +
                 ' — راجع البنود التي لم تُضمَّن.' };
      go('doc', saved.doc.id);
    });

    $('fxPol').addEventListener('click', function () {
      var nv = persist(), list = chosen(nv);
      if (!list.length) { $('fxMsg').innerHTML = '<div class="errbox">لم تُضمّن أي بند.</div>'; return; }
      var out = CF.buildAmendedPolicy(doc.text, list, nv);
      saveText('nadheer-سياسة-معدلة-' + doc.caseCode + '.txt', out.text);
      AU.log({ kind: 'data', actor: S.session.name, code: doc.caseCode,
               title: 'إصدار مسودة سياسة معدّلة', detail: out.applied + ' بندًا عُدّل · ' + doc.name });
      $('fxMsg').innerHTML = '<div class="okbox">نُزّلت السياسة بعد تعديل ' + out.applied + ' بندًا.</div>';
    });

    function fixVars() {
      return { org: val('fxOrg', v.org), number: val('fxNum', v.number),
               effectiveDate: val('fxEff', v.effectiveDate), owner: val('fxOwner', v.owner),
               refName: val('fxRef', v.refName), days: val('fxDays', v.days),
               docName: doc.name, edits: v.edits, skip: v.skip };
    }
    function val(id, dflt) { var e = $(id); return e ? (e.value || '').trim() : (dflt || ''); }
  }

  function tabReport(doc, r) {
    var present = r.clauseReport.filter(function (c) { return c.present; }).length;
    var tot = r.stats.critical + r.stats.medium + r.stats.low;
    var html = '<div class="report-head"><div class="eyebrow">' + esc(doc.caseCode) + ' · ' + ST.today() + '</div>' +
      '<h3>التقرير التنفيذي</h3><p>' + esc(doc.name) + '</p><div class="report-stats">' +
      rstat(r.coverage ? r.coverage.score + '٪' : present + '/' + r.clauseReport.length, r.coverage ? 'التغطية' : 'بنود معيارية') +
      rstat(r.openGaps.length, 'فجوات مفتوحة') + rstat(r.preds.length, 'مواعيد') + rstat(r.effRisk, 'الخطر') + '</div></div>';
    html += '<div class="card"><div class="sectitle">توزيع الخطورة</div>' +
      barrow('حرجة', tot ? r.stats.critical / tot * 100 : 0, r.stats.critical, 'var(--danger)') +
      barrow('متوسطة', tot ? r.stats.medium / tot * 100 : 0, r.stats.medium, 'var(--warning)') +
      barrow('منخفضة', tot ? r.stats.low / tot * 100 : 0, r.stats.low, 'var(--success)') + '</div>';
    html += '<div class="card"><div class="sectitle">الخلاصة</div>' +
      '<div style="font-size:13px;line-height:2.15;color:var(--text2);font-weight:300">' + esc(summary(r)) + '</div></div>';
    html += '<div class="card"><div class="sectitle">حدود هذا التحليل</div>' +
      '<div style="font-size:11px;color:var(--text3);line-height:2;font-weight:300">' +
      'تحليل قائم على قواعد لغوية وتقويمية، مساعد للمراجع البشري لا بديل عنه.<br>' +
      'صيغ الإلزام تُرصد بألفاظها؛ التزام مصاغ بأسلوب غير معتاد قد لا يُرصد.<br>' +
      'التواريخ الهجرية تُحوَّل بالتقويم المدني وقد تفارق أم القرى بيوم.<br>' +
      '«التغطية» تطابق لفظي بين نصّين، لا حكم على كفاية البند.</div></div>';
    html += '<button class="btn" id="dlBtn">تنزيل التقرير</button>';
    $('tabBody').innerHTML = html;
    $('dlBtn').addEventListener('click', function () { downloadReport(doc, r); });
  }
  function rstat(v, l) { return '<div><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  function barrow(label, pct, val, color) {
    return '<div class="barrow"><div class="lbl">' + esc(label) + '</div><div class="track">' +
      '<div class="fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="val" style="color:' + color + '">' + val + '</div></div>';
  }
  function summary(r) {
    var over = r.openGaps.filter(function (g) { return g.type === 'موعد متجاوز'; }).length;
    var miss = r.clauseReport.filter(function (c) { return !c.present; });
    var s = 'فحصنا ' + r.counts.chars.toLocaleString('en-US') + ' حرفًا ورصدنا ' + r.obligations.length +
      ' التزامًا و' + r.counts.dates + ' تاريخًا. ';
    s += over ? 'هناك ' + over + ' موعدًا انقضى دون ما يفيد تنفيذه. ' : 'لا يوجد موعد متجاوز. ';
    s += r.preds.length ? 'وأقرب استحقاق قادم خلال ' + r.preds[0].daysRemaining + ' يومًا. ' : '';
    s += miss.length ? 'ويخلو المستند من ' + miss.length + ' بندًا معياريًا، أبرزها: ' +
      miss.slice(0, 3).map(function (c) { return c.title; }).join('، ') + '. ' : 'وتغطي بنوده كامل القائمة المعيارية. ';
    if (r.doneCount) s += 'أُغلقت ' + r.doneCount + ' فجوة من خطة المعالجة. ';
    s += 'درجة الخطر ' + r.effRisk + ' من 100.';
    return s;
  }

  /* ═══════════ ٤. خطة المعالجة ═══════════ */
  function renderPlan() {
    backdrop(false);
    var el = $('pageContent'), tasks = allTasks();
    var counts = { open: 0, doing: 0, done: 0 };
    tasks.forEach(function (t) {
      if (t.task.status === 'done') counts.done++;
      else { counts.open++; if (t.task.status === 'doing') counts.doing++; }
    });
    var list = S.planFilter === 'all' ? tasks
      : S.planFilter === 'done' ? tasks.filter(function (t) { return t.task.status === 'done'; })
      : tasks.filter(function (t) { return t.task.status !== 'done'; });

    var html = banner() + '<div class="eyebrow">عبر كل المستندات</div><h2 class="pagetitle">خطة المعالجة</h2>' +
      '<p class="pagesub">كل فجوة صارت مهمة لها حالة. إغلاق المهمة يخفض درجة الخطر فعلًا — الحساب يعيد نفسه فورًا.</p>';

    if (!tasks.length) {
      el.innerHTML = html + '<div class="card"><div class="empty">لا توجد مهام بعد. ابدأ بتحليل مستند.</div>' +
        '<button class="btn" data-r="upload">تحليل مستند جديد</button></div>';
      wire(el); return;
    }

    html += '<div class="trace"><div><div class="v">' + counts.open + '</div><div class="l">مفتوحة</div></div>' +
      '<div><div class="v" style="color:var(--warning)">' + counts.doing + '</div><div class="l">قيد التنفيذ</div></div>' +
      '<div><div class="v" style="color:var(--success)">' + counts.done + '</div><div class="l">مكتملة</div></div></div>';

    html += '<div class="filters" id="pf">' +
      ['open', 'all', 'done'].map(function (k) {
        return '<button class="filter-btn' + (S.planFilter === k ? ' active' : '') + '" data-pf="' + k + '">' +
          (k === 'open' ? 'المفتوحة (' + counts.open + ')' : k === 'done' ? 'المكتملة (' + counts.done + ')' : 'الكل (' + tasks.length + ')') + '</button>';
      }).join('') + '</div>';

    html += list.map(function (x) {
      var rem = (S.cfg.remediation || {})[x.gap.type] || { owner: 'الإدارة القانونية', effort: 'متوسط' };
      return '<div class="task' + (x.task.status === 'done' ? ' done' : '') + '">' +
        '<div class="task-head"><div><div class="task-title">' + esc(x.gap.title) + '</div>' +
        '<div class="gap-meta"><span class="code">' + x.gap.code + '</span>' +
        '<button class="task-doc" type="button" data-r="doc" data-id="' + x.doc.id + '">' + esc(x.doc.name) + '</button></div></div>' +
        '<span class="badge ' + (x.task.status === 'done' ? 'mute' : sevBadge(x.gap.severity)) + '">' +
        (x.task.status === 'done' ? '✓' : x.gap.risk) + '</span></div>' +
        '<div class="task-action">' + esc(x.gap.recommendation) + '</div>' +
        '<div class="task-meta"><span>' + esc(rem.owner) + '</span><span>' + esc(rem.effort) + '</span>' +
        (x.task.by && x.task.status !== 'todo' ? '<span>آخر تحديث: ' + esc(x.task.by) + '</span>' : '') + '</div>' +
        statusBar(x.doc.id, x.gap.code, x.task) + '</div>';
    }).join('');

    html += '<div class="row-btns"><button class="btn ghost" id="planExport">تنزيل الخطة</button></div>';
    el.innerHTML = html; wire(el);
    on(el, '[data-pf]', 'click', function (b) { S.planFilter = b.dataset.pf; renderPlan(); });
    $('planExport').addEventListener('click', function () { downloadPlan(tasks); });
  }

  /* ═══════════ الرفع ═══════════ */
  function renderUpload() {
    backdrop(false);
    var el = $('pageContent');
    el.innerHTML = banner() +
      '<button class="backlink" type="button" data-r="docs">' + ico('back', 13) + ' المستندات</button>' +
      '<h2 class="pagetitle">تحليل مستند جديد</h2>' +
      '<p class="pagesub">يُحفظ المستند في هذا الجهاز ليُعاد حسابه كل يوم. لا يغادر المتصفح ولا يوجد أي اتصال بالإنترنت.</p>' +
      '<div class="card">' +
      '<label class="field-label" for="docName">اسم المستند</label>' +
      '<input type="text" id="docName" placeholder="مثال: عقد صيانة ٢٠٢٦">' +
      '<label class="field-label" for="docType">نوع المستند — يحدد قائمة البنود التي تُفحص</label>' +
      '<select id="docType">' + Object.keys(S.cfg.docTypes).map(function (t) {
        return '<option' + (t === S.draft.type ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('') + '</select>' +
      '<div class="doclabel" style="margin-top:18px">المستند — مطلوب</div>' +
      '<button type="button" class="drop" id="drop_doc1"><div class="ic">' + ico('doc', 22) + '</div>' +
      '<div class="mt">اسحب الملف أو اضغط للاختيار</div><div class="ht">PDF · TXT</div></button>' +
      '<input type="file" id="fi_doc1" accept=".pdf,.txt,.md" style="display:none"><div id="info_doc1"></div>' +
      '<textarea id="paste_doc1" placeholder="أو الصق النص مباشرة..."></textarea>' +
      '<hr class="hair">' +
      '<div class="doclabel">المرجع التنظيمي — اختياري</div>' +
      '<button type="button" class="drop" id="drop_doc2"><div class="ic">' + ico('docs', 22) + '</div>' +
      '<div class="mt">اسحب الملف أو اضغط للاختيار</div><div class="ht">PDF · TXT</div></button>' +
      '<input type="file" id="fi_doc2" accept=".pdf,.txt,.md" style="display:none"><div id="info_doc2"></div>' +
      '<textarea id="paste_doc2" placeholder="أو الصق النص مباشرة..."></textarea>' +
      '<div style="margin-top:20px"><button class="btn" id="analyzeBtn">حلّل واحفظ</button></div>' +
      '<div id="errArea"></div></div>';
    wire(el);
    ['doc1', 'doc2'].forEach(function (key) {
      var drop = $('drop_' + key), input = $('fi_' + key), pasteEl = $('paste_' + key);
      drop.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () { if (this.files[0]) handleFile(this.files[0], key); });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('drag');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], key);
      });
      pasteEl.value = S.draft[key] || '';
      pasteEl.addEventListener('input', function () { S.draft[key] = this.value; });
      if (S.files[key]) showFile(key, S.files[key].name, S.files[key].text.length);
    });
    $('docName').value = S.draft.name || '';
    $('docName').addEventListener('input', function () { S.draft.name = this.value; });
    $('docType').addEventListener('change', function () { S.draft.type = this.value; });
    $('analyzeBtn').addEventListener('click', runAnalysis);
  }
  function showFile(key, name, len) {
    var info = $('info_' + key);
    info.innerHTML = '<div class="fileinfo"><span>' + esc(name) + ' — ' + len.toLocaleString('en-US') +
      ' حرف</span><button type="button">إزالة</button></div>';
    info.querySelector('button').addEventListener('click', function () { delete S.files[key]; info.innerHTML = ''; });
    if (key === 'doc1' && !$('docName').value) { $('docName').value = name.replace(/\.[^.]+$/, ''); S.draft.name = $('docName').value; }
  }
  function handleFile(file, key) {
    var info = $('info_' + key);
    info.innerHTML = '<div class="fileinfo"><span>جارٍ قراءة: ' + esc(file.name) + '</span></div>';
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    (isPdf ? extractPdf(file) : file.text()).then(function (text) {
      if (!text || !text.trim()) throw new Error('لا يحتوي هذا الملف نصًا قابلًا للاستخراج — غالبًا صورة ممسوحة ضوئيًا.');
      S.files[key] = { name: file.name, text: text };
      showFile(key, file.name, text.length);
    }).catch(function (err) {
      info.innerHTML = ''; delete S.files[key];
      showError(isPdf ? 'تعذّر قراءة ملف PDF. جرّب حفظه كنص، أو الصق المحتوى مباشرة.' : err.message);
    });
  }
  function extractPdf(file) {
    return file.arrayBuffer()
      .then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
      .then(function (pdf) {
        var jobs = [];
        for (var i = 1; i <= pdf.numPages; i++) {
          jobs.push(pdf.getPage(i).then(function (p) { return p.getTextContent(); })
            .then(function (c) { return c.items.map(function (it) { return it.str; }).join(' '); }));
        }
        return Promise.all(jobs).then(function (pages) { return pages.join('\n\n'); });
      });
  }
  function showError(m) { var el = $('errArea'); if (el) el.innerHTML = '<div class="errbox">' + esc(m) + '</div>'; }

  var STEPS = ['قراءة النص وتطبيعه', 'استخراج التواريخ والمدد', 'رصد الالتزامات والجزاءات',
               'فحص البنود المعيارية', 'حساب الخطر وحفظ المستند'];
  function runAnalysis() {
    var err = $('errArea'); if (err) err.innerHTML = '';
    var t1 = ((S.files.doc1 ? S.files.doc1.text : '') + '\n\n' + (S.draft.doc1 || '')).trim();
    var t2 = ((S.files.doc2 ? S.files.doc2.text : '') + '\n\n' + (S.draft.doc2 || '')).trim();
    if (!t1) { showError('أضف المستند أولًا — ارفع ملفًا أو الصق النص.'); return; }
    var name = ($('docName').value || '').trim() ||
               (S.files.doc1 ? S.files.doc1.name.replace(/\.[^.]+$/, '') : 'مستند ' + ST.today());
    var docType = $('docType').value;

    $('procLogo').innerHTML = logo(34, 1.1);
    $('proc').classList.add('active');
    $('procSteps').innerHTML = STEPS.map(function (s, i) {
      return '<div class="proc-step" id="ps_' + i + '"><div class="dot">' + (i + 1) + '</div>' + s +
             '<span class="out" id="po_' + i + '"></span></div>';
    }).join('');

    setTimeout(function () {
      var res;
      try { res = E.analyze({ docText: t1, refText: t2, config: S.cfg, docType: docType }); }
      catch (e) {
        $('proc').classList.remove('active'); go('upload');
        showError('تعذّر تحليل هذا المستند: ' + e.message); return;
      }
      var code = AU.nextCode('NR');
      var saved = ST.add({ name: name, text: t1, refText: t2, docType: docType,
                           refName: S.files.doc2 ? S.files.doc2.name : '', caseCode: code, fp: res.fingerprint });
      AU.log({ kind: 'analysis', actor: S.session.name, code: code, title: 'تحليل مستند: ' + name,
        detail: res.counts.chars.toLocaleString('en-US') + ' حرف · ' + res.obligations.length + ' التزام · ' +
                res.gaps.length + ' فجوة · درجة الخطر ' + res.riskScore,
        meta: { fp: res.fingerprint, risk: res.riskScore, codes: res.gaps.map(function (g) { return g.code; }) } });

      var outs = [res.counts.chars.toLocaleString('en-US') + ' حرف',
                  res.counts.dates + ' تاريخ · ' + res.counts.durations + ' مدة',
                  res.obligations.length + ' التزام',
                  res.clauseReport.filter(function (c) { return c.present; }).length + '/' + res.clauseReport.length + ' بند',
                  saved.saved ? 'حُفظ · ' + res.riskScore : 'الخطر ' + res.riskScore];
      var i = 0;
      (function tick() {
        if (i >= STEPS.length) {
          setTimeout(function () {
            $('proc').classList.remove('active');
            S.draft = { doc1: '', doc2: '', ctx: '', name: '', type: docType }; S.files = {};
            refreshAll();
            if (!saved.saved) {
              S.banner = { bad: true, msg: saved.full
                ? 'مساحة المتصفح ممتلئة — احذف مستندًا قديمًا ليُحفظ هذا. التحليل معروض الآن لكنه لن يبقى بعد إغلاق الصفحة.'
                : 'تعذّر الحفظ في هذا الجهاز — التخزين المحلي ممنوع. التحليل معروض الآن فقط.' };
            }
            go('doc', saved.doc.id);
          }, 280); return;
        }
        var st = $('ps_' + i); st.classList.add('done'); st.querySelector('.dot').textContent = '✓';
        $('po_' + i).textContent = outs[i]; i++; setTimeout(tick, 140);
      })();
    }, 40);
  }

  /* ═══ التصدير ═══ */
  function saveText(name, text) {
    var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadReport(doc, r) {
    var t = 'تقرير نذير — ' + doc.caseCode + '\n' + doc.name + '\n' + ST.today() + '\n' + Array(48).join('=') + '\n\n' +
      summary(r) + '\n\nدرجة الخطر: ' + r.effRisk + '/100\n';
    if (r.coverage) t += 'التغطية مقابل المرجع: ' + r.coverage.score + '%\n';
    t += 'البنود المعيارية: ' + r.clauseReport.filter(function (c) { return c.present; }).length + '/' + r.clauseReport.length + '\n';
    t += '\n--- الالتزامات والمواعيد ---\n';
    r.obligations.forEach(function (o, i) {
      t += (i + 1) + '. [' + o.code + '] [' + o.urgency + '] ' + o.quote.replace(/\s+/g, ' ') + '\n   الموعد: ' +
        (o.rawDeadline || '—') + (o.deadlineTS ? ' → ' + new Date(o.deadlineTS).toISOString().slice(0, 10) +
        ' (' + o.daysRemaining + ' يومًا)' : '') + ' | الجزاء: ' + o.penalty + '\n\n';
    });
    t += '--- الفجوات ---\n';
    r.gaps.forEach(function (g, i) {
      var s = ST.taskOf(doc, g.code).status;
      t += (i + 1) + '. [' + g.code + '] [' + g.risk + ' · ' + sevLabel(g.severity) + '] [' + STATUS[s] + '] ' +
        g.type + ' — ' + g.title + '\n   ' + g.description + '\n   ' +
        (g.evidenceType === 'absence' ? 'الدليل: غياب موثّق' : 'الاقتباس: «' + g.evidence.replace(/\s+/g, ' ') + '»') +
        '\n   التوصية: ' + g.recommendation + '\n\n';
    });
    t += '--- البنود المعيارية ---\n';
    r.clauseReport.forEach(function (c) { t += (c.present ? '[✓] ' : '[ ] ') + c.title + '\n'; });
    if (doc.history && doc.history.length > 1) {
      t += '\n--- منحنى الخطر ---\n';
      doc.history.slice(-30).forEach(function (h) { t += h.d + '  ' + h.r.toFixed(1) + '\n'; });
    }
    t += '\nتحليل آلي قائم على قواعد، مساعد للمراجعة البشرية لا بديل عنها.\n';
    saveText('nadheer-' + doc.caseCode + '.txt', t);
    AU.log({ kind: 'data', actor: S.session.name, code: doc.caseCode, title: 'تصدير تقرير', detail: doc.name });
  }
  function downloadPlan(tasks) {
    var t = 'خطة المعالجة — نذير\n' + ST.today() + '\n' + Array(48).join('=') + '\n\n';
    ['doing', 'todo', 'done'].forEach(function (st) {
      var g = tasks.filter(function (x) { return x.task.status === st; });
      if (!g.length) return;
      t += '\n### ' + STATUS[st] + ' (' + g.length + ')\n\n';
      g.forEach(function (x, i) {
        var rem = (S.cfg.remediation || {})[x.gap.type] || {};
        t += (i + 1) + '. [' + x.gap.code + '] [خطر ' + x.gap.risk + '] ' + x.gap.title + '\n' +
          '   المستند: ' + x.doc.name + ' (' + x.doc.caseCode + ')\n' +
          '   الإجراء: ' + x.gap.recommendation + '\n' +
          '   الجهة: ' + (rem.owner || '—') + ' · الجهد: ' + (rem.effort || '—') + '\n\n';
      });
    });
    saveText('nadheer-plan-' + ST.today() + '.txt', t);
    AU.log({ kind: 'data', actor: S.session.name, title: 'تصدير خطة المعالجة', detail: tasks.length + ' مهمة' });
  }

  /* ═══════════ الإدارة ═══════════ */
  function draft() { if (!S.cfgDraft) S.cfgDraft = NC.clone(S.cfg); return S.cfgDraft; }
  function dirty() { return JSON.stringify(S.cfgDraft) !== JSON.stringify(S.cfg); }
  function chips(list, attr) {
    return '<div class="chips">' + list.map(function (t, i) {
      return '<span class="chip">' + esc(t) + '<button type="button" data-' + attr + '="' + i + '">✕</button></span>';
    }).join('') + '</div>';
  }
  function addRow(id, ph) {
    return '<div class="addrow"><input type="text" id="' + id + '" placeholder="' + ph + '">' +
      '<button class="btn ghost sm" type="button" data-add="' + id + '">إضافة</button></div>';
  }
  function renderAdmin() {
    backdrop(false);
    var el = $('pageContent'), c = draft();
    var html = '<div class="eyebrow">الإدارة</div><h2 class="pagetitle">إعدادات المحرك</h2>' +
      '<p class="pagesub">كل جدول هنا يغيّر نتائج التحليل مباشرة، وتُعاد كل المستندات المحفوظة بالحساب الجديد. ' +
      'صدّر الإعدادات كملف لتوزيعها على بقية الأجهزة — وهي الطريقة الوحيدة للنقل في بيئة معزولة.</p>' +
      (dirty() ? '<div class="okbox">هناك تعديلات غير محفوظة.</div>' : '');

    html += '<div class="card"><div class="sectitle">صيغ الإلزام — ' + c.deontic.length + '</div>' +
      chips(c.deontic, 'deldeontic') + addRow('addDeontic', 'صيغة إلزام جديدة') + '</div>';
    html += '<div class="card"><div class="sectitle">أسماء الأطراف — ' + c.parties.length + '</div>' +
      chips(c.parties, 'delparty') + addRow('addParty', 'اسم طرف جديد') + '</div>';

    html += '<div class="card"><div class="sectitle">درجات الجزاء</div>';
    c.penaltyTiers.forEach(function (t, i) {
      html += '<div class="subcard"><div class="adm-row" style="border:none;padding:0 0 8px">' +
        '<input type="text" value="' + esc(t.label) + '" data-tier="' + i + '" data-f="label">' +
        '<input type="number" step="0.05" min="0" max="1" value="' + t.impact + '" data-tier="' + i + '" data-f="impact"></div>' +
        chips(t.terms, 'delterm' + i) + addRow('addTier' + i, 'لفظ جزاء') + '</div>';
    });
    html += '<div class="adm-row"><div class="nm">بلا جزاء منصوص — الأثر الافتراضي</div>' +
      '<input type="number" step="0.05" min="0" max="1" value="' + c.noPenaltyImpact + '" data-scalar="noPenaltyImpact"></div></div>';

    html += '<div class="card"><div class="sectitle">البنود المعيارية — ' + c.clauses.length + '</div>';
    c.clauses.forEach(function (cl, i) {
      html += '<div class="subcard"><div class="adm-row" style="border:none;padding:0 0 8px">' +
        '<input type="text" value="' + esc(cl.title) + '" data-clause="' + i + '" data-f="title">' +
        '<select data-clause="' + i + '" data-f="group" style="width:118px">' +
        ['عام', 'عقود', 'أمن معلومات', 'رسوم وخدمات'].map(function (g) {
          return '<option' + (g === (cl.group || 'عام') ? ' selected' : '') + '>' + g + '</option>';
        }).join('') + '</select>' +
        '<input type="number" step="0.05" min="0" max="1" value="' + cl.impact + '" data-clause="' + i + '" data-f="impact">' +
        '<button class="x" type="button" data-delclause="' + i + '">✕</button></div>' +
        chips(cl.terms, 'delcterm' + i) + addRow('addClause' + i, 'صيغة تدل على وجود البند') + '</div>';
    });
    html += addRow('newClause', 'اسم بند معياري جديد') + '</div>';

    html += '<div class="card"><div class="sectitle">العبارات الفضفاضة — ' + c.vague.length + '</div>';
    c.vague.forEach(function (v, i) {
      html += '<div class="adm-row"><input type="text" value="' + esc(v.term) + '" data-vague="' + i + '" data-f="term">' +
        '<input type="text" value="' + esc(v.why) + '" data-vague="' + i + '" data-f="why">' +
        '<button class="x" type="button" data-delvague="' + i + '">✕</button></div>';
    });
    html += addRow('newVague', 'عبارة فضفاضة جديدة') + '</div>';

    html += '<div class="card"><div class="sectitle">معاملات الحساب</div>';
    [['probability', 'الاحتمالية حسب الموعد', { overdue:'متجاوز', d7:'٧ أيام', d30:'٣٠ يومًا', d90:'٩٠ يومًا', far:'أبعد', none:'بلا موعد' }],
     ['decay', 'عامل الزمن', { overdue:'متجاوز', d7:'٧ أيام', d14:'١٤ يومًا', d30:'٣٠ يومًا', d90:'٩٠ يومًا', far:'أبعد' }],
     ['thresholds', 'حدود التصنيف', { critical:'حرجة ≥', medium:'متوسطة ≥' }],
     ['aggregate', 'أوزان الدرجة الكلية', { maxWeight:'وزن الأعلى', rmsWeight:'وزن الجذر التربيعي' }],
     ['gapProbability', 'احتمالية الفجوات', { missingClause:'بند مفقود', vague:'صياغة فضفاضة', uncovered:'متطلب غير مغطى', noDeadline:'التزام بلا موعد' }],
     ['gapImpact', 'أثر الفجوات', { vague:'صياغة فضفاضة', uncovered:'متطلب غير مغطى' }]
    ].forEach(function (g) {
      html += '<div class="grouplbl">' + g[1] + '</div>';
      Object.keys(g[2]).forEach(function (k) {
        html += '<div class="adm-row"><div class="nm">' + g[2][k] + '</div>' +
          '<input type="number" step="0.05" value="' + c.scoring[g[0]][k] + '" data-sc="' + g[0] + '" data-k="' + k + '"></div>';
      });
    });
    html += '<div class="grouplbl">أخرى</div><div class="adm-row"><div class="nm">عتبة التغطية اللفظية</div>' +
      '<input type="number" step="0.05" min="0" max="1" value="' + c.scoring.coverageThreshold + '" data-sc="root" data-k="coverageThreshold"></div></div>';

    html += '<div class="card"><div class="sectitle">جهات المعالجة</div>';
    Object.keys(c.remediation).forEach(function (k) {
      html += '<div class="adm-row"><div class="nm" style="flex:0 0 118px;font-size:11px">' + esc(k) + '</div>' +
        '<input type="text" value="' + esc(c.remediation[k].owner) + '" data-rem="' + esc(k) + '" data-f="owner">' +
        '<input type="text" value="' + esc(c.remediation[k].effort) + '" data-rem="' + esc(k) + '" data-f="effort"></div>';
    });
    html += '</div>';

    html += '<div class="card"><div class="sectitle">حفظ ونقل</div>' +
      '<div class="row-btns" style="margin-top:0"><button class="btn" id="cfgSave">حفظ التعديلات</button>' +
      '<button class="btn ghost" id="cfgRevert">تراجع</button></div>' +
      '<div class="row-btns"><button class="btn ghost" id="cfgExport">تصدير ملف الإعدادات</button>' +
      '<button class="btn ghost" id="cfgImport">استيراد</button></div>' +
      '<input type="file" id="cfgFile" accept=".json" style="display:none">' +
      '<div class="row-btns"><button class="btn danger" id="cfgReset">إعادة كل شيء للافتراضي</button></div>' +
      '<div id="cfgMsg"></div></div>';
    el.innerHTML = html; wire(el); bindAdmin(el);
  }
  function bindAdmin(el) {
    var c = draft(), redraw = function () { renderAdmin(); };
    var bindAll = function (sel, ev, fn) { on(el, sel, ev, fn); };
    bindAll('[data-deldeontic]', 'click', function (n) { c.deontic.splice(+n.dataset.deldeontic, 1); redraw(); });
    bindAll('[data-delparty]', 'click', function (n) { c.parties.splice(+n.dataset.delparty, 1); redraw(); });
    bindAll('[data-delvague]', 'click', function (n) { c.vague.splice(+n.dataset.delvague, 1); redraw(); });
    bindAll('[data-delclause]', 'click', function (n) { c.clauses.splice(+n.dataset.delclause, 1); redraw(); });
    c.penaltyTiers.forEach(function (t, i) {
      bindAll('[data-delterm' + i + ']', 'click', function (n) { t.terms.splice(+n.getAttribute('data-delterm' + i), 1); redraw(); });
    });
    c.clauses.forEach(function (cl, i) {
      bindAll('[data-delcterm' + i + ']', 'click', function (n) { cl.terms.splice(+n.getAttribute('data-delcterm' + i), 1); redraw(); });
    });
    bindAll('[data-add]', 'click', function (n) {
      var id = n.dataset.add, v = ($(id).value || '').trim();
      if (!v) return;
      if (id === 'addDeontic') c.deontic.push(v);
      else if (id === 'addParty') c.parties.push(v);
      else if (id === 'newVague') c.vague.push({ term: v, why: 'عبارة غير قابلة للقياس' });
      else if (id === 'newClause') c.clauses.push({ id: 'c' + Date.now().toString(36), title: v, group: 'عام', impact: 0.6, terms: [v] });
      else if (id.indexOf('addTier') === 0) c.penaltyTiers[+id.slice(7)].terms.push(v);
      else if (id.indexOf('addClause') === 0) c.clauses[+id.slice(9)].terms.push(v);
      redraw();
    });
    bindAll('[data-tier]', 'change', function (n) {
      var t = c.penaltyTiers[+n.dataset.tier]; t[n.dataset.f] = n.dataset.f === 'impact' ? +n.value : n.value;
    });
    bindAll('[data-clause]', 'change', function (n) {
      var cl = c.clauses[+n.dataset.clause]; cl[n.dataset.f] = n.dataset.f === 'impact' ? +n.value : n.value;
    });
    bindAll('[data-vague]', 'change', function (n) { c.vague[+n.dataset.vague][n.dataset.f] = n.value; });
    bindAll('[data-rem]', 'change', function (n) { c.remediation[n.dataset.rem][n.dataset.f] = n.value; });
    bindAll('[data-scalar]', 'change', function (n) { c[n.dataset.scalar] = +n.value; });
    bindAll('[data-sc]', 'change', function (n) {
      if (n.dataset.sc === 'root') c.scoring[n.dataset.k] = +n.value;
      else c.scoring[n.dataset.sc][n.dataset.k] = +n.value;
    });
    $('cfgSave').addEventListener('click', function () {
      var changes = NC.diff(S.cfg, c);
      if (!changes.length) { $('cfgMsg').innerHTML = '<div class="okbox">لا توجد تعديلات.</div>'; return; }
      var ok = NC.save(c); S.cfg = NC.clone(c);
      refreshAll();                      // كل المستندات تُعاد بالحساب الجديد فورًا
      AU.log({ kind: 'config', actor: S.session.name, title: 'تعديل إعدادات المحرك',
               detail: changes.length + ' قيمة تغيّرت', changes: changes.slice(0, 40) });
      $('cfgMsg').innerHTML = '<div class="okbox">حُفظت ' + changes.length + ' تعديلًا وأُعيد حساب ' +
        S.docs.length + ' مستند' + (ok ? '.' : '، لكن التخزين المحلي ممنوع فلن تبقى بعد الإغلاق.') + '</div>';
    });
    $('cfgRevert').addEventListener('click', function () { S.cfgDraft = NC.clone(S.cfg); renderAdmin(); });
    $('cfgExport').addEventListener('click', function () {
      saveText('nadheer-config.json', JSON.stringify(c, null, 2));
      AU.log({ kind: 'config', actor: S.session.name, title: 'تصدير ملف الإعدادات', detail: '' });
    });
    $('cfgImport').addEventListener('click', function () { $('cfgFile').click(); });
    $('cfgFile').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var inc = NC.merge(NC.DEFAULTS, JSON.parse(txt));
        var n = NC.diff(S.cfg, inc).length;
        S.cfgDraft = inc; renderAdmin();
        $('cfgMsg').innerHTML = '<div class="okbox">استُورد الملف — ' + n + ' قيمة مختلفة. راجعها ثم احفظ.</div>';
      }).catch(function () {
        $('cfgMsg').innerHTML = '<div class="errbox">تعذّرت قراءة الملف — تأكد أنه ملف إعدادات نذير.</div>';
      });
    });
    $('cfgReset').addEventListener('click', function () {
      if (!window.confirm('إعادة كل الإعدادات للافتراضي؟')) return;
      S.cfg = NC.reset(); S.cfgDraft = NC.clone(S.cfg); refreshAll();
      AU.log({ kind: 'config', actor: S.session.name, title: 'إعادة الإعدادات للافتراضي', detail: '' });
      renderAdmin();
      $('cfgMsg').innerHTML = '<div class="okbox">أُعيدت كل الإعدادات للافتراضي.</div>';
    });
  }

  /* ═══ سجل التتبّع ═══ */
  function renderAudit() {
    backdrop(false);
    var el = $('pageContent'), st = AU.stats(), list = AU.list({ kind: S.auditFilter, q: S.auditQ });
    var html = '<div class="eyebrow">الإدارة</div><h2 class="pagetitle">سجل التتبّع</h2>' +
      '<p class="pagesub">كل تحليل وتعديل ودخول وتحديث مهمة مقيَّد هنا. ابحث بكود التحليل (NR-…) أو بكود بند (G-…).</p>' +
      '<div class="trace"><div><div class="v">' + st.total + '</div><div class="l">إجمالي</div></div>' +
      '<div><div class="v">' + st.analysis + '</div><div class="l">تحاليل</div></div>' +
      '<div><div class="v">' + st.config + '</div><div class="l">تعديلات</div></div>' +
      '<div><div class="v">' + st.auth + '</div><div class="l">دخول</div></div></div>' +
      '<input type="text" id="auditQ" placeholder="ابحث بالكود أو النص..." value="' + esc(S.auditQ) + '">' +
      '<div class="filters" style="margin-top:12px">' +
      ['all', 'analysis', 'config', 'auth', 'security', 'data'].map(function (k) {
        return '<button class="filter-btn' + (S.auditFilter === k ? ' active' : '') + '" data-af="' + k + '">' +
          (k === 'all' ? 'الكل' : AU.KINDS[k]) + '</button>';
      }).join('') + '</div>';
    html += list.length ? list.map(function (e) {
      return '<div class="log"><div class="lh"><div class="lt">' +
        (e.code ? '<span class="code">' + esc(e.code) + '</span> ' : '') + esc(e.title) + '</div>' +
        '<div class="ld">' + fmtDate(e.at) + ' · ' + esc(e.actor) + '</div></div>' +
        (e.detail ? '<div class="lb">' + esc(e.detail) + '</div>' : '') +
        (e.changes && e.changes.length ? '<div class="diff">' + e.changes.slice(0, 8).map(function (ch) {
          return esc(ch.path) + ': ' + esc(String(ch.from).slice(0, 40)) + ' → ' + esc(String(ch.to).slice(0, 40));
        }).join('<br>') + (e.changes.length > 8 ? '<br>… +' + (e.changes.length - 8) : '') + '</div>' : '') + '</div>';
    }).join('') : '<div class="card"><div class="empty">لا توجد أحداث مطابقة.</div></div>';
    html += '<div class="row-btns"><button class="btn ghost" id="auExport">تصدير السجل</button>' +
      '<button class="btn danger" id="auClear">مسح السجل</button></div>';
    el.innerHTML = html;
    on(el, '[data-af]', 'click', function (b) { S.auditFilter = b.dataset.af; renderAudit(); });
    var q = $('auditQ');
    q.addEventListener('input', function () {
      S.auditQ = this.value; var pos = this.selectionStart; renderAudit();
      var nq = $('auditQ'); nq.focus(); nq.setSelectionRange(pos, pos);
    });
    $('auExport').addEventListener('click', function () {
      saveText('nadheer-audit-' + ST.today() + '.json', JSON.stringify(AU.all(), null, 2));
    });
    $('auClear').addEventListener('click', function () {
      if (!window.confirm('مسح سجل التتبّع بالكامل؟ صدّره أولًا إن أردت الاحتفاظ به.')) return;
      AU.clear();
      AU.log({ kind: 'security', actor: S.session.name, title: 'مسح سجل التتبّع', detail: 'بواسطة مدير النظام' });
      renderAudit();
    });
  }

  /* ═══ الأمان ═══ */
  function renderSecurity() {
    backdrop(false);
    var el = $('pageContent'), u = ST.usage();
    el.innerHTML = '<div class="eyebrow">الإدارة</div><h2 class="pagetitle">الأمان والدخول</h2>' +
      '<p class="pagesub">تغيير رمز المدير، وحدود ما يستطيع هذا التطبيق حمايته.</p>' +
      (isDefaultCode() ? '<div class="errbox">الرمز الافتراضي ما زال فعّالًا. غيّره الآن.</div>' : '') +
      '<div class="card"><div class="sectitle">رمز المدير</div>' +
      '<label class="field-label" for="oldC">الرمز الحالي</label><input type="password" id="oldC" autocomplete="off">' +
      '<label class="field-label" for="newC">الرمز الجديد — ٤ محارف على الأقل</label><input type="password" id="newC" autocomplete="off">' +
      '<label class="field-label" for="newC2">تأكيد الرمز الجديد</label><input type="password" id="newC2" autocomplete="off">' +
      '<div style="margin-top:16px"><button class="btn" id="secSave">تغيير الرمز</button></div><div id="secMsg"></div></div>' +
      '<div class="card"><div class="sectitle">ما الذي يحميه هذا الرمز فعلًا</div>' +
      '<div style="font-size:11.5px;color:var(--text2);line-height:2.1;font-weight:300">' +
      '<b style="color:var(--gold2);font-weight:500">يحمي من:</b> الاستخدام العابر والتعديل بالخطأ على قواعد المحرك.<br><br>' +
      '<b style="color:var(--danger);font-weight:500">لا يحمي من:</b> من يفتح الملف بمحرر نصوص. ' +
      'التطبيق يعمل من القرص بلا خادم، وكل كوده وبياناته على جهاز المستخدم.<br><br>' +
      '<b style="color:var(--gold2);font-weight:500">للحماية الفعلية:</b> خادم داخلي بمصادقة، وقاعدة بيانات على الخادم ' +
      'بدل متصفح كل جهاز. البنية جاهزة لهذا النقل لأن المحرك منفصل تمامًا عن الواجهة.</div></div>' +
      '<div class="card"><div class="sectitle">بيانات هذا الجهاز</div>' +
      '<div class="adm-row"><div class="nm">مستندات محفوظة</div><div>' + u.docs + ' · ' + u.mb.toFixed(2) + ' م.ب</div></div>' +
      '<div class="adm-row"><div class="nm">أحداث في السجل</div><div>' + AU.stats().total + '</div></div>' +
      '<div class="row-btns"><button class="btn danger" id="wipe">مسح كل بيانات هذا الجهاز</button></div></div>';
    $('secSave').addEventListener('click', function () {
      var o = $('oldC').value, n = $('newC').value, n2 = $('newC2').value, m = $('secMsg');
      if (codeHash(o) !== adminHash()) { m.innerHTML = '<div class="errbox">الرمز الحالي غير صحيح.</div>'; return; }
      if (n.length < 4) { m.innerHTML = '<div class="errbox">الرمز الجديد قصير جدًا.</div>'; return; }
      if (n !== n2) { m.innerHTML = '<div class="errbox">التأكيد لا يطابق الرمز الجديد.</div>'; return; }
      try { window.localStorage.setItem(ADMIN_KEY, codeHash(n)); }
      catch (e) { m.innerHTML = '<div class="errbox">تعذّر الحفظ — التخزين المحلي ممنوع.</div>'; return; }
      AU.log({ kind: 'security', actor: S.session.name, title: 'تغيير رمز المدير', detail: '' });
      m.innerHTML = '<div class="okbox">تم تغيير الرمز.</div>';
      $('oldC').value = $('newC').value = $('newC2').value = '';
    });
    $('wipe').addEventListener('click', function () {
      if (!window.confirm('مسح المستندات والإعدادات والسجل من هذا الجهاز؟ لا يمكن التراجع.')) return;
      ['nadheer:config:v3', 'nadheer:audit:v1', 'nadheer:docs:v1', 'nadheer:seq:v1', ADMIN_KEY]
        .forEach(function (k) { try { window.localStorage.removeItem(k); } catch (e) {} });
      ST.clear(); S.cfg = NC.load(); S.cfgDraft = null;
      logout();
    });
  }

  /* ═══ الإقلاع ═══ */
  function startApp() {
    S.cfg = NC.load(); S.cfgDraft = null;
    try { window.localStorage.setItem('nadheer:probe', '1'); window.localStorage.removeItem('nadheer:probe'); S.storageOK = true; }
    catch (e) { S.storageOK = false; }
    $('userName').textContent = S.session.name;
    $('userRole').textContent = isAdmin() ? 'مدير النظام' : 'مستخدم';
    $('avatarLetter').textContent = (S.session.name || 'ن').charAt(0);
    $('brandLogo').innerHTML = logo(19);
    renderNav();
    refreshAll();
    if (!S.storageOK) S.banner = { bad: true, msg: 'المتصفح يمنع التخزين المحلي هنا، فلن تُحفظ المستندات بين الجلسات. شغّل الملف من خادم داخلي لتفعيل الحفظ.' };
    go('home');
  }

  $('burgerBtn').innerHTML = ico('burger', 17);
  $('burgerBtn').addEventListener('click', function () { $('navOverlay').classList.add('open'); });
  $('navScrim').addEventListener('click', closeOverlays);
  $('brandHome').addEventListener('click', function () { if (S.session) go('home'); });
  $('viewScrim').addEventListener('click', closeOverlays);
  $('viewClose').addEventListener('click', closeOverlays);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlays(); });

  try { S.session = JSON.parse(window.sessionStorage.getItem('nadheer:session') || 'null'); } catch (e) { S.session = null; }
  if (S.session) startApp(); else renderGate();
})();
