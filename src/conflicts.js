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
    var out = [];

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
        var score = topicScore(need, docSets[di], idf);
        if (score < minScore) return;

        var refQ = quote(rn.map, opts.refText, rs), docQ = quote(dn.map, opts.docText, ds);
        var subject = subjectOf(docQ), amount = amountOf(docQ);
        out.push({
          kind: kind, score: Math.round(score * 100),
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
    list.forEach(function (c) { c.code = E.makeCode('CF', fp, c.key); });
    return { conflicts: list };
  }

  /* ═══ مسودة البند البديل ═══ */
  function proposeClause(c, vars) {
    var v = vars || {};
    var ref = (c.refArticle ? c.refArticle + ' من ' : '') + (v.refName || 'المرجع التنظيمي');
    var art = c.docArticle || 'هذا البند';
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
    var subject = conflicts.length === 1 ? conflicts[0].core : 'بنود السياسة المخالفة للمرجع التنظيمي';

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
      if (c.kind.indexOf('تفرضه') > -1) {
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
  function buildAmendedPolicy(docText, conflicts, vars) {
    var v = vars || {}, out = docText, applied = 0;
    conflicts.forEach(function (c) {
      if (c.skip) return;
      var body = (c.editedProposal || proposeClause(c, v));
      var idx = out.indexOf(c.docQuote);
      if (idx === -1) return;                   // النص تغيّر بعد الكشف
      out = out.slice(0, idx) + body + out.slice(idx + c.docQuote.length);
      applied++;
    });
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
