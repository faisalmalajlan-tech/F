const E = require('../src/engine.js');
const sample = require('./sample.js');
let pass=0, fail=0;
const ok=(c,m)=>{ c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m)); };

console.log('\n— التقويم —');
const h = new Date(E.hijriToUTC(1447,1,1)).toISOString().slice(0,10);
ok(h.startsWith('2025-06'), '1 محرم 1447 ≈ يونيو 2025 (got '+h+')');

console.log('\n— تجميع الخطر —');
ok(E.aggregateRisk([95,5,5,5,5])>=70, 'بند حرج واحد لا تبتلعه البنود الهادئة: '+E.aggregateRisk([95,5,5,5,5]));
ok(E.aggregateRisk([95])===95, 'بند واحد = درجته');
ok(E.aggregateRisk([10,10,10])===10, 'كلها منخفضة = منخفضة');
ok(E.aggregateRisk([])===0, 'لا بنود = صفر');

console.log('\n— التواريخ —');
const n = E.normStr(sample);
const dates = E.findDates(n);
const iso = dates.map(d=>new Date(d.ts).toISOString().slice(0,10));
ok(iso.includes('2026-06-01'), 'YYYY/MM/DD  → 2026-06-01');
ok(iso.includes('2026-09-15'), 'YYYY-MM-DD  → 2026-09-15');
ok(iso.includes('2026-07-10'), 'DD/MM/YYYY  → 2026-07-10');
ok(dates.some(d=>d.hijri), 'رمضان 1447 اكتُشف كهجري');
console.log('    كل التواريخ:', iso.join(', '));

console.log('\n— المدد —');
const dur = E.findDurations(n);
ok(dur.some(d=>d.days===30), 'ثلاثين (30) يوماً → 30 يوم');
console.log('    المدد:', dur.map(d=>d.days+'ي').join(', '));

console.log('\n— التحليل الكامل (اليوم: 2026-08-20) —');
const r = E.analyze({docText: sample, todayISO: '2026-08-20'});
ok(r.anchorDate && r.anchorDate.iso==='2026-06-01', 'تاريخ التحرير المرجعي = 2026-06-01');
ok(r.obligations.length>=7, 'التزامات مستخرجة: '+r.obligations.length);
ok(r.obligations.every(o=>o.quote && o.quote.length>10), 'كل التزام يحمل اقتباسًا حرفيًا');
ok(r.obligations.some(o=>o.daysRemaining<0), 'رصد موعدًا متجاوزًا');
ok(r.gaps.some(g=>g.type==='صياغة فضفاضة'), 'رصد صياغة فضفاضة');
ok(r.gaps.some(g=>g.type==='بند مفقود'), 'رصد بنودًا مفقودة');
ok(r.gaps.every(g=>g.evidenceType==='absence' || (g.evidence&&g.evidence.length>5)), 'كل فجوة إما اقتباس أو غياب موثّق');
ok(r.gaps.every(g=>E.locateQuote(sample,g.evidence)||g.evidenceType!=='quote'), 'كل اقتباس يُعثر عليه في النص الأصلي');
ok(r.riskScore>0 && r.riskScore<=100, 'درجة الخطر ضمن المدى: '+r.riskScore);
ok(r.clauseReport.find(c=>c.id==='conf').present, 'بند السرية موجود → لم يُعلَّم مفقودًا');
ok(!r.clauseReport.find(c=>c.id==='force').present, 'القوة القاهرة غائبة → عُلِّمت مفقودة');

console.log('\n  الالتزامات:');
r.obligations.forEach(o=>console.log('    ['+String(o.risk).padStart(3)+'] '+o.urgency.padEnd(9)+' '+
  (o.daysRemaining===null?'  —':String(o.daysRemaining).padStart(4)+'ي')+'  '+o.penalty.slice(0,28).padEnd(30)+' '+o.quote.slice(0,52).replace(/\n/g,' ')));
console.log('\n  أعلى ٦ فجوات:');
r.gaps.slice(0,6).forEach(g=>console.log('    ['+String(g.risk).padStart(3)+'] '+g.type.padEnd(16)+' '+g.title.slice(0,58)));
console.log('\n  التنبؤات:');
r.preds.forEach(p=>console.log('    '+String(p.daysRemaining).padStart(4)+' يوم → '+p.consequence.slice(0,64)));

