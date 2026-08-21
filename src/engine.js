/* نذير — محرك التحليل الحتمي (بلا إنترنت، بلا نموذج لغوي)
   كل مخرجة هنا مشتقة من نص المستند: إما اقتباس حرفي، أو غياب موثّق.
   لا يوجد أي استدعاء شبكة في هذا الملف. */
(function (root, factory) {
  var cfg = (typeof module === 'object' && module.exports) ? require('./config.js') : root.NadheerConfig;
  var api = factory(cfg);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerEngine = api;
})(typeof self !== 'undefined' ? self : this, function (NC) {
  'use strict';

  var DAY = 86400000;

  /* ═══════════ ١. التطبيع ═══════════ */

  var AR_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                    '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };

  /* يبني نصًّا مطبَّعًا مع خريطة تُعيد كل حرف إلى موضعه في النص الأصلي.
     الخريطة هي ما يسمح لنا بإبراز الاقتباس في المستند الأصلي بدقة. */
  function normMap(text) {
    var norm = '', map = [], i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (AR_DIGITS[c]) c = AR_DIGITS[c];
      if (/[ً-ْٰـ]/.test(c)) continue;      // تشكيل وتطويل
      if ('إأآٱا'.indexOf(c) > -1) c = 'ا';
      else if ('ىي'.indexOf(c) > -1) c = 'ي';
      else if (c === 'ة') c = 'ه';
      else if (c === 'ؤ') c = 'و';
      else if (c === 'ئ') c = 'ي';
      else c = c.toLowerCase();
      if (/[\s ]/.test(c)) {
        if (norm === '' || norm.charAt(norm.length - 1) === ' ') continue;
        c = ' ';
      }
      norm += c; map.push(i);
    }
    return { norm: norm, map: map };
  }

  function normStr(t) { return normMap(t || '').norm.trim(); }

  /* يطبّع كل عناصر قائمة كلمات مرة واحدة عند التحميل، حتى لا يختلف
     تطبيع القوائم عن تطبيع النص. */
  function normList(arr) {
    var out = [], i, v;
    for (i = 0; i < arr.length; i++) { v = normStr(arr[i]); if (v) out.push(v); }
    return out;
  }

  function hasAny(normText, terms) {
    for (var i = 0; i < terms.length; i++) if (normText.indexOf(terms[i]) > -1) return terms[i];
    return null;
  }

  /* ═══════════ ٢. التقويم ═══════════ */

  /* التقويم الهجري المدني (الخوارزمية الجدولية). يفارق تقويم أم القرى
     بيوم واحد أحيانًا — لذلك كل تاريخ هجري يُعلَّم approx = true. */
  function hijriToJDN(y, m, d) {
    return Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m -
           Math.floor((m - 1) / 2) + d + 1948440 - 386;
  }
  function jdnToUTC(jdn) {
    var l = jdn + 68569;
    var n = Math.floor(4 * l / 146097);
    l = l - Math.floor((146097 * n + 3) / 4);
    var i = Math.floor(4000 * (l + 1) / 1461001);
    l = l - Math.floor(1461 * i / 4) + 31;
    var j = Math.floor(80 * l / 2447);
    var day = l - Math.floor(2447 * j / 80);
    l = Math.floor(j / 11);
    var month = j + 2 - 12 * l;
    var year = 100 * (n - 49) + i + l;
    return Date.UTC(year, month - 1, day);
  }
  function hijriToUTC(y, m, d) { return jdnToUTC(hijriToJDN(y, m, d)); }

  /* كل التواريخ في المحرك تُبنى بـ UTC، و«اليوم» يُشتق من التاريخ المحلي
     ثم يُثبَّت على UTC — حتى لا يختلف عدد الأيام باختلاف المنطقة الزمنية. */
  function todayUTC(iso) {
    if (iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
    var n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  }

  var GREG_MONTHS = normList([
    'يناير','فبراير','مارس','أبريل','ابريل','مايو','يونيو','يوليو','أغسطس','اغسطس',
    'سبتمبر','أكتوبر','اكتوبر','نوفمبر','ديسمبر']);
  var GREG_MONTH_NO = { 'يناير':1,'فبراير':2,'مارس':3,'ابريل':4,'مايو':5,'يونيو':6,
    'يوليو':7,'اغسطس':8,'سبتمبر':9,'اكتوبر':10,'نوفمبر':11,'ديسمبر':12,
    'كانون الثاني':1,'شباط':2,'اذار':3,'نيسان':4,'ايار':5,'حزيران':6,
    'تموز':7,'اب':8,'ايلول':9,'تشرين الاول':10,'تشرين الثاني':11,'كانون الاول':12 };
  var HIJRI_MONTH_NO = { 'محرم':1,'صفر':2,'ربيع الاول':3,'ربيع الاخر':4,'ربيع الثاني':4,
    'جمادي الاولي':5,'جمادي الاخره':6,'جمادي الثانيه':6,'رجب':7,'شعبان':8,
    'رمضان':9,'شوال':10,'ذو القعده':11,'ذي القعده':11,'ذو الحجه':12,'ذي الحجه':12 };

  /* ═══════════ ٣. استخراج التواريخ ═══════════ */

  /* ملاحظة: لا تضع 'هـ' هنا — التطويل يُحذف في التطبيع فتصير 'ه' المجردة
     وتطابق أي نص عربي تقريبًا. لاحقة الهجري تُفحص بعد نهاية التاريخ مباشرة. */
  var HIJRI_HINT = normList(['هجري','هجرية','للهجرة','أم القرى','تقويم أم القرى']);

  function isHijriContext(norm, at, len) {
    // لاحقة مباشرة: «1447هـ» → بعد التطبيع «1447ه»
    var after = norm.slice(at + len, at + len + 2);
    if (/^ه(?![ء-ي])/.test(after)) return true;
    var win = norm.slice(Math.max(0, at - 30), at + len + 30);
    for (var i = 0; i < HIJRI_HINT.length; i++) if (win.indexOf(HIJRI_HINT[i]) > -1) return true;
    return false;
  }

  /* يعيد كل التواريخ في النص المطبَّع، بمواضعها، مع نوع التقويم. */
  function findDates(norm) {
    var out = [], m, re;

    // YYYY-MM-DD / YYYY/MM/DD
    re = /(\d{4})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{1,2})/g;
    while ((m = re.exec(norm))) out.push(mk(m.index, m[0], +m[1], +m[2], +m[3]));

    // DD-MM-YYYY / DD/MM/YYYY  (الترتيب السائد في المستندات العربية)
    re = /(\d{1,2})\s*[-\/\.]\s*(\d{1,2})\s*[-\/\.]\s*(\d{4})/g;
    while ((m = re.exec(norm))) out.push(mk(m.index, m[0], +m[3], +m[2], +m[1]));

    // ١٥ رمضان ١٤٤٧  /  1 سبتمبر 2026
    var names = Object.keys(GREG_MONTH_NO).concat(Object.keys(HIJRI_MONTH_NO))
                  .sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < names.length; i++) {
      var nm = names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp('(\\d{1,2})\\s+' + nm + '\\s+(\\d{3,4})', 'g');
      while ((m = re.exec(norm))) {
        var isH = HIJRI_MONTH_NO[names[i]] !== undefined;
        var mo = isH ? HIJRI_MONTH_NO[names[i]] : GREG_MONTH_NO[names[i]];
        out.push(mk(m.index, m[0], +m[2], mo, +m[1], isH));
      }
    }

    function mk(idx, raw, y, mo, d, forceHijri) {
      var hijri = forceHijri || (y < 1600 && y > 1300) || isHijriContext(norm, idx, raw.length);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      var ts = hijri ? hijriToUTC(y, mo, d) : Date.UTC(y, mo - 1, d);
      return { at: idx, len: raw.length, raw: raw.trim(), ts: ts, hijri: !!hijri, approx: !!hijri };
    }

    return out.filter(Boolean).sort(function (a, b) { return a.at - b.at; });
  }

  /* ═══════════ ٤. استخراج المدد ═══════════ */

  var NUM_WORDS = {};
  (function () {
    var raw = { 'واحد':1,'واحدة':1,'يوم واحد':1,'اثنان':2,'اثنين':2,'اثنتين':2,'يومين':2,'شهرين':2,'أسبوعين':2,'سنتين':2,
      'ثلاثة':3,'ثلاث':3,'أربعة':4,'أربع':4,'خمسة':5,'خمس':5,'ستة':6,'ست':6,'سبعة':7,'سبع':7,
      'ثمانية':8,'ثماني':8,'تسعة':9,'تسع':9,'عشرة':10,'عشر':10,'خمسة عشر':15,'خمسة عشرة':15,
      'عشرين':20,'عشرون':20,'ثلاثين':30,'ثلاثون':30,'أربعين':40,'أربعون':40,'خمسين':50,'خمسون':50,
      'ستين':60,'ستون':60,'سبعين':70,'ثمانين':80,'تسعين':90,'تسعون':90,'مائة':100,'مئة':100,'مائتين':200,
      // العشرات المركّبة شائعة في النصوص النظامية: «خلال أربع وعشرين ساعة»
      'أحد عشر':11,'إحدى عشرة':11,'اثني عشر':12,'اثنا عشر':12,'اثنتي عشرة':12,'اثنتا عشرة':12,
      'ثلاثة عشر':13,'أربعة عشر':14,'ستة عشر':16,'سبعة عشر':17,'ثمانية عشر':18,'تسعة عشر':19,
      'أربع وعشرين':24,'أربعة وعشرين':24,'ثمان وأربعين':48,'ثمانية وأربعين':48,
      'اثنتين وسبعين':72,'اثنين وسبعين':72,'ست وثلاثين':36,'تسعين يوماً':90 };
    Object.keys(raw).forEach(function (k) { NUM_WORDS[normStr(k)] = raw[k]; });
  })();

  var UNITS = [
    { terms: normList(['ساعة','ساعه','ساعات','ساعةً']), days: 1 / 24 },
    { terms: normList(['يوم','يوماً','يوما','أيام','ايام','يومًا']), days: 1 },
    { terms: normList(['أسبوع','اسبوع','أسابيع','اسابيع','أسبوعاً','اسبوعا']), days: 7 },
    { terms: normList(['شهر','شهراً','شهرا','أشهر','اشهر','شهور']), days: 30 },
    { terms: normList(['سنة','سنوات','عام','أعوام','اعوام','سنوياً','سنويا']), days: 365 }
  ];

  /* يبحث عن «خلال ٣٠ يومًا» و«خلال ثلاثين (30) يوماً» ونحوهما. */
  function findDurations(norm) {
    var out = [];
    UNITS.forEach(function (u) {
      u.terms.forEach(function (term) {
        var re = new RegExp('(^|[^\\u0621-\\u064A])' + term + '($|[^\\u0621-\\u064A])', 'g'), m;
        while ((m = re.exec(norm))) {
          var at = m.index + m[1].length;
          var before = norm.slice(Math.max(0, at - 40), at);
          var n = null, numLen = 0, numGap = 0;
          var dm = before.match(/(\d{1,4})(\s*\)?\s*)$/);          // رقم مباشر أو داخل قوسين
          if (dm) { n = +dm[1]; numLen = dm[1].length; numGap = dm[2].length; }
          if (n === null) {
            var keys = Object.keys(NUM_WORDS).sort(function (a, b) { return b.length - a.length; });
            for (var i = 0; i < keys.length; i++) {
              var tailWin = before.slice(-keys[i].length - 12);
              var kAt = tailWin.indexOf(keys[i]);
              if (kAt > -1) {
                n = NUM_WORDS[keys[i]]; numLen = keys[i].length;
                numGap = tailWin.length - kAt - keys[i].length;
                break;
              }
            }
          }
          if (n === null || n <= 0 || n > 3650) continue;
          // نطاق دقيق يبدأ من الرقم وينتهي بالوحدة — يسمح باستبدال «٥ أيام»
          // بـ«٢٤ ساعة» داخل جملة المستخدم نفسها بدل إعادة صياغتها.
          var numStart = at;
          if (numLen) numStart = at - numGap - numLen;
          // «ثلاثين (30) يوماً»: نبدأ من اللفظ لا من الرقم بين قوسين،
          // حتى لا يخرج نطاقٌ يقطع القوس فيفسد الاستبدال.
          var pre = norm.slice(Math.max(0, numStart - 26), numStart);
          var wm = pre.match(/([\u0621-\u064A]+(?: [\u0621-\u064A]+)?)(\s*\()$/);
          if (wm) {
            // الالتقاط جشع فيبتلع الكلمة السابقة («خلال ثلاثين»)، فنجرّب
            // العبارة كاملة ثم آخر كلمة فيها.
            var cand = [wm[1], wm[1].split(' ').pop()];
            for (var ci = 0; ci < cand.length; ci++) {
              if (NUM_WORDS[cand[ci]] !== undefined) {
                numStart = numStart - wm[2].length - cand[ci].length;
                break;
              }
            }
          }
          out.push({ at: at, days: n * u.days, s: Math.max(0, numStart), e: at + term.length,
                     raw: norm.slice(Math.max(0, numStart), at + term.length).trim() });
        }
      });
    });
    out.sort(function (a, b) { return a.at - b.at || b.days - a.days; });
    var dedup = [];
    out.forEach(function (d) {
      var prev = dedup[dedup.length - 1];
      if (prev && Math.abs(d.at - prev.at) <= 6) return;   // نفس العبارة بصيغة وحدة أخرى
      dedup.push(d);
    });
    return dedup;
  }

  /* ═══════════ ٥. تقطيع الجُمل ═══════════ */

  /* النقطة تُنهي جملة فقط إن تلاها فراغ أو نهاية النص.
     بدون هذا الشرط تنقطع «غرامة 1.5%» عند «1.» و«ر.س» عند «ر.»،
     فيضيع باقي البند ويخرج اقتباس مشوَّه. */
  function isBreak(norm, i) {
    var c = norm[i];
    if ('؟!؛'.indexOf(c) > -1) return true;
    if (c !== '.') return false;
    var nxt = norm[i + 1];
    return nxt === undefined || nxt === ' ';
  }
  function splitSentences(norm) {
    var out = [], start = 0, i;
    for (i = 0; i < norm.length; i++) {
      if (isBreak(norm, i)) {
        var t = norm.slice(start, i + 1).trim();
        if (t.length > 12) out.push({ start: start, end: i + 1, text: t });
        start = i + 1;
      }
    }
    var last = norm.slice(start).trim();
    if (last.length > 12) out.push({ start: start, end: norm.length, text: last });
    // تجزئة الجمل الطويلة جدًا حتى لا يصير الاقتباس صفحة كاملة
    var final = [];
    out.forEach(function (s) {
      if (s.text.length <= 420) { final.push(s); return; }
      var cut = 0;
      while (cut < s.text.length) {
        var piece = s.text.slice(cut, cut + 380);
        var sp = piece.lastIndexOf(' ');
        if (sp > 200 && cut + 380 < s.text.length) piece = piece.slice(0, sp);
        final.push({ start: s.start + cut, end: s.start + cut + piece.length, text: piece.trim() });
        cut += piece.length;
      }
    });
    return final;
  }

  /* ═══════════ ٦. الالتزامات والجزاءات ═══════════ */

  var MONEY = /(\d[\d,\.]*)\s*(ريال|ر\.س|sar|درهم|دولار)/;
  /* «عن كل يوم تأخير» تعني غرامة تتراكم — مبلغها الفعلي = القيمة × أيام التأخر */
  var PER_DAY = null, CAP_CUES = null, VALUE_CUES = null;
  var PCT = /(\d[\d\.]*)\s*(?:٪|%|في المائه|في المئه)/;

  /* يترجم إعدادات المستخدم (نص عربي خام) إلى صيغ مطبَّعة، مرة واحدة لكل إعداد.
     الذاكرة المؤقتة مفتاحها بصمة الإعداد، فتعديل الإدارة يُعاد ترجمته فورًا. */
  var _cc = { key: null, val: null };
  function compile(cfg) {
    var key = JSON.stringify(cfg);
    if (_cc.key === key) return _cc.val;
    STRUCTURAL = null; STEM_MAP = null;      // القوائم المشتقة تتبع الإعداد
    var c = {
      raw: cfg,
      deontic: normList(cfg.deontic || []),
      deonticNeg: normList(cfg.deonticNegations || []),
      prohibitive: normList((cfg.conflict && cfg.conflict.prohibitions) || []),
      parties: normList(cfg.parties || []),
      penaltyTiers: (cfg.penaltyTiers || []).map(function (t) {
        return { label: t.label, impact: +t.impact, terms: normList(t.terms || []) };
      }),
      noPenaltyImpact: +cfg.noPenaltyImpact,
      noPenaltyLabel: cfg.noPenaltyLabel,
      clauses: (cfg.clauses || []).map(function (c2) {
        return { id: c2.id, title: c2.title, group: c2.group || 'عام',
                 impact: +c2.impact, terms: normList(c2.terms || []) };
      }),
      vague: (cfg.vague || []).map(function (v) { return { term: normStr(v.term), raw: v.term, why: v.why }; }),
      sc: cfg.scoring
    };
    _cc = { key: key, val: c };
    return c;
  }

  /* سقف الغرامة: «بما لا يتجاوز 500000 ريال» أو «بحد أقصى 10٪ من قيمة العقد».
     بدون قراءته يخرج تعرّضٌ ماليٌّ مبالغ فيه أضعافًا حين تكون الغرامة يومية. */
  function findCap(normSentence) {
    if (!CAP_CUES) CAP_CUES = normList(['بما لا يتجاوز', 'بحد أقصى', 'بحد اقصى', 'على ألا تتجاوز',
      'على الا تتجاوز', 'وبحد أعلى', 'بحد أعلى', 'وبما لا يزيد', 'بما لا يزيد عن', 'ولا تتجاوز']);
    for (var i = 0; i < CAP_CUES.length; i++) {
      var k = normSentence.indexOf(CAP_CUES[i]);
      if (k === -1) continue;
      var tail = normSentence.slice(k, k + 90);
      var m = tail.match(MONEY);
      if (m) return { amount: parseFloat(m[1].replace(/,/g, '')), kind: 'مبلغ' };
      var p = tail.match(PCT);
      if (p) return { percent: parseFloat(p[1]), kind: 'نسبة' };
    }
    return null;
  }

  function classifyPenalty(normSentence, C) {
    if (!PER_DAY) PER_DAY = normList(['عن كل يوم', 'لكل يوم', 'يومياً', 'يوميا', 'عن كل يوم تأخير', 'غرامة يومية']);
    var money = normSentence.match(MONEY);
    var amount = money ? parseFloat(money[1].replace(/,/g, '')) : null;
    if (amount !== null && !isFinite(amount)) amount = null;
    var perDay = !!(amount !== null && hasAny(normSentence, PER_DAY));
    for (var i = 0; i < C.penaltyTiers.length; i++) {
      var hit = hasAny(normSentence, C.penaltyTiers[i].terms);
      if (hit) {
        var t = C.penaltyTiers[i];
        var cap = findCap(normSentence);
        return { impact: money && t.impact < 0.85 ? 0.85 : t.impact,
                 label: money ? t.label + ' (' + money[0].trim() + (perDay ? ' يوميًا' : '') +
                        (cap ? ' · سقف ' + (cap.kind === 'مبلغ' ? cap.amount.toLocaleString('en-US') : cap.percent + '٪') : '') + ')'
                        : t.label,
                 amount: amount, currency: money ? money[2] : null, perDay: perDay, cap: cap };
      }
    }
    return { impact: C.noPenaltyImpact, label: C.noPenaltyLabel, amount: null, currency: null, perDay: false, cap: null };
  }

  /* ═══════════ أكواد التتبّع ═══════════ */
  /* كود ثابت مشتق من بصمة المستند ومفتاح البند — البند نفسه يحمل
     نفس الكود في كل تحليل لاحق، فيمكن تتبّعه عبر الزمن. */
  function shortHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36).toUpperCase();
  }
  function makeCode(prefix, fp, key) {
    return prefix + '-' + (shortHash(fp) + 'XXX').slice(0, 3) + '-' + (shortHash(key) + 'XXXX').slice(0, 4);
  }

  /* ═══════════ ٨. حساب الخطر ═══════════ */

  function SC(sc) { return sc || NC.DEFAULTS.scoring; }

  /* المنحنى متصل لا درجي: القيم المضبوطة في الإعدادات هي نقاط ارتساء،
     وما بينها يُستكمل خطيًا. بدون هذا يبقى الخطر ساكنًا أسابيع ثم يقفز
     دفعة واحدة عند حدٍّ ما — والواقع أن اقتراب الموعد يزيد الخطر كل يوم. */
  function curve(d, anchors) {
    var i;
    for (i = 0; i < anchors.length - 1; i++) {
      var hi = anchors[i], lo = anchors[i + 1];       // hi.day > lo.day
      if (d >= lo.day && d <= hi.day) {
        var span = hi.day - lo.day;
        if (span <= 0) return lo.v;
        var t = (d - lo.day) / span;                  // 0 عند lo، 1 عند hi
        return lo.v + (hi.v - lo.v) * t;
      }
    }
    return d > anchors[0].day ? anchors[0].v : anchors[anchors.length - 1].v;
  }

  function timeDecay(d, sc) {
    var k = SC(sc).decay;
    if (d === null || d === undefined) return 1.0;
    // كلما طال التجاوز زاد الخطر، بسقف عند ضعف قيمة التجاوز
    if (d < 0) return Math.min(k.overdue * 2, k.overdue * (1 + Math.min(-d, 180) / 360));
    return curve(d, [{ day: 90, v: k.d90 }, { day: 30, v: k.d30 },
                     { day: 14, v: k.d14 }, { day: 7, v: k.d7 }, { day: 0, v: k.overdue }]);
  }
  function probFromDays(d, sc) {
    var k = SC(sc).probability;
    if (d === null || d === undefined) return k.none;   // غياب الموعد نفسه سببٌ للتأخر
    if (d < 0) return k.overdue;
    return curve(d, [{ day: 90, v: k.d90 }, { day: 30, v: k.d30 },
                     { day: 7, v: k.d7 }, { day: 0, v: k.overdue }]);
  }
  function urgencyLabel(d) {
    if (d === null || d === undefined) return 'غير مؤرّخ';
    if (d < 0)  return 'متجاوز';
    if (d < 14) return 'حرج';
    if (d < 45) return 'قريب';
    return 'مراقبة';
  }
  var clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
  function itemRisk(p, i, d, sc) {
    return Math.round(clamp(clamp(p, 0, 1) * clamp(i, 0, 1) * timeDecay(d, sc) * 100, 0, 100));
  }
  /* الدرجة الكلية: ٦٠٪ من أعلى بند + ٤٠٪ من الجذر التربيعي للمتوسط.
     الحد الأعلى يمنع بندًا حرجًا واحدًا من أن تبتلعه بنود هادئة —
     وهو ما لا يفعله الجذر التربيعي وحده. */
  function aggregateRisk(items, sc) {
    if (!items.length) return 0;
    var w = SC(sc).aggregate;
    var max = Math.max.apply(null, items);
    var rms = Math.sqrt(items.reduce(function (a, x) { return a + x * x; }, 0) / items.length);
    return Math.round(max * w.maxWeight + rms * w.rmsWeight);
  }
  function sevFromRisk(r, sc) {
    var t = SC(sc).thresholds;
    return r >= t.critical ? 'critical' : r >= t.medium ? 'medium' : 'low';
  }

  /* ═══════════ ٩. التحليل ═══════════ */

  var STOP = normList(['من','إلى','على','في','عن','مع','هذا','هذه','ذلك','التي','الذي','أن','إن',
    'ما','لا','قد','كل','بين','عند','بعد','قبل','أو','و','ثم','كما','حيث','وفق','وفقاً','بموجب','يتم','تم']);

  /* ألفاظ الإلزام وأسماء الأطراف تتكرر في كل بند، فوجودها لا يدل على تغطية
     الموضوع. نستبعدها حتى تُقارَن الكلمات الموضوعية وحدها. */
  var STRUCTURAL = null, CC = null;
  function structuralWords() {
    if (STRUCTURAL) return STRUCTURAL;
    // contentWords قد تُستدعى من خارج analyze (كاشف التعارض مثلًا)،
    // فنسقط على الإعدادات الافتراضية بدل الانهيار.
    if (!CC) CC = compile(NC.DEFAULTS);
    STRUCTURAL = {};
    STOP.concat(CC.deontic, CC.parties).forEach(function (t) {
      t.split(' ').forEach(function (w) { if (w.length > 1) STRUCTURAL[w] = 1; });
    });
    return STRUCTURAL;
  }
  /* تجذير خفيف: العربية تصرّف الكلمة الواحدة بصيغ كثيرة («مستقل/مستقلة/المستقلة»)
     فبدونه تُعدّ صيغتان لنفس الكلمة غير متطابقتين وتنهار المطابقة. */
  var STEM_MAP = null;
  function stem(w) {
    if (!STEM_MAP) {
      STEM_MAP = {};
      var raw = (CC && CC.raw && CC.raw.stemMap) || NC.DEFAULTS.stemMap || {};
      Object.keys(raw).forEach(function (k) { STEM_MAP[normStr(k)] = normStr(raw[k]); });
    }
    var bare = w.replace(/^(وال|بال|كال|فال|ال|و|ب|ل|ف|ك)/, '');
    if (STEM_MAP[w]) w = STEM_MAP[w];
    else if (STEM_MAP[bare]) w = STEM_MAP[bare];
    w = w.replace(/^(وال|بال|كال|فال|ال|و|ب|ل|ف|ك)/, '');
    w = w.replace(/(اتها|اتهم|يتها|ياتهم|هما|كما|هم|هن|نا|كم|ها|ه|ي)$/, '');
    w = w.replace(/(اتين|ييه|يات|ات|ين|ون|يه|ية|ه|ا)$/, '');
    return w.length >= 3 ? w : null;
  }
  function contentWords(normText) {
    var sw = structuralWords(), out = [], seen = {};
    normText.split(/[^ء-ي0-9a-z]+/).forEach(function (w) {
      if (w.length <= 2 || sw[w]) return;
      var st = stem(w);
      if (!st || sw[st] || seen[st]) return;
      seen[st] = 1; out.push(st);
    });
    return out;
  }

  function analyze(opts) {
    var C = compile(NC.merge(NC.DEFAULTS, opts.config || null));
    var sc = C.sc, COVER_THRESHOLD = sc.coverageThreshold;
    CC = C; STRUCTURAL = null;               // إعادة بناء قائمة الكلمات الهيكلية لهذا الإعداد
    var text = opts.docText || '';
    var refText = opts.refText || '';
    var today = todayUTC(opts.todayISO);
    var focus = normList((opts.context || '').split(/[،,\n]/).filter(Boolean));

    var nm = normMap(text);
    var norm = nm.norm, map = nm.map;
    var toOrig = function (a, b) {
      if (!map.length) return { start: 0, end: 0 };
      return { start: map[clamp(a, 0, map.length - 1)],
               end: map[clamp(b - 1, 0, map.length - 1)] + 1 };
    };
    var quoteAt = function (a, b) { var r = toOrig(a, b); return text.slice(r.start, r.end).trim(); };

    /* قيمة العقد — لتحويل السقف النسبي إلى مبلغ. إن لم تُذكر، يبقى
       التعرّض «غير محسوب» بدل أن نعرض رقمًا نعرف أنه فوق السقف. */
    if (!VALUE_CUES) VALUE_CUES = normList(['قيمة العقد', 'إجمالي قيمة العقد', 'قيمة هذا العقد',
      'القيمة الإجمالية', 'قيمة الاتفاقية', 'مبلغ العقد']);
    var contractValue = null;
    for (var vi = 0; vi < VALUE_CUES.length; vi++) {
      var vk = norm.indexOf(VALUE_CUES[vi]);
      if (vk === -1) continue;
      var vm = norm.slice(vk, vk + 90).match(MONEY);
      if (vm) { contractValue = parseFloat(vm[1].replace(/,/g, '')); break; }
    }

    var sentences = splitSentences(norm);
    var dates = findDates(norm);
    var durations = findDurations(norm);

    /* تاريخ المرجع (تاريخ التحرير) — أول تاريخ في مقدمة المستند، تُسنَد إليه المدد النسبية */
    var anchor = null;
    var headEnd = Math.max(1200, Math.floor(norm.length * 0.12));
    for (var ai = 0; ai < dates.length; ai++) {
      if (dates[ai].at < headEnd) { anchor = dates[ai]; break; }
    }

    /* إشارات الاستحقاق: التاريخ الذي تسبقه إحداها هو الموعد المقصود،
       لا أول تاريخ في الجملة. «يبدأ 2026-09-01 وينتهي 2026-12-31» موعده
       الثاني لا الأول — فإن لم توجد إشارة نأخذ آخر تاريخ. */
    var DUE_CUES = normList(['قبل تاريخ', 'بحلول', 'في موعد أقصاه', 'موعد أقصاه', 'حتى تاريخ',
      'في موعد لا يتجاوز', 'لا يتجاوز تاريخ', 'قبل حلول', 'في تاريخ أقصاه', 'وينتهي', 'الانتهاء']);
    /* الإشارة يجب أن تلاصق التاريخ. بنافذة واسعة تلتقطُ إشارةَ تاريخٍ
       سابق: «قبل تاريخ 2026-11-30 وليس 2026-02-01» كانت تُعدّ الإشارة
       سابقةً للتاريخ الثاني أيضًا. */
    var BASE_CUES = normList(['من تاريخ', 'اعتباراً من', 'اعتبارا من', 'ابتداءً من', 'بدءاً من', 'من']);
    function nearCue(at, cues, span, tail) {
      var win = norm.slice(Math.max(0, at - span), at);
      var hit = hasAny(win, cues);
      if (!hit) return false;
      return win.lastIndexOf(hit) + hit.length >= win.length - tail;
    }
    var cueBefore = function (at) { return nearCue(at, DUE_CUES, 18, 9); };

    function pickDeadline(a, b) {
      var inRange = dates.filter(function (x) { return x.at >= a && x.at < b; });
      var dur = durations.filter(function (x) { return x.at >= a && x.at < b; })[0];

      /* «خلال ثلاثين يوماً من تاريخ 2026/01/10» موعده التاريخ + المدة،
         لا التاريخ نفسه — فالتاريخ هنا أساسٌ لا استحقاق. */
      if (dur && inRange.length) {
        var base = inRange.filter(function (x) {
          return x.at > dur.at && nearCue(x.at, BASE_CUES, 16, 8);
        })[0];
        if (base) {
          return { ts: base.ts + dur.days * DAY, approx: base.approx,
                   raw: dur.raw + ' (من ' + base.raw + ')' };
        }
      }
      if (inRange.length) {
        var cued = inRange.filter(function (x) { return cueBefore(x.at); });
        var pick = cued.length ? cued[cued.length - 1] : inRange[inRange.length - 1];
        return { ts: pick.ts, raw: pick.raw, approx: pick.approx };
      }
      if (!dur) return null;
      return { ts: anchor ? anchor.ts + dur.days * DAY : null,
               raw: dur.raw + (anchor ? ' (من ' + anchor.raw + ')' : ' (بلا تاريخ مرجعي)'),
               approx: anchor ? anchor.approx : false };
    }
    var nextIdx = {};
    sentences.forEach(function (s2, i2) { if (i2 + 1 < sentences.length) nextIdx[s2.start] = i2 + 1; });

    /* جزاءٌ عام يسري على المستند كله: «يترتب على مخالفة أحكام هذه اللائحة...».
       بدونه يخرج كل بندٍ لم يذكر جزاءه بأثر 0.35 مع أن الفسخ يشمله. */
    var GENERAL_SCOPE = normList(['مخالفة أحكام هذه', 'مخالفة هذه', 'أي مخالفة', 'مخالفة أحكام',
      'مخالفة هذا العقد', 'مخالفة هذه السياسة', 'مخالفة هذه اللائحة', 'الإخلال بأحكام', 'الإخلال بهذه']);
    var docPenalty = null;
    sentences.forEach(function (s2) {
      if (!hasAny(s2.text, GENERAL_SCOPE)) return;
      var p = classifyPenalty(s2.text, C);
      if (p.impact <= C.noPenaltyImpact) return;
      if (!docPenalty || p.impact > docPenalty.impact) {
        docPenalty = { impact: p.impact, label: p.label, quote: quoteAt(s2.start, s2.end) };
      }
    });

    /* ── الالتزامات ── */
    var obligations = [];
    sentences.forEach(function (s) {
      var marker = hasAny(s.text, C.deontic);
      if (!marker) return;
      /* «لا يلتزم المورد بتقديم تقارير» إعفاء لا التزام. أما «لا يجوز»
         و«يحظر» فهي التزام بالامتناع، ولذلك تُستثنى من إلغاء النفي. */
      if (hasAny(s.text, C.deonticNeg) && !hasAny(s.text, C.prohibitive)) return;

      var picked = pickDeadline(s.start, s.end);
      // ٥) الموعد قد يرد في الجملة التالية: «يلتزم المورد بالتسليم. ويكون
      //    ذلك خلال ثلاثين يوماً». نأخذها فقط إن لم تكن التزامًا مستقلًا.
      var fromNext = false;
      if (!picked && nextIdx[s.start] !== undefined) {
        var nx = sentences[nextIdx[s.start]];
        if (nx && !hasAny(nx.text, C.deontic)) {
          picked = pickDeadline(nx.start, nx.end);
          fromNext = !!picked;
        }
      }
      var d = picked ? picked.ts : null;
      var source = picked ? picked.raw + (fromNext ? ' (من الجملة التالية)' : '') : null;
      var approx = picked ? picked.approx : false;

      var days = d === null ? null : Math.round((d - today) / DAY);
      var pen = classifyPenalty(s.text, C);
      /* الجزاء العام أضعف دلالةً من المنصوص في البند نفسه، فيُخصم منه قليلًا */
      var generalPenalty = false;
      if (pen.impact <= C.noPenaltyImpact && docPenalty) {
        pen = { impact: Math.max(C.noPenaltyImpact, docPenalty.impact * 0.85),
                label: 'جزاء عام: ' + docPenalty.label, amount: null, currency: null, perDay: false, cap: null };
        generalPenalty = true;
      }
      var party = hasAny(s.text, C.parties);
      var q = quoteAt(s.start, s.end);
      obligations.push({
        quote: q, marker: marker, party: party,
        rawDeadline: source, deadlineTS: d, approxDate: approx,
        daysRemaining: days, urgency: urgencyLabel(days),
        penalty: pen.label, impact: pen.impact,
        penaltyAmount: pen.amount, penaltyCurrency: pen.currency, penaltyPerDay: pen.perDay,
        penaltyCap: pen.cap, generalPenalty: generalPenalty,
        probability: probFromDays(days, sc),
        risk: itemRisk(probFromDays(days, sc), pen.impact, days, sc),
        focused: focus.length ? focus.some(function (f) { return s.text.indexOf(f) > -1; }) : false,
        _s: s.start, _e: s.end
      });
    });
    obligations.forEach(function (o, i) {
      o.severity = sevFromRisk(o.risk, sc);
      /* التعرض المالي: المتجاوز غرامته جارية (× أيام التأخر إن كانت يومية)،
         والقادم غرامته محتملة عند التخلف. */
      o.exposure = null; o.exposureNote = null;
      if (o.penaltyAmount !== null && o.penaltyAmount !== undefined && o.daysRemaining !== null) {
        var raw = o.penaltyPerDay && o.daysRemaining < 0
          ? o.penaltyAmount * Math.min(-o.daysRemaining, 3650)
          : o.penaltyAmount;
        var cap = o.penaltyCap;
        if (cap && cap.kind === 'مبلغ') {
          o.exposure = Math.min(raw, cap.amount);
          if (raw > cap.amount) o.exposureNote = 'بلغ السقف المنصوص (' + cap.amount.toLocaleString('en-US') + ')';
        } else if (cap && cap.kind === 'نسبة') {
          if (contractValue) {
            var capAmt = contractValue * cap.percent / 100;
            o.exposure = Math.min(raw, capAmt);
            o.exposureNote = 'سقف ' + cap.percent + '٪ من قيمة العقد = ' + Math.round(capAmt).toLocaleString('en-US');
          } else {
            // سقف نسبي وقيمة العقد غير مذكورة: أي رقم نعرضه قد يتجاوز السقف
            o.exposure = null;
            o.exposureNote = 'محدود بـ' + cap.percent + '٪ من قيمة العقد — القيمة غير مذكورة في المستند';
          }
        } else {
          o.exposure = raw;
        }
        o.exposureAccruing = o.daysRemaining < 0;
      }
      o.key = normStr(o.quote).slice(0, 70);
      o.index = i;
    });

    /* ── الفجوات ── */
    var gaps = [];
    function pushGap(g) {
      var d = g.daysRemaining === undefined ? null : g.daysRemaining;
      g.risk = itemRisk(g.probability, g.impact, d, sc);
      g.severity = sevFromRisk(g.risk, sc);
      g.decay = timeDecay(d, sc);
      // الاقتباس جزء من المفتاح: فجوتان بنفس العنوان (كـ«التزام غير محدد المدة»)
      // تنتميان لبندين مختلفين ويجب أن تحملا كودين مختلفين.
      g.key = g.type + '|' + normStr(g.title).slice(0, 50) + '|' + normStr(g.evidence || '').slice(0, 60);
      gaps.push(g);
    }

    // (أ) مواعيد متجاوزة
    obligations.filter(function (o) { return o.daysRemaining !== null && o.daysRemaining < 0; })
      .forEach(function (o) {
        pushGap({ type: 'موعد متجاوز', title: 'موعد انقضى منذ ' + Math.abs(o.daysRemaining) + ' يومًا',
          description: 'التزام مؤرّخ مضى موعده ولم يرد في المستند ما يفيد تنفيذه أو تمديده.' +
            (o.penalty !== 'لا جزاء منصوص عليه' ? ' الجزاء المنصوص: ' + o.penalty + '.' : ''),
          recommendation: 'وثّق التنفيذ أو اطلب تمديدًا كتابيًا قبل تفعيل الجزاء.',
          evidence: o.quote, evidenceType: 'quote',
          probability: o.probability, impact: o.impact, daysRemaining: o.daysRemaining });
      });

    // (ب) التزام بلا موعد
    obligations.filter(function (o) { return o.daysRemaining === null; })
      .forEach(function (o) {
        pushGap({ type: 'التزام بلا موعد', title: 'التزام غير محدد المدة',
          description: 'الجملة تحمل صيغة إلزام («' + o.marker + '») دون تاريخ أو مدة يمكن قياس التأخر عنها.',
          recommendation: 'أضف موعدًا صريحًا أو مدة محسوبة من تاريخ محدد.',
          evidence: o.quote, evidenceType: 'quote',
          probability: sc.gapProbability.noDeadline, impact: o.impact, daysRemaining: null });
      });

    // (ج) صياغة فضفاضة
    C.vague.forEach(function (v) {
      var idx = norm.indexOf(v.term);
      if (idx === -1) return;
      var host = sentences.filter(function (s) { return idx >= s.start && idx < s.end; })[0];
      pushGap({ type: 'صياغة فضفاضة', title: 'عبارة غير قابلة للقياس: «' + v.raw + '»',
        description: v.why + '.', recommendation: 'استبدلها بمدة أو تاريخ أو معيار قابل للتحقق.',
        evidence: host ? quoteAt(host.start, host.end) : quoteAt(idx, idx + v.term.length + 60),
        evidenceType: 'quote', probability: sc.gapProbability.vague, impact: sc.gapImpact.vague, daysRemaining: null });
    });

    // (د) بنود معيارية غائبة
    /* نوع المستند يحدد أي مجموعات بنود تُفحص. «فحص كل البنود» أو نوع
       غير معروف يعني فحص الكل كما كان. */
    var groups = C.raw.docTypes ? C.raw.docTypes[opts.docType] : null;
    var activeClauses = groups
      ? C.clauses.filter(function (c) { return groups.indexOf(c.group || 'عام') > -1; })
      : C.clauses;
    var clauseReport = activeClauses.map(function (c) {
      var hit = hasAny(norm, c.terms);
      return { id: c.id, title: c.title, present: !!hit, hit: hit, impact: c.impact };
    });
    clauseReport.filter(function (c) { return !c.present; }).forEach(function (c) {
      pushGap({ type: 'بند مفقود', title: 'لا يوجد بند: ' + c.title,
        description: 'بحثنا عن كل الصيغ الشائعة لهذا البند في المستند ولم نجد أيًّا منها.',
        recommendation: 'أضف بندًا يعالج «' + c.title + '» أو وثّق سبب استبعاده.',
        evidence: null, evidenceType: 'absence',
        probability: sc.gapProbability.missingClause, impact: c.impact, daysRemaining: null });
    });

    gaps.sort(function (a, b) { return b.risk - a.risk; });

    /* ── التنبؤات: كل التزام مؤرّخ لم يحن موعده بعد ── */
    var preds = obligations
      .filter(function (o) { return o.daysRemaining !== null && o.daysRemaining >= 0; })
      .sort(function (a, b) { return a.daysRemaining - b.daysRemaining; })
      .map(function (o) {
        return { title: 'يستحق خلال ' + o.daysRemaining + ' يومًا',
          trigger: o.rawDeadline || '—', approxDate: o.approxDate,
          deadlineISO: new Date(o.deadlineTS).toISOString().slice(0, 10),
          consequence: o.penalty === 'لا جزاء منصوص عليه'
            ? 'لم ينص المستند على جزاء صريح لهذا التأخر — الأثر تعاقدي عام.'
            : 'عند التأخر يترتب: ' + o.penalty + '.',
          recommendation: o.daysRemaining < 14
            ? 'ابدأ التنفيذ الآن — النافذة أقل من أسبوعين.'
            : 'أدرجه في خطة الربع وحدّد مسؤولًا.',
          evidence: o.quote, daysRemaining: o.daysRemaining, obKey: o.key, obIndex: o.index,
          risk: o.risk, severity: o.severity };
      });

    /* ── التغطية مقابل المرجع ── */
    var coverage = null;
    if (refText && refText.trim()) {
      var rn = normMap(refText), rSent = splitSentences(rn.norm);
      var docWords = sentences.map(function (s) { return contentWords(s.text); });

      /* الندرة تُقاس على المرجع نفسه، لا على مستندك.
         لو قِستها على مستندك لحصلت الكلمةُ الغائبة عنه تمامًا على أعلى ندرة،
         فتُختار ضمن «الكلمات المميّزة» وهي مضمونة الغياب — عكس المقصود.
         على المرجع: «المؤسسة» ترد في كل مادة فتضعف، و«الاختراق» ترد في مادة
         واحدة فتقوى، وهي فعلًا الكلمة التي تحدد موضوع المتطلب. */
      var refWordSets = rSent.map(function (s2) { return contentWords(s2.text); });
      var df = {};
      refWordSets.forEach(function (rw) {
        var once = {};
        rw.forEach(function (w) { if (!once[w]) { once[w] = 1; df[w] = (df[w] || 0) + 1; } });
      });
      var N = Math.max(1, refWordSets.length);
      var idf = function (w) { return Math.log(1 + N / (1 + (df[w] || 0))); };

      /* السؤال: هل تعالج الإجراءات موضوع هذا المتطلب؟
         نقيسه على أميز ٦ كلمات في المتطلب (الأعلى ندرةً) لأن جملة المتطلب
         أطول عادةً من البند المقابل، فقياس كل كلماتها يظلم التغطية الحقيقية.
         الدليل المعروض يبقى البند الأقرب لفظًا. */
      var TOPK = 6;
      var docAll = {};
      docWords.forEach(function (dw) { dw.forEach(function (w) { docAll[w] = 1; }); });

      var reqs = rSent.filter(function (s) { return hasAny(s.text, C.deontic); }).map(function (s) {
        var need = contentWords(s.text).sort(function (a, b) { return idf(b) - idf(a); }).slice(0, TOPK);
        var total = need.reduce(function (a, w) { return a + idf(w); }, 0);
        var found = need.reduce(function (a, w) { return a + (docAll[w] ? idf(w) : 0); }, 0);
        var score = total ? found / total : 0;

        var best = 0, bestIdx = -1;
        docWords.forEach(function (dw, i) {
          if (!total) return;
          var hit = need.reduce(function (a, w) { return a + (dw.indexOf(w) > -1 ? idf(w) : 0); }, 0) / total;
          if (hit > best) { best = hit; bestIdx = i; }
        });

        return { requirement: refText.slice(rn.map[s.start], rn.map[Math.min(s.end, rn.map.length) - 1] + 1).trim(),
                 met: score >= COVER_THRESHOLD, score: Math.round(score * 100), terms: need,
                 matched: bestIdx > -1 ? quoteAt(sentences[bestIdx].start, sentences[bestIdx].end) : null };
      });

      if (reqs.length) {
        coverage = { requirements: reqs,
          score: Math.round(reqs.filter(function (r) { return r.met; }).length / reqs.length * 100) };
        reqs.filter(function (r) { return !r.met; }).forEach(function (r) {
          pushGap({ type: 'متطلب غير مغطى', title: 'متطلب من المرجع بلا ما يقابله',
            description: 'أقوى تطابق لفظي وجدناه في مستندك كان ' + r.score + '٪ فقط.',
            recommendation: 'أضف بندًا يقابل هذا المتطلب صراحةً.',
            evidence: r.requirement, evidenceType: 'reference',
            probability: sc.gapProbability.uncovered, impact: sc.gapImpact.uncovered, daysRemaining: null });
        });
        gaps.sort(function (a, b) { return b.risk - a.risk; });
      }
    }

    var stats = { critical: 0, medium: 0, low: 0 };
    gaps.forEach(function (g) { stats[g.severity]++; });

    var allRisks = gaps.map(function (g) { return g.risk; })
                     .concat(preds.map(function (p) { return p.risk; }));
    var riskScore = aggregateRisk(allRisks, sc);
    // القيمة غير المدوَّرة تُحفظ في تاريخ المستند، فيظهر منحنى الخطر متصلًا
    // بدل أن تبتلع التقريبُ حركةَ يومٍ واحد.
    var riskExact = allRisks.length
      ? Math.max.apply(null, allRisks) * sc.aggregate.maxWeight +
        Math.sqrt(allRisks.reduce(function (a, x) { return a + x * x; }, 0) / allRisks.length) * sc.aggregate.rmsWeight
      : 0;

    /* أكواد تتبّع ثابتة — نفس البند يحمل نفس الكود في كل تحليل لاحق.
       أي تصادم متبقٍ يُفَك بلاحقة ترتيبية، وهي ثابتة ما دام النص ثابتًا. */
    function uniqueKeys(items) {
      var seen = {};
      items.forEach(function (it) {
        var k = it.key;
        if (seen[k] === undefined) { seen[k] = 0; return; }
        seen[k]++; it.key = k + '#' + seen[k];
      });
    }
    var fp = fingerprint(norm);
    uniqueKeys(gaps);
    uniqueKeys(obligations);
    preds.forEach(function (p) {
      var ob = obligations.filter(function (o) { return o.index === p.obIndex; })[0];
      if (ob) p.obKey = ob.key;
    });
    gaps.forEach(function (g) { g.code = makeCode('G', fp, g.key); });
    obligations.forEach(function (o) { o.code = makeCode('OB', fp, o.key); });
    preds.forEach(function (p) { p.code = makeCode('DL', fp, p.obKey); });

    return {
      riskScore: riskScore, riskExact: riskExact, stats: stats, gaps: gaps, preds: preds,
      obligations: obligations.sort(function (a, b) {
        var x = a.daysRemaining === null ? 1e9 : a.daysRemaining;
        var y = b.daysRemaining === null ? 1e9 : b.daysRemaining;
        return x - y;
      }),
      clauseReport: clauseReport, coverage: coverage,
      docPenalty: docPenalty, contractValue: contractValue, docType: opts.docType || null,
      anchorDate: anchor ? { raw: anchor.raw, iso: new Date(anchor.ts).toISOString().slice(0, 10), approx: anchor.approx } : null,
      counts: { sentences: sentences.length, dates: dates.length, durations: durations.length, chars: text.length },
      fingerprint: fp,
      generatedAt: Date.now()
    };
  }

  function fingerprint(norm) {
    var n = norm.slice(0, 40000), h = 0;
    for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
    return 'fp' + Math.abs(h).toString(36) + '_' + n.length;
  }

  /* موضع اقتباس في النص الأصلي — لإبرازه في العارض */
  function locateQuote(sourceText, quote) {
    if (!quote || !sourceText) return null;
    var nm = normMap(sourceText), q = normStr(quote);
    if (q.length < 8) return null;
    var k = nm.norm.indexOf(q);
    if (k === -1) {
      var head = q.slice(0, 40);
      if (head.length < 12) return null;
      k = nm.norm.indexOf(head);
      if (k === -1) return null;
      q = head;
    }
    return { start: nm.map[k], end: nm.map[Math.min(k + q.length - 1, nm.map.length - 1)] + 1 };
  }

  return {
    analyze: analyze, locateQuote: locateQuote, normStr: normStr, normMap: normMap,
    findDates: findDates, findDurations: findDurations, splitSentences: splitSentences,
    NUM_WORDS: NUM_WORDS,
    hijriToUTC: hijriToUTC, todayUTC: todayUTC,
    timeDecay: timeDecay, itemRisk: itemRisk, aggregateRisk: aggregateRisk, curve: curve,
    sevFromRisk: sevFromRisk, probFromDays: probFromDays, urgencyLabel: urgencyLabel,
    makeCode: makeCode, shortHash: shortHash, compile: compile,
    stem: stem, contentWords: contentWords, normList: normList, hasAny: hasAny
  };
});
