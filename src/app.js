/* نذير — الواجهة. لا يوجد أي طلب شبكة في هذا الملف ولا في المحرك. */
(function () {
  'use strict';
  var E = window.NadheerEngine;

  var S = { files: {}, draft: { doc1: '', doc2: '', ctx: '' }, result: null,
            sourceText: '', history: [], memo: null, gapFilter: 'all', route: 'dash', storageOK: true };

  var esc = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g,
    function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); };
  var sevColor = function (s) { return s === 'critical' ? 'var(--danger)' : s === 'medium' ? 'var(--warning)' : 'var(--success)'; };
  var sevLabel = function (s) { return s === 'critical' ? 'حرجة' : s === 'medium' ? 'متوسطة' : 'منخفضة'; };
  var sevBadge = function (s) { return s === 'critical' ? 'high' : s === 'medium' ? 'med' : 'low'; };
  var riskColor = function (r) { return r >= 66 ? 'var(--danger)' : r >= 33 ? 'var(--warning)' : 'var(--success)'; };
  var $ = function (id) { return document.getElementById(id); };
  var DAY = 86400000;

  /* ═══ الذاكرة: localStorage مع بديل في الذاكرة (file:// قد يمنعه) ═══ */
  var KEY = 'nadheer:history:v2';
  function loadHistory() {
    try {
      var raw = window.localStorage.getItem(KEY);
      S.history = raw ? JSON.parse(raw) : [];
      S.storageOK = true;
    } catch (e) { S.history = []; S.storageOK = false; }
  }
  function saveHistory() {
    S.history = S.history.slice(-24);
    try { window.localStorage.setItem(KEY, JSON.stringify(S.history)); }
    catch (e) { S.storageOK = false; }
  }

  function buildMemo(fp, snap) {
    var prev = null;
    for (var i = S.history.length - 1; i >= 0; i--) { if (S.history[i].fp === fp) { prev = S.history[i]; break; } }
    if (!prev) return null;
    var lines = [], prevMap = {}, nowMap = {};
    (prev.gaps || []).forEach(function (g) { prevMap[g.key] = g; });
    snap.gaps.forEach(function (g) { nowMap[g.key] = g; });

    snap.gaps.forEach(function (g) {
      var p = prevMap[g.key]; if (!p) return;
      var age = Math.max(0, Math.round((Date.now() - (p.firstSeenAt || prev.at)) / DAY));
      var diff = g.risk - p.risk;
      lines.push('«' + g.title + '» ما زالت مفتوحة منذ ' + age + ' يومًا — ' +
        (diff > 0 ? 'ارتفع خطرها من ' + p.risk + ' إلى ' + g.risk
         : diff < 0 ? 'انخفض خطرها من ' + p.risk + ' إلى ' + g.risk
         : 'خطرها ثابت عند ' + g.risk) + '.');
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
  var routes = { dash: renderDash, upload: renderUpload, gaps: renderGaps, risk: renderRisk,
                 remed: renderRemed, predict: renderPredict, report: renderReport };
  function go(route) {
    S.route = route;
    $('navOverlay').classList.remove('open');
    var links = document.querySelectorAll('.navlink');
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

  /* ═══ عارض المستند ═══ */
  function openViewer(quote) {
    var hit = E.locateQuote(S.sourceText, quote), body = $('viewBody');
    if (!hit) body.innerHTML = '<div class="empty">تعذّر تحديد موضع هذا الاقتباس في النص.</div>';
    else {
      var t = S.sourceText, from = Math.max(0, hit.start - 900), to = Math.min(t.length, hit.end + 900);
      body.innerHTML = (from > 0 ? '…' : '') + esc(t.slice(from, hit.start)) +
        '<mark id="hl">' + esc(t.slice(hit.start, hit.end)) + '</mark>' +
        esc(t.slice(hit.end, to)) + (to < t.length ? '…' : '');
    }
    $('viewer').classList.add('open');
    var hl = $('hl'); if (hl) hl.scrollIntoView({ block: 'center' });
  }
  function closeOverlays() { $('viewer').classList.remove('open'); $('navOverlay').classList.remove('open'); }

  /* ═══ الرفع ═══ */
  function renderUpload() {
    var el = $('pageContent');
    el.innerHTML =
      '<h2 class="pagetitle">رفع المستندات</h2>' +
      '<p class="pagesub">التحليل يجري كاملًا داخل جهازك. لا يغادر المستند المتصفح، ولا يوجد أي اتصال بالإنترنت.</p>' +
      '<div class="card">' +
      '<div class="doclabel">المستند الأساسي (مطلوب)</div>' +
      '<button type="button" class="drop" id="drop_doc1"><div class="ic">📄</div><div class="mt">اسحب الملف أو اضغط للاختيار</div><div class="ht">PDF أو TXT</div></button>' +
      '<input type="file" id="fi_doc1" accept=".pdf,.txt,.md" style="display:none">' +
      '<div id="info_doc1"></div>' +
      '<textarea id="paste_doc1" placeholder="أو الصق النص مباشرة..."></textarea>' +
      '<div class="doclabel" style="margin-top:16px">المرجع التنظيمي (اختياري — يفعّل نسبة التغطية)</div>' +
      '<button type="button" class="drop" id="drop_doc2"><div class="ic">📑</div><div class="mt">اسحب الملف أو اضغط للاختيار</div><div class="ht">PDF أو TXT</div></button>' +
      '<input type="file" id="fi_doc2" accept=".pdf,.txt,.md" style="display:none">' +
      '<div id="info_doc2"></div>' +
      '<textarea id="paste_doc2" placeholder="أو الصق النص مباشرة..."></textarea>' +
      '<label class="field-label" for="contextText">كلمات تركيز (اختياري — افصلها بفاصلة)</label>' +
      '<textarea id="contextText" style="min-height:44px" placeholder="مثال: الضمان، التراخيص، الغرامات"></textarea>' +
      '<div style="margin-top:16px"><button class="btn" id="analyzeBtn">ابدأ التحليل ←</button></div>' +
      '<div id="errArea"></div></div>' +
      (S.storageOK ? '' : '<div class="card"><div style="font-size:11.5px;color:var(--text3);line-height:1.8">' +
        'المتصفح يمنع التخزين المحلي في هذا الوضع، فمقارنة التحليلات عبر الزمن معطّلة. ' +
        'شغّل الملف من خادم داخلي إن أردت تفعيلها.</div></div>');

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
      // النص الملصوق يُحفظ فورًا حتى لا يضيع عند إعادة رسم الصفحة
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
    info.innerHTML = '<div class="fileinfo"><span>✅ ' + esc(name) + ' — ' +
      len.toLocaleString('en-US') + ' حرف</span><button type="button">إزالة</button></div>';
    info.querySelector('button').addEventListener('click', function () {
      delete S.files[key]; info.innerHTML = '';
    });
  }

  function handleFile(file, key) {
    var info = $('info_' + key);
    info.innerHTML = '<div class="fileinfo"><span>⏳ جارٍ قراءة: ' + esc(file.name) + '</span></div>';
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    (isPdf ? extractPdf(file) : file.text()).then(function (text) {
      if (!text || !text.trim()) throw new Error('لا يحتوي هذا الملف نصًا قابلًا للاستخراج — غالبًا صورة ممسوحة ضوئيًا. الصق النص مباشرة أو استخدم نسخة نصية.');
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
          jobs.push(pdf.getPage(i)
            .then(function (p) { return p.getTextContent(); })
            .then(function (c) { return c.items.map(function (it) { return it.str; }).join(' '); }));
        }
        return Promise.all(jobs).then(function (pages) { return pages.join('\n\n'); });
      });
  }

  function showError(msg) { var el = $('errArea'); if (el) el.innerHTML = '<div class="errbox">' + esc(msg) + '</div>'; }

  /* ═══ التشغيل ═══ */
  var STEPS = ['قراءة النص وتطبيعه', 'استخراج التواريخ والمدد', 'رصد الالتزامات والجزاءات',
               'فحص البنود المعيارية', 'حساب الخطر والتنبؤات'];

  function runAnalysis() {
    var err = $('errArea'); if (err) err.innerHTML = '';
    var t1 = ((S.files.doc1 ? S.files.doc1.text : '') + '\n\n' + (S.draft.doc1 || '')).trim();
    var t2 = ((S.files.doc2 ? S.files.doc2.text : '') + '\n\n' + (S.draft.doc2 || '')).trim();
    if (!t1) { showError('أضف المستند الأساسي أولًا — ارفع ملفًا أو الصق النص.'); return; }

    S.sourceText = t1;
    $('proc').classList.add('active');
    $('procSteps').innerHTML = STEPS.map(function (s, i) {
      return '<div class="proc-step" id="ps_' + i + '"><div class="dot">' + (i + 1) + '</div>' + s + '<span class="out" id="po_' + i + '"></span></div>';
    }).join('');

    // نُفسح للمتصفح أن يرسم الشاشة قبل التحليل المتزامن
    setTimeout(function () {
      var res;
      try {
        res = E.analyze({ docText: t1, refText: t2, context: S.draft.ctx });
      } catch (e) {
        $('proc').classList.remove('active'); go('upload');
        showError('تعذّر تحليل هذا المستند: ' + e.message); return;
      }
      buildResult(res, t1);
      // نعرض أرقامًا حقيقية لكل خطوة — لا شريط تقدّم وهمي
      var outs = [res.counts.chars.toLocaleString('en-US') + ' حرف',
                  res.counts.dates + ' تاريخ · ' + res.counts.durations + ' مدة',
                  res.obligations.length + ' التزام',
                  res.clauseReport.filter(function (c) { return c.present; }).length + '/' + res.clauseReport.length + ' بند',
                  res.gaps.length + ' فجوة · درجة ' + res.riskScore];
      var i = 0;
      (function tick() {
        if (i >= STEPS.length) { setTimeout(function () { $('proc').classList.remove('active'); go('dash'); }, 260); return; }
        var st = $('ps_' + i); st.classList.add('done'); st.querySelector('.dot').textContent = '✓';
        $('po_' + i).textContent = outs[i]; i++; setTimeout(tick, 130);
      })();
    }, 40);
  }

  /* أولوية المعالجة مشتقة من الفجوة نفسها — لا ترتيب اعتباطي */
  var OWNERS = { 'موعد متجاوز': 'إدارة العقود', 'التزام بلا موعد': 'الإدارة القانونية',
    'صياغة فضفاضة': 'الإدارة القانونية', 'بند مفقود': 'الإدارة القانونية', 'متطلب غير مغطى': 'إدارة الالتزام' };
  var EFFORT = { 'موعد متجاوز': 'عاجل — أيام', 'التزام بلا موعد': 'متوسط — أسبوع',
    'صياغة فضفاضة': 'منخفض — أيام', 'بند مفقود': 'متوسط — أسبوعان', 'متطلب غير مغطى': 'متوسط — أسبوعان' };

  function buildResult(res, sourceText) {
    var snap = { fp: res.fingerprint, at: Date.now(), riskScore: res.riskScore,
      gaps: res.gaps.map(function (g) { return { key: g.key, title: g.title, risk: g.risk, firstSeenAt: Date.now() }; }) };
    S.memo = buildMemo(res.fingerprint, snap);
    if (S.memo && S.memo.prevMap) {
      snap.gaps.forEach(function (g) {
        var p = S.memo.prevMap[g.key];
        if (p && p.firstSeenAt) g.firstSeenAt = p.firstSeenAt;
      });
    }
    S.history.push(snap); saveHistory();

    res.remediation = res.gaps.map(function (g) {
      return { title: g.title, action: g.recommendation, gapType: g.type, risk: g.risk,
               priority: g.severity, owner: OWNERS[g.type] || 'الإدارة القانونية', effort: EFFORT[g.type] || 'متوسط' };
    });
    res.prevRisk = S.memo ? S.memo.prevRisk : null;
    S.result = res;
  }

  /* ═══ الرئيسية ═══ */
  function renderDash() {
    var el = $('pageContent'), d = S.result;
    if (!d) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:34px 18px">' +
        '<div style="font-size:30px;margin-bottom:10px">📋</div>' +
        '<div style="font-weight:700;font-size:15px;margin-bottom:6px">ابدأ بمستند</div>' +
        '<p style="color:var(--text2);font-size:12.5px;margin-bottom:16px;line-height:1.8">ارفع عقدًا أو لائحة أو ترخيصًا. نذير يستخرج الالتزامات والمواعيد، يحسب الخطر، ويحدد ما يقع إذا مرّت المواعيد — كل ذلك داخل جهازك.</p>' +
        '<button class="btn" data-r="upload">ارفع مستندًا</button></div>';
      wire(el); return;
    }
    var near = d.preds.slice(0, 3);
    var soonest = d.preds.length ? d.preds[0].daysRemaining : null;
    var overdue = d.obligations.filter(function (o) { return o.daysRemaining !== null && o.daysRemaining < 0; }).length;
    var soon = d.obligations.filter(function (o) { return o.daysRemaining !== null && o.daysRemaining >= 0 && o.daysRemaining < 45; }).length;

    var delta = '';
    if (d.prevRisk != null && d.prevRisk !== d.riskScore) {
      var up = d.riskScore > d.prevRisk;
      delta = '<div class="delta" style="color:' + (up ? 'var(--danger)' : 'var(--success)') + '">' +
        (up ? '▲' : '▼') + ' ' + Math.abs(d.riskScore - d.prevRisk) + ' عن التحليل السابق</div>';
    }

    var html = '';
    if (S.memo) html += '<div class="memobar"><div class="h">ما تغيّر منذ آخر تحليل</div><ul>' +
      S.memo.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';

    html += '<div class="risk-hero"><div class="top">' +
      '<div style="flex:1;min-width:180px">' +
      '<div class="risk-lbl">تنبيه استباقي</div>' +
      '<div class="risk-title">نذير ينبهك بما<br><span style="color:var(--greenL)">سيحدث — قبل أن يحدث.</span></div>' +
      '<div class="risk-badges">' +
        '<span class="badge info">' + d.preds.length + ' موعد قادم' + (soonest != null ? ' · أقربها خلال ' + soonest + ' يومًا' : '') + '</span>' +
        (overdue ? '<span class="badge high">' + overdue + ' موعد متجاوز</span>' : '') +
      '</div></div>' +
      '<div style="text-align:center"><div class="risk-lbl">درجة الخطر</div>' +
      '<div class="risk-num" style="color:' + riskColor(d.riskScore) + '">' + d.riskScore + '</div>' +
      '<div style="font-size:10.5px;color:var(--text2)">محسوبة لا مقدَّرة</div>' + delta +
      '</div></div></div>';

    var present = d.clauseReport.filter(function (c) { return c.present; }).length;
    html += '<div class="kpi-grid">' +
      kpi('gaps', 'var(--warning)', d.gaps.length, 'فجوة',
          d.stats.critical + ' حرجة · ' + d.stats.medium + ' متوسطة · ' + d.stats.low + ' منخفضة') +
      kpi('risk', 'var(--green2)', present + '/' + d.clauseReport.length, 'بند معياري موجود',
          (d.clauseReport.length - present) + ' بند غائب') +
      kpi('risk', 'var(--danger)', overdue, 'موعد متجاوز', soon + ' موعد خلال ٤٥ يومًا') +
      kpi('predict', 'var(--greenL)', d.preds.length, 'موعد قادم', 'مرتّبة بالأقرب') +
      '</div>';

    html += '<div class="card"><div class="sectitle">أقرب ما يستحق</div>';
    html += near.length ? near.map(function (p) {
      return '<div class="pred-row">' +
        '<div class="pred-tag" style="color:' + sevColor(p.severity) + ';background:' + sevColor(p.severity) + '18;border:1px solid ' + sevColor(p.severity) + '30">' + p.daysRemaining + ' يوم</div>' +
        '<div><div class="t">' + esc(p.title) + '</div><div class="b">' + esc(p.consequence) + '</div></div></div>';
    }).join('') : '<div class="empty">لم يرد في المستند موعد قادم محدد التاريخ.</div>';
    html += '<div style="margin-top:12px"><button class="btn" data-r="predict">كل المواعيد ←</button></div></div>';

    html += '<div class="card"><div class="sectitle">الفجوات حسب النوع</div>' + typeBars(d.gaps) +
      '<div class="row-btns"><button class="btn ghost" data-r="gaps">الفجوات</button>' +
      '<button class="btn ghost" data-r="upload">تحليل جديد</button></div></div>';

    el.innerHTML = html; wire(el);
  }
  function kpi(route, color, v, l, s) {
    return '<button class="kpi" data-r="' + route + '" style="border-top-color:' + color + '">' +
      '<div class="v" style="color:' + color + '">' + v + '</div><div class="l">' + l + '</div><div class="s">' + esc(s) + '</div></button>';
  }
  function typeBars(gaps) {
    var map = {};
    gaps.forEach(function (g) { map[g.type] = (map[g.type] || 0) + 1; });
    var entries = Object.keys(map).map(function (k) { return [k, map[k]]; })
                    .sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) return '<div class="empty">لا توجد فجوات.</div>';
    var max = entries[0][1];
    var colors = ['var(--danger)', 'var(--warning)', 'var(--warning)', 'var(--greenL)', 'var(--success)'];
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
    el.innerHTML = '<h2 class="pagetitle">فجوات الامتثال</h2>' +
      '<p class="pagesub">' + d.gaps.length + ' فجوة — كل واحدة إمّا اقتباس حرفي من مستندك أو غياب موثّق لبند بحثنا عنه.</p>' +
      '<div class="filters" id="gapFilters">' +
      fbtn('all', 'الكل', d.gaps.length) + fbtn('critical', 'حرجة', d.stats.critical) +
      fbtn('medium', 'متوسطة', d.stats.medium) + fbtn('low', 'منخفضة', d.stats.low) +
      '</div><div id="gapList"></div>';
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
      ? '<div class="absence"><span class="lb" style="display:block;font-size:9.5px;color:var(--text3);margin-bottom:3px;font-weight:700">غياب موثّق</span>لم يرد في المستند أيٌّ من الصيغ الشائعة لهذا البند.</div>'
      : '<button type="button" class="evidence" data-q="' + esc(g.evidence) + '">' +
        '<span class="lb">' + (g.evidenceType === 'reference' ? 'من المستند المرجعي' : 'من نص مستندك — اضغط لعرض الموضع') + '</span>«' + esc(g.evidence) + '»</button>';
    return '<div class="gap-card ' + g.severity + '">' +
      '<div class="gap-head"><div><div class="gap-title">' + esc(g.title) + '</div>' +
      '<div class="gap-type">' + esc(g.type) + '</div></div>' +
      '<span class="badge ' + sevBadge(g.severity) + '">' + g.risk + '</span></div>' +
      '<div class="gap-desc">' + esc(g.description) + '</div>' + ev +
      '<div class="mathbox">احتمالية <b>' + g.probability.toFixed(2) + '</b><span class="op">×</span>' +
      'أثر <b>' + g.impact.toFixed(2) + '</b><span class="op">×</span>' +
      'عامل الزمن <b>' + g.decay.toFixed(2) + '</b>' +
      '<span class="out" style="color:' + sevColor(g.severity) + '">' + g.risk + '</span></div>' +
      '<div class="gap-rec">' + esc(g.recommendation) + '</div></div>';
  }
  function drawGaps() {
    var d = S.result;
    var list = S.gapFilter === 'all' ? d.gaps : d.gaps.filter(function (g) { return g.severity === S.gapFilter; });
    var box = $('gapList');
    box.innerHTML = list.length ? list.map(gapCard).join('') : '<div class="empty">لا توجد فجوات في هذا التصنيف.</div>';
    var evs = box.querySelectorAll('.evidence');
    for (var i = 0; i < evs.length; i++) {
      (function (e) { e.addEventListener('click', function () { openViewer(e.dataset.q); }); })(evs[i]);
    }
  }

  /* ═══ المخاطر ═══ */
  function renderRisk() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('المخاطر', 'لا يوجد تحليل بعد.'); return; }

    var html = '<h2 class="pagetitle">تقييم المخاطر</h2>' +
      '<p class="pagesub">كل رقم هنا ناتج معادلة معلنة، ويمكنك تتبّعه إلى الجملة التي أنتجته.</p>' +
      '<div class="card" style="text-align:center">' +
      '<div class="risk-lbl" style="letter-spacing:1px">درجة الخطر الكلية</div>' +
      '<div style="font-size:52px;font-weight:900;color:' + riskColor(d.riskScore) + '">' + d.riskScore + '</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">' +
        (d.riskScore >= 66 ? 'مرتفع' : d.riskScore >= 33 ? 'متوسط' : 'منخفض') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px">' +
      sevBox(d.stats.critical, 'حرجة', 'var(--danger)') + sevBox(d.stats.medium, 'متوسطة', 'var(--warning)') +
      sevBox(d.stats.low, 'منخفضة', 'var(--success)') + '</div></div>';

    html += '<div class="card"><div class="sectitle">كيف تُحسب الدرجة</div><div class="rubric">' +
      'خطر البند = <b style="color:var(--text)">احتمالية × أثر × عامل الزمن × 100</b>. ' +
      'والدرجة الكلية = <b style="color:var(--text)">٦٠٪ من أعلى بند + ٤٠٪ من الجذر التربيعي لمتوسط المربّعات</b> — ' +
      'الحدّ الأعلى يمنع بندًا حرجًا واحدًا من أن تبتلعه بنود هادئة.' +
      '<table><tr><td>الاحتمالية تأتي من حالة الموعد</td><td>متجاوز 0.95 · &lt;٧ي 0.75 · &lt;٣٠ي 0.55 · &lt;٩٠ي 0.35 · أبعد 0.20 · بلا موعد 0.50</td></tr>' +
      '<tr><td>الأثر يأتي من الجزاء المنصوص</td><td>فسخ/سحب 1.00 · غرامة محددة 0.85 · غرامة عامة 0.70 · إنذار 0.40 · بلا جزاء 0.35</td></tr>' +
      '<tr><td>عامل الزمن يضاعف قرب الموعد</td><td>متجاوز ×1.60 · &lt;٧ي ×1.45 · &lt;١٤ي ×1.30 · &lt;٣٠ي ×1.15 · &lt;٩٠ي ×1.00 · أبعد ×0.85</td></tr>' +
      '</table></div></div>';

    html += '<div class="card"><div class="sectitle">البنود المعيارية (' +
      d.clauseReport.filter(function (c) { return c.present; }).length + '/' + d.clauseReport.length + ')</div><div class="clause-grid">' +
      d.clauseReport.map(function (c) {
        return '<div class="clause ' + (c.present ? 'ok' : 'miss') + '"><span class="mk">' + (c.present ? '✓' : '!') + '</span>' + esc(c.title) + '</div>';
      }).join('') + '</div></div>';

    if (d.coverage) {
      html += '<div class="card"><div class="sectitle">التغطية مقابل المرجع — ' + d.coverage.score + '٪</div>' +
        '<p style="font-size:11px;color:var(--text3);line-height:1.8;margin:0 0 10px">تطابق لفظي بين متطلبات المرجع وبنود مستندك، لا رأيًا قانونيًا. النسبة تقيس التغطية الظاهرة فقط.</p>' +
        d.coverage.requirements.map(function (r) {
          return '<div style="padding:9px 0;border-bottom:1px solid var(--border)">' +
            '<div style="display:flex;gap:8px;justify-content:space-between;align-items:flex-start">' +
            '<div style="font-size:12px;line-height:1.7;flex:1">' + esc(r.requirement) + '</div>' +
            '<span class="badge ' + (r.met ? 'low' : 'med') + '">' + r.score + '٪</span></div>' +
            (r.matched ? '<div style="font-size:11px;color:var(--text3);margin-top:5px;line-height:1.7">يقابله: «' + esc(r.matched.slice(0, 140)) + '»</div>' : '') +
            '</div>';
        }).join('') + '</div>';
    }

    html += '<div class="card"><div class="sectitle">الالتزامات والمواعيد المستخرجة (' + d.obligations.length + ')</div>';
    html += d.obligations.length ? d.obligations.map(function (o) {
      var c = o.daysRemaining == null ? 'var(--text3)' : o.daysRemaining < 0 ? 'var(--danger)'
            : o.daysRemaining < 14 ? 'var(--danger)' : o.daysRemaining < 45 ? 'var(--warning)' : 'var(--success)';
      return '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
        '<div style="font-size:12.5px;line-height:1.7;flex:1">' + esc(o.quote.slice(0, 220)) + (o.quote.length > 220 ? '…' : '') + '</div>' +
        '<span class="badge" style="background:' + c + '18;color:' + c + ';border:1px solid ' + c + '30">' + o.urgency + '</span></div>' +
        '<div style="font-size:10.5px;color:var(--text3);margin-top:4px">' +
        esc(o.rawDeadline || 'بلا موعد صريح') +
        (o.deadlineTS ? ' → ' + new Date(o.deadlineTS).toISOString().slice(0, 10) +
          (o.approxDate ? ' (هجري تقريبي ±يوم)' : '') + ' · ' + o.daysRemaining + ' يومًا' : '') +
        (o.party ? ' · ' + esc(o.party) : '') + ' · ' + esc(o.penalty) + '</div></div>';
    }).join('') : '<div class="empty">لم تُرصد صيغ إلزام في هذا المستند.</div>';
    html += '<div style="margin-top:12px"><button class="btn" data-r="remed">خطة المعالجة ←</button></div></div>';

    el.innerHTML = html; wire(el);
  }
  function sevBox(n, l, c) {
    return '<div style="background:' + c + '18;border-radius:10px;padding:11px">' +
      '<div style="font-size:20px;font-weight:900;color:' + c + '">' + n + '</div>' +
      '<div style="font-size:10.5px;color:var(--text2)">' + l + '</div></div>';
  }

  /* ═══ المعالجة ═══ */
  function renderRemed() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('المعالجة', 'لا يوجد تحليل بعد.'); return; }
    var html = '<h2 class="pagetitle">خطة المعالجة</h2>' +
      '<p class="pagesub">كل إجراء مشتق من فجوة بعينها ويحمل درجتها — الترتيب بالخطر الفعلي.</p>';
    html += d.remediation.length ? d.remediation.map(function (r) {
      return '<div class="remed-item"><div class="hdr"><div class="ttl">' + esc(r.title) + '</div>' +
        '<span class="badge ' + sevBadge(r.priority) + '">أولوية ' + sevLabel(r.priority) + ' · ' + r.risk + '</span></div>' +
        '<div class="remed-action">' + esc(r.action) + '</div><div class="remed-meta">' +
        '<div><div class="l">الجهة المقترحة</div><div class="v">' + esc(r.owner) + '</div></div>' +
        '<div><div class="l">الجهد التقديري</div><div class="v" style="color:var(--warning)">' + esc(r.effort) + '</div></div>' +
        '</div></div>';
    }).join('') : '<div class="card"><div class="empty">لا توجد فجوات تستدعي معالجة.</div></div>';
    html += '<div class="row-btns"><button class="btn ghost" data-r="predict">المواعيد</button>' +
      '<button class="btn" data-r="report">التقرير ←</button></div>';
    el.innerHTML = html; wire(el);
  }

  /* ═══ المواعيد القادمة ═══ */
  function renderPredict() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('المواعيد', 'لا يوجد تحليل بعد.'); return; }
    var html = '<h2 class="pagetitle">ماذا سيستحق</h2>' +
      '<p class="pagesub">كل بند مربوط بالتزام وتاريخ مستخرجين من نصك. عدد الأيام محسوب من تاريخ اليوم.</p>';
    if (!d.preds.length) {
      el.innerHTML = html + '<div class="card"><div class="empty">لم يرد في المستند موعد قادم محدد التاريخ.</div></div>';
      return;
    }
    var days = d.preds.map(function (p) { return p.daysRemaining; });
    var maxD = Math.max(90, Math.max.apply(null, days));
    html += '<div class="timeline">';
    [7, 14, 30, 60, 90, 180, 365].filter(function (m) { return m <= maxD; }).forEach(function (m) {
      html += '<div class="tl-mark" style="right:' + (m / maxD * 100) + '%"><span>' + m + ' يوم</span></div>';
    });
    d.preds.forEach(function (p) {
      var pct = Math.max(0, Math.min(99, p.daysRemaining / maxD * 100));
      html += '<div class="tl-dot" style="right:' + pct + '%;background:' + sevColor(p.severity) + '"></div>';
    });
    html += '</div>';

    html += d.preds.map(function (p) {
      return '<div class="pred-card">' +
        '<div class="pred-days"><div class="n" style="color:' + sevColor(p.severity) + '">' + p.daysRemaining + '</div>' +
        '<div class="u">يومًا</div></div><div class="pred-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
        '<div class="pred-title2">' + esc(p.title) + '</div><span class="badge ' + sevBadge(p.severity) + '">' + p.risk + '</span></div>' +
        '<div class="pred-trigger">الموعد: ' + esc(p.trigger) + ' → ' + p.deadlineISO +
          (p.approxDate ? ' (هجري تقريبي ±يوم)' : '') + '</div>' +
        '<div class="pred-cons"><b>ما يترتب:</b> ' + esc(p.consequence) + '</div>' +
        '<button type="button" class="evidence" data-q="' + esc(p.evidence) + '">' +
        '<span class="lb">من نص مستندك — اضغط لعرض الموضع</span>«' + esc(p.evidence.slice(0, 200)) + '»</button>' +
        '<div class="pred-rec">' + esc(p.recommendation) + '</div></div></div>';
    }).join('');
    html += '<button class="btn" data-r="report" style="margin-top:6px">التقرير ←</button>';
    el.innerHTML = html; wire(el);
    var evs = el.querySelectorAll('.evidence');
    for (var i = 0; i < evs.length; i++) {
      (function (e) { e.addEventListener('click', function () { openViewer(e.dataset.q); }); })(evs[i]);
    }
  }

  /* ═══ التقرير ═══ */
  function renderReport() {
    var el = $('pageContent'), d = S.result;
    if (!d) { emptyPage('التقرير', 'لا يوجد تحليل بعد.'); return; }
    var present = d.clauseReport.filter(function (c) { return c.present; }).length;
    var total = d.stats.critical + d.stats.medium + d.stats.low;
    var html = '<div class="report-head">' +
      '<div class="rh-top">نذير · ' + new Date().toISOString().slice(0, 10) + '</div>' +
      '<h3>التقرير التنفيذي</h3><p>مبني على نص مستندك، بأرقام محسوبة لا مقدَّرة</p>' +
      '<div class="report-stats">' +
      rstat(d.coverage ? d.coverage.score + '٪' : present + '/' + d.clauseReport.length, d.coverage ? 'التغطية' : 'بنود معيارية') +
      rstat(d.gaps.length, 'الفجوات') + rstat(d.preds.length, 'مواعيد قادمة') + rstat(d.riskScore, 'الخطر') +
      '</div></div>';

    html += '<div class="card"><div class="sectitle">توزيع الخطورة</div>' +
      barrow('حرجة', total ? d.stats.critical / total * 100 : 0, d.stats.critical, 'var(--danger)') +
      barrow('متوسطة', total ? d.stats.medium / total * 100 : 0, d.stats.medium, 'var(--warning)') +
      barrow('منخفضة', total ? d.stats.low / total * 100 : 0, d.stats.low, 'var(--success)') + '</div>';

    html += '<div class="card"><div class="sectitle">الخلاصة</div>' +
      '<div style="font-size:13px;line-height:1.95;color:var(--text2)">' + esc(summary(d)) + '</div></div>';

    html += '<div class="card"><div class="sectitle">حدود هذا التحليل</div>' +
      '<div style="font-size:11.5px;color:var(--text3);line-height:1.9">' +
      '• التحليل قائم على قواعد لغوية وتقويمية، لا على رأي قانوني — وهو مساعد للمراجع البشري لا بديل عنه.<br>' +
      '• صيغ الإلزام تُرصد بألفاظها؛ التزام مصاغ بأسلوب غير معتاد قد لا يُرصد.<br>' +
      '• التواريخ الهجرية تُحوَّل بالتقويم المدني وقد تفارق تقويم أم القرى بيوم.<br>' +
      '• «التغطية» تطابق لفظي بين نصّين، لا حكم على كفاية البند.</div></div>';

    html += '<div class="quote">"نذير لا يخبرك بما حدث — بل ينبهك لما سيحدث قبل أن يتحول إلى مخالفة."</div>';
    html += '<div class="row-btns"><button class="btn ghost" data-r="dash">الرئيسية</button>' +
      '<button class="btn" id="dlBtn">تنزيل التقرير</button></div>';
    el.innerHTML = html; wire(el);
    $('dlBtn').addEventListener('click', download);
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
    s += 'درجة الخطر الكلية ' + d.riskScore + ' من 100 (' +
      (d.riskScore >= 66 ? 'مرتفعة' : d.riskScore >= 33 ? 'متوسطة' : 'منخفضة') + ').';
    return s;
  }

  function emptyPage(title, msg) {
    var el = $('pageContent');
    el.innerHTML = '<h2 class="pagetitle">' + title + '</h2>' +
      '<div class="card" style="text-align:center;padding:30px 16px">' +
      '<p style="color:var(--text2);font-size:12.5px;margin-bottom:14px">' + msg + '</p>' +
      '<button class="btn" data-r="upload">ارفع مستندًا</button></div>';
    wire(el);
  }

  function download() {
    var d = S.result; if (!d) return;
    var t = 'تقرير نذير — ' + new Date().toISOString().slice(0, 10) + '\n' + Array(46).join('=') + '\n\n';
    t += summary(d) + '\n\n';
    t += 'درجة الخطر: ' + d.riskScore + '/100\n';
    if (d.coverage) t += 'التغطية مقابل المرجع: ' + d.coverage.score + '%\n';
    t += 'البنود المعيارية: ' + d.clauseReport.filter(function (c) { return c.present; }).length + '/' + d.clauseReport.length + '\n';

    t += '\n--- الالتزامات والمواعيد ---\n';
    d.obligations.forEach(function (o, i) {
      t += (i + 1) + '. [' + o.risk + ' · ' + o.urgency + '] ' + o.quote.replace(/\s+/g, ' ') + '\n' +
        '   الموعد: ' + (o.rawDeadline || '—') +
        (o.deadlineTS ? ' → ' + new Date(o.deadlineTS).toISOString().slice(0, 10) + ' (' + o.daysRemaining + ' يومًا)' : '') +
        ' | الجزاء: ' + o.penalty + '\n\n';
    });
    t += '--- الفجوات ---\n';
    d.gaps.forEach(function (g, i) {
      t += (i + 1) + '. [' + g.risk + ' · ' + sevLabel(g.severity) + '] ' + g.type + ' — ' + g.title + '\n' +
        '   ' + g.description + '\n' +
        '   ' + (g.evidenceType === 'absence' ? 'الدليل: غياب موثّق (لم يرد أيٌّ من صيغ هذا البند)' :
                 'الاقتباس: «' + g.evidence.replace(/\s+/g, ' ') + '»') + '\n' +
        '   التوصية: ' + g.recommendation + '\n\n';
    });
    t += '--- البنود المعيارية ---\n';
    d.clauseReport.forEach(function (c) { t += (c.present ? '[✓] ' : '[ ] ') + c.title + '\n'; });
    if (d.coverage) {
      t += '\n--- التغطية مقابل المرجع ---\n';
      d.coverage.requirements.forEach(function (r) { t += (r.met ? '[✓] ' : '[ ] ') + '(' + r.score + '%) ' + r.requirement.replace(/\s+/g, ' ') + '\n'; });
    }
    t += '\n--- خطة المعالجة ---\n';
    d.remediation.forEach(function (r, i) {
      t += (i + 1) + '. [' + r.risk + '] ' + r.title + '\n   ' + r.action + '\n   الجهة: ' + r.owner + ' · الجهد: ' + r.effort + '\n\n';
    });
    t += '\nملاحظة: تحليل آلي قائم على قواعد، مساعد للمراجعة البشرية لا بديل عنها.\n';

    var url = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/plain;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'nadheer-report-' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ═══ التشغيل ═══ */
  $('burgerBtn').addEventListener('click', function () { $('navOverlay').classList.add('open'); });
  $('navScrim').addEventListener('click', closeOverlays);
  $('brandHome').addEventListener('click', function () { go('dash'); });
  $('viewScrim').addEventListener('click', closeOverlays);
  $('viewClose').addEventListener('click', closeOverlays);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlays(); });
  var nl = document.querySelectorAll('.navlink');
  for (var i = 0; i < nl.length; i++) {
    (function (l) { l.addEventListener('click', function () { go(l.dataset.r); }); })(nl[i]);
  }
  loadHistory();
  go('dash');
})();