console.log('\n— التغطية مقابل مرجع —');
const ref='يجب على المتعاقد تقديم خطة التشغيل. يجب على المتعاقد توفير وثيقة تأمين سارية طوال مدة العقد.';
const r2 = E.analyze({docText: sample, refText: ref, todayISO:'2026-08-20'});
ok(r2.coverage && r2.coverage.requirements.length===2, 'استخرج متطلبين من المرجع');
ok(r2.coverage.score>=0 && r2.coverage.score<=100, 'نسبة التغطية: '+r2.coverage.score+'%');
r2.coverage.requirements.forEach(q=>console.log('    '+(q.met?'✓':'✗')+' ('+q.score+'%) '+q.requirement.slice(0,60)));

console.log('\n— الأكواد والإعدادات —');
ok(r.gaps.every(g=>/^G-[A-Z0-9]{3}-[A-Z0-9]{4}$/.test(g.code)), 'كل فجوة تحمل كودًا بالصيغة G-XXX-XXXX');
ok(r.obligations.every(o=>/^OB-/.test(o.code)), 'كل التزام يحمل كود OB-');
ok(r.preds.every(p=>/^DL-/.test(p.code)), 'كل موعد يحمل كود DL-');
const again = E.analyze({docText: sample, todayISO:'2026-08-20'});
ok(again.gaps.map(g=>g.code).join()===r.gaps.map(g=>g.code).join(), 'الأكواد ثابتة عبر التحاليل المتكررة');
ok(new Set(r.gaps.map(g=>g.code)).size===r.gaps.length, 'لا تكرار في الأكواد');

const NC = require('../src/config.js');
// حذف بند معياري من الإعدادات يجب أن يزيل فجوته
const noForce = NC.clone(NC.DEFAULTS);
noForce.clauses = noForce.clauses.filter(c=>c.id!=='force');
const rc = E.analyze({docText: sample, todayISO:'2026-08-20', config: noForce});
ok(!rc.gaps.some(g=>g.title.indexOf('القوة القاهرة')>-1), 'حذف بند من الإعدادات يزيل فجوته');
ok(rc.clauseReport.length===r.clauseReport.length-1, 'قائمة البنود تتبع الإعدادات');

// رفع حد التصنيف الحرج يجب أن يقلّل الفجوات الحرجة
const strict = NC.clone(NC.DEFAULTS); strict.scoring.thresholds.critical = 30;
const rs = E.analyze({docText: sample, todayISO:'2026-08-20', config: strict});
ok(rs.stats.critical > r.stats.critical, 'خفض حد «حرجة» يزيدها: '+r.stats.critical+' → '+rs.stats.critical);

// إضافة صيغة إلزام جديدة ترصد التزامات أكثر
const more = NC.clone(NC.DEFAULTS); more.deontic.push('تختص');
const rm = E.analyze({docText: sample, todayISO:'2026-08-20', config: more});
ok(rm.obligations.length > r.obligations.length, 'إضافة صيغة إلزام ترصد المزيد: '+r.obligations.length+' → '+rm.obligations.length);

// تعديل وزن التجميع يغيّر الدرجة
const w = NC.clone(NC.DEFAULTS); w.scoring.aggregate = {maxWeight:1, rmsWeight:0};
ok(E.analyze({docText: sample, todayISO:'2026-08-20', config: w}).riskScore === Math.max(...r.gaps.map(g=>g.risk), ...r.preds.map(p=>p.risk)),
   'وزن 1/0 يجعل الدرجة = أعلى بند');

console.log('\n— الثبات —');
ok(E.analyze({docText:sample,todayISO:'2026-08-20'}).riskScore===r.riskScore, 'نفس المدخل ⇒ نفس الدرجة (حتمي)');
ok(r.fingerprint===r2.fingerprint, 'بصمة المستند ثابتة');

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' نجحت، '+fail+' فشلت\n');
process.exit(fail?1:0);
