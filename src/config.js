/* نذير — الإعدادات القابلة للتعديل من لوحة الإدارة.
   كل جدول هنا يظهر في «إعدادات المحرك» ويمكن تحريره وتصديره واستيراده. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NadheerConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 3;

  var DEFAULTS = {
    version: VERSION,

    /* صيغ الإلزام — وجود أيٍّ منها في جملة يجعلها التزامًا */
    deontic: ['يجب','يتعين','يتوجب','يلتزم','تلتزم','ملزم','ملزمة','على الطرف','على المورد',
      'على المقاول','يتعهد','تتعهد','يقر','لا يجوز','يحظر','يمتنع','يشترط','بشرط','شريطة',
      'عليه أن','عليها أن','مسؤول عن','مسؤولة عن','يتحمل','تتحمل','وجب','ينبغي'],

    /* أسماء الأطراف — لنسبة الالتزام لطرفه */
    parties: ['الطرف الأول','الطرف الثاني','المورد','المقاول','المستفيد','العميل','الجهة الحكومية',
      'صاحب الترخيص','المرخص له','المستأجر','المؤجر','الشركة','الموظف','البائع','المشتري'],

    /* درجات الجزاء — تُفحص بالترتيب، وأول تطابق يحدد الأثر */
    penaltyTiers: [
      { id:'t1', label:'إنهاء أو سحب',   impact:1.00, terms:['فسخ','إلغاء العقد','إنهاء العقد','سحب الترخيص','إلغاء الترخيص','شطب','إيقاف النشاط','الحرمان من'] },
      { id:'t2', label:'غرامة محددة',    impact:0.85, terms:['غرامة قدرها','غرامة مقدارها','شرط جزائي','غرامة تأخير','غرامة يومية'] },
      { id:'t3', label:'غرامة أو تعويض', impact:0.70, terms:['غرامة','جزاء','جزائية','تعويض','مخالفة','عقوبة','مساءلة','خصم'] },
      { id:'t4', label:'إنذار',          impact:0.40, terms:['إنذار','لفت نظر','تنبيه','ملاحظة كتابية'] }
    ],
    noPenaltyImpact: 0.35,
    noPenaltyLabel: 'لا جزاء منصوص عليه',

    /* البنود المعيارية — غياب أيٍّ منها يُنتج فجوة «بند مفقود» */
    clauses: [
      { id:'conf',    title:'السرية وحماية المعلومات', impact:0.80, terms:['سرية','السرية','معلومات سرية','عدم الإفصاح','عدم إفشاء','كتمان'] },
      { id:'pdpl',    title:'حماية البيانات الشخصية',  impact:0.90, terms:['البيانات الشخصية','بيانات شخصية','الخصوصية','حماية البيانات'] },
      { id:'term',    title:'إنهاء العقد وفسخه',       impact:0.85, terms:['إنهاء العقد','فسخ العقد','إنهاء الاتفاقية','الفسخ'] },
      { id:'dispute', title:'تسوية المنازعات',          impact:0.75, terms:['المنازعات','النزاع','التحكيم','المحكمة','الاختصاص القضائي','لجنة الفصل'] },
      { id:'force',   title:'القوة القاهرة',            impact:0.55, terms:['القوة القاهرة','قوة قاهرة','الظروف القاهرة'] },
      { id:'ip',      title:'الملكية الفكرية',          impact:0.70, terms:['الملكية الفكرية','حقوق الملكية','براءة اختراع','العلامة التجارية','حقوق النشر'] },
      { id:'penalty', title:'الجزاءات والغرامات',       impact:0.80, terms:['غرامة','الشرط الجزائي','جزاء','عقوبة'] },
      { id:'warranty',title:'الضمان والكفالة',          impact:0.65, terms:['ضمان','الكفالة','ضمان بنكي','خطاب ضمان'] },
      { id:'ins',     title:'التأمين',                  impact:0.60, terms:['التأمين','بوليصة','وثيقة تأمين'] },
      { id:'amend',   title:'تعديل العقد وملاحقه',      impact:0.50, terms:['تعديل العقد','ملحق','الملاحق','تعديل الاتفاقية'] },
      { id:'notice',  title:'الإشعارات والمراسلات',     impact:0.45, terms:['إشعار','إخطار','المراسلات','العنوان الوطني'] },
      { id:'regs',    title:'الالتزام بالأنظمة السارية',impact:0.75, terms:['الأنظمة','اللوائح','النظام السعودي','الجهات المختصة','الأنظمة النافذة'] },
      { id:'liab',    title:'حدود المسؤولية',           impact:0.70, terms:['حدود المسؤولية','حد المسؤولية','المسؤولية عن الأضرار','إعفاء من المسؤولية'] },
      { id:'assign',  title:'التنازل عن العقد',         impact:0.50, terms:['التنازل','تنازل الطرف','حوالة الحق','التعاقد من الباطن'] },
      { id:'pay',     title:'الدفع والمستحقات',         impact:0.70, terms:['الدفع','السداد','الفاتورة','المستحقات','الدفعة'] }
    ],

    /* عبارات غير قابلة للقياس */
    vague: [
      { term:'في وقت مناسب',        why:'لا يحدد موعدًا يمكن قياس التأخر عنه' },
      { term:'في أقرب وقت',         why:'لا يحدد موعدًا يمكن قياس التأخر عنه' },
      { term:'بالسرعة الممكنة',     why:'لا يحدد موعدًا يمكن قياس التأخر عنه' },
      { term:'بشكل دوري',           why:'لا يحدد دورية محددة (شهري؟ سنوي؟)' },
      { term:'بصورة منتظمة',        why:'لا يحدد دورية محددة' },
      { term:'من وقت لآخر',         why:'يترك التوقيت مفتوحًا بلا سقف' },
      { term:'حسب الحاجة',          why:'يترك التقدير لطرف واحد بلا معيار' },
      { term:'عند الاقتضاء',        why:'يترك التقدير لطرف واحد بلا معيار' },
      { term:'حسب ما يراه مناسباً', why:'سلطة تقديرية مطلقة بلا ضابط' },
      { term:'ما يلزم',             why:'نطاق الالتزام غير محدد' },
      { term:'الجهة المختصة',       why:'لم تُسمَّ الجهة صراحة' }
    ],

    /* معاملات الحساب */
    scoring: {
      probability: { overdue:0.95, d7:0.75, d30:0.55, d90:0.35, far:0.20, none:0.50 },
      decay:       { overdue:1.60, d7:1.45, d14:1.30, d30:1.15, d90:1.00, far:0.85 },
      thresholds:  { critical:66, medium:33 },
      aggregate:   { maxWeight:0.6, rmsWeight:0.4 },
      coverageThreshold: 0.45,
      gapProbability: { missingClause:0.60, vague:0.55, uncovered:0.60, noDeadline:0.50 },
      gapImpact:      { vague:0.55, uncovered:0.75 }
    },

    /* الجهات والجهد المقترحان لكل نوع فجوة */
    remediation: {
      'موعد متجاوز':     { owner:'إدارة العقود',      effort:'عاجل — أيام' },
      'التزام بلا موعد': { owner:'الإدارة القانونية', effort:'متوسط — أسبوع' },
      'صياغة فضفاضة':    { owner:'الإدارة القانونية', effort:'منخفض — أيام' },
      'بند مفقود':       { owner:'الإدارة القانونية', effort:'متوسط — أسبوعان' },
      'متطلب غير مغطى':  { owner:'إدارة الالتزام',    effort:'متوسط — أسبوعان' }
    }
  };

  var KEY = 'nadheer:config:v3';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* دمج عميق: أي مفتاح غائب من إعدادات المستخدم يعود لقيمته الافتراضية،
     فترقية النسخة لا تكسر إعدادات محفوظة قديمة. */
  function merge(base, over) {
    if (over === null || over === undefined) return clone(base);
    if (Array.isArray(base)) return Array.isArray(over) ? clone(over) : clone(base);
    if (typeof base !== 'object') return typeof over === typeof base ? over : base;
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = merge(base[k], over[k]);
    return out;
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      return merge(DEFAULTS, JSON.parse(raw));
    } catch (e) { return clone(DEFAULTS); }
  }
  function save(cfg) {
    cfg.version = VERSION;
    try { window.localStorage.setItem(KEY, JSON.stringify(cfg)); return true; }
    catch (e) { return false; }
  }
  function reset() {
    try { window.localStorage.removeItem(KEY); } catch (e) {}
    return clone(DEFAULTS);
  }

  /* مقارنة إعدادين لإنتاج سطور «ما تغيّر» في سجل التتبع */
  function diff(a, b, prefix) {
    prefix = prefix || '';
    var out = [], k;
    for (k in b) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      var pa = a ? a[k] : undefined, pb = b[k], p = prefix ? prefix + '.' + k : k;
      if (pb && typeof pb === 'object' && !Array.isArray(pb)) out = out.concat(diff(pa || {}, pb, p));
      else {
        var sa = JSON.stringify(pa), sb = JSON.stringify(pb);
        if (sa !== sb) out.push({ path: p, from: sa, to: sb });
      }
    }
    return out;
  }

  return { DEFAULTS: DEFAULTS, VERSION: VERSION, load: load, save: save, reset: reset,
           merge: merge, clone: clone, diff: diff };
});
