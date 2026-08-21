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
    var requires  = E.hasAny(normSentence, C.req);
    return {
      prohibits: !!prohibits, prohibitTerm: prohibits,
      imposes: !!imposes && !prohibits, imposeTerm: imposes,
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

  var DIR = { MAX: 'حد أعلى', MIN: 'حد أدنى', EXACT: 'قيمة محددة' };

  function dirCues(raw) {
    return {
      max: E.normList(raw.max), min: E.normList(raw.min), notice: E.normList(raw.notice)
    };
  }

  /* اتجاه القيد يُقرأ مما يسبق المقدار مباشرة */
  function directionOf(norm, at, cues) {
    var win = norm.slice(Math.max(0, at - 34), at);
    if (E.hasAny(win, cues.min)) return DIR.MIN;
    if (E.hasAny(win, cues.notice)) return DIR.MIN;   // «قبل ثلاثين يوماً» مهلة إشعار = حد أدنى
    if (E.hasAny(win, cues.max)) return DIR.MAX;
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
  function quantities(norm, a, b, cues) {
    var out = [], m;
    E.findDurations(norm).forEach(function (d) {
      if (d.s < a || d.e > b) return;
      out.push({ kind: 'مدة', base: d.days * 24, unit: 'ساعة',
                 s: d.s, e: d.e, dir: directionOf(norm, d.s, cues) });
    });
    var seg = norm.slice(a, b), mre = moneyRegex();
    mre.lastIndex = 0;
    while ((m = mre.exec(seg))) {
      var val = moneyValue(m[1]);
      if (val === null) continue;
      out.push({ kind: 'مبلغ', base: val, unit: 'عملة',
                 s: a + m.index, e: a + m.index + m[0].length,
                 dir: directionOf(norm, a + m.index, cues) });
    }
    PCT_G.lastIndex = 0;
    while ((m = PCT_G.exec(seg))) {
      out.push({ kind: 'نسبة', base: parseFloat(m[1]), unit: '٪',
                 s: a + m.index, e: a + m.index + m[0].length,
                 dir: directionOf(norm, a + m.index, cues) });
    }
    return out;
  }

  /* هل قيمة سياستك تخالف قيد المرجع؟ */
  function violates(refQ, docQ) {
    var r = refQ.base, d = docQ.base;
    if (refQ.dir === DIR.MAX)   return d > r ? 'سياستك تتجاوز الحد الأعلى' : null;
    if (refQ.dir === DIR.MIN)   return d < r ? 'سياستك دون الحد الأدنى' : null;
    if (refQ.dir === DIR.EXACT) return d !== r ? 'القيمة تخالف المنصوص' : null;
    return null;
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

    /* ── القاعدة (ج): تعارض حدّي ── */
    rS.forEach(function (rs, ri) {
      var refQs = quantities(rn.norm, rs.start, rs.end, cues);
      if (!refQs.length) return;
      var need = refSets[ri].slice().sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
      if (!need.length) return;

      dS.forEach(function (ds, di) {
        var score = topicScore(need, docSets[di], idf);
        if (score < minScore) return;
        var docQs = quantities(dn.norm, ds.start, ds.end, cues);
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

    // بند واحد قد يعارض عدة مواد — نُبقي أقوى تطابق لكل بند
    var best = {};
    out.forEach(function (c) {
      if (!best[c.key] || c.score > best[c.key].score) best[c.key] = c;
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
