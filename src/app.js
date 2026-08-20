/* نذير — الواجهة. لا يوجد أي طلب شبكة في هذا الملف. */
(function () {
  'use strict';
  var E = window.NadheerEngine, NC = window.NadheerConfig, AU = window.NadheerAudit;

  var S = { files: {}, draft: { doc1: '', doc2: '', ctx: '' }, result: null, sourceText: '',
            history: [], memo: null, gapFilter: 'all', route: 'dash', storageOK: true,
            session: null, cfg: null, cfgDraft: null, auditFilter: 'all', auditQ: '' };

  /* ═══ أدوات ═══ */
  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g,
    function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); };
  var sevColor = function (s) { return s === 'critical' ? 'var(--danger)' : s === 'medium' ? 'var(--warning)' : 'var(--success)'; };
  var sevLabel = function (s) { return s === 'critical' ? 'حرجة' : s === 'medium' ? 'متوسطة' : 'منخفضة'; };
  var sevBadge = function (s) { return s === 'critical' ? 'high' : s === 'medium' ? 'med' : 'low'; };
  var $ = function (id) { return document.getElementById(id); };
  var DAY = 86400000;
  var riskColor = function (r) {
    var t = (S.cfg || NC.DEFAULTS).scoring.thresholds;
    return r >= t.critical ? 'var(--danger)' : r >= t.medium ? 'var(--warning)' : 'var(--success)';
  };
  var fmtDate = function (ts) {
    var d = new Date(ts);
    return d.toISOString().slice(0, 10) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  };

  /* أيقونات خطية — لا إيموجي */
  var I = {
    doc:'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
    docs:'<path d="M15 2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V6z"/><path d="M15 2v4h4"/><path d="M3 7v13a2 2 0 0 0 2 2h9"/>',
    shield:'<path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert:'<path d="M12 3l9 16H3z"/><path d="M12 9v4M12 17h.01"/>',
    down:'<path d="M12 3v13M7 12l5 5 5-5M4 21h16"/>',
    up:'<path d="M12 21V8M7 12l5-5 5 5M4 3h16"/>',
    chart:'<path d="M3 21h18M7 21V10M12 21V4M17 21v-7"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    out:'<path d="M14 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8"/><path d="M17 16l4-4-4-4M21 12H10"/>',
    burger:'<path d="M3 6h18M3 12h18M3 18h18"/>'
  };
  /* شعار نذير: معيّن يحيط بنبضات صاعدة من نقطة — إشارة إنذار مبكر.
     يُرسم بالذهب، ويعمل من 20px إلى 80px بنفس الوضوح. */
  function logo(size, sw) {
    var w = sw || 1.15;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 1.8 22.2 12 12 22.2 1.8 12Z" stroke-width="' + w + '" opacity=".55"/>' +
      '<path d="M6.9 16.4a5.15 5.15 0 0 1 10.2 0" stroke-width="' + w + '" opacity=".45"/>' +
      '<path d="M8.85 16.4a3.2 3.2 0 0 1 6.3 0" stroke-width="' + (w * 1.15) + '" opacity=".8"/>' +
      '<circle cx="12" cy="16.5" r="1.45" fill="currentColor" stroke="none"/></svg>';
  }

  function ico(name, size) {
    return '<svg width="' + (size || 17) + '" height="' + (size || 17) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + I[name] + '</svg>';
  }

  /* ═══ الجلسة والأدوار ═══ */
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
  function isDefaultCode() { return adminHash() === codeHash(DEFAULT_CODE); }
  function setAdminCode(c) {
    try { window.localStorage.setItem(ADMIN_KEY, codeHash(c)); return true; } catch (e) { return false; }
  }
  function saveSession(s) { try { window.sessionStorage.setItem('nadheer:session', JSON.stringify(s)); } catch (e) {} }
  function loadSession() {
    try { return JSON.parse(window.sessionStorage.getItem('nadheer:session') || 'null'); } catch (e) { return null; }
  }
  var isAdmin = function () { return S.session && S.session.role === 'admin'; };

  /* ═══ بوابة الدخول ═══ */
  var gateRole = 'user';
  function renderGate() {
    $('gate').classList.add('open');
    $('gate').innerHTML =
      '<div class="gate-card">' +
      '<div class="gate-mark">' + logo(40, 1.05) + '</div>' +
      '<h1>نذير</h1><div class="tag">ذكاء الامتثال الاستباقي</div>' +
      '<div class="roles">' +
      '<button type="button" class="role' + (gateRole === 'user' ? ' sel' : '') + '" data-role="user">' +
        ico('user', 21) + '<div class="rn">دخول عادي</div><div class="rd">تحليل واطّلاع وتصدير</div></button>' +
      '<button type="button" class="role' + (gateRole === 'admin' ? ' sel' : '') + '" data-role="admin">' +
        ico('shield', 21) + '<div class="rn">مدير النظام</div><div class="rd">تعديل المحرك والتتبّع</div></button>' +
      '</div>' +
      '<div id="gateFields"></div>' +
      '<div style="margin-top:16px"><button class="btn" id="gateGo">دخول</button></div>' +
      '<div id="gateErr"></div>' +
      '<div class="gate-note">' + ico('lock', 12) + ' هذا فصل أدوار للاستخدام، لا حاجز أمني. ' +
      'الملف يعمل من القرص بلا خادم، فمن يفتحه بمحرر نصوص يستطيع تجاوز الرمز. ' +
      'للحماية الفعلية شغّله من خادم داخلي بمصادقة.</div></div>';

    var roles = $('gate').querySelectorAll('.role');
    for (var i = 0; i < roles.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { gateRole = b.dataset.role; renderGate(); });
      })(roles[i]);
    }
    $('gateFields').innerHTML = gateRole === 'admin'
      ? '<label class="field-label" for="gateCode">رمز المدير</label>' +
        '<input type="password" id="gateCode" autocomplete="off">' +
        (isDefaultCode() ? '<div style="font-size:10px;color:var(--warning);margin-top:8px;line-height:1.7">الرمز الافتراضي ما زال فعّالًا — غيّره من صفحة الأمان بعد الدخول.</div>' : '')
      : '<label class="field-label" for="gateName">الاسم (اختياري — يظهر في سجل التتبّع)</label>' +
        '<input type="text" id="gateName" autocomplete="off">';

    var go = function () {
      if (gateRole === 'admin') {
        var c = ($('gateCode').value || '');
        if (codeHash(c) !== adminHash()) {
          $('gateErr').innerHTML = '<div class="errbox">رمز غير صحيح.</div>';
          AU.log({ kind: 'security', actor: 'مجهول', title: 'محاولة دخول فاشلة', detail: 'رمز مدير غير صحيح' });
          return;
        }
        S.session = { role: 'admin', name: 'مدير النظام' };
      } else {
        S.session = { role: 'user', name: (($('gateName').value || '').trim() || 'مستخدم') };
      }
      saveSession(S.session);
      AU.log({ kind: 'auth', actor: S.session.name, title: 'تسجيل دخول',
               detail: isAdmin() ? 'بصلاحية مدير النظام' : 'بصلاحية مستخدم' });
      $('gate').classList.remove('open');
      startApp();
    };
    $('gateGo').addEventListener('click', go);
    var inp = $('gateCode') || $('gateName');
    if (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); inp.focus(); }
  }
  function logout() {
    AU.log({ kind: 'auth', actor: S.session ? S.session.name : '—', title: 'تسجيل خروج', detail: '' });
    try { window.sessionStorage.removeItem('nadheer:session'); } catch (e) {}
    S.session = null; S.result = null; S.files = {}; S.draft = { doc1: '', doc2: '', ctx: '' };
    renderGate();
  }

  /* ═══ الذاكرة التاريخية ═══ */
  var KEY = 'nadheer:history:v3';
  function loadHistory() {
    try { S.history = JSON.parse(window.localStorage.getItem(KEY) || '[]'); S.storageOK = true; }
    catch (e) { S.history = []; S.storageOK = false; }
  }
  function saveHistory() {
    S.history = S.history.slice(-24);
    try { window.localStorage.setItem(KEY, JSON.stringify(S.history)); } catch (e) { S.storageOK = false; }
  }
  function buildMemo(fp, snap) {
    var prev = null, i;
    for (i = S.history.length - 1; i >= 0; i--) if (S.history[i].fp === fp) { prev = S.history[i]; break; }
    if (!prev) return null;
    var lines = [], prevMap = {}, nowMap = {};
    (prev.gaps || []).forEach(function (g) { prevMap[g.key] = g; });
    snap.gaps.forEach(function (g) { nowMap[g.key] = g; });
    snap.gaps.forEach(function (g) {
      var p = prevMap[g.key]; if (!p) return;
      var age = Math.max(0, Math.round((Date.now() - (p.firstSeenAt || prev.at)) / DAY)), diff = g.risk - p.risk;
      lines.push('[' + g.code + '] «' + g.title + '» مفتوحة منذ ' + age + ' يومًا — ' +
        (diff > 0 ? 'ارتفع خطرها من ' + p.risk + ' إلى ' + g.risk
         : diff < 0 ? 'انخفض خطرها من ' + p.risk + ' إلى ' + g.risk : 'خطرها ثابت عند ' + g.risk) + '.');
    });
    var closed = (prev.gaps || []).filter(function (g) { return !nowMap[g.key]; });
    if (closed.length) lines.push('أُغلقت ' + closed.length + ' فجوة منذ التحليل السابق.');
    var fresh = snap.gaps.filter(function (g) { return !prevMap[g.key]; });
    if (fresh.length) lines.push('ظهرت ' + fresh.length + ' فجوة جديدة.');
    var dr = snap.riskScore - prev.riskScore;
    if (dr !== 0) lines.push('درجة الخطر ' + (dr > 0 ? 'ارتفعت' : 'انخفضت') + ' من ' + prev.riskScore + ' إلى ' + snap.riskScore + '.');
    return lines.length ? { lines: lines.slice(0, 6), prevRisk: prev.riskScore, prevMap: prevMap } : null;
  }

  /* ═══ التنقّل ═══ */
  var NAV = [
    { r: 'dash',    t: 'الرئيسية' },
    { r: 'upload',  t: 'رفع المستندات' },
    { r: 'gaps',    t: 'الفجوات' },
    { r: 'risk',    t: 'المخاطر والبنود' },
    { r: 'remed',   t: 'المعالجة' },
    { r: 'predict', t: 'المواعيد القادمة' },
    { r: 'report',  t: 'التقرير' },
    { sep: 'الإدارة', admin: true },
    { r: 'admin',   t: 'إعدادات المحرك', admin: true },
    { r: 'audit',   t: 'سجل التتبّع',    admin: true },
    { r: 'security',t: 'الأمان والدخول', admin: true }
  ];
  var routes = { dash: renderDash, upload: renderUpload, gaps: renderGaps, risk: renderRisk,
    remed: renderRemed, predict: renderPredict, report: renderReport,
    admin: renderAdmin, audit: renderAudit, security: renderSecurity };

  function renderNav() {
    var html = '<div class="hdr">التنقّل</div>';
    NAV.forEach(function (n) {
      if (n.admin && !isAdmin()) return;
      html += n.sep ? '<div class="navsep">' + n.sep + '</div>'
                    : '<button class="navlink" type="button" data-r="' + n.r + '">' + n.t + '</button>';
    });
    html += '<div class="navsep">الجلسة</div>' +
      '<button class="navlink" type="button" id="logoutBtn">تسجيل الخروج</button>';
    $('navPanel').innerHTML = html;
    var ls = $('navPanel').querySelectorAll('.navlink[data-r]');
    for (var i = 0; i < ls.length; i++) {
      (function (l) { l.addEventListener('click', function () { go(l.dataset.r); }); })(ls[i]);
    }
    $('logoutBtn').addEventListener('click', logout);
  }
  function go(route) {
    if (!S.session) { renderGate(); return; }
    if (['admin', 'audit', 'security'].indexOf(route) > -1 && !isAdmin()) route = 'dash';
    S.route = route;
    $('navOverlay').classList.remove('open');
    var links = $('navPanel').querySelectorAll('.navlink[data-r]');
    for (var i = 0; i < links.length; i++) links[i].classList.toggle('active', links[i].dataset.r === route);
    window.scrollTo(0, 0);
    (routes[route] || renderDash)();
  }
  function wire(el) {
    var bs = el.querySelectorAll('[data-r]');
    for (var i = 0; i < bs.length; i++) {
      (function (b) { b.addEventListener('click', function () { go(b.dataset.r); }); })(bs[i]);
    }
  }
  function wireEvidence(el) {
    var evs = el.querySelectorAll('.evidence');
    for (var i = 0; i < evs.length; i++) {
      (function (e) { e.addEventListener('click', function () { openViewer(e.dataset.q); }); })(evs[i]);
    }
  }

  /* ═══ عارض المستند ═══ */
  function openViewer(quote) {
    var hit = E.locateQuote(S.sourceText, quote), body = $('viewBody');
    if (!hit) body.innerHTML = '<div class="empty">تعذّر تحديد موضع هذا الاقتباس في النص.</div>';
    else {
      var t = S.sourceText, from = Math.max(0, hit.start - 900), to = Math.min(t.length, hit.end + 900);
      body.innerHTML = (from > 0 ? '…' : '') + esc(t.slice(from, hit.start)) +
        '<mark id="hl">' + esc(t.slice(hit.start, hit.end)) + '</mark>' + esc(t.slice(hit.end, to)) + (to < t.length ? '…' : '');
    }
    $('viewer').classList.add('open');
    var hl = $('hl'); if (hl) hl.scrollIntoView({ block: 'center' });
  }
  function closeOverlays() { $('viewer').classList.remove('open'); $('navOverlay').classList.remove('open'); }

  /* ═══ الرفع ═══ */
  function renderUpload() {
    var el = $('pageContent');
    el.innerHTML = '<div class="eyebrow">المدخلات</div><h2 class="pagetitle">رفع المستندات</h2>' +
      '<p class="pagesub">التحليل يجري كاملًا داخل جهازك. لا يغادر المستند المتصفح، ولا يوجد أي اتصال بالإنترنت.</p>' +
      '<div class="card">' +
      '<div class="doclabel">المستند الأساسي — مطلوب</div>' +
      '<button type="button" class="drop" id="drop_doc1"><div class="ic">' + ico('doc', 22) + '</div>' +
        '<div class="mt">اسحب الملف أو اضغط للاختيار</div><div class="ht">PDF · TXT</div></button>' +
      '<input type="file" id="fi_doc1" accept=".pdf,.txt,.md" style="display:none">' +
      '<div id="info_doc1"></div><textarea id="paste_doc1" placeholder="أو الصق النص مباشرة..."></textarea>' +
      '<hr class="hair">' +
      '<div class="doclabel">المرجع التنظيمي — اختياري، يفعّل نسبة التغطية</div>' +
      '<button type="button" class="drop" id="drop_doc2"><div class="ic">' + ico('docs', 22) + '</div>' +
        '<div class="mt">اسحب الملف أو اضغط للاختيار</div><div class="ht">PDF · TXT</div></button>' +
      '<input type="file" id="fi_doc2" accept=".pdf,.txt,.md" style="display:none">' +
      '<div id="info_doc2"></div><textarea id="paste_doc2" placeholder="أو الصق النص مباشرة..."></textarea>' +
      '<label class="field-label" for="contextText">كلمات تركيز — افصلها بفاصلة</label>' +
      '<textarea id="contextText" style="min-height:44px" placeholder="مثال: الضمان، التراخيص، الغرامات"></textarea>' +
      '<div style="margin-top:18px"><button class="btn" id="analyzeBtn">ابدأ التحليل</button></div>' +
      '<div id="errArea"></div></div>' +
      (S.storageOK ? '' : '<div class="card"><div style="font-size:11px;color:var(--text3);line-height:1.9;font-weight:300">' +
        'المتصفح يمنع التخزين المحلي هنا، فمقارنة التحاليل عبر الزمن وسجل التتبّع معطّلان. شغّل الملف من خادم داخلي لتفعيلهما.</div></div>');

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
    $('contextText').value = S.draft.ctx || '';
    $('contextText').addEventListener('input', function () { S.draft.ctx = this.value; });
    $('analyzeBtn').addEventListener('click', runAnalysis);
  }
  function showFile(key, name, len) {
    var info = $('info_' + key);
    info.innerHTML = '<div class="fileinfo"><span>' + esc(name) + ' — ' + len.toLocaleString('en-US') +
      ' حرف</span><button type="button">إزالة</button></div>';
    info.querySelector('button').addEventListener('click', function () { delete S.files[key]; info.innerHTML = ''; });
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
  function showError(msg) { var el = $('errArea'); if (el) el.innerHTML = '<div class="errbox">' + esc(msg) + '</div>'; }

  /* ═══ التشغيل ═══ */
  var STEPS = ['قراءة النص وتطبيعه', 'استخراج التواريخ والمدد', 'رصد الالتزامات والجزاءات',
               'فحص البنود المعيارية', 'حساب الخطر وإصدار الأكواد'];
  function runAnalysis() {
    var err = $('errArea'); if (err) err.innerHTML = '';
    var t1 = ((S.files.doc1 ? S.files.doc1.text : '') + '\n\n' + (S.draft.doc1 || '')).trim();
    var t2 = ((S.files.doc2 ? S.files.doc2.text : '') + '\n\n' + (S.draft.doc2 || '')).trim();
    if (!t1) { showError('أضف المستند الأساسي أولًا — ارفع ملفًا أو الصق النص.'); return; }

    S.sourceText = t1;
    $('procLogo').innerHTML = logo(34, 1.1);
    $('proc').classList.add('active');
    $('procSteps').innerHTML = STEPS.map(function (s, i) {
      return '<div class="proc-step" id="ps_' + i + '"><div class="dot">' + (i + 1) + '</div>' + s +
             '<span class="out" id="po_' + i + '"></span></div>';
    }).join('');

    setTimeout(function () {
      var res;
      try { res = E.analyze({ docText: t1, refText: t2, context: S.draft.ctx, config: S.cfg }); }
      catch (e) {
        $('proc').classList.remove('active'); go('upload');
        showError('تعذّر تحليل هذا المستند: ' + e.message); return;
      }
      buildResult(res, S.files.doc1 ? S.files.doc1.name : 'نص ملصوق');
      var outs = [res.counts.chars.toLocaleString('en-US') + ' حرف',
                  res.counts.dates + ' تاريخ · ' + res.counts.durations + ' مدة',
                  res.obligations.length + ' التزام',
                  res.clauseReport.filter(function (c) { return c.present; }).length + '/' + res.clauseReport.length + ' بند',
                  res.gaps.length + ' فجوة · ' + res.riskScore];
      var i = 0;
      (function tick() {
        if (i >= STEPS.length) { setTimeout(function () { $('proc').classList.remove('active'); go('dash'); }, 280); return; }
        var st = $('ps_' + i); st.classList.add('done'); st.querySelector('.dot').textContent = '✓';
        $('po_' + i).textContent = outs[i]; i++; setTimeout(tick, 140);
      })();
    }, 40);
  }

  function buildResult(res, docName) {
    var snap = { fp: res.fingerprint, at: Date.now(), riskScore: res.riskScore,
      gaps: res.gaps.map(function (g) { return { key: g.key, code: g.code, title: g.title, risk: g.risk, firstSeenAt: Date.now() }; }) };
    S.memo = buildMemo(res.fingerprint, snap);
    if (S.memo && S.memo.prevMap) {
      snap.gaps.forEach(function (g) { var p = S.memo.prevMap[g.key]; if (p && p.firstSeenAt) g.firstSeenAt = p.firstSeenAt; });
    }
    S.history.push(snap); saveHistory();

    var rem = S.cfg.remediation || {};
    res.remediation = res.gaps.map(function (g) {
      var m = rem[g.type] || { owner: 'الإدارة القانونية', effort: 'متوسط' };
      return { code: g.code, title: g.title, action: g.recommendation, gapType: g.type,
               risk: g.risk, priority: g.severity, owner: m.owner, effort: m.effort };
    });
    res.prevRisk = S.memo ? S.memo.prevRisk : null;
    res.docName = docName;
    res.caseCode = AU.nextCode('NR');
    S.result = res;

    AU.log({ kind: 'analysis', actor: S.session.name, code: res.caseCode,
      title: 'تحليل مستند: ' + docName,
      detail: res.counts.chars.toLocaleString('en-US') + ' حرف · ' + res.obligations.length + ' التزام · ' +
              res.gaps.length + ' فجوة · درجة الخطر ' + res.riskScore,
      meta: { fp: res.fingerprint, risk: res.riskScore, gaps: res.gaps.length,
              codes: res.gaps.map(function (g) { return g.code; }) } });
  }

  /* ═══ الرئيسية ═══ */
  function renderDash() {
    var el = $('pageContent'), d = S.result;
    if (!d) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:44px 22px">' +
        '<div style="color:var(--gold);display:flex;justify-content:center;margin-bottom:16px">' + ico('doc', 30) + '</div>' +
        '<div style="font-weight:300;font-size:20px;margin-bottom:10px">ابدأ بمستند</div>' +
        '<p style="color:var(--text2);font-size:12px;margin:0 auto 20px;line-height:1.95;font-weight:300;max-width:44ch">' +
        'ارفع عقدًا أو لائحة أو ترخيصًا. نذير يستخرج الالتزامات والمواعيد، يحسب الخطر، ويصدر كودًا لكل بند لتتبّعه عبر الزمن.</p>' +
        '<div style="max-width:230px;margin:0 auto"><button class="btn" data-r="upload">ارفع مستندًا</button></div></div>';
      wire(el); return;
    }
    var near = d.preds.slice(0, 3);
    var overdue = d.obligations.filter(function (o) { return o.daysRemaining !== null && o.daysRemaining < 0; }).length;
    var soon = d.obligations.filter(function (o) { return o.daysRemaining !== null && o.daysRemaining >= 0 && o.daysRemaining < 45; }).length;
    var present = d.clauseReport.filter(function (c) { return c.present; }).length;

    var delta = '';
    if (d.prevRisk != null && d.prevRisk !== d.riskScore) {
      var up = d.riskScore > d.prevRisk;
      delta = '<div class="delta" style="color:' + (up ? 'var(--danger)' : 'var(--success)') + '">' +
        (up ? '▲' : '▼') + ' ' + Math.abs(d.riskScore - d.prevRisk) + ' عن التحليل السابق</div>';
    }
    var html = '';
    if (S.memo) html += '<div class="memobar"><div class="eyebrow">ما تغيّر منذ آخر تحليل</div><ul>' +
      S.memo.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';

    html += '<div class="risk-hero"><div class="top">' +
      '<div style="flex:1;min-width:200px">' +
      '<div class="eyebrow">' + esc(d.caseCode) + ' · ' + esc(d.docName) + '</div>' +
      '<div class="risk-title">نذير ينبهك بما<br><b>سيحدث — قبل أن يحدث.</b></div>' +
      '<div class="risk-badges">' +
        '<span class="badge info">' + d.preds.length + ' موعد قادم</span>' +
        (overdue ? '<span class="badge high">' + overdue + ' موعد متجاوز</span>' : '') +
        '<span class="badge mute">' + d.obligations.length + ' التزام</span>' +
      '</div></div>' +
      '<div style="text-align:center;min-width:120px">' +
      '<div class="eyebrow">درجة الخطر</div>' +
      '<div class="risk-num num" style="color:' + riskColor(d.riskScore) + '">' + d.riskScore + '</div>' +
      '<div style="font-size:9.5px;color:var(--text3);letter-spacing:.1em;margin-top:8px">محسوبة لا مقدَّرة</div>' + delta +
      '</div></div></div>';

    html += '<div class="kpi-grid">' +
      kpi('gaps', 'var(--warning)', d.gaps.length, 'فجوة',
          d.stats.critical + ' حرجة · ' + d.stats.medium + ' متوسطة · ' + d.stats.low + ' منخفضة') +
      kpi('risk', 'var(--gold)', present + '/' + d.clauseReport.length, 'بند معياري موجود',
          (d.clauseReport.length - present) + ' بند غائب') +
      kpi('risk', 'var(--danger)', overdue, 'موعد متجاوز', soon + ' موعد خلال ٤٥ يومًا') +
      kpi('predict', 'var(--success)', d.preds.length, 'موعد قادم', 'مرتّبة بالأقرب') + '</div>';

    html += '<div class="card"><div class="sectitle">أقرب ما يستحق</div>';
    html += near.length ? near.map(function (p) {
      return '<div class="pred-row">' +
        '<div class="pred-tag" style="color:' + sevColor(p.severity) + ';border:1px solid ' + sevColor(p.severity) + '44">' +
        p.daysRemaining + ' يوم</div>' +
        '<div><div class="t">' + esc(p.title) + ' <span class="code">' + p.code + '</span></div>' +
        '<div class="b">' + esc(p.consequence) + '</div></div></div>';
    }).join('') : '<div class="empty">لم يرد في المستند موعد قادم محدد التاريخ.</div>';
    html += '<div style="margin-top:16px"><button class="btn ghost" data-r="predict">كل المواعيد</button></div></div>';

    html += '<div class="card"><div class="sectitle">الفجوات حسب النوع</div>' + typeBars(d.gaps) +
      '<div class="row-btns"><button class="btn ghost" data-r="gaps">الفجوات</button>' +
      '<button class="btn ghost" data-r="upload">تحليل جديد</button></div></div>';
    el.innerHTML = html; wire(el);
  }
  function kpi(route, color, v, l, s) {
    return '<button class="kpi" data-r="' + route + '"><div class="v" style="color:' + color + '">' + v + '</div>' +
      '<div class="l">' + l + '</div><div class="s">' + esc(s) + '</div></button>';
  }
  function typeBars(gaps) {
    var map = {};
    gaps.forEach(function (g) { map[g.type] = (map[g.type] || 0) + 1; });
    var entries = Object.keys(map).map(function (k) { return [k, map[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return '<div class="empty">لا توجد فجوات.</div>';
    var max = entries[0][1];
    var colors = ['var(--danger)', 'var(--warning)', 'var(--gold)', 'var(--success)', 'var(--ice)'];
    return entries.map(function (e, i) { return barrow(e[0], e[1] / max * 100, e[1], colors[i % colors.length]); }).join('');
  }
  function barrow(label, pct, val, color) {
    return '<div class="barrow"><div class="lbl">' + esc(label) + '</div><div class="track">' +
      '<div class="fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<div class="val" style="color:' + color + '">' + val + '</div></div>';
  }

  /* ═══ الفجوات ═══ */
  function renderGaps() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('الفجوات', 'لا يوجد تحليل بعد.'); return; }
    el.innerHTML = '<div class="eyebrow">' + esc(d.caseCode) + '</div><h2 class="pagetitle">فجوات الامتثال</h2>' +
      '<p class="pagesub">' + d.gaps.length + ' فجوة — كل واحدة إمّا اقتباس حرفي من مستندك أو غياب موثّق لبند بحثنا عنه. ' +
      'الكود الظاهر بجانب كل فجوة ثابت، فيتتبعها عبر التحاليل القادمة.</p>' +
      '<div class="filters" id="gapFilters">' + fbtn('all', 'الكل', d.gaps.length) +
      fbtn('critical', 'حرجة', d.stats.critical) + fbtn('medium', 'متوسطة', d.stats.medium) +
      fbtn('low', 'منخفضة', d.stats.low) + '</div><div id="gapList"></div>';
    var btns = el.querySelectorAll('#gapFilters .filter-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');
          b.classList.add('active'); S.gapFilter = b.dataset.f; drawGaps();
        });
      })(btns[i]);
    }
    S.gapFilter = 'all'; drawGaps();
  }
  function fbtn(f, label, n) {
    return '<button class="filter-btn' + (f === 'all' ? ' active' : '') + '" data-f="' + f + '">' + label + ' (' + n + ')</button>';
  }
  function gapCard(g) {
    var ev = g.evidenceType === 'absence'
      ? '<div class="absence"><span class="lb">غياب موثّق</span>لم يرد في المستند أيٌّ من الصيغ الشائعة لهذا البند.</div>'
      : '<button type="button" class="evidence" data-q="' + esc(g.evidence) + '"><span class="lb">' +
        (g.evidenceType === 'reference' ? 'من المستند المرجعي' : 'من نص مستندك — اضغط لعرض الموضع') +
        '</span>«' + esc(g.evidence) + '»</button>';
    return '<div class="gap-card ' + g.severity + '">' +
      '<div class="gap-head"><div><div class="gap-title">' + esc(g.title) + '</div>' +
      '<div class="gap-meta"><span class="code">' + g.code + '</span><span class="gap-type">' + esc(g.type) + '</span></div></div>' +
      '<span class="badge ' + sevBadge(g.severity) + '">' + g.risk + '</span></div>' +
      '<div class="gap-desc">' + esc(g.description) + '</div>' + ev +
      '<div class="gap-rec">' + esc(g.recommendation) + '</div>' +
      '<div class="mathbox">احتمالية <b>' + g.probability.toFixed(2) + '</b><span class="op">×</span>' +
      'أثر <b>' + g.impact.toFixed(2) + '</b><span class="op">×</span>زمن <b>' + g.decay.toFixed(2) + '</b>' +
      '<span class="out num" style="color:' + sevColor(g.severity) + '">' + g.risk + '</span></div></div>';
  }
  function drawGaps() {
    var d = S.result;
    var list = S.gapFilter === 'all' ? d.gaps : d.gaps.filter(function (g) { return g.severity === S.gapFilter; });
    var box = $('gapList');
    box.innerHTML = list.length ? list.map(gapCard).join('') : '<div class="empty">لا توجد فجوات في هذا التصنيف.</div>';
    wireEvidence(box);
  }

  /* ═══ المخاطر ═══ */
  function renderRisk() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('المخاطر', 'لا يوجد تحليل بعد.'); return; }
    var sc = S.cfg.scoring, present = d.clauseReport.filter(function (c) { return c.present; }).length;
    var html = '<div class="eyebrow">' + esc(d.caseCode) + '</div><h2 class="pagetitle">تقييم المخاطر</h2>' +
      '<p class="pagesub">كل رقم هنا ناتج معادلة معلنة، ويمكن تتبّعه إلى الجملة التي أنتجته.</p>' +
      '<div class="card" style="text-align:center;padding:32px 20px">' +
      '<div class="eyebrow">درجة الخطر الكلية</div>' +
      '<div class="num" style="font-size:74px;color:' + riskColor(d.riskScore) + '">' + d.riskScore + '</div>' +
      '<div style="font-size:10px;color:var(--text3);letter-spacing:.14em;margin:12px 0 20px">' +
      (d.riskScore >= sc.thresholds.critical ? 'مرتفع' : d.riskScore >= sc.thresholds.medium ? 'متوسط' : 'منخفض') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line)">' +
      sevBox(d.stats.critical, 'حرجة', 'var(--danger)') + sevBox(d.stats.medium, 'متوسطة', 'var(--warning)') +
      sevBox(d.stats.low, 'منخفضة', 'var(--success)') + '</div></div>';

    html += '<div class="card"><div class="sectitle">كيف تُحسب الدرجة</div><div class="rubric">' +
      'خطر البند = <b>احتمالية × أثر × عامل الزمن × 100</b>، والدرجة الكلية = <b>' +
      sc.aggregate.maxWeight + ' × أعلى بند + ' + sc.aggregate.rmsWeight +
      ' × الجذر التربيعي لمتوسط المربّعات</b> — الحدّ الأعلى يمنع بندًا حرجًا واحدًا من أن تبتلعه بنود هادئة.' +
      '<table>' +
      '<tr><td>الاحتمالية من حالة الموعد</td><td>' + [sc.probability.overdue, sc.probability.d7, sc.probability.d30,
        sc.probability.d90, sc.probability.far, sc.probability.none].join(' · ') + '</td></tr>' +
      '<tr><td>الأثر من الجزاء المنصوص</td><td>' + S.cfg.penaltyTiers.map(function (t) { return t.impact; })
        .concat([S.cfg.noPenaltyImpact]).join(' · ') + '</td></tr>' +
      '<tr><td>عامل الزمن يضاعف قرب الموعد</td><td>' + [sc.decay.overdue, sc.decay.d7, sc.decay.d14,
        sc.decay.d30, sc.decay.d90, sc.decay.far].join(' · ') + '</td></tr>' +
      '<tr><td>حدّا التصنيف</td><td>حرجة ≥ ' + sc.thresholds.critical + ' · متوسطة ≥ ' + sc.thresholds.medium + '</td></tr>' +
      '</table>' + (isAdmin() ? '<div style="margin-top:14px"><button class="btn ghost sm" data-r="admin">تعديل هذه المعاملات</button></div>' : '') +
      '</div></div>';

    html += '<div class="card"><div class="sectitle">البنود المعيارية — ' + present + '/' + d.clauseReport.length + '</div>' +
      '<div class="clause-grid">' + d.clauseReport.map(function (c) {
        return '<div class="clause ' + (c.present ? 'ok' : 'miss') + '"><span class="mk">' +
          (c.present ? '✓' : '✕') + '</span>' + esc(c.title) + '</div>';
      }).join('') + '</div></div>';

    if (d.coverage) {
      html += '<div class="card"><div class="sectitle">التغطية مقابل المرجع — ' + d.coverage.score + '٪</div>' +
        '<p style="font-size:10.5px;color:var(--text3);line-height:1.9;margin:0 0 14px;font-weight:300">' +
        'تطابق لفظي بين متطلبات المرجع وبنود مستندك، لا رأيًا قانونيًا. النسبة تقيس التغطية الظاهرة فقط.</p>' +
        d.coverage.requirements.map(function (r) {
          return '<div style="padding:11px 0;border-bottom:1px solid var(--line)">' +
            '<div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start">' +
            '<div style="font-size:12px;line-height:1.8;flex:1;font-weight:300">' + esc(r.requirement) + '</div>' +
            '<span class="badge ' + (r.met ? 'low' : 'med') + '">' + r.score + '٪</span></div>' +
            (r.matched ? '<div style="font-size:10.5px;color:var(--text3);margin-top:7px;line-height:1.8">يقابله: «' +
              esc(r.matched.slice(0, 140)) + '»</div>' : '') + '</div>';
        }).join('') + '</div>';
    }

    html += '<div class="card"><div class="sectitle">الالتزامات والمواعيد — ' + d.obligations.length + '</div>';
    html += d.obligations.length ? d.obligations.map(function (o) {
      var c = o.daysRemaining == null ? 'var(--text3)' : o.daysRemaining < 14 ? 'var(--danger)'
            : o.daysRemaining < 45 ? 'var(--warning)' : 'var(--success)';
      return '<div style="padding:13px 0;border-bottom:1px solid var(--line)">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
        '<div style="font-size:12px;line-height:1.85;flex:1;font-weight:300">' + esc(o.quote.slice(0, 210)) +
        (o.quote.length > 210 ? '…' : '') + '</div>' +
        '<span class="badge" style="color:' + c + ';border:1px solid ' + c + '44">' + o.urgency + '</span></div>' +
        '<div style="font-size:10px;color:var(--text3);margin-top:7px;line-height:1.8">' +
        '<span class="code">' + o.code + '</span> &nbsp;' + esc(o.rawDeadline || 'بلا موعد صريح') +
        (o.deadlineTS ? ' → ' + new Date(o.deadlineTS).toISOString().slice(0, 10) +
          (o.approxDate ? ' (هجري تقريبي ±يوم)' : '') + ' · ' + o.daysRemaining + ' يومًا' : '') +
        (o.party ? ' · ' + esc(o.party) : '') + ' · ' + esc(o.penalty) + '</div></div>';
    }).join('') : '<div class="empty">لم تُرصد صيغ إلزام في هذا المستند.</div>';
    html += '<div style="margin-top:16px"><button class="btn ghost" data-r="remed">خطة المعالجة</button></div></div>';
    el.innerHTML = html; wire(el);
  }
  function sevBox(n, l, c) {
    return '<div style="background:var(--bg);padding:16px 10px">' +
      '<div class="num" style="font-size:26px;color:' + c + '">' + n + '</div>' +
      '<div style="font-size:9.5px;color:var(--text3);margin-top:6px;letter-spacing:.08em">' + l + '</div></div>';
  }

  /* ═══ المعالجة ═══ */
  function renderRemed() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('المعالجة', 'لا يوجد تحليل بعد.'); return; }
    var html = '<div class="eyebrow">' + esc(d.caseCode) + '</div><h2 class="pagetitle">خطة المعالجة</h2>' +
      '<p class="pagesub">كل إجراء مشتق من فجوة بعينها ويحمل كودها ودرجتها — الترتيب بالخطر الفعلي.</p>';
    html += d.remediation.length ? d.remediation.map(function (r) {
      return '<div class="remed-item"><div class="hdr"><div><div class="ttl">' + esc(r.title) + '</div>' +
        '<div class="gap-meta"><span class="code">' + r.code + '</span>' +
        '<span class="gap-type">' + esc(r.gapType) + '</span></div></div>' +
        '<span class="badge ' + sevBadge(r.priority) + '">' + sevLabel(r.priority) + ' · ' + r.risk + '</span></div>' +
        '<div class="remed-action">' + esc(r.action) + '</div><div class="remed-meta">' +
        '<div><div class="l">الجهة المقترحة</div><div class="v">' + esc(r.owner) + '</div></div>' +
        '<div><div class="l">الجهد التقديري</div><div class="v" style="color:var(--warning)">' + esc(r.effort) + '</div></div>' +
        '</div></div>';
    }).join('') : '<div class="card"><div class="empty">لا توجد فجوات تستدعي معالجة.</div></div>';
    html += '<div class="row-btns"><button class="btn ghost" data-r="predict">المواعيد</button>' +
      '<button class="btn ghost" data-r="report">التقرير</button></div>';
    el.innerHTML = html; wire(el);
  }

  /* ═══ المواعيد ═══ */
  function renderPredict() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('المواعيد', 'لا يوجد تحليل بعد.'); return; }
    var html = '<div class="eyebrow">' + esc(d.caseCode) + '</div><h2 class="pagetitle">ماذا سيستحق</h2>' +
      '<p class="pagesub">كل بند مربوط بالتزام وتاريخ مستخرجين من نصك. عدد الأيام محسوب من تاريخ اليوم.</p>';
    if (!d.preds.length) {
      el.innerHTML = html + '<div class="card"><div class="empty">لم يرد في المستند موعد قادم محدد التاريخ.</div></div>';
      return;
    }
    var maxD = Math.max(90, Math.max.apply(null, d.preds.map(function (p) { return p.daysRemaining; })));
    html += '<div class="timeline">';
    [7, 14, 30, 60, 90, 180, 365].filter(function (m) { return m <= maxD; }).forEach(function (m) {
      html += '<div class="tl-mark" style="right:' + (m / maxD * 100) + '%"><span>' + m + ' يوم</span></div>';
    });
    d.preds.forEach(function (p) {
      html += '<div class="tl-dot" style="right:' + Math.max(0, Math.min(99, p.daysRemaining / maxD * 100)) +
        '%;background:' + sevColor(p.severity) + '"></div>';
    });
    html += '</div>';
    html += d.preds.map(function (p) {
      return '<div class="pred-card"><div class="pred-days">' +
        '<div class="n" style="color:' + sevColor(p.severity) + '">' + p.daysRemaining + '</div>' +
        '<div class="u">يومًا</div></div><div class="pred-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div><div class="pred-title2">' + esc(p.title) + '</div>' +
        '<div class="gap-meta"><span class="code">' + p.code + '</span></div></div>' +
        '<span class="badge ' + sevBadge(p.severity) + '">' + p.risk + '</span></div>' +
        '<div class="pred-trigger" style="margin-top:8px">الموعد: ' + esc(p.trigger) + ' → ' + p.deadlineISO +
        (p.approxDate ? ' (هجري تقريبي ±يوم)' : '') + '</div>' +
        '<div class="pred-cons"><b>ما يترتب:</b> ' + esc(p.consequence) + '</div>' +
        '<button type="button" class="evidence" data-q="' + esc(p.evidence) + '">' +
        '<span class="lb">من نص مستندك</span>«' + esc(p.evidence.slice(0, 200)) + '»</button>' +
        '<div class="pred-rec">' + esc(p.recommendation) + '</div></div></div>';
    }).join('');
    html += '<button class="btn ghost" data-r="report" style="margin-top:8px">التقرير</button>';
    el.innerHTML = html; wire(el); wireEvidence(el);
  }

  /* ═══ التقرير ═══ */
  function renderReport() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('التقرير', 'لا يوجد تحليل بعد.'); return; }
    var present = d.clauseReport.filter(function (c) { return c.present; }).length;
    var total = d.stats.critical + d.stats.medium + d.stats.low;
    var html = '<div class="report-head"><div class="eyebrow">' + esc(d.caseCode) + ' · ' +
      new Date().toISOString().slice(0, 10) + '</div>' +
      '<h3>التقرير التنفيذي</h3><p>' + esc(d.docName) + ' — بأرقام محسوبة لا مقدَّرة</p>' +
      '<div class="report-stats">' +
      rstat(d.coverage ? d.coverage.score + '٪' : present + '/' + d.clauseReport.length, d.coverage ? 'التغطية' : 'بنود معيارية') +
      rstat(d.gaps.length, 'الفجوات') + rstat(d.preds.length, 'مواعيد') + rstat(d.riskScore, 'الخطر') + '</div></div>';

    html += '<div class="card"><div class="sectitle">توزيع الخطورة</div>' +
      barrow('حرجة', total ? d.stats.critical / total * 100 : 0, d.stats.critical, 'var(--danger)') +
      barrow('متوسطة', total ? d.stats.medium / total * 100 : 0, d.stats.medium, 'var(--warning)') +
      barrow('منخفضة', total ? d.stats.low / total * 100 : 0, d.stats.low, 'var(--success)') + '</div>';
    html += '<div class="card"><div class="sectitle">الخلاصة</div>' +
      '<div style="font-size:13px;line-height:2.1;color:var(--text2);font-weight:300">' + esc(summary(d)) + '</div></div>';
    html += '<div class="card"><div class="sectitle">حدود هذا التحليل</div>' +
      '<div style="font-size:11px;color:var(--text3);line-height:2;font-weight:300">' +
      'تحليل قائم على قواعد لغوية وتقويمية، مساعد للمراجع البشري لا بديل عنه.<br>' +
      'صيغ الإلزام تُرصد بألفاظها؛ التزام مصاغ بأسلوب غير معتاد قد لا يُرصد.<br>' +
      'التواريخ الهجرية تُحوَّل بالتقويم المدني وقد تفارق أم القرى بيوم.<br>' +
      '«التغطية» تطابق لفظي بين نصّين، لا حكم على كفاية البند.</div></div>';
    html += '<div class="quote">"نذير لا يخبرك بما حدث — بل ينبهك لما سيحدث قبل أن يتحول إلى مخالفة."</div>';
    html += '<div class="row-btns"><button class="btn ghost" data-r="dash">الرئيسية</button>' +
      '<button class="btn" id="dlBtn">تنزيل التقرير</button></div>';
    el.innerHTML = html; wire(el);
    $('dlBtn').addEventListener('click', downloadReport);
  }
  function rstat(v, l) { return '<div><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }

  function summary(d) {
    var overdue = d.obligations.filter(function (o) { return o.daysRemaining !== null && o.daysRemaining < 0; }).length;
    var missing = d.clauseReport.filter(function (c) { return !c.present; });
    var s = 'فحصنا ' + d.counts.chars.toLocaleString('en-US') + ' حرفًا ورصدنا ' + d.obligations.length +
      ' التزامًا و' + d.counts.dates + ' تاريخًا. ';
    s += overdue ? 'هناك ' + overdue + ' موعدًا انقضى دون ما يفيد تنفيذه. ' : 'لا يوجد موعد متجاوز في هذا المستند. ';
    s += d.preds.length ? 'وأقرب استحقاق قادم خلال ' + d.preds[0].daysRemaining + ' يومًا. ' : '';
    s += missing.length ? 'ويخلو المستند من ' + missing.length + ' بندًا معياريًا، أبرزها: ' +
      missing.slice(0, 3).map(function (c) { return c.title; }).join('، ') + '. ' : 'وتغطي بنوده كامل القائمة المعيارية. ';
    s += 'درجة الخطر الكلية ' + d.riskScore + ' من 100.';
    return s;
  }

  function saveText(name, text) {
    var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadReport() {
    var d = S.result; if (!d) return;
    var t = 'تقرير نذير — ' + d.caseCode + '\n' + d.docName + '\n' +
      new Date().toISOString().slice(0, 16).replace('T', ' ') + '\n' + Array(48).join('=') + '\n\n' + summary(d) + '\n\n';
    t += 'درجة الخطر: ' + d.riskScore + '/100\n';
    if (d.coverage) t += 'التغطية مقابل المرجع: ' + d.coverage.score + '%\n';
    t += 'البنود المعيارية: ' + d.clauseReport.filter(function (c) { return c.present; }).length + '/' + d.clauseReport.length + '\n';
    t += '\n--- الالتزامات والمواعيد ---\n';
    d.obligations.forEach(function (o, i) {
      t += (i + 1) + '. [' + o.code + '] [' + o.risk + ' · ' + o.urgency + '] ' + o.quote.replace(/\s+/g, ' ') + '\n' +
        '   الموعد: ' + (o.rawDeadline || '—') +
        (o.deadlineTS ? ' → ' + new Date(o.deadlineTS).toISOString().slice(0, 10) + ' (' + o.daysRemaining + ' يومًا)' : '') +
        ' | الجزاء: ' + o.penalty + '\n\n';
    });
    t += '--- الفجوات ---\n';
    d.gaps.forEach(function (g, i) {
      t += (i + 1) + '. [' + g.code + '] [' + g.risk + ' · ' + sevLabel(g.severity) + '] ' + g.type + ' — ' + g.title + '\n' +
        '   ' + g.description + '\n   ' +
        (g.evidenceType === 'absence' ? 'الدليل: غياب موثّق' : 'الاقتباس: «' + g.evidence.replace(/\s+/g, ' ') + '»') + '\n' +
        '   التوصية: ' + g.recommendation + '\n\n';
    });
    t += '--- البنود المعيارية ---\n';
    d.clauseReport.forEach(function (c) { t += (c.present ? '[✓] ' : '[ ] ') + c.title + '\n'; });
    if (d.coverage) {
      t += '\n--- التغطية مقابل المرجع ---\n';
      d.coverage.requirements.forEach(function (r) {
        t += (r.met ? '[✓] ' : '[ ] ') + '(' + r.score + '%) ' + r.requirement.replace(/\s+/g, ' ') + '\n';
      });
    }
    t += '\n--- خطة المعالجة ---\n';
    d.remediation.forEach(function (r, i) {
      t += (i + 1) + '. [' + r.code + '] [' + r.risk + '] ' + r.title + '\n   ' + r.action +
        '\n   الجهة: ' + r.owner + ' · الجهد: ' + r.effort + '\n\n';
    });
    t += '\nتحليل آلي قائم على قواعد، مساعد للمراجعة البشرية لا بديل عنها.\n';
    saveText('nadheer-' + d.caseCode + '.txt', t);
    AU.log({ kind: 'data', actor: S.session.name, code: d.caseCode, title: 'تصدير تقرير', detail: d.docName });
  }

  function emptyPage(title, msg) {
    var el = $('pageContent');
    el.innerHTML = '<h2 class="pagetitle">' + title + '</h2>' +
      '<div class="card" style="text-align:center;padding:40px 20px">' +
      '<p style="color:var(--text3);font-size:12px;margin-bottom:20px;font-weight:300">' + msg + '</p>' +
      '<div style="max-width:220px;margin:0 auto"><button class="btn" data-r="upload">ارفع مستندًا</button></div></div>';
    wire(el);
  }

  /* ═══════════ لوحة الإدارة ═══════════ */
  function draft() { if (!S.cfgDraft) S.cfgDraft = NC.clone(S.cfg); return S.cfgDraft; }
  function dirty() { return JSON.stringify(S.cfgDraft) !== JSON.stringify(S.cfg); }

  function chips(list, onDel) {
    return '<div class="chips">' + list.map(function (t, i) {
      return '<span class="chip">' + esc(t) + '<button type="button" data-' + onDel + '="' + i + '">✕</button></span>';
    }).join('') + '</div>';
  }
  function addRow(id, ph) {
    return '<div class="addrow"><input type="text" id="' + id + '" placeholder="' + ph + '">' +
      '<button class="btn ghost sm" type="button" data-add="' + id + '">إضافة</button></div>';
  }

  function renderAdmin() {
    var el = $('pageContent'), c = draft();
    var html = '<div class="eyebrow">الإدارة</div><h2 class="pagetitle">إعدادات المحرك</h2>' +
      '<p class="pagesub">كل جدول هنا يغيّر نتائج التحليل مباشرة. التعديلات تُحفظ في هذا الجهاز، ' +
      'ويمكن تصديرها كملف لتوزيعها على بقية الأجهزة — وهي الطريقة الوحيدة للنقل في بيئة معزولة.</p>' +
      (dirty() ? '<div class="okbox">هناك تعديلات غير محفوظة.</div>' : '');

    html += '<div class="card"><div class="sectitle">صيغ الإلزام — ' + c.deontic.length + '</div>' +
      '<div style="font-size:11px;color:var(--text3);line-height:1.9;font-weight:300">وجود أيٍّ منها في جملة يجعلها التزامًا.</div>' +
      chips(c.deontic, 'deldeontic') + addRow('addDeontic', 'صيغة إلزام جديدة') + '</div>';

    html += '<div class="card"><div class="sectitle">أسماء الأطراف — ' + c.parties.length + '</div>' +
      chips(c.parties, 'delparty') + addRow('addParty', 'اسم طرف جديد') + '</div>';

    html += '<div class="card"><div class="sectitle">درجات الجزاء</div>' +
      '<div style="font-size:11px;color:var(--text3);line-height:1.9;font-weight:300;margin-bottom:12px">' +
      'تُفحص بالترتيب، وأول تطابق يحدد الأثر (0 إلى 1).</div>';
    c.penaltyTiers.forEach(function (t, i) {
      html += '<div style="border:1px solid var(--line);padding:13px;margin-bottom:9px">' +
        '<div class="adm-row" style="border:none;padding:0 0 8px">' +
        '<input type="text" value="' + esc(t.label) + '" data-tier="' + i + '" data-f="label">' +
        '<input type="number" step="0.05" min="0" max="1" value="' + t.impact + '" data-tier="' + i + '" data-f="impact">' +
        '</div>' + chips(t.terms, 'delterm' + i) + addRow('addTier' + i, 'لفظ جزاء') + '</div>';
    });
    html += '<div class="adm-row"><div class="nm">بلا جزاء منصوص — الأثر الافتراضي</div>' +
      '<input type="number" step="0.05" min="0" max="1" value="' + c.noPenaltyImpact + '" data-scalar="noPenaltyImpact"></div></div>';

    html += '<div class="card"><div class="sectitle">البنود المعيارية — ' + c.clauses.length + '</div>' +
      '<div style="font-size:11px;color:var(--text3);line-height:1.9;font-weight:300;margin-bottom:12px">' +
      'غياب أيٍّ منها يُنتج فجوة «بند مفقود» بأثرها المحدد.</div>';
    c.clauses.forEach(function (cl, i) {
      html += '<div style="border:1px solid var(--line);padding:13px;margin-bottom:9px">' +
        '<div class="adm-row" style="border:none;padding:0 0 8px">' +
        '<input type="text" value="' + esc(cl.title) + '" data-clause="' + i + '" data-f="title">' +
        '<input type="number" step="0.05" min="0" max="1" value="' + cl.impact + '" data-clause="' + i + '" data-f="impact">' +
        '<button class="x" type="button" data-delclause="' + i + '" title="حذف البند">✕</button></div>' +
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
    [['probability', 'الاحتمالية حسب الموعد', { overdue:'متجاوز', d7:'أقل من ٧ أيام', d30:'أقل من ٣٠', d90:'أقل من ٩٠', far:'أبعد', none:'بلا موعد' }],
     ['decay', 'عامل الزمن', { overdue:'متجاوز', d7:'أقل من ٧', d14:'أقل من ١٤', d30:'أقل من ٣٠', d90:'أقل من ٩٠', far:'أبعد' }],
     ['thresholds', 'حدود التصنيف', { critical:'حرجة ≥', medium:'متوسطة ≥' }],
     ['aggregate', 'أوزان الدرجة الكلية', { maxWeight:'وزن الأعلى', rmsWeight:'وزن الجذر التربيعي' }],
     ['gapProbability', 'احتمالية الفجوات', { missingClause:'بند مفقود', vague:'صياغة فضفاضة', uncovered:'متطلب غير مغطى', noDeadline:'التزام بلا موعد' }],
     ['gapImpact', 'أثر الفجوات', { vague:'صياغة فضفاضة', uncovered:'متطلب غير مغطى' }]
    ].forEach(function (grp) {
      html += '<div style="font-size:10px;color:var(--gold);letter-spacing:.12em;margin:16px 0 8px">' + grp[1] + '</div>';
      Object.keys(grp[2]).forEach(function (k) {
        html += '<div class="adm-row"><div class="nm">' + grp[2][k] + '</div>' +
          '<input type="number" step="0.05" value="' + c.scoring[grp[0]][k] + '" data-sc="' + grp[0] + '" data-k="' + k + '"></div>';
      });
    });
    html += '<div style="font-size:10px;color:var(--gold);letter-spacing:.12em;margin:16px 0 8px">أخرى</div>' +
      '<div class="adm-row"><div class="nm">عتبة التغطية اللفظية</div>' +
      '<input type="number" step="0.05" min="0" max="1" value="' + c.scoring.coverageThreshold + '" data-sc="root" data-k="coverageThreshold"></div></div>';

    html += '<div class="card"><div class="sectitle">جهات المعالجة</div>';
    Object.keys(c.remediation).forEach(function (k) {
      html += '<div class="adm-row"><div class="nm" style="flex:0 0 130px;font-size:11px">' + esc(k) + '</div>' +
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

    el.innerHTML = html;
    wire(el);
    bindAdmin(el);
  }

  function bindAdmin(el) {
    var c = draft();
    var redraw = function () { renderAdmin(); };
    var on = function (sel, ev, fn) {
      var ns = el.querySelectorAll(sel);
      for (var i = 0; i < ns.length; i++) (function (n) { n.addEventListener(ev, function (e) { fn(n, e); }); })(ns[i]);
    };

    on('[data-deldeontic]', 'click', function (n) { c.deontic.splice(+n.dataset.deldeontic, 1); redraw(); });
    on('[data-delparty]', 'click', function (n) { c.parties.splice(+n.dataset.delparty, 1); redraw(); });
    on('[data-delvague]', 'click', function (n) { c.vague.splice(+n.dataset.delvague, 1); redraw(); });
    on('[data-delclause]', 'click', function (n) { c.clauses.splice(+n.dataset.delclause, 1); redraw(); });
    c.penaltyTiers.forEach(function (t, i) {
      on('[data-delterm' + i + ']', 'click', function (n) { t.terms.splice(+n.getAttribute('data-delterm' + i), 1); redraw(); });
    });
    c.clauses.forEach(function (cl, i) {
      on('[data-delcterm' + i + ']', 'click', function (n) { cl.terms.splice(+n.getAttribute('data-delcterm' + i), 1); redraw(); });
    });

    on('[data-add]', 'click', function (n) {
      var id = n.dataset.add, inp = $(id), v = (inp.value || '').trim();
      if (!v) return;
      if (id === 'addDeontic') c.deontic.push(v);
      else if (id === 'addParty') c.parties.push(v);
      else if (id === 'newVague') c.vague.push({ term: v, why: 'عبارة غير قابلة للقياس' });
      else if (id === 'newClause') c.clauses.push({ id: 'c' + Date.now().toString(36), title: v, impact: 0.6, terms: [v] });
      else if (id.indexOf('addTier') === 0) c.penaltyTiers[+id.slice(7)].terms.push(v);
      else if (id.indexOf('addClause') === 0) c.clauses[+id.slice(9)].terms.push(v);
      redraw();
    });

    on('[data-tier]', 'change', function (n) {
      var t = c.penaltyTiers[+n.dataset.tier];
      t[n.dataset.f] = n.dataset.f === 'impact' ? +n.value : n.value;
    });
    on('[data-clause]', 'change', function (n) {
      var cl = c.clauses[+n.dataset.clause];
      cl[n.dataset.f] = n.dataset.f === 'impact' ? +n.value : n.value;
    });
    on('[data-vague]', 'change', function (n) { c.vague[+n.dataset.vague][n.dataset.f] = n.value; });
    on('[data-rem]', 'change', function (n) { c.remediation[n.dataset.rem][n.dataset.f] = n.value; });
    on('[data-scalar]', 'change', function (n) { c[n.dataset.scalar] = +n.value; });
    on('[data-sc]', 'change', function (n) {
      if (n.dataset.sc === 'root') c.scoring[n.dataset.k] = +n.value;
      else c.scoring[n.dataset.sc][n.dataset.k] = +n.value;
    });

    $('cfgSave').addEventListener('click', function () {
      var changes = NC.diff(S.cfg, c);
      if (!changes.length) { $('cfgMsg').innerHTML = '<div class="okbox">لا توجد تعديلات.</div>'; return; }
      var okSave = NC.save(c);
      S.cfg = NC.clone(c);
      AU.log({ kind: 'config', actor: S.session.name, title: 'تعديل إعدادات المحرك',
        detail: changes.length + ' قيمة تغيّرت', changes: changes.slice(0, 40) });
      $('cfgMsg').innerHTML = '<div class="okbox">حُفظت ' + changes.length + ' تعديلًا' +
        (okSave ? ' — ستُطبَّق على التحليل القادم.' : '، لكن التخزين المحلي ممنوع فلن تبقى بعد إغلاق الصفحة. صدّرها كملف.') + '</div>';
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
        var incoming = NC.merge(NC.DEFAULTS, JSON.parse(txt));
        var changes = NC.diff(S.cfg, incoming);
        S.cfgDraft = incoming;
        renderAdmin();
        $('cfgMsg').innerHTML = '<div class="okbox">استُورد ملف الإعدادات — ' + changes.length +
          ' قيمة مختلفة. راجعها ثم اضغط «حفظ التعديلات».</div>';
      }).catch(function () {
        $('cfgMsg').innerHTML = '<div class="errbox">تعذّرت قراءة الملف — تأكد أنه ملف إعدادات نذير.</div>';
      });
    });
    $('cfgReset').addEventListener('click', function () {
      if (!window.confirm('إعادة كل الإعدادات للافتراضي؟ لا يمكن التراجع.')) return;
      S.cfg = NC.reset(); S.cfgDraft = NC.clone(S.cfg);
      AU.log({ kind: 'config', actor: S.session.name, title: 'إعادة الإعدادات للافتراضي', detail: '' });
      renderAdmin();
      $('cfgMsg').innerHTML = '<div class="okbox">أُعيدت كل الإعدادات للافتراضي.</div>';
    });
  }

  /* ═══════════ سجل التتبّع ═══════════ */
  function renderAudit() {
    var el = $('pageContent'), st = AU.stats();
    var list = AU.list({ kind: S.auditFilter, q: S.auditQ });
    var html = '<div class="eyebrow">الإدارة</div><h2 class="pagetitle">سجل التتبّع</h2>' +
      '<p class="pagesub">كل تحليل وكل تعديل على المحرك وكل دخول مقيَّد هنا بكوده ووقته وفاعله. ' +
      'ابحث بكود التحليل (NR-…) أو بكود بند (G-…) لتتبّعه.</p>' +
      '<div class="trace">' +
      '<div><div class="v">' + st.total + '</div><div class="l">إجمالي الأحداث</div></div>' +
      '<div><div class="v">' + st.analysis + '</div><div class="l">تحاليل</div></div>' +
      '<div><div class="v">' + st.config + '</div><div class="l">تعديلات</div></div>' +
      '<div><div class="v">' + st.auth + '</div><div class="l">دخول</div></div>' +
      '</div>' +
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
        }).join('<br>') + (e.changes.length > 8 ? '<br>… +' + (e.changes.length - 8) : '') + '</div>' : '') +
        '</div>';
    }).join('') : '<div class="card"><div class="empty">لا توجد أحداث مطابقة.</div></div>';

    html += '<div class="row-btns"><button class="btn ghost" id="auExport">تصدير السجل</button>' +
      '<button class="btn danger" id="auClear">مسح السجل</button></div>';
    el.innerHTML = html;

    var fs = el.querySelectorAll('[data-af]');
    for (var i = 0; i < fs.length; i++) {
      (function (b) { b.addEventListener('click', function () { S.auditFilter = b.dataset.af; renderAudit(); }); })(fs[i]);
    }
    var q = $('auditQ');
    q.addEventListener('input', function () {
      S.auditQ = this.value;
      var pos = this.selectionStart;
      renderAudit();
      var nq = $('auditQ'); nq.focus(); nq.setSelectionRange(pos, pos);
    });
    $('auExport').addEventListener('click', function () {
      saveText('nadheer-audit-' + new Date().toISOString().slice(0, 10) + '.json',
               JSON.stringify(AU.all(), null, 2));
    });
    $('auClear').addEventListener('click', function () {
      if (!window.confirm('مسح سجل التتبّع بالكامل؟ لا يمكن التراجع. صدّره أولًا إن أردت الاحتفاظ به.')) return;
      AU.clear();
      AU.log({ kind: 'security', actor: S.session.name, title: 'مسح سجل التتبّع', detail: 'بواسطة مدير النظام' });
      renderAudit();
    });
  }

  /* ═══════════ الأمان ═══════════ */
  function renderSecurity() {
    var el = $('pageContent');
    el.innerHTML = '<div class="eyebrow">الإدارة</div><h2 class="pagetitle">الأمان والدخول</h2>' +
      '<p class="pagesub">تغيير رمز المدير، وحدود ما يستطيع هذا التطبيق حمايته.</p>' +
      (isDefaultCode() ? '<div class="errbox">الرمز الافتراضي ما زال فعّالًا. غيّره الآن.</div>' : '') +
      '<div class="card"><div class="sectitle">رمز المدير</div>' +
      '<label class="field-label" for="oldC">الرمز الحالي</label><input type="password" id="oldC" autocomplete="off">' +
      '<label class="field-label" for="newC">الرمز الجديد — ٤ محارف على الأقل</label><input type="password" id="newC" autocomplete="off">' +
      '<label class="field-label" for="newC2">تأكيد الرمز الجديد</label><input type="password" id="newC2" autocomplete="off">' +
      '<div style="margin-top:16px"><button class="btn" id="secSave">تغيير الرمز</button></div><div id="secMsg"></div></div>' +
      '<div class="card"><div class="sectitle">ما الذي يحميه هذا الرمز فعلًا</div>' +
      '<div style="font-size:11.5px;color:var(--text2);line-height:2.05;font-weight:300">' +
      '<b style="color:var(--gold2);font-weight:500">يحمي من:</b> الاستخدام العابر والتعديل بالخطأ على قواعد المحرك، ' +
      'وفصل من يحلل عمّن يغيّر النظام.<br><br>' +
      '<b style="color:var(--danger);font-weight:500">لا يحمي من:</b> من يفتح الملف بمحرر نصوص. ' +
      'التطبيق يعمل من القرص بلا خادم، وكل كوده وبياناته على جهاز المستخدم — ' +
      'فالرمز حاجز استخدام لا حاجز تشفير.<br><br>' +
      '<b style="color:var(--gold2);font-weight:500">للحماية الفعلية:</b> شغّل الملف من خادم داخلي بمصادقة، ' +
      'واجعل البيانات في قاعدة على الخادم بدل متصفح كل جهاز. البنية الحالية جاهزة لهذا النقل ' +
      'لأن المحرك منفصل تمامًا عن الواجهة.</div></div>' +
      '<div class="card"><div class="sectitle">بيانات هذا الجهاز</div>' +
      '<div class="adm-row"><div class="nm">التخزين المحلي</div><div>' + (S.storageOK ? 'متاح' : 'ممنوع') + '</div></div>' +
      '<div class="adm-row"><div class="nm">تحاليل محفوظة</div><div>' + S.history.length + '</div></div>' +
      '<div class="adm-row"><div class="nm">أحداث في السجل</div><div>' + AU.stats().total + '</div></div>' +
      '<div class="row-btns"><button class="btn danger" id="wipe">مسح كل بيانات هذا الجهاز</button></div></div>';

    $('secSave').addEventListener('click', function () {
      var o = $('oldC').value, n = $('newC').value, n2 = $('newC2').value, m = $('secMsg');
      if (codeHash(o) !== adminHash()) { m.innerHTML = '<div class="errbox">الرمز الحالي غير صحيح.</div>'; return; }
      if (n.length < 4) { m.innerHTML = '<div class="errbox">الرمز الجديد قصير جدًا.</div>'; return; }
      if (n !== n2) { m.innerHTML = '<div class="errbox">التأكيد لا يطابق الرمز الجديد.</div>'; return; }
      if (!setAdminCode(n)) { m.innerHTML = '<div class="errbox">تعذّر الحفظ — التخزين المحلي ممنوع في هذا الوضع.</div>'; return; }
      AU.log({ kind: 'security', actor: S.session.name, title: 'تغيير رمز المدير', detail: '' });
      m.innerHTML = '<div class="okbox">تم تغيير الرمز.</div>';
      $('oldC').value = $('newC').value = $('newC2').value = '';
    });
    $('wipe').addEventListener('click', function () {
      if (!window.confirm('مسح الإعدادات والسجل والتاريخ من هذا الجهاز؟ لا يمكن التراجع.')) return;
      ['nadheer:config:v3', 'nadheer:audit:v1', 'nadheer:history:v3', 'nadheer:seq:v1', ADMIN_KEY]
        .forEach(function (k) { try { window.localStorage.removeItem(k); } catch (e) {} });
      S.cfg = NC.load(); S.cfgDraft = null; S.history = []; S.result = null;
      logout();
    });
  }

  /* ═══ الإقلاع ═══ */
  function startApp() {
    S.cfg = NC.load(); S.cfgDraft = null;
    loadHistory();
    $('userName').textContent = S.session.name;
    $('userRole').textContent = isAdmin() ? 'مدير النظام' : 'مستخدم';
    $('avatarLetter').textContent = (S.session.name || 'ن').charAt(0);
    renderNav();
    go('dash');
  }

  $('brandLogo').innerHTML = logo(19);
  $('burgerBtn').innerHTML = ico('burger', 17);
  $('burgerBtn').addEventListener('click', function () { $('navOverlay').classList.add('open'); });
  $('navScrim').addEventListener('click', closeOverlays);
  $('brandHome').addEventListener('click', function () { if (S.session) go('dash'); });
  $('viewScrim').addEventListener('click', closeOverlays);
  $('viewClose').addEventListener('click', closeOverlays);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlays(); });

  S.session = loadSession();
  if (S.session) startApp(); else renderGate();
})();
