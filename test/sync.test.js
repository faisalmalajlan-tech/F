/* اختبار المزامنة على خادمٍ حقيقي (وهمي الشكل، حقيقي السلوك) */
const store={};
global.window={localStorage:{
  getItem:k=>k in store?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v)},
  removeItem:k=>{delete store[k]}
}};
global.fetch=require('node:util').promisify?global.fetch:undefined;
const SY=require('/home/user/F/src/sync.js');
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ✓ '+m)):(fail++,console.log('  ✗ '+m));};
const U='http://127.0.0.1:8787', K='test-anon-key';

(async()=>{
 console.log('\n— الضبط —');
 ok(!SY.isOn(),'بلا ضبط: المزامنة مطفأة (التطبيق محليّ تمامًا)');
 const bad=await SY.test(U,'wrong-key-123');
 ok(!bad.ok,'مفتاح خاطئ يُرفض بـ٤٠١ لا بانهيار: '+(bad.error||'').slice(0,24));
 const arab=await SY.test(U,'مفتاح عربي');
 ok(!arab.ok&&/غير إنجليزية/.test(arab.error||''),'مفتاح غير إنجليزي: رسالة مفهومة لا خطأ ByteString');
 const good=await SY.test(U,K);
 ok(good.ok,'ومفتاح صحيح يُقبل');
 SY.setConfig(U,K);
 ok(SY.isOn(),'بعد الضبط: المزامنة تعمل');

 console.log('\n— الدفع —');
 store['nadheer:docs:v1']=JSON.stringify([
   {id:'d1',name:'سياسة الإسناد',text:'نص',refText:'مرجع',caseCode:'NR-1',
    history:[{d:'2026-08-21',r:80}],tasks:{'G-1':{status:'done'}},lastRisk:80,addedAt:1},
   {id:'d2',name:'سياسة الرسوم',text:'نص٢',refText:'مرجع',caseCode:'NR-2',
    history:[],tasks:{},lastRisk:40,addedAt:2}
 ]);
 store['nadheer:requests']=JSON.stringify([
   {id:'r1',at:1,actor:'روان',title:'تحليل',status:'pending',versionId:'v1'}]);
 store['nadheer:versions']=JSON.stringify([{id:'v1',at:1,label:'قبل',actor:'روان',docs:[]}]);
 const p=await SY.pushAll('فيصل');
 ok(p.ok,'الدفع نجح');

 console.log('\n— السحب على جهازٍ آخر —');
 // نمسح المحلي كأننا على جهاز ثانٍ
 delete store['nadheer:docs:v1']; delete store['nadheer:requests']; delete store['nadheer:versions'];
 const q=await SY.pull();
 ok(q.ok,'السحب نجح');
 const docs=JSON.parse(store['nadheer:docs:v1']||'[]');
 ok(docs.length===2,'وصل المستندان إلى الجهاز الثاني: '+docs.length);
 const d1=docs.filter(d=>d.id==='d1')[0];
 ok(d1&&d1.name==='سياسة الإسناد','الاسم العربي سليم: '+(d1||{}).name);
 ok(d1&&d1.refText==='مرجع','refText عاد camelCase لا ref_text');
 ok(d1&&d1.history.length===1&&d1.history[0].r===80,'تاريخ الخطر محفوظ');
 ok(d1&&d1.tasks['G-1'].status==='done','حالات المهام محفوظة');
 const reqs=JSON.parse(store['nadheer:requests']||'[]');
 ok(reqs.length===1&&reqs[0].actor==='روان','طلب الموافقة وصل مع صاحبه');
 ok(reqs[0].versionId==='v1','versionId عاد camelCase');

 console.log('\n— التعديل والحذف —');
 docs[0].name='سياسة الإسناد (معدّلة)';
 store['nadheer:docs:v1']=JSON.stringify(docs);
 await SY.pushAll('فيصل');
 await SY.pull();
 const after=JSON.parse(store['nadheer:docs:v1']).filter(d=>d.id==='d1')[0];
 ok(after.name==='سياسة الإسناد (معدّلة)','التعديل يصل للخادم ويعود');
 ok(JSON.parse(store['nadheer:docs:v1']).length===2,'ولا يتكرّر المستند عند إعادة الدفع');
 await SY.removeDoc('d2');
 await SY.pull();
 ok(JSON.parse(store['nadheer:docs:v1']).length===1,'الحذف يصل فعلًا للخادم');

 console.log('\n— الإعدادات المشتركة —');
 const s=await SY.pushSettings({scoring:{thresholds:{critical:80,medium:21}}},'فيصل');
 ok(s.ok,'دفع الإعدادات نجح');
 const back=await SY.pull();
 ok(back.settings&&back.settings.scoring.thresholds.critical===80,'وتعود مع السحب: عتبة '+
    (back.settings?back.settings.scoring.thresholds.critical:'—'));

 console.log('\n— الانقطاع —');
 SY.setConfig('http://127.0.0.1:9999','x');
 const off=await SY.pull();
 ok(!off.ok,'خادم لا يستجيب ⇒ خطأ واضح لا انهيار');
 ok(JSON.parse(store['nadheer:docs:v1']).length===1,'والبيانات المحلية باقية سليمة');

 console.log('\n'+(fail?'✗ ':'✓ ')+pass+' نجحت، '+fail+' فشلت');
 process.exit(fail?1:0);
})();
