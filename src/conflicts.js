/* نذير — كشف التعارض وإصدار التعديلات.
   يرصد بندًا في سياستك يفعل ما يمنعه المرجع (أو العكس)، ويولّد مسودة
   بند بديل ومسودة تعميم. القوالب حتمية ولا نموذج لغوي هنا — والمسودة
   تُحرَّر وتُعتمد بشريًا قبل الإصدار. */
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { E: require('./engine.js'), NC: require('./config.js') }
    : { E: root.NadheerEngine, NC: root.NadheerConfig };
  var api = factory(deps.E, deps.NC);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerConflicts = api;
})(typeof self !== 'undefined' ? self : this, function (E, NC) {
  'use strict';

  var MONEY = /(\d[\d,\.]*)\s*(ريال|ر\.س|sar|درهم|دولار)/;
  var TOPK = 6;

  function cfgOf(c) { return NC.merge(NC.DEFAULTS, c || null); }

  /* هل الجملة تمنع؟ هل تفرض؟ الجملة التي تمنع لا تُعدّ فارضة ولو ورد فيها
     لفظ الرسوم — «لا يجوز فرض رسوم» منعٌ لا فرض. */
  function classify(normSentence, C) {
    var prohibits = E.hasAny(normSentence, C.proh);
    var imposes   = E.hasAny(normSentence, C.imp);
    var permits   = E.hasAny(normSentence, C.perm);
    var requires  = E.hasAny(normSentence, C.req);
    return {
      prohibits: !!prohibits, prohibitTerm: prohibits,
      // «يجوز» داخل «لا يجوز» ليست إباحة، فالمنع يلغيهما معًا
      imposes: !!imposes && !prohibits, imposeTerm: imposes,
      permits: !!permits && !prohibits, permitTerm: permits,
      requires: !!requires && !prohibits
    };
  }

  /* الموضوع المشترك يُقاس بأميز الكلمات (الأندر في المرجع) بعد التجذير */
  function topicScore(needStems, hayStems, idf) {
    var total = needStems.reduce(function (a, w) { return a + idf(w); }, 0);
    if (!total) return 0;
    var hit = needStems.reduce(function (a, w) { return a + (hayStems.indexOf(w) > -1 ? idf(w) : 0); }, 0);
    return hit / total;
  }

  /* ما الذي يُفرض؟ نأخذ ما بين لفظ الفرض وبداية المبلغ. */
  function subjectOf(rawSentence) {
    var t = rawSentence.replace(/\s+/g, ' ').trim();
    var pm = t.match(/(?:يجوز|تجوز|يحق|يُسمح|يسمح|يمكن)\s+(?:ل[^\s]+\s+)?(.{4,110}?)(?=\s*(?:متى|إذا|بعد|وفق|حسب|،|\.|$))/);
    if (pm) return pm[1].trim();
    var m = t.match(/(?:تفرض|تُفرض|يفرض|يُفرض|يُحصَّل|تُحصّل|يحصل|تستوفي|تُستوفى|يُستوفى)\s+(.{4,120}?)(?=\s*(?:بمبلغ|بقيمة|قدره|قدرها|مقدارها|بواقع|\d|،|\.|$))/);
    if (m) return m[1].trim();
    var f = t.match(/((?:رسوم|رسم|عمولة|أجور|مقابل مالي)[^،\.]{0,90})/);
    return f ? f[1].trim() : 'الرسوم الواردة في هذا البند';
  }
  /* «مقابل مالي عن إصدار الكشف» → «إصدار الكشف»، وإلا خرجت الصياغة
     «لا تُفرض ... على عن إصدار» بحرفَي جر متتاليين. */
  function coreOf(subject) {
    var c = subject.replace(/^(رسوم|رسم|عمولة|عمولات|أجور|مقابل مالي|تعرفة)\s*/, '').trim();
    c = c.replace(/^(عن|على|من|في|لـ|ل)\s+/, '').trim();
    return c || subject;
  }
  function amountOf(rawSentence) {
    var m = rawSentence.replace(/\s+/g, ' ').match(MONEY);
    return m ? m[0].trim() : null;
  }
  /* رقم المادة إن ذُكر، ليُشار إليه في التعميم */
  /* نحافظ على صيغة المادة كما وردت: «المادة (2)» تبقى بقوسين،
     و«المادة الثالثة» تبقى بلا قوسين. */
  function articleOf(rawSentence) {
    var t = rawSentence.replace(/\s+/g, ' ');
    var paren = t.match(/الماد[هة]\s*\(\s*([^\)]{1,14})\s*\)/);
    if (paren) return 'المادة (' + paren[1].trim() + ')';
    var word = t.match(/الماد[هة]\s+([^\s:،\.]{2,14})/);
    return word ? 'المادة ' + word[1].trim() : null;
  }

  /* ═══════════ التعارض الحدّي ═══════════
     أشيع تعارض في الواقع ليس «ممنوع مقابل مفروض»، بل رقمان متعارضان على
     الموضوع نفسه: المرجع «خلال ٢٤ ساعة» وسياستك «خلال ٥ أيام»، أو المرجع
     «لا تقل عن ١٢ شهراً» وسياستك «٦ أشهر». نستخرج المقدار واتجاه القيد،
     ثم نقارن. */

  /* GATE عتبةُ تعريف لا حدُّ التزام: «يُعد الإسناد جوهرياً إذا تجاوزت
     قيمته مليونين» بوابةُ دخولٍ إلى النطاق. خفضُها يوسّع النطاق فيكون
     أشدّ — عكس الحدّ تمامًا. لولا تمييزها لعُدّ كل تعريفٍ أوسع مخالفةً. */
  var DIR = { MAX: 'حد أعلى', MIN: 'حد أدنى', EXACT: 'قيمة محددة', GATE: 'عتبة تعريف' };

  /* «إذا تجاوزت/زادت/بلغت» تدل على بوابة لا على سقف */
  var GATE_CUE = /(?:اذا|ان|متي)\s+(?:\S+\s+){0,2}(?:تجاوز|يتجاوز|تجاوزت|زاد|زادت|بلغ|بلغت|يزيد|تزيد|فاق|فاقت)/;

  function dirCues(raw) {
    return {
      max: E.normList(raw.max), min: E.normList(raw.min),
      notice: E.normList(raw.notice), recur: E.normList(raw.recur || [])
    };
  }

  /* «كل» وحدها تبتلع «لكل عقد» و«الكلّ»، فلا تُقرأ دوريةً إلا ملاصقةً
     لوحدة زمن: «كل ستة أشهر»، «كل سنة».
     الحدُّ يسبقها فراغًا أو بدايةَ نص — لا \b، فهو في JS معرَّفٌ على
     [A-Za-z0-9_] ولا يقع بين حرفٍ عربي وفراغ، فيموت النمط صامتًا.
     والوحدة تُذكر بجموعها: «ستة أشهر» لا يطابقها جذر «شهر» وحده. */
  var UNIT = '(?:ساع|يوم|ايام|اسبوع|اسابيع|شهر|اشهر|شهور|سن|عام|اعوام|ربع|نصف)';
  /* حتى كلمتان بين «كل» ووحدتها، ليسع العدد المركّب: «كل اثني عشر شهراً» */
  var RECUR_KUL = new RegExp('(?:^|[\\s،؛\\(])كل\\s+(?:\\S+\\s+){0,2}' + UNIT);

  /* «كل اثني عشر شهراً» تكتنف المقدارَ نفسه: «كل» قبله ووحدتُه بعده.
     فحصُ النافذتين منفصلتين لا يراها أبدًا — لا بد من مقطعٍ يمتدّ عبر
     المقدار. */
  function isRecurring(before, after, span, cues) {
    return E.hasAny(before, cues.recur) || E.hasAny(after, cues.recur) ||
           RECUR_KUL.test(span);
  }

  /* اتجاه القيد يُقرأ مما يسبق المقدار مباشرة */
  function directionOf(norm, at, end, cues, kind, isDef) {
    var before = norm.slice(Math.max(0, at - 34), at);
    var after = norm.slice(end, end + 22);

    // في جملة تعريفٍ تكون العتبة بوابةَ نطاق لا سقفَ التزام
    if (isDef && GATE_CUE.test(norm.slice(Math.max(0, at - 60), at))) return DIR.GATE;

    /* دورية التكرار تقلب المعنى: «مراجعة مرة واحدة سنوياً على الأقل» تعني
       أن الفاصل بين المراجعتين سنةٌ على الأكثر — فمراجعةٌ كل ستة أشهر
       التزامٌ لا مخالفة. بلا هذا الاستثناء يُقرأ «على الأقل» حدًّا أدنى
       على المدة نفسها فتخرج إيجابية كاذبة.
       والدورية وصفٌ للزمن وحده: مبلغٌ أو نسبةٌ لا يكونان فاصلًا بين مرّتين،
       فلا يقلبهما جوارُ لفظ التكرار. */
    if (kind === 'مدة' &&
        isRecurring(before, after, norm.slice(Math.max(0, at - 34), end + 22), cues)) return DIR.MAX;

    if (E.hasAny(before, cues.min)) return DIR.MIN;
    if (E.hasAny(before, cues.notice)) return DIR.MIN;   // «قبل ثلاثين يوماً» مهلة إشعار
    if (E.hasAny(before, cues.max)) return DIR.MAX;
    // الإشارة قد تلحق المقدار: «خلال ثلاثين يوماً كحد أقصى»
    if (E.hasAny(after, cues.min)) return DIR.MIN;
    if (E.hasAny(after, cues.max)) return DIR.MAX;

    /* قد يفصل بين الإشارة ومقدارها وصفٌ طويل: «لا يقل الضمان البنكي
       المطلوب من مزود الخدمة عن 100000 ريال». النافذة الضيقة تفوّته،
       فنوسّعها بعد أن تخيب — والضيقة تُفحص أولًا حتى لا يسرق مقدارٌ
       إشارةَ مقدارٍ قبله في الجملة نفسها. */
    var wide = norm.slice(Math.max(0, at - 90), at);
    if (E.hasAny(wide, cues.min)) return DIR.MIN;
    if (E.hasAny(wide, cues.max)) return DIR.MAX;
    return DIR.EXACT;
  }

  var PCT_G = /(\d[\d\.]*)\s*(?:٪|%)/g;

  /* المبالغ تُكتب بالرقم («25 ريالاً») وبالحرف («عشرة ريالات»)، والثانية
     شائعة في النصوص النظامية. بلا دعمها يمرّ سقف الرسوم بلا كشف. */
  var MONEY_RE = null;
  function moneyRegex() {
    if (MONEY_RE) return MONEY_RE;
    var words = Object.keys(E.NUM_WORDS)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    // «ريالات» قبل «ريال»: البدائل تُجرَّب بالترتيب، فالأقصر يبتلع الأطول.
    MONEY_RE = new RegExp('(\\d[\\d,\\.]*|' + words.join('|') +
      ')\\s*(ريالات|ريالاً|ريالا|ريال|ر\\.س|sar|دراهم|درهم|دولارات|دولار)', 'g');
    return MONEY_RE;
  }
  function moneyValue(tok) {
    var n = parseFloat(String(tok).replace(/,/g, ''));
    if (isFinite(n)) return n;
    return E.NUM_WORDS[tok] !== undefined ? E.NUM_WORDS[tok] : null;
  }

  /* كل المقادير في نطاق جملة: مدة (بالساعات) أو مبلغ أو نسبة */
  function quantities(norm, a, b, cues, isDef) {
    var out = [], m;
    E.findDurations(norm).forEach(function (d) {
      if (d.s < a || d.e > b) return;
      out.push({ kind: 'مدة', base: d.days * 24, unit: 'ساعة',
                 s: d.s, e: d.e, dir: directionOf(norm, d.s, d.e, cues, 'مدة', isDef) });
    });
    var seg = norm.slice(a, b), mre = moneyRegex();
    mre.lastIndex = 0;
    while ((m = mre.exec(seg))) {
      var val = moneyValue(m[1]);
      if (val === null) continue;
      out.push({ kind: 'مبلغ', base: val, unit: 'عملة',
                 s: a + m.index, e: a + m.index + m[0].length,
                 dir: directionOf(norm, a + m.index, a + m.index + m[0].length, cues, 'مبلغ', isDef) });
    }
    PCT_G.lastIndex = 0;
    while ((m = PCT_G.exec(seg))) {
      out.push({ kind: 'نسبة', base: parseFloat(m[1]), unit: '٪',
                 s: a + m.index, e: a + m.index + m[0].length,
                 dir: directionOf(norm, a + m.index, a + m.index + m[0].length, cues, 'نسبة', isDef) });
    }
    return out;
  }

  /* هل قيمة سياستك تخالف قيد المرجع؟ */
  function violates(refQ, docQ) {
    var r = refQ.base, d = docQ.base;
    if (refQ.dir === DIR.MAX)   return d > r ? 'سياستك تتجاوز الحد الأعلى' : null;
    if (refQ.dir === DIR.MIN)   return d < r ? 'سياستك دون الحد الأدنى' : null;
    if (refQ.dir === DIR.EXACT) return d !== r ? 'القيمة تخالف المنصوص' : null;
    /* البوابة تعمل بالمقلوب: عتبةٌ أعلى تُخرج حالاتٍ يشملها المرجع،
       وأخفضُ منها يوسّع النطاق فيكون أشدّ لا مخالفًا. */
    if (refQ.dir === DIR.GATE) return d > r ? 'عتبة تعريفك أعلى فتُخرج حالات يشملها المرجع' : null;
    return null;
  }

  /* ═══════════ ما بعد المقدار ═══════════
     التعارض الحدّي يحتاج رقمين متقابلين، وتعارض الفعل يحتاج لفظ منعٍ
     مقابل فرضٍ أو إباحة. وأخطر ما يمرّ بينهما تعارضٌ لا رقم فيه ولا لفظ
     منع: نطاقٌ يُضيَّق، وتعريفٌ يُقيَّد، وترتيبٌ يُقلَب، والتزامٌ يبقى
     لفظًا ويُفرَّغ حكمًا. القواعد الأربع التالية تغطيها. */

  /* ما بعد لفظ الإدخال/الإخراج هو الجهة المقصودة. نقطعها عند أول فاصل
     لأن «بما فيها الشركات التابعة، وتسري من تاريخه» جهةٌ واحدة لا اثنتان. */
  function entityAfter(norm, terms) {
    for (var i = 0; i < terms.length; i++) {
      var at = norm.indexOf(terms[i]);
      if (at < 0) continue;
      var tail = norm.slice(at + terms[i].length, at + terms[i].length + 80);
      var cut = tail.split(/[،؛\.\n]/)[0];
      var ws = E.contentWords(cut);
      if (ws.length) return { term: terms[i], words: ws, text: cut.trim() };
    }
    return null;
  }

  /* التداخل يُقاس على الأصغر: «الشركات التابعة» داخل «الشركات التابعة
     والفروع الخارجية» هي الجهة نفسها. */
  function overlap(a, b) {
    if (!a.length || !b.length) return 0;
    var hit = a.filter(function (w) { return b.indexOf(w) > -1; }).length;
    return hit / Math.min(a.length, b.length);
  }

  /* المصطلح المعرَّف يقع بين لفظ التعريف وبداية جسم التعريف. نأخذه من
     بين قوسي اقتباس إن وُجدا، وإلا فما قبل أداة الشرط أو الرابطة.
     القطع لازم: بلا حدٍّ يبتلع المصطلحُ جسمَ التعريف كله، فيصير تعريفان
     لمصطلحٍ واحد بلا تداخل — وهما في الحقيقة المصطلح نفسه. */
  /* لا نستعمل \b هنا: حدُّ الكلمة في JS معرَّفٌ على [A-Za-z0-9_] وحدها،
     فكل حرفٍ عربي «غير كلمة» عنده ولا يقع بينه وبين الفراغ حدّ — فالنمط
     لا يطابق شيئًا أبدًا. النظرةُ الأمامية للفراغ تقوم مقامه. */
  var DEF_STOP = /\s+(?:اذا|اذ|انه|بانه|هو|هي|كل|التي|الذي|ما|عندما|متي|حين|في حال|كلما)(?=\s|$)/;

  function definedTerm(norm, markers) {
    for (var i = 0; i < markers.length; i++) {
      var at = norm.indexOf(markers[i]);
      if (at < 0) continue;
      var tail = norm.slice(at + markers[i].length, at + markers[i].length + 70);
      var q = tail.match(/^\s*[«"']([^»"']{2,40})[»"']/);
      var termText = q ? q[1] : tail.split(DEF_STOP)[0];
      // المصطلح اسمٌ لا جملة: خمس كلمات سقفًا
      var ws = E.contentWords(String(termText).split(/[،؛\.\n:]/)[0]).slice(0, 5);
      if (ws.length) {
        return { marker: markers[i], words: ws, at: at,
                 body: norm.slice(at, at + 260) };
      }
    }
    return null;
  }

  /* الترتيب: أقربُ مرساةٍ إلى لفظ «قبل» أو «بعد» هي التي يصفها. بلا هذا
     القيد تلتقط جملةٌ فيها «قبل التوقيع» و«بعد الإصدار» ترتيبين متضاربين
     من نفسها. */
  /* «التوقيع» و«توقيع» مرساةٌ واحدة: بلا تجريد الألف واللام يخرج ترتيبان
     مختلفان عن الحدث نفسه فلا يلتقيان أبدًا. */
  var bareAnchor = function (a) { return a.replace(/^ال/, ''); };

  function ordering(norm, seq) {
    var best = null;
    [['before', seq.before], ['after', seq.after]].forEach(function (pair) {
      pair[1].forEach(function (rel) {
        var from = 0, at;
        while ((at = norm.indexOf(rel, from)) > -1) {
          from = at + 1;
          // «قبل ثلاثين يوماً من التوقيع» ترتيبٌ أيضًا، فنمدّ نافذة البحث
          var win = norm.slice(at + rel.length, at + rel.length + 46);
          seq.anchors.forEach(function (anc) {
            var d = win.indexOf(anc);
            if (d < 0) return;
            if (!best || d < best.dist) {
              best = { rel: pair[0], relTerm: rel,
                       anchor: bareAnchor(anc), dist: d };
            }
          });
        }
      });
    });
    return best;
  }

  var fmtQ = function (q, norm) { return norm.slice(q.s, q.e).trim(); };

  /* التطبيع يحذف التشكيل، فالخريطة تقف عند آخر حرف أصلي وتترك «ً» خارجه.
     نمدّ المقطع ليشمل ما يلحقه من تشكيل حتى يخرج «يوماً» لا «يوما». */
  function origSpan(text, map, s0, e0) {
    var a = map[s0], b = map[Math.min(e0, map.length) - 1] + 1;
    while (b < text.length && /[\u064B-\u0652\u0640]/.test(text[b])) b++;
    return text.slice(a, b);
  }

  function detect(opts) {
    var raw = cfgOf(opts.config);
    var C = {
      proh: E.normList(raw.conflict.prohibitions),
      imp:  E.normList(raw.conflict.impositions),
      perm: E.normList(raw.conflict.permissions),
      req:  E.normList(raw.deontic)
    };
    var minScore = raw.conflict.minTopicScore;

    var dn = E.normMap(opts.docText || ''), rn = E.normMap(opts.refText || '');
    if (!rn.norm.trim() || !dn.norm.trim()) return { conflicts: [], reason: 'no-ref' };

    var dS = E.splitSentences(dn.norm), rS = E.splitSentences(rn.norm);
    var quote = function (map, text, s) {
      return text.slice(map[s.start], map[Math.min(s.end, map.length) - 1] + 1).trim();
    };

    // الندرة تُقاس على المرجع نفسه — الكلمة الغائبة عن سياستك ليست «مميزة»
    var refSets = rS.map(function (s) { return E.contentWords(s.text); });
    var df = {};
    refSets.forEach(function (ws) {
      var once = {};
      ws.forEach(function (w) { if (!once[w]) { once[w] = 1; df[w] = (df[w] || 0) + 1; } });
    });
    var N = Math.max(1, refSets.length);
    var idf = function (w) { return Math.log(1 + N / (1 + (df[w] || 0))); };

    var docSets = dS.map(function (s) { return E.contentWords(s.text); });
    var docCls = dS.map(function (s) { return classify(s.text, C); });
    var cues = dirCues(raw.conflict.direction);
    var out = [];

    /* جملةُ التعريف تُعلَّم قبل القاعدة الحدّية: مقاديرها بوابات نطاق
       لا حدود التزام، فتُقرأ بعكس اتجاهها. */
    var DF = {
      mk: E.normList(raw.conflict.definition.markers),
      uni: E.normList(raw.conflict.definition.universals)
    };
    var rIsDef = rS.map(function (s) { return !!definedTerm(s.text, DF.mk); });
    var dIsDef = dS.map(function (s) { return !!definedTerm(s.text, DF.mk); });

    /* ── القاعدة (ج): تعارض حدّي ── */
    rS.forEach(function (rs, ri) {
      var refQs = quantities(rn.norm, rs.start, rs.end, cues, rIsDef[ri]);
      if (!refQs.length) return;
      var need = refSets[ri].slice().sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
      if (!need.length) return;

      dS.forEach(function (ds, di) {
        var score = topicScore(need, docSets[di], idf);
        if (score < minScore) return;
        var docQs = quantities(dn.norm, ds.start, ds.end, cues, dIsDef[di]);
        if (!docQs.length) return;

        /* الاقتران بالترتيب لا بالضرب الديكارتي: جملة تحمل «الإبلاغ خلال
           ٢٤ ساعة وتقديم التقرير خلال ٥ أيام» يجب أن تُقارن الأولى بالأولى
           والثانية بالثانية — وإلا قُورن التقرير بمهلة الإبلاغ فخرج تعارض
           وهمي. */
        var byKind = function (list, k) { return list.filter(function (q) { return q.kind === k; }); };
        var pairs = [];
        ['مدة', 'مبلغ', 'نسبة'].forEach(function (k) {
          var rs2 = byKind(refQs, k), ds2 = byKind(docQs, k);
          for (var i = 0; i < Math.min(rs2.length, ds2.length); i++) pairs.push([rs2[i], ds2[i]]);
        });
        pairs.forEach(function (pr) {
          var rq = pr[0], dq = pr[1];
          (function () {
            var why = violates(rq, dq);
            if (!why) return;
            var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
            out.push({
              rule: 'حدّي', kind: 'قيمة تخالف حدًّا في المرجع', why: why,
              score: Math.round(score * 100),
              refQuote: refQ, refArticle: articleOf(refQ),
              docQuote: docQ, docArticle: articleOf(docQ),
              subject: fmtQ(dq, dn.norm), core: need.slice(0, 3).join(' '),
              amount: null, topic: need,
              quantity: {
                kind: rq.kind, dir: rq.dir,
                refText: fmtQ(rq, rn.norm), docText: fmtQ(dq, dn.norm),
                refBase: rq.base, docBase: dq.base,
                docOrig: origSpan(opts.docText, dn.map, dq.s, dq.e),
                refOrig: origSpan(opts.refText, rn.map, rq.s, rq.e),
                docShow: origSpan(opts.docText, dn.map, dq.s, dq.e).replace(/\s+/g, ' '),
                refShow: origSpan(opts.refText, rn.map, rq.s, rq.e).replace(/\s+/g, ' ')
              },
              key: E.normStr(docQ).slice(0, 70) + '|' + dq.s
            });
          })();
        });
      });
    });

    rS.forEach(function (rs, ri) {
      var rc = classify(rs.text, C);
      if (!rc.prohibits && !rc.requires) return;
      var need = refSets[ri].slice().sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
      if (!need.length) return;

      dS.forEach(function (ds, di) {
        var dc = docCls[di];
        // تعارض حقيقي: المرجع يمنع وسياستك تفرض، أو المرجع يوجب وسياستك تمنع
        var kind = (rc.prohibits && dc.imposes) ? 'يمنعه المرجع وسياستك تفرضه'
                 : (rc.prohibits && dc.permits) ? 'يمنعه المرجع وسياستك تُجيزه'
                 : (rc.requires && dc.prohibits) ? 'يوجبه المرجع وسياستك تمنعه' : null;
        if (!kind) return;
        /* بندٌ يمنع شيئًا قد يكون تنفيذًا للمتطلب لا مخالفةً له («لا يجوز
           التعاقد قبل تقييم المخاطر» ينفّذ متطلبَ التقييم). فنرفع عتبته
           ونعلّمه «محتمل» ليراجعه الإنسان بدل أن يُعدَّل تلقائيًا. */
        var tentative = kind.indexOf('تمنعه') > -1;
        var score = topicScore(need, docSets[di], idf);
        if (score < (tentative ? raw.conflict.minTopicScoreTentative : minScore)) return;

        var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
        var subject = subjectOf(docQ), amount = amountOf(docQ);
        out.push({
          rule: 'فعل', kind: kind, tentative: tentative, score: Math.round(score * 100),
          refQuote: refQ, refArticle: articleOf(refQ),
          docQuote: docQ, docArticle: articleOf(docQ),
          subject: subject, core: coreOf(subject), amount: amount,
          topic: need,
          key: E.normStr(docQ).slice(0, 70)
        });
      });
    });

    /* ── القاعدة (د): تعارض النطاق ──
       المرجع يُدخل جهةً في النطاق وسياستك تُخرجها. */
    var SC = {
      inc: E.normList(raw.conflict.scope.includes),
      exc: E.normList(raw.conflict.scope.excludes)
    };
    rS.forEach(function (rs, ri) {
      var rInc = entityAfter(rs.text, SC.inc);
      if (!rInc) return;
      var need = refSets[ri].slice().sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
      if (!need.length) return;

      dS.forEach(function (ds, di) {
        var dExc = entityAfter(ds.text, SC.exc);
        if (!dExc) return;
        // الجهة نفسها لا جهة أخرى: «تُستثنى الفروع» لا تعارض «تشمل التابعة»
        var ent = overlap(rInc.words, dExc.words);
        if (ent < raw.conflict.scope.minEntityOverlap) return;
        var score = topicScore(need, docSets[di], idf);
        if (score < raw.conflict.scope.minTopicScore) return;

        var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
        out.push({
          rule: 'نطاق', kind: 'يشمله المرجع وسياستك تستثنيه',
          why: 'المرجع يُدخل «' + rInc.text + '» في النطاق، وسياستك تُخرجه',
          score: Math.round(Math.min(score, ent) * 100),
          refQuote: refQ, refArticle: articleOf(refQ),
          docQuote: docQ, docArticle: articleOf(docQ),
          subject: dExc.text, core: dExc.text, amount: null, topic: need,
          scope: { includeTerm: rInc.term, excludeTerm: dExc.term,
                   entity: dExc.text, refEntity: rInc.text },
          key: E.normStr(docQ).slice(0, 70) + '|نطاق'
        });
      });
    });

    /* ── القاعدة (هـ): تعارض التعريف ──
       المصطلح نفسه معرَّفٌ في الوثيقتين تعريفين مختلفين. لا نرفع كل
       اختلاف صياغة، بل الاختلاف الذي يُضيّق: المرجع يعمّم صراحةً
       («بصرف النظر عن قيمته») وسياستك تقيّده بعتبة. */
    rS.forEach(function (rs) {
      var rDef = definedTerm(rs.text, DF.mk);
      if (!rDef) return;
      var refUniversal = E.hasAny(rDef.body, DF.uni);
      if (!refUniversal) return;   // بلا تعميمٍ صريح لا نحكم على التضييق

      dS.forEach(function (ds) {
        var dDef = definedTerm(ds.text, DF.mk);
        if (!dDef) return;
        var term = overlap(rDef.words, dDef.words);
        if (term < raw.conflict.definition.minTermOverlap) return;
        // التضييق يظهر عتبةً: مقدارٌ في تعريف سياستك غائبٌ عن تعميم المرجع
        var dq = quantities(dn.norm, ds.start, ds.end, cues);
        if (!dq.length) return;
        if (E.hasAny(dDef.body, DF.uni)) return;   // سياستك تعمّم أيضًا

        var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
        var termTxt = rDef.words.join(' ');
        out.push({
          rule: 'تعريف', kind: 'تعريف أضيق مما في المرجع',
          why: 'المرجع يعمّم التعريف، وسياستك تقيّده بعتبة ' + fmtQ(dq[0], dn.norm),
          score: Math.round(term * 100),
          refQuote: refQ, refArticle: articleOf(refQ),
          docQuote: docQ, docArticle: articleOf(docQ),
          subject: termTxt, core: termTxt, amount: null, topic: rDef.words,
          definition: { term: termTxt, threshold: fmtQ(dq[0], dn.norm) },
          key: E.normStr(docQ).slice(0, 70) + '|تعريف'
        });
      });
    });

    /* ── القاعدة (و): تعارض التسلسل ──
       الإجراء نفسه والمرساة نفسها، والترتيب مقلوب: رقابةٌ كانت شرطًا
       سابقًا صارت إخطارًا لاحقًا. */
    var SQ = {
      before: E.normList(raw.conflict.sequence.before),
      after: E.normList(raw.conflict.sequence.after),
      anchors: E.normList(raw.conflict.sequence.anchors)
    };
    rS.forEach(function (rs, ri) {
      var rOrd = ordering(rs.text, SQ);
      if (!rOrd || rOrd.rel !== 'before') return;   // التقديم وحده هو الضمانة
      // الترتيب لا يُحتجّ به إلا إن كان المرجع يوجبه أو يمنعه
      var rcSeq = classify(rs.text, C);
      if (!rcSeq.requires && !rcSeq.prohibits) return;
      var need = refSets[ri].slice().sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
      if (!need.length) return;

      dS.forEach(function (ds, di) {
        var dOrd = ordering(ds.text, SQ);
        if (!dOrd || dOrd.rel !== 'after') return;
        if (dOrd.anchor !== rOrd.anchor) return;    // المرساة نفسها
        /* الجذور المشتركة تُقاس بعددها لا بتغطيتها: البندان يتحدثان عن
           العقد والإسناد والجهة الرقابية نفسها وإن اختلفت آليتهما. */
        var shared = refSets[ri].filter(function (w) {
          return docSets[di].indexOf(w) > -1;
        }).length;
        if (shared < raw.conflict.sequence.minSharedStems) return;
        var score = topicScore(need, docSets[di], idf);

        var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
        out.push({
          rule: 'تسلسل', tentative: true, rank: shared,
          kind: 'المرجع يوجبه قبل، وسياستك تجعله بعد',
          why: 'المرجع يشترطه قبل «' + rOrd.anchor + '»، وسياستك تجعله بعده',
          score: Math.round(score * 100),
          refQuote: refQ, refArticle: articleOf(refQ),
          docQuote: docQ, docArticle: articleOf(docQ),
          subject: rOrd.anchor, core: rOrd.anchor, amount: null, topic: need,
          sequence: { anchor: rOrd.anchor, refRel: rOrd.relTerm, docRel: dOrd.relTerm },
          key: E.normStr(docQ).slice(0, 70) + '|تسلسل'
        });
      });
    });

    /* ── القاعدة (ز): الإفراغ بالغموض ──
       البند حاضرٌ في سياستك لفظًا، لكنه معلَّق على تقديرٍ مطلق بعد أن كان
       في المرجع شاملًا واجبًا. أخطر من الغياب: الغياب يُرى في الجرد،
       وهذا يمرّ على أنه تغطية. */
    var HV = E.normList(raw.conflict.hollowing.universals);
    var vagueList = E.normList((raw.vague || []).map(function (v) { return v.term; }));
    rS.forEach(function (rs, ri) {
      var rc = classify(rs.text, C);
      if (!rc.requires && !rc.prohibits) return;
      if (!E.hasAny(rs.text, HV)) return;          // المرجع شامل صراحةً
      if (E.hasAny(rs.text, vagueList)) return;    // مرجعٌ غامضٌ لا يُفرَّغ
      var need = refSets[ri].slice().sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
      if (!need.length) return;

      dS.forEach(function (ds, di) {
        var vague = E.hasAny(ds.text, vagueList);
        if (!vague) return;
        if (E.hasAny(ds.text, HV)) return;          // سياستك شاملة أيضًا
        var shared = refSets[ri].filter(function (w) {
          return docSets[di].indexOf(w) > -1;
        }).length;
        if (shared < raw.conflict.hollowing.minSharedStems) return;
        var score = topicScore(need, docSets[di], idf);

        var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
        out.push({
          rule: 'إفراغ', rank: shared,
          kind: 'التزام شامل في المرجع صار تقديريًا في سياستك',
          why: 'المرجع يوجبه شمولًا، وسياستك تعلّقه على «' + vague + '»',
          score: Math.round(score * 100),
          refQuote: refQ, refArticle: articleOf(refQ),
          docQuote: docQ, docArticle: articleOf(docQ),
          subject: vague, core: vague, amount: null, topic: need,
          hollowing: { vagueTerm: vague },
          key: E.normStr(docQ).slice(0, 70) + '|إفراغ'
        });
      });
    });

    /* بند واحد قد يعارض عدة مواد — نُبقي أقوى تطابق لكل بند.
       والقوة تُقاس بما استُدلّ به فعلًا: قاعدتا التسلسل والإفراغ تحكمان
       بعدد الجذور المشتركة لا بتغطية أندر الكلمات، فترتيبُهما به. بلا
       ذلك تُنسب المخالفة إلى مادةٍ مرجعية أخرى تصادف أن فيها اللفظ
       نفسه — رأينا تعارض «عدم الممانعة» يُنسب إلى مادة خطة الخروج. */
    var rankOf = function (c) { return c.rank !== undefined ? c.rank : c.score; };
    var best = {};
    out.forEach(function (c) {
      if (!best[c.key] || rankOf(c) > rankOf(best[c.key])) best[c.key] = c;
    });
    var list = Object.keys(best).map(function (k) { return best[k]; })
                 .sort(function (a, b) { return b.score - a.score; });

    var fp = E.normStr(opts.docText).slice(0, 40000);
    var seen = {};
    list.forEach(function (c) {
      var code = E.makeCode('CF', fp, c.key);
      // تصادم في اختصار البصمة ممكن؛ نفكّه بلاحقة ثابتة الترتيب
      if (seen[code] !== undefined) { seen[code]++; code = code + '-' + seen[code]; }
      else seen[code] = 0;
      c.code = code;
    });
    return { conflicts: list };
  }

  /* ═══ مسودة البند البديل ═══ */
  function proposeClause(c, vars) {
    var v = vars || {};
    var ref = (c.refArticle ? c.refArticle + ' من ' : '') + (v.refName || 'المرجع التنظيمي');
    var art = c.docArticle || 'هذا البند';

    /* التعارض الحدّي يُصلَح بأدق تدخّل ممكن: استبدال المقدار داخل جملتك
       نفسها. يبقى النص بأسلوبك، ولا نعيد صياغة ما لم يُطلب تغييره. */
    if (c.rule === 'حدّي') {
      var q = c.quantity;
      var body = c.docQuote.indexOf(q.docOrig) > -1
        ? c.docQuote.replace(q.docOrig, q.refOrig)
        : null;
      if (body) {
        return art + ' (معدَّلة):\n' + body.replace(/\s+/g, ' ').trim() +
          '\n(عُدِّل «' + q.docOrig + '» إلى «' + q.refOrig + '» التزامًا بـ' + ref + '.)';
      }
      return art + ' (معدَّلة):\n' + c.docQuote.replace(/\s+/g, ' ').trim() +
        '\nعلى أن تكون القيمة «' + q.refOrig + '» بدلًا من «' + q.docOrig +
        '»، التزامًا بـ' + ref + '.';
    }
    /* لكل قاعدةٍ إصلاحُها: التعارض في النطاق يُصلَح بردّ الجهة المستثناة،
       وفي التعريف بتبنّي تعريف المرجع، وفي التسلسل بإعادة الإجراء إلى
       ما قبل الحدث، وفي الإفراغ بإزالة التقدير. صيغةٌ عامة واحدة تصلح
       لجميعها تقول للمحرِّر أقلَّ مما يعرفه المحرك. */
    if (c.rule === 'نطاق') {
      return art + ' (معدَّلة):\n' +
        c.docQuote.replace(/\s+/g, ' ').trim() +
        '\nعلى أن يشمل النطاق «' + c.scope.refEntity + '» دون استثناء، التزامًا بـ' + ref + '.\n' +
        '(حُذف استثناء «' + c.scope.entity + '».)';
    }
    if (c.rule === 'تعريف') {
      return art + ' (معدَّلة):\n' +
        'يُعتمد في تعريف «' + c.definition.term + '» ما ورد في ' + ref + ' دون تقييده بعتبة مالية.\n' +
        '(أُلغيت عتبة «' + c.definition.threshold + '»، فالمرجع يعمّم التعريف بصرف النظر عن القيمة.)';
    }
    if (c.rule === 'تسلسل') {
      return art + ' (معدَّلة):\n' +
        c.docQuote.replace(/\s+/g, ' ').trim() +
        '\nعلى أن يتم الإجراء المقرر في ' + ref + ' قبل «' + c.sequence.anchor + '» لا بعده.\n' +
        '(الرقابة سابقة لا لاحقة — راجِع الصياغة قبل الاعتماد.)';
    }
    if (c.rule === 'إفراغ') {
      /* لا نستبدل العبارة في النص: اللفظ المرصود مطبَّعٌ («عند الحاجه»)
         والنص خام («عند الحاجة»)، فالاستبدال يخفق صامتًا ويخرج البند
         كما هو موهمًا أنه عُدِّل. نذكرها في الملاحظة ليحذفها المحرِّر. */
      return art + ' (معدَّلة):\n' +
        c.docQuote.replace(/\s+/g, ' ').trim() +
        '\nويكون الالتزام واجبًا في جميع الحالات دون تعليقٍ على التقدير، التزامًا بـ' + ref + '.\n' +
        '(حُذفت عبارة «' + c.hollowing.vagueTerm + '» لأنها تُفرغ الالتزام.)';
    }
    if (c.kind.indexOf('تُجيزه') > -1) {
      return art + ' (معدَّلة):\n' +
        'لا يجوز ' + c.core + '، التزامًا بما ورد في ' + ref + '.\n' +
        'ويُلغى كل ما يخالف ذلك في هذا البند اعتبارًا من ' +
        (v.effectiveDate || '[تاريخ النفاذ]') + '.';
    }
    if (c.kind.indexOf('تفرضه') > -1) {
      return art + ' (معدَّلة):\n' +
        'لا تُفرض أي رسوم أو عمولات أو مقابل مالي على ' + c.core + '، ' +
        'التزامًا بما ورد في ' + ref + '.\n' +
        (c.amount ? 'وتُلغى الرسوم البالغة ' + c.amount + ' المنصوص عليها سابقًا، ' : 'وتُلغى الرسوم المنصوص عليها سابقًا، ') +
        'ويُوقف تحصيلها اعتبارًا من ' + (v.effectiveDate || '[تاريخ النفاذ]') + '.';
    }
    return art + ' (معدَّلة):\n' +
      'يُلتزم بما ورد في ' + ref + ' بشأن ' + c.core + '، ' +
      'ويُلغى كل ما يخالف ذلك في هذا البند اعتبارًا من ' +
      (v.effectiveDate || '[تاريخ النفاذ]') + '.';
  }

  /* ═══ مسودة التعميم الداخلي ═══ */
  function buildCircular(conflicts, vars) {
    var v = vars || {};
    var org = v.org || '[اسم الجهة]';
    var num = v.number || '[رقم التعميم]';
    var date = v.date || new Date().toISOString().slice(0, 10);
    var eff = v.effectiveDate || '[تاريخ النفاذ]';
    var owner = v.owner || '[الإدارة المختصة]';
    var days = v.days || '30';
    var subject = conflicts.length === 1
      ? (conflicts[0].rule === 'حدّي' ? 'قيمة مخالفة للمرجع التنظيمي' : conflicts[0].core)
      : 'بنود السياسة المخالفة للمرجع التنظيمي';

    var t = '';
    t += '⚠ مسودة — لم تُعتمد بعد. تُراجَع قانونيًا وتُعتمد قبل الإصدار.\n';
    t += Array(64).join('─') + '\n\n';
    t += org + '\n';
    t += 'تعميم داخلي رقم ' + num + '\n';
    t += 'التاريخ: ' + date + '\n';
    t += 'الموضوع: تعديل ' + subject + ' بما يوافق ' + (v.refName || 'المرجع التنظيمي') + '\n\n';
    t += Array(64).join('─') + '\n\n';

    var n2 = conflicts.length;
    var countPhrase = n2 === 1 ? 'بندٍ واحد يخالف'
                    : n2 === 2 ? 'بندين يخالفان'
                    : n2 + ' بنودٍ تخالف';
    t += 'استنادًا إلى ' + (v.refName || 'المرجع التنظيمي') + '، وبعد مراجعة السياسة الداخلية ' +
         (v.docName ? '«' + v.docName + '»' : '') + '، تبيّن وجود ' + countPhrase + ' ما ورد في المرجع.\n\n';

    conflicts.forEach(function (c, i) {
      t += (conflicts.length > 1 ? '(' + (i + 1) + ') ' : '') + 'حيث نص ' +
           (c.refArticle ? c.refArticle + ' من المرجع' : 'المرجع') + ' على:\n';
      t += '    «' + c.refQuote.replace(/\s+/g, ' ') + '»\n\n';
      t += 'وحيث ' + (c.docArticle ? 'نصت ' + c.docArticle + ' من السياسة' : 'نصت السياسة') + ' على:\n';
      t += '    «' + c.docQuote.replace(/\s+/g, ' ') + '»\n\n';
    });

    t += Array(64).join('─') + '\n';
    t += 'يُعمَّم على جميع القطاعات والفروع ما يلي:\n\n';
    var n = 1;
    conflicts.forEach(function (c) {
      if (c.rule === 'حدّي') {
        t += (n++) + '. تُعدَّل «' + c.quantity.docOrig + '» إلى «' + c.quantity.refOrig + '» في ' +
             (c.docArticle || 'البند المشار إليه') + '، اعتبارًا من ' + eff + '.\n';
      } else if (c.kind.indexOf('تفرضه') > -1) {
        t += (n++) + '. يُوقف فورًا تحصيل ' + c.subject +
             (c.amount ? ' البالغة ' + c.amount : '') + '، وتُعدّ ملغاة اعتبارًا من ' + eff + '.\n';
      } else {
        t += (n++) + '. يُلتزم بما ورد في المرجع بشأن ' + c.core + ' اعتبارًا من ' + eff + '.\n';
      }
    });
    t += (n++) + '. على ' + owner + ' تحديث الأنظمة والنماذج وقوائم التعرفة خلال ' + days + ' يومًا من تاريخه.\n';
    t += (n++) + '. تُعاد أي مبالغ حُصّلت بعد ' + eff + ' خلافًا لهذا التعميم.\n';
    t += (n++) + '. يُعدّ هذا التعميم جزءًا لا يتجزأ من السياسة المشار إليها، ويُلغى كل ما يخالفه.\n\n';

    t += Array(64).join('─') + '\n';
    t += 'نص البنود بعد التعديل:\n\n';
    conflicts.forEach(function (c) { t += proposeClause(c, v) + '\n\n'; });

    t += Array(64).join('─') + '\n';
    t += 'للاعتماد:\n\n';
    t += '    المراجعة القانونية: ....................  التاريخ: ..........\n\n';
    t += '    الاعتماد:            ....................  التاريخ: ..........\n\n';
    t += 'أُنشئت هذه المسودة آليًا بواسطة نذير من مقارنة نصّي السياسة والمرجع.\n';
    t += 'الصياغة قالبية وتحتاج مراجعة بشرية — لا تُصدر قبل الاعتماد.\n';
    return t;
  }

  /* ═══ السياسة كاملة بعد استبدال البنود المتعارضة ═══ */
  function buildAmendedPolicy(docText, conflicts, vars, bare) {
    var v = vars || {}, out = docText, applied = 0;
    conflicts.forEach(function (c) {
      if (c.skip) return;
      var body = (c.editedProposal || proposeClause(c, v));
      var idx = out.indexOf(c.docQuote);
      if (idx === -1) return;                   // النص تغيّر بعد الكشف
      out = out.slice(0, idx) + body + out.slice(idx + c.docQuote.length);
      applied++;
    });
    // bare: نصٌّ بلا ترويسة، لإعادة تحميله في النظام وتحليله دون أن
    // تدخل كلماتُ الترويسة في التحليل.
    if (bare) return { text: out, applied: applied };
    var head = '⚠ مسودة معدَّلة — لم تُعتمد بعد. تُراجَع قانونيًا قبل الإصدار.\n' +
      'أُنشئت بواسطة نذير في ' + new Date().toISOString().slice(0, 10) +
      ' · عُدِّل ' + applied + ' من ' + conflicts.length + ' بندًا متعارضًا.\n' +
      Array(64).join('─') + '\n\n';
    return { text: head + out, applied: applied };
  }

  return { detect: detect, proposeClause: proposeClause,
           buildCircular: buildCircular, buildAmendedPolicy: buildAmendedPolicy,
           subjectOf: subjectOf, amountOf: amountOf };
});
