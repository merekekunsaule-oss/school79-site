/* 79-р сургуулийн AI туслах — сайтад оруулсан мэдээлэл (CMS) дээр тулгуурлан хариулна.
   1) Сервер дээр Claude API тохируулсан бол /api/ask-аар байгалийн хэлээр хариулна.
   2) Үгүй бол (эсвэл алдаа гарвал) энэ файлын хайлтын хөдөлгүүр бүх мэдээллээс хайж хариулна. */
const S79Assistant=(()=>{
  const STOP=new Set(('вэ бэ юу юуг хэн хэнийг ямар ямархуу хаана хэзээ хэд хэдэн хэдэх уу үү юм байна байдаг байгаа '+
    'нь ба болон тухай талаар мэдээлэл мэдээллийг өгөөч өгнө хэлээч хэлнэ үү гэж гэдэг энэ тэр манай танай '+
    'сургууль сургуулийн сургуульд 79 79-р дүгээр бол л ч гэх мэт вэ? надад би та бид асуух асуулт болох болно болдог болсон байх').split(' '));
  const norm=s=>String(s??'').toLowerCase().replace(/ё/g,'е');
  const toks=s=>norm(s).match(/[a-zа-яөү0-9]+/g)||[];
  // Монгол үгийн нөхцөлийг ойролцоогоор таслах: “математикийн” → “математик”
  const SUF=/(ийнх|ийн|ын|ний|ийг|ыг|ныг|аас|ээс|оос|өөс|өд|эд|ад|од)$/;
  const stem=t=>{if(t.length>4){const b=t.replace(SUF,'');if(b.length>=3&&b!==t)t=b}return t.length<=4?t:t.slice(0,Math.max(4,t.length-3))};
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const cut=(s,n)=>{s=clean(s);return s.length>n?s.slice(0,n).replace(/\s\S*$/,'')+'…':s};
  const fmtDate=d=>d?String(d).replace(/-/g,'.'):'';

  let docs=null, lastClub=null; // lastClub — сүүлд ярьсан клуб (дараагийн асуултыг холбоход)
  function build(){
    const g=k=>S79.get(k)||[];
    const cfg=S79.get('settings')||{}, home=S79.get('home')||{};
    const D=[];
    const add=(kind,title,body,render,extra={})=>D.push({kind,title:String(title||''),body:String(body||''),render,...extra});
    g('teachers').forEach(t=>add('teacher',`${t.n} ${t.r} ${t.s||''} ${t.dept||''}`,
      `${t.rank||''} ${t.homeroom?t.homeroom+' анги даасан':''} ${t.classes||''} ${t.note||''}`,
      ()=>`👩‍🏫 ${t.n} — ${t.r}${t.s&&t.s!==t.r?` (${t.s})`:''}.`+
        (t.e?` Туршлага: ${t.e} жил.`:'')+(t.rank?` ${t.rank}.`:'')+
        (t.homeroom?` Даасан анги: ${t.homeroom}.`:'')+(t.classes?`\nЗаадаг анги: ${t.classes}`:'')+(t.note?`\n${t.note}`:''),
      {t}));
    g('clubs').forEach(c=>add('club',`${c.name} ${c.cat} клуб дугуйлан`,`${c.t} ${c.d} ${c.goal||''} ${c.acts||''} ${c.place||''} ${c.day||''} ${c.grade||''} ${c.reqs||''}`,
      ()=>`🏅 ${c.name}`+(c.t?` — удирдагч ${c.t}`:'')+'.'+
        (c.grade?`\nХамрагдах: ${/^[\d\s–-]+$/.test(c.grade)?c.grade+'-р анги':c.grade}`:'')+(c.day?`\n🕒 ${c.day}`:'')+(c.place?`\n📍 ${c.place}`:'')+
        (c.phone?`\n📞 ${c.phone}`:'')+(c.d?`\n${cut(c.d,220)}`:'')+'\n\n“Клуб” хэсгээс онлайн бүртгүүлээрэй.',{c}));
    [['news','📰','Мэдээ'],['announcements','📣','Зарлал'],['events','📅','Арга хэмжээ']].forEach(([k,ic,lab])=>
      g(k).forEach(n=>add(k,`${n.title} ${lab}`,`${n.text} ${n.place||''}`,
        qt=>`${ic} ${n.title}${n.date?` (${fmtDate(n.date)})`:''}\n${bestPart(n.text,qt||[])}`,{date:n.date||'',o:n,lab})));
    g('pages').forEach(p=>{
      let head='';
      String(p.text||'').split('\n').map(clean).filter(Boolean).forEach(l=>{
        if(l.startsWith('# ')){head=l.slice(2);return}
        const line=l.replace(/^•\s*/,'');
        add('page',`${p.title} ${head}`,line,()=>`📖 ${p.title}${head?` — ${head.replace(/^\W+/,'')}`:''}\n${cut(line,400)}`);
      });
    });
    g('pride').forEach(p=>add('pride',`${p.n} ${p.sport||''} бахархал төгсөгч`,`${p.title||''} ${p.grad||''} ${p.text||''} ${p.wins||''}`,
      ()=>`🏆 ${p.n} — ${p.title||''} (${p.sport||''}). ${p.grad||''}.`+(p.text?`\n${cut(p.text,200)}`:'')+
        '\n'+String(p.wins||'').split('\n').filter(w=>w&&!w.startsWith('—')).slice(0,4).map(w=>'• '+w).join('\n'),{o:p}));
    g('ads').forEach(a=>add('ad',`${a.title} зар ${a.cat||''}`,a.desc,
      ()=>`🛒 ${a.title} — ${a.deal?'үнэ тохиролцоно':+a.price?(+a.price).toLocaleString()+'₮':'үнэгүй'}.\n${cut(a.desc,200)}\n📞 ${a.contact||''}`,{o:a}));
    g('faq').forEach(f=>add('faq',f.q,f.a,()=>f.a));
    add('contact','холбоо барих утас утасны дугаар имэйл и-мэйл хаяг байршил ажлын цаг цагийн хуваарь','',
      ()=>['Сургуулийн холбоо барих мэдээлэл:',cfg.phone&&`📞 ${cfg.phone}`,cfg.email&&`✉️ ${cfg.email}`,cfg.address&&`📍 ${cfg.address}`,cfg.hours&&`🕘 Ажлын цаг: ${cfg.hours}`].filter(Boolean).join('\n'));
    add('stats','сурагч сурагчид тоо хэдэн багш ажилтан нийт жилийн түүх байгуулагдсан он клубын тоо','',
      ()=>`📊 Манай сургууль: ${home.students||'—'} сурагч, ${home.teachersN||'—'} багш, ${home.workers||'—'} ажилтан, ${home.groups||'—'} анги бүлэг, ${g('clubs').length} клуб дугуйлан. 1974 онд байгуулагдсан, ${home.years||''} жилийн түүхтэй.`);
    if(home.dirText)add('director',`захирал ${home.dirName||''} мэндчилгээ удирдлага`,home.dirText,
      ()=>`👩‍💼 Захирал: ${home.dirName}.\n${cut(home.dirText,300)}`);
    g('admission').forEach(a=>add('admission',`${a.title} элсэлт бүртгэл шалгалт эеш`,a.text,()=>`🎓 ${a.title}\n📅 ${fmtDate(a.date)}${a.until?` – ${fmtDate(a.until)}`:''}${a.link?`\n🌐 ${a.link}`:''}`,{date:a.date||''}));
    g('buildings').forEach(b=>add('building',`${b.name} хичээлийн байр байршил`,`${b.address||''} ${b.note||''}`,()=>`🏫 ${b.name} — 📍 ${b.address||''}`));
    if(home.obj1)add('goal','сургуулийн зорилт зорилтууд',[home.obj1,home.obj2,home.obj3].join(' '),()=>'📌 Сургуулийн зорилтууд:\n'+[home.obj1,home.obj2,home.obj3].filter(Boolean).map((x,i)=>`${i+1}. ${x}`).join('\n'));
    if(home.motto)add('goal','сургуулийн уриа уриалга',home.motto,()=>`📣 Уриа: “${home.motto}”`);
    if(home.goal)add('goal','сургуулийн зорилго алсын хараа эрхэм зорилго зорилт',home.goal,()=>`🎯 Сургуулийн зорилго: ${home.goal}`);
    if(home.about)add('about','сургуулийн тухай танилцуулга түүх байгуулагдсан',home.about,()=>`🏫 ${home.about}`);
    D.forEach(d=>{d.tt=new Set(toks(d.title).map(stem));d.bt=new Set(toks(d.body).map(stem))});
    return D;
  }
  const has=(set,s)=>{if(set.has(s))return true;for(const x of set){const a=x.length<s.length?x:s,b=a===x?s:x;if(a.length>=3&&b.startsWith(a))return true}return false};
  // Ерөнхий үгс (бараг бүх бичлэгт байдаг) — бага жинтэй
  const GEN=new Set(['багш','нар','анги','клуб','дугуй','сургалт','хичээ','мэдээ','сурагч','ажилт','ажилла','тэмцээ','жил','хэдэн'].map(stem));
  const isGen=t=>[...GEN].some(g=>t.startsWith(g)||g.startsWith(t));
  // Мэдээ/хуудасны текстээс асуултад хамгийн тохирох хэсгийг сонгох
  function bestPart(text,qt){const parts=String(text||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);if(parts.length<2)return cut(text,450);
    let bi=0,bs=-1;parts.forEach((p,i)=>{const ts=new Set(toks(p).map(stem));const sc=qt.filter(t=>!isGen(t)&&has(ts,t)).length;if(sc>bs){bs=sc;bi=i}});
    return bs>0?cut(parts[bi],700):cut(parts[0],450)}


  // Түгээмэл асуултын төрлүүд — хайлтаас өмнө шууд, тодорхой хариулна
  const upcoming=()=>{const d=new Date(),t=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return (S79.get('events')||[]).filter(e=>e.date>=t).sort((a,b)=>a.date<b.date?-1:1)};
  const ROLES=[[/(^|\s)эмч(\s|$|ийн|тэй|ээс|д\s)|эмнэлэг/,/^Эмч/],[/сэтгэл ?зүйч|сэтгэлзүйч/,/Сэтгэл зүйч/],[/хоол ?зүйч|тогооч|хоол тэжээл/,/Хоол зүйч/],
    [/нийгмийн ажилтан|нийгмийн ажилтн/,/Нийгмийн ажилтан/],[/менежер/,/менежер/i]];
  function intents(q,n,qt){
    const cfg=S79.get('settings')||{}, tel=cfg.phone?` 📞 ${cfg.phone}`:'';
    if(/^(чи|та) хэн|хэн бэ чи|хэн бэ та|юу хийж чадах|юу асууж болох|юу мэдэх вэ|туслах уу|чадвар/.test(n))
      return {text:'Би 79-р сургуулийн AI туслах. 😊 Сайтад оруулсан мэдээллээс багш, клуб, мэдээ, арга хэмжээ, элсэлт, амралт, сурах бичиг, холбоо барих талаар хариулна.',
        options:['Сүүлийн мэдээ','Удахгүй болох арга хэмжээ','Аль клубт элсэх вэ?','Амралт хэзээ вэ?','Сурах бичиг','Холбоо барих']};
    if(/^холбоо барих$/.test(n))return ['Сургуулийн холбоо барих мэдээлэл:',cfg.phone&&`📞 ${cfg.phone}`,cfg.email&&`✉️ ${cfg.email}`,cfg.address&&`📍 ${cfg.address}`,cfg.hours&&`🕘 Ажлын цаг: ${cfg.hours}`].filter(Boolean).join('\n');
    if(/захир/.test(n)&&/утас|дугаар|холбогдох/.test(n))return `Захирлын хувийн утас сайтад байхгүй. Сургуулийн утас:${tel||' —'}`+(cfg.email?`, ✉️ ${cfg.email}`:'');
    // Ажил үүргээр (эмч, сэтгэл зүйч…)
    for(const [qr,rr] of ROLES)if(qr.test(n)){const ts=(S79.get('teachers')||[]).filter(t=>rr.test(t.r));
      if(ts.length)return ts.map(t=>`${t.n} — ${t.r}${t.e?`, ${t.e} жил`:''}.`).join('\n');}
    // Хичээлийн байрууд
    if(/хэдэн байр|байрууд|хичээлийн байр(ууд)?\s*(хаана|хэд)|ямар байр/.test(n)&&!/(^|\s)[1-9]\s*-?\s*(р|дугаар|дүгээр)?\s*байр/.test(n)){
      const b=(S79.get('buildings')||[]).slice().sort((a,c)=>(a.o||0)-(c.o||0));
      if(b.length)return `🏫 ${b.length} хичээлийн байртай:\n`+b.map(x=>`• ${x.name}${x.address?` — ${x.address}`:''}`).join('\n');}
    // Сүүлийн мэдээ
    if(/сүүлийн мэдээ|шинэ мэдээ|мэдээ юу байна|мэдээнүүд|ямар мэдээ|онцлох мэдээ/.test(n)){
      const ns=(S79.get('news')||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4);
      if(ns.length)return {text:'📰 Сүүлийн мэдээ:\n'+ns.map(x=>`• ${x.title} (${fmtDate(x.date)})`).join('\n'),links:[{t:'📰 Бүх мэдээ',u:'#news'}]};}
    // Удахгүй болох арга хэмжээ
    if(/(ямар|юу|ойрын|удахгүй|ирэх).{0,12}арга хэмжээ|арга хэмжээнүүд|юу болох вэ|юу болох гэж/.test(n)){
      const ev=upcoming().slice(0,5);
      return ev.length?'📅 Удахгүй болох арга хэмжээ:\n'+ev.map(e=>`• ${fmtDate(e.date)} — ${e.title}`).join('\n'):'Удахгүй болох арга хэмжээ одоогоор алга.';}
    // Бахархалт төгсөгчид
    if(/бахархал|төгсөгчид|алдартай төгсөгч|амжилттай төгсөгч/.test(n)){
      const p=(S79.get('pride')||[]).slice().sort((a,b)=>(a.o||0)-(b.o||0));
      const named=p.find(x=>qt.some(t=>t.length>=4&&has(new Set(toks(x.n).map(stem)),t)));
      if(!named&&p.length)return '🏆 Сургуулийн бахархал:\n'+p.map(x=>`• ${x.n} — ${x.title||''}${x.sport?` (${x.sport})`:''}`).join('\n');}
    // Зар оруулах
    if(/зар (оруулах|нэмэх|тавих|өгөх|байршуулах)|зар(аа)? яаж|яаж зар/.test(n))
      return {text:'Зар оруулахдаа сайтын “Зарын булан” хэсгийн “＋ Зар нэмэх” товчийг дарж, гарчиг, ангилал, үнэ, утсаа бичээд илгээнэ.',links:[{t:'🛒 Зарын булан',u:'#market'}]};
    // Гомдол, санал хүсэлт
    if(/гомдол|санал хүсэлт|санал гаргах|зурвас (илгээ|үлдээ)|хүсэлт (илгээ|гаргах)/.test(n))
      return {text:'Санал, хүсэлт, гомдлоо сайтын “Холбоо барих” хэсгийн маягтаар илгээнэ үү. Сургуулийн удирдлагад шууд хүрнэ.'+tel,links:[{t:'✉️ Холбоо барих',u:'#contact'}]};
    if(/дүрэмт хувцас|сургуулийн хувцас|сургуулийн форм/.test(n))return 'Дүрэмт хувцасны мэдээлэл сайтад оруулаагүй байна — ангийн багшаасаа лавлана уу.'+tel;
    // Хичээлийн цагийн хуваарь (ээлж, цаг, завсарлага)
    if((/хичээл.{0,15}(хэдэн цаг|хэдэн цагт|хэдэд|цагт эхэл|эхэлдэг|эхлэх|тардаг|тарах|дуусдаг|дуусах)|(цагийн|хичээлийн) хуваарь|завсарлага|ээлж|(^|\s)([1-7])\s*-?\s*(р|дугаар|дүгээр)?\s*цаг(\s|$|ийн)/.test(n))&&!/улирал|жил|амралт|олимпиад|клуб|дугуйлан/.test(n)){
      const rows=String((S79.get('home')||{}).bells||'').split('\n').map(l=>l.split('|').map(x=>x.trim())).filter(a=>a.length>=4);
      if(!rows.length)return `Хичээлийн цагийн хуваарь сайтад оруулаагүй байна — ангийн багшаасаа лавлана уу.`+tel;
      const sh=[...new Set(rows.map(r=>r[0]))], by=x=>rows.filter(r=>r[0]===x), L={links:[{t:'🕘 Цагийн хуваарь',u:'#bells'}]};
      const one=/(^|\s)(ii|2|хоёр|оройн|үдээс хойш)(-р|р)?\s*ээлж|оройн|үдээс хойш/.test(n)?sh[1]:/(^|\s)(i|1|нэг|өглөө)(-р|р)?\s*ээлж|өглөө/.test(n)?sh[0]:null;
      const use=one?[one]:sh;
      const pm=n.match(/(^|\s)([1-7])\s*-?\s*(р|дугаар|дүгээр)?\s*цаг/);
      if(pm){const k=pm[2]+'-р цаг';return {text:use.map(x=>{const r=by(x).find(r=>r[1]===k);return r?`${x}: ${k} ${r[2]}–${r[3]}`:''}).filter(Boolean).join('\n')||'Ийм цаг хуваарьт алга.',...L}}
      if(/завсарлага/.test(n))return {text:use.map(x=>{const r=by(x).find(r=>/завсарлага/i.test(r[1]));return r?`${x}: ${r[1]} ${r[2]}–${r[3]}`:''}).filter(Boolean).join('\n'),...L};
      if(/тар|дуус/.test(n))return {text:use.map(x=>{const r=by(x).slice(-1)[0];return `${x}: хичээл ${r[3]}-д тарна`}).join('\n'),...L};
      if(/эхэл|эхлэх|хэдэн цагт|хэдэд|хэдэн цаг/.test(n)&&!/хуваарь/.test(n))return {text:use.map(x=>`${x}: ${by(x)[0][2]} цагт эхэлнэ`).join('\n')+'\nЦаг бүр 40 минут.',...L};
      return {text:use.map(x=>`🕘 ${x}:\n`+by(x).map(r=>`• ${r[1]} — ${r[2]}–${r[3]}`).join('\n')).join('\n\n'),...L};
    }
    // Ерөнхий “бүртгүүлэх” — юунд бүртгүүлэхийг тодруулна
    if(/(яаж|хэрхэн|хаана).{0,10}бүртгүүл|хүүхдээ бүртгүүл|бүртгүүлэх вэ$/.test(n)&&!/клуб|дугуйлан|секц|эеш|шалгалт|элсэлт|1-р анги|нэгдүгээр анги|1 р анги/.test(n)&&!lastClub)
      return {text:'Юунд бүртгүүлэх вэ?',options:['1-р ангийн элсэлт','Клубт бүртгүүлэх','ЭЕШ бүртгэл']};
    if(/^клубт бүртгүүлэх$|клубт (яаж|хэрхэн) (бүртгүүл|элс)|клубт (бүртгүүлэх|элсэх) (вэ|арга)/.test(n))
      return {text:'Сайтын “Клуб” хэсгээс клубээ сонгоод “Бүртгүүлэх” товчийг дарж, маягтыг бөглөнө. Аль клубт элсэхээ мэдэхгүй бол би санал болгож чадна. 😊',options:['Аль клубт элсэх вэ?','Клубууд'],links:[{t:'🏅 Клубууд',u:'#clubs'}]};
    // Клуб байгаа эсэх (“шатрын дугуйлан байна уу?”)
    if(/байна уу|бий юу|байдаг уу|байгаа юу|байхгүй юу|байна у$|бий$/.test(n)&&!/багш|анги|номын|ном |мэдээ/.test(n)){const cw=/клуб|дугуйлан|секц/.test(n);
      // Нэрийн харьцуулалтад үгийг таслахгүй (зөвхөн нөхцөлийг авна): “хөгжмийн” ≠ “хөгжлийн”
      const st2=w=>{const b=w.replace(/(ийнх|ийн|ын|ний|ны|ийг|ыг|ныг|аас|ээс|оос|өөс|д|т)$/,'');return b.length>=3?b:w};
      const topic=toks(q).filter(t=>!STOP.has(t)).map(st2).filter(t=>!/^(клуб|дугуй|секц|байн|байд|байг|бий|ямар|танай|орох|элсэ|хүүх)/.test(t)&&t.length>=3);
      const cl=S79.get('clubs')||[];
      if(topic.length){const mt=(ts,t,m)=>ts.some(x=>x===t||(Math.min(x.length,t.length)>=m&&(x.startsWith(t)||t.startsWith(x))));
        const sc=c=>{const a=toks(cw?`${c.name} ${c.cat} ${c.t||''}`:c.name).map(st2),g=cw?toks(c.goal||'').map(st2):[];return topic.filter(t=>mt(a,t,3)||mt(g,t,5)).length};
        const mx=Math.max(0,...cl.map(sc)), hit=mx?cl.filter(c=>sc(c)===mx):[];
        if(hit.length>=2){const nm=c=>c.name.replace(/&amp;/g,'&').replace(/[“”"]/g,'');return {text:`${hit.length} клуб, дугуйлан байна:\n`+hit.map(c=>`• ${nm(c)}${c.t?` — ${c.t}`:''}`).join('\n'),options:hit.map(nm)}}
        if(!hit.length&&cw)return {text:`Ийм клуб одоогоор алга. Манай ${cl.length} клуб, дугуйлан:\n`+cl.map(c=>'• '+c.name.replace(/&amp;/g,'&')).join('\n'),options:['Аль клубт элсэх вэ?']};}
    }
    return null;
  }
  function answer(q){
    docs=docs||build();
    const n=norm(q);
    {const L=libAnswer(q);if(L)return L}
    q=String(q).replace(/элсүүл\S*/gi,'элсэлт').replace(/элсэх(\s|$)/gi,'элсэлт$1');
    if(/^\s*(сайн уу|сайн байна уу|сайн байна|hello|hi|мэнд)\W*$/.test(n))return 'Сайн байна уу! 😊 Юу асуух вэ?';
    if(/баярлалаа|thanks|thank you/.test(n))return 'Баярлалаа! Өөр асуулт байвал асуугаарай. 😊';

    // “5а ангийн багш хэн бэ?” — даасан анги
    const cls=n.match(/(?:^|\s)(\d{1,2})\s*-?\s*([а-яө])(?=\s|$|\s*анги)/);
    if(cls&&/багш|анги/.test(n)){
      const key=cls[1]+cls[2];
      const hits=docs.filter(d=>d.kind==='teacher'&&norm(d.t.homeroom||'').replace(/\s/g,'')===key);
      if(hits.length)return `${key} ангийн багш — ${hits.map(d=>d.t.n).join(', ')}.`;
    }
    const statsLeft=toks(q).filter(t=>!STOP.has(t)&&!/^(хэд|тоо|сурагч|багш|ажилт|клуб|дугуйлан|жил|нийт|байд|байна|байгуул|он|түүх|ямар|анги|бүлэг)/.test(t));
    if(/(хэд|хэдэн|тоо)/.test(n)&&/(сурагч|багш|ажилтан|ажилчид|клуб|дугуйлан|жил|бүлэг)/.test(n)&&(!/анги/.test(n)||/бүлэг/.test(n))&&!statsLeft.length){const h=S79.get('home')||{},nc=(S79.get('clubs')||[]).length;
      if(/сурагч/.test(n))return `${h.students} сурагчтай.`;
      if(/бүлэг/.test(n))return `${h.groups} анги бүлэгтэй.`;
      if(/багш/.test(n)&&/ажилтан|ажилчид/.test(n))return `${h.staff} багш, ажилтантай: ${h.teachersN} багш, ${h.workers} ажилтан.`;
      if(/багш/.test(n))return `${h.teachersN} багштай.`;
      if(/ажилтан|ажилчид/.test(n))return `${h.workers} ажилтантай.`;
      if(/клуб|дугуйлан/.test(n))return `${nc} клуб, дугуйлантай.`;
      return `1974 онд байгуулагдсан, ${h.years} жилийн түүхтэй.`;}
    if(/амралт/.test(n)&&!/булан/.test(n)){ // Улирлын амралт — “Нүүр хуудас”-ны хуваарьаас
      const md=d=>{const [,m,dd]=d.split('-');return `${+m}-р сарын ${+dd}`};
      const brs=String((S79.get('home')||{}).breaks||'').split('\n').map(l=>l.split('|').map(s=>s.trim())).filter(a=>a[0]&&/^\d{4}-\d\d-\d\d$/.test(a[1]||''))
        .map(([nm,s,e,note])=>({nm,s,e:/^\d{4}-\d\d-\d\d$/.test(e||'')?e:'',note:note||''})).sort((a,b)=>a.s<b.s?-1:1);
      if(brs.length){
        const line=b=>`🗓 ${b.nm}: ${md(b.s)}${b.e?' – '+md(b.e):'-нөөс'}${b.note?` (${b.note})`:''}`;
        const pick=/өвл/.test(n)?brs.find(b=>/өвл/i.test(b.nm)):/зун/.test(n)?brs.find(b=>/зун/i.test(b.nm)):
          /(^|\s)(iii|3)/.test(n)?brs.find(b=>/^III\s/.test(b.nm)):/(^|\s)(ii|2)/.test(n)?brs.find(b=>/^II\s/.test(b.nm)):/(^|\s)(i|1)(\s|-)/.test(n)?brs.find(b=>/^I\s/.test(b.nm)):null;
        if(pick)return line(pick);
        if(/бүх|хуваар|улирлын амралтууд/.test(n))return brs.map(line).join('\n');
        const d=new Date(),t=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const b=brs.find(b=>b.s<=t&&(!b.e||t<=b.e))||brs.find(b=>b.s>t);
        if(b)return (b.s<=t?'Одоо амралт үргэлжилж байна.\n':'')+line(b);
      }
    }
    { // Сургуулийн зорилго / зорилт / уриа — ялгаж хариулна
      const h=S79.get('home')||{};
      if(/уриа/.test(n)&&h.motto&&!/клуб|дугуйлан/.test(n))return `📣 Уриа: “${h.motto}”`;
      if(/зорилт/.test(n)&&h.obj1&&!/клуб|дугуйлан/.test(n))return '📌 Сургуулийн зорилтууд:\n'+[h.obj1,h.obj2,h.obj3].filter(Boolean).map((x,i)=>`${i+1}. ${x}`).join('\n');
      if(/зорилго/.test(n)&&/сургуул|манай|79/.test(n)&&h.goal)return `🎯 Сургуулийн зорилго: ${h.goal}`;
    }
    const qt=[...new Set(toks(q).filter(t=>!STOP.has(t)).map(stem))];
    {const I=intents(q,n,qt);if(I)return I}
    // Дараагийн асуулт (ж: “Тавигдах шаардлага”, “Хэзээ?”) — нэр дурдаагүй бол сүүлд ярьсан клубыг ашиглана
    if(lastClub){
      const named=docs.find(d=>d.kind==='club'&&d.c!==lastClub&&qt.filter(t=>!isGen(t)).some(t=>has(d.tt,t)));
      const follow=/шаардлага|юу хэрэгтэй|юу авч|авч ирэх|юу бэлд|бэлтгэх зүйл|нөхцөл|элсэхэд|элсэх бол|орохын тулд|орохад/.test(n)||/^(📋|🕒|📍|👤|📞)|^(хэзээ|хаана|хэн|бүртгүүлэх|утас|холбоо барих|удирдагч)(\s|\?|$)|хичээллэдэг вэ|удирдагч хэн/.test(n);
      if(follow&&!named){const d=docs.find(x=>x.kind==='club'&&x.c===lastClub);if(d)return brief(d,n)}
    }
    // Олимпиадын хуваарь — зарлал доторх сургуулийн шатны жагсаалтыг шууд харуулна
    if(/олимпиад/.test(n)&&/хуваар|хэзээ|огноо|өдөр|шат/.test(n)){
      const ann=(S79.get('announcements')||[]).find(a=>/олимпиад/i.test(a.title)&&/шатны хуваарь/.test(a.text||''));
      if(ann){const blk=String(ann.text).split(/\n\s*\n/).find(b=>/шатны хуваарь/.test(b));
        const qs=toks(q).filter(t=>!STOP.has(t)&&!/олимпиад|хуваар|хэзээ|огноо|өдөр|шат|бол/.test(t)).map(stem);
        const ln=blk.split('\n').filter(l=>l.startsWith('•')&&qs.length&&qs.some(t=>has(new Set(toks(l).map(stem)),t)));
        if(ln.length)return ln.map(l=>l.replace(/^•\s*/,'')+' (сургуулийн шат)').join('\n');
        return blk.replace(/^🏫\s*Манай сургуулийн шатны хуваарь/,'Сургуулийн шат');}
    }
    if(!qt.length)return fallback();
    const spec=qt.filter(t=>!isGen(t));
    const scored=docs.map(d=>{let s=0,m=0,ms=0;qt.forEach(t=>{const g=isGen(t);if(has(d.tt,t)){s+=g?0.5:3;m++;if(!g)ms++}else if(has(d.bt,t)){s+=g?0.2:1;m++;if(!g)ms++}});
      if(spec.length&&!ms)return {d,s:0};
      if(m===qt.length)s+=2; if(['contact','stats','director','about','goal'].includes(d.kind))s+=0.5; return {d,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||String(b.d.date||'').localeCompare(String(a.d.date||'')));
    if(!scored.length)return fallback();

    // Асуултын төрлөөр тохирох бичлэгийн төрлийг давуу болгох
    const pref=/үнэ|хэдээр|хэд вэ|зарна|авах/.test(n)?['ad']:/клуб|дугуйлан|секц|шаардлага|юу хэрэгтэй|элсэхэд|юу авч ирэх/.test(n)?['club']:/хэзээ|огноо|болох/.test(n)?['events','announcements','news','club']:[];
    if(pref.length)scored.forEach(x=>{if(pref.includes(x.d.kind))x.s+=1.5});
    scored.sort((a,b)=>b.s-a.s||String(b.d.date||'').localeCompare(String(a.d.date||'')));
    const wantList=/багш нар|багшууд|бүх|жагсаа|ямар ямар|хэн хэн|клубууд|клубүүд|дугуйлангууд|мэдээнүүд/.test(n);
    const top=scored[0].s, best=scored.filter(x=>x.s>=top-1);
    if(/клуб|дугуйлан|секц/.test(n)&&(wantList||!spec.length||best.filter(x=>x.d.kind==='club').length>=3)){
      const cl=docs.filter(d=>d.kind==='club');
      return `${cl.length} клуб, дугуйлан байна:\n`+cl.map(d=>`• ${d.c.name.replace(/&amp;/g,'&')}`).join('\n');
    }
    // Олон багш таарвал жагсаалтаар (зөвхөн багш асуусан үед)
    let tch=best.filter(x=>x.d.kind==='teacher');
    if(tch.length>1&&spec.length){const rs=tch.filter(x=>{const ts=new Set(toks(x.d.t.r+' '+(x.d.t.s||'')).map(stem));return spec.every(t=>has(ts,t))});if(rs.length)tch=rs}
    if(/багш/.test(n)&&!/клуб|дугуйлан|секц/.test(n)&&tch.length>=2&&(wantList||tch.length>=3||tch.length===best.length)){
      return `${tch.length} багш: ${tch.slice(0,20).map(x=>x.d.t.n).join(', ')}${tch.length>20?'…':''}.`;
    }
    const first=scored[0].d;
    // Асуултын гол үгсийн талаас бага нь таарвал (ж: “эцэг эхийн хурал”) буруу мэдээлэл өгөхгүй
    if(spec.length>=2&&!spec.some(t=>has(first.tt,t))){const all=new Set([...first.tt,...first.bt]);if(spec.filter(t=>has(all,t)).length*2<=spec.length)return fallback();}
    return brief(first,n);
  }
  // Асуултын төрлийг тодорхойлж, зөвхөн асуусан зүйлийг товч хариулна
  const first1=t=>{t=clean(t);const m=t.match(/^.*?[.!?](?=\s|$)/);return cut(m?m[0]:t,200)};
  const price=a=>a.deal?'үнэ тохиролцоно':+a.price?(+a.price).toLocaleString()+'₮':'үнэгүй';
  function brief(d,n){
    const I={when:/хэзээ|хэдэн цаг|цагт|аль өдөр|өдөр|гараг|огноо|хэдний/.test(n),where:/хаана|байршил|хаяг|аль байр|хаана байдаг/.test(n),
      phone:/утас|дугаар/.test(n),who:/хэн|удирдагч|дасгалжуулагч|багш нь/.test(n),
      years:/хэдэн жил|туршлага|хэдэн жилийн/.test(n),price:/үнэ|хэдээр|хэдэн төгрөг/.test(n),grade:/аль анги|хэддүгээр анги|хэдэн анги|хамрагд|нас/.test(n),
      cls:/заадаг|ямар анги|аль ангид/.test(n),reqs:/шаардлага|юу хэрэгтэй|юу авч|авч ирэх|юу бэлд|бэлтгэх зүйл|нөхцөл|элсэхэд|элсэх бол|орохын тулд|орохад/.test(n),signup:/бүртгүүл|элсэх вэ|яаж элсэх|хэрхэн элсэх/.test(n)&&!/аль|ямар/.test(n)};
    switch(d.kind){
      case 'club':{const c=d.c,N=c.name.replace(/&amp;/g,'&');lastClub=c;
        const O=t=>({text:t,options:['📋 Тавигдах шаардлага','🕒 Хэзээ хичээллэдэг вэ?','📍 Хаана хичээллэдэг вэ?','👤 Удирдагч хэн бэ?','📞 Холбоо барих'].concat(['Бүртгүүлэх'])});
        if(I.reqs){const R=String(c.reqs||'').split('\n').map(x=>x.trim()).filter(Boolean);
          return O(R.length?`📋 ${N} — тавигдах шаардлага:\n`+R.map(x=>'• '+x).join('\n'):`${N}-д тавигдах шаардлага сайтад оруулаагүй байна.`+(c.phone?` 📞 ${c.phone}-аас лавлана уу.`:''))}
        if(/уриа/.test(n))return O(c.motto?`${N} — уриа: “${c.motto}”`:`${N}-ийн уриа сайтад алга.`);
        if(/зорилго/.test(n))return O(c.goal?`${N} — зорилго: ${c.goal}`:`${N}-ийн зорилго сайтад алга.`);
        if(I.signup)return O(`${N}-д бүртгүүлэхдээ “Клуб” хэсгээс тухайн клубын “Бүртгүүлэх” товчийг дарж, маягтыг бөглөнө.`+(c.phone?` Асуух зүйл байвал 📞 ${c.phone}.`:''));
        if(I.when)return O(c.day?`${N} — ${c.day}.`:`${N} — хичээллэх цаг сайтад алга.`+(c.phone?` 📞 ${c.phone}`:''));
        if(I.where)return O(c.place?`${N} — ${c.place}.`:`${N} — байршил сайтад алга.`);
        if(I.phone)return O(c.phone?`${N}: 📞 ${c.phone}`:`${N} — утас сайтад алга.`);
        if(I.who)return O(c.t?`${N} — удирдагч: ${c.t}.`:`${N} — удирдагч сайтад алга.`);
        if(I.grade)return O(c.grade?`${N} — ${/^[\d\s–-]+$/.test(c.grade)?c.grade+'-р анги':c.grade}.`:`${N} — хамрагдах анги сайтад алга.`);
        return O(`${N}`+(c.t?`, удирдагч ${c.t}`:'')+(c.day?`. 🕒 ${c.day}`:'')+(c.place?`. 📍 ${c.place}`:'')+'.');}
      case 'teacher':{const t=d.t;
        if(I.years)return t.e?`${t.n} — ${t.e} жил ажиллаж байна.`:`${t.n}-ийн ажилласан жил сайтад алга.`;
        if(I.cls)return t.classes?`${t.n} заадаг анги: ${t.classes}.`:`${t.n}-ийн заадаг анги сайтад алга.`;
        return `${t.n} — ${t.r}`+(t.e?`, ${t.e} жил`:'')+(t.rank?`, ${t.rank.toLowerCase()}`:'')+(t.homeroom?`, ${t.homeroom} ангийн даасан багш`:'')+'.';}
      case 'news':case 'announcements':case 'events':{const o=d.o;
        // Гарчигт байхгүй үгээр асуусан бол текстээс хамгийн тохирох мөрийг сонгоно (ж: “сэдэв”, “шагнал”, “хаана илгээх”)
        const tt=new Set(toks(o.title).map(stem)), want=toks(n).filter(t=>!STOP.has(t)).map(stem).filter(t=>!isGen(t)&&!has(tt,t));
        let best='',bs=0;
        if(want.length)String(o.text||'').split('\n').map(clean).filter(Boolean).forEach(l=>{const lt=toks(l).map(stem),ls=new Set(lt);
          let sc=want.filter(t=>has(ls,t)).length; if(sc&&want.some(t=>lt.slice(0,2).some(x=>x.startsWith(t)||t.startsWith(x))))sc+=0.5; if(sc>bs){bs=sc;best=l}});
        {const cm=n.match(/(?:^|\s)(\d{1,2})\s*-?\s*([а-яө])(?=\s|$|\s*анги)/);if(cm){const k=cm[1]+cm[2];
          const ln=String(o.text||'').split('\n').find(l=>new RegExp('(^|[\\s,(])'+k+'(?=[\\s,)]|$)','i').test(norm(l)));if(ln)return `${o.title} (${fmtDate(o.date)}):\n${clean(ln.replace(/^•\s*/,''))}`}}
        if(bs>=1.5||(bs>=1&&!I.when))return `${o.title}:\n${cut(best.replace(/^•\s*/,''),400)}`;
        if(I.when)return `${o.title} — ${fmtDate(o.date)}${o.place?`, ${o.place}`:''}.`;
        if(I.where&&o.place)return `${o.title} — ${o.place}.`;
        return `${o.title} (${fmtDate(o.date)}). ${first1(o.text)}`;}
      case 'pride':{const p=d.o;return `${p.n} — ${p.title||''} (${p.sport||''}), ${p.grad||''}.`;}
      case 'ad':{const a=d.o,ph=a.contact?` 📞 ${a.contact}`:' Холбоо барих мэдээлэл зард байхгүй.';if(I.phone)return `${a.title}:${ph}`;return `${a.title} — ${price(a)}.${ph}`;}
      case 'contact':{const c=S79.get('settings')||{};
        if(I.phone)return `📞 ${c.phone||'—'}`+(c.email&&/имэйл|и-мэйл|мэйл/.test(n)?`, ✉️ ${c.email}`:'');
        if(/имэйл|и-мэйл|мэйл/.test(n))return `✉️ ${c.email||'—'}`;
        if(I.where)return `📍 ${c.address||'—'}`;
        if(I.when)return `🕘 Ажлын цаг: ${c.hours||'—'}`;
        return d.render();}
      case 'goal':return d.render();
      case 'director':{const h=S79.get('home')||{};return `Захирал: ${h.dirName}.`;}
      case 'about':return /он|байгуулагд|хэзээ/.test(n)?'79-р сургууль 1974 онд байгуулагдсан.':first1(d.body);
      case 'page':return first1(d.body);
      case 'faq':return d.render();
    }
    return d.render();
  }
  function fallback(){
    const cfg=S79.get('settings')||{};
    return 'Энэ талаар мэдээлэл алга.'+(cfg.phone?` 📞 ${cfg.phone}-аас лавлана уу.`:'');
  }

  // Сервер дээрх Claude (байгаа бол)
  let remote=null;
  const remoteOn=()=>remote??=fetch('/api/ask/status').then(r=>r.ok?r.json():{enabled:false}).then(j=>!!j.enabled).catch(()=>false);
  /* ---------- Клуб сонгоход туслах (сонирхол, анги, хүйсэнд тулгуурлан санал болгоно) ---------- */
  const INTERESTS=[
    {k:'sport',l:'⚽ Спорт, хөдөлгөөн',re:/спорт|хөл бөмбөг|сагс|бөмбөг|гүйх|гүйлт|хөдөлгөө|тамир|барилд|бөх(?!ийн шинж)|football|basket/},
    {k:'art',l:'🎨 Зураг, урлаг',re:/зураг|зурах|урлаг|бүтээл|гар урлал|бийр|уран бичлэг|art|draw/},
    {k:'dance',l:'💃 Бүжиг, хөгжим',re:/бүжиг|хөгжим|дуу|тайз|хэмнэл|dance|music/},
    {k:'speak',l:'🎤 Ярих, мэтгэлцэх',re:/ярих|илтгэ|мэтгэл|дебат|ном унших|унших|бичих|логик|debate/},
    {k:'lead',l:'🤝 Манлайлал, нийгмийн ажил',re:/манлайл|удирд|нийгм|сайн дур|туслах|зохион байгуул|аян|leader/},
    {k:'nature',l:'🌱 Байгаль, шинжлэх ухаан',re:/байгал|эко|ногоон|шинжлэх|биолог|хими|ургамал|амьтан|хог|nature/},
    {k:'health',l:'🩺 Эрүүл мэнд, сэтгэл зүй',re:/эрүүл|сэтгэл зүй|сэтгэл|эмч|зөвлөх|стресс|health/},
    {k:'media',l:'📰 Медиа, зураг авалт',re:/медиа|сэтгүүл|видео|зураг авах|гэрэл зураг|контент|мэдээ бэлтгэ|фото|camera|video/},
    {k:'culture',l:'🏹 Монгол соёл, уламжлал',re:/монгол бичиг|уламжлал|соёл|үндэсн|монгол бөх|өв/}];
  const TAGS={'club-football':['sport'],'club-magick-rock':['sport'],'club-uran-biir':['art','culture'],'club-lilo':['dance','art','culture'],
    'club-souz':['lead'],'club-malala':['lead','speak'],'club-uhaalag-hotoch':['health','lead','nature'],'club-tsets-mergen':['speak','lead'],
    'club-eco':['nature','lead'],'club-journalist':['media','speak'],'club-harandaa':['art'],'club-hovguud':['lead','speak'],'club-shanz':['dance','culture'],'club-morin-khuur':['dance','culture'],'club-nairal-duu':['dance'],'club-volleyball':['sport'],'club-volleyball-munkhbold':['sport'],'club-oyunii-ons':['speak','nature'],'club-mongol-bukh':['sport','culture']};
  const clubTags=c=>TAGS[c.id]||INTERESTS.filter(i=>i.re.test(norm(`${c.name} ${c.cat} ${c.d} ${c.acts||''}`))).map(i=>i.k);
  function eligible(c,st){
    const g=norm(c.grade||''), r=g.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})/);
    if(st.grade&&r&&(st.grade<+r[1]||st.grade>+r[2]))return false;
    if(/охид/.test(g)&&st.sex==='boy')return false;
    if(/хөвгүүд|хүү/.test(g)&&st.sex==='girl')return false;
    return true;
  }
  let quiz=null; // {grade, sex, ints:[]}
  const wantsAdvice=n=>/(аль|ямар|ямар нэг)\s+(клуб|дугуйлан|секц)/.test(n)&&/(элс|орох|сонго|тохир|явах|сурах|хичээллэ)/.test(n)
    ||/(клуб|дугуйлан).*(санал болго|зөвлө)|санал болго.*(клуб|дугуйлан)|(клуб|дугуйлан).*мэдэхгүй|мэдэхгүй.*(клуб|дугуйлан)|клуб сонго/.test(n);
  function readFacts(n,st){
    const g=n.match(/(\d{1,2})\s*(?:-р|-ийн|-н|дугаар|дүгээр|р)?\s*анги/)||n.match(/^\s*(\d{1,2})\s*$/);
    if(g&&+g[1]>=1&&+g[1]<=12)st.grade=+g[1];
    if(/охин|охид|эмэгтэй/.test(n))st.sex='girl'; else if(/хүү(\s|$|,|\.)|хөвгүүн|эрэгтэй|^хүү/.test(n))st.sex='boy'; else if(/хэлэхгүй|хамаагүй/.test(n)&&st.grade>=8&&st.grade<=11&&!st.sex)st.sex='na';
    INTERESTS.forEach(i=>{const lab=norm(i.l.replace(/^\S+\s+/,''));if((i.re.test(n)||(lab&&n.includes(lab)))&&!st.ints.includes(i.k))st.ints.push(i.k)});
    if(/мэдэхгүй|сайн мэдэхгүй|бүгд|хамаагүй/.test(n)&&!st.ints.length&&st.asked)st.ints.push('any');
  }
  function recommend(st){
    const all=(S79.get('clubs')||[]).filter(c=>eligible(c,st));
    const scored=all.map(c=>{const t=clubTags(c);const hit=st.ints.filter(k=>t.includes(k));return {c,hit,s:hit.reduce((z,k)=>z+(t[0]===k?3:1),0)+(st.ints.includes('any')?0.1:0)}})
      .filter(x=>x.s>0||st.ints.includes('any')).sort((a,b)=>b.s-a.s);
    let top=scored.slice(0,3);
    if(st.ints.includes('any')&&st.ints.length===1){ // “Мэдэхгүй” — өөр өөр чиглэлээс нэг нэгийг санал болгоно
      const seen=new Set();top=[];
      for(const c of all){const t=clubTags(c)[0]||'other';if(!seen.has(t)){seen.add(t);top.push({c,hit:[t].filter(k=>k!=='other')})}if(top.length===4)break}
    }
    if(!top.length)return {text:`${st.grade?st.grade+'-р ангийн':'Таны'} сонирхолд яг тохирох клуб одоогоор алга байна. 😊 Нийт ${all.length} клуб танд нээлттэй — “Клубүүд” гэж бичээд бүгдийг нь харж болно.`,options:['Клубүүд','Дахин эхлэх']};
    const lab=k=>(INTERESTS.find(i=>i.k===k)||{l:''}).l.replace(/^\S+\s/,'').toLowerCase();
    const lines=top.map((x,i)=>{const c=x.c;return `${i+1}. ${c.ico||'🏅'} ${c.name.replace(/&amp;/g,'&')}`+(x.hit.length?` — ${x.hit.map(lab).join(', ')}`:'')+(c.day?`\n   🕒 ${c.day}`:'')});
    quiz=null; lastClub=top[0].c;
    const intro=st.ints.includes('any')&&st.ints.length===1?'Өөр өөр чиглэлээс сонирхож болох клубууд':'Танд тохирох клубууд';
    return {text:`${intro}${st.grade?` (${st.grade}-р анги)`:''}:\n\n${lines.join('\n')}\n\nДэлгэрэнгүйг доорх товчоор асууж, “Клуб” хэсгээс бүртгүүлээрэй.`,
      options:top.map(x=>x.c.name.replace(/&amp;/g,'&').replace(/[“”]/g,'').slice(0,40)).concat(['Дахин эхлэх'])};
  }
  function advise(q){
    const n=norm(q);
    if(!quiz)quiz={grade:0,sex:'',ints:[],asked:false};
    readFacts(n,quiz);
    if(!quiz.grade)return {text:'Сайн байна! Тохирох клуб олоход тусалъя. 😊\nХэддүгээр ангид сурдаг вэ?',options:['1','2','3','4','5','6','7','8','9','10','11','12'].map(x=>x+'-р анги')};
    if(quiz.grade>=8&&quiz.grade<=11&&!quiz.sex)return {text:'Хүү юү, охин уу? (Зарим клуб зөвхөн охидод зориулагдсан)',options:['Хүү','Охин','Хэлэхгүй']};
    if(!quiz.ints.length){quiz.asked=true;return {text:'Юу хийх хамгийн дуртай вэ? Товч дарах эсвэл өөрөө бичээрэй (ж: “зураг зурах, хөл бөмбөг”).',options:INTERESTS.map(i=>i.l).concat(['Мэдэхгүй'])}}
    return recommend(quiz);
  }


  // Цахим сан — сурах бичиг, дасгал ажлын дэвтэр (анги, хичээлээр нь холбоостой хариулна)
  const WB='Дасгал ажлын дэвтэр';
  let lastLib=null; // сүүлд асуусан цахим сангийн сэдэв {g, what}
  function libAnswer(q){
    const n=norm(q);
    const wantWb=/дасгал|ажлын дэвт|дэвтэр|бөглө/.test(n), wantBk=/сурах бич|(^|\s)ном(ын|ыг|оо|ууд|нууд)?(\s|$|\?)|textbook|pdf/.test(n);
    if(/номын сан/.test(n)&&!/цахим/.test(n))return null;
    if(!wantWb&&!wantBk&&!/цахим сан/.test(n))return null;
    const lib=(S79.get('library')||[]).filter(b=>b.title&&b.file);
    if(!lib.length)return null;
    const gm=n.match(/(?:^|\s)(1[0-2]|[1-9])\s*-?\s*(?:р|дугаар|дүгээр|-р)?\s*анги/)||n.match(/(?:^|\s)(1[0-2]|[1-9])(?:\s|$)/);
    const g=gm?gm[1]:(lastLib&&lastLib.g)||null; // анги дурдаагүй бол өмнөх асуултын ангийг ашиглана
    const kindOk=b=>wantWb&&!wantBk?b.kind===WB:wantBk&&!wantWb?b.kind!==WB:true;
    const qt=toks(q).map(stem).filter(t=>t.length>=3&&t!=='анг'&&!/^(сура|бичи|ном|дасг|ажлы|дэвт|анги|цахи|хэрэ|хаан|байн|татаж|татах|уншиж|унши|өгөө|олдо|линк|холб|авах|аваа|хүсэ|бөгл)/.test(t)&&!STOP.has(t));
    const score=b=>{const ts=new Set(toks(b.subject||b.title).map(stem));return qt.filter(t=>has(ts,t)).length};
    const label=b=>b.kind===WB?'✏️ Бөглөх':'📖 Унших';
    const link=b=>({t:`${label(b)}: ${b.title}`,u:S79.img(b.file)});
    let pool=lib.filter(kindOk);
    let subj=[];
    if(qt.length){const sc=pool.map(b=>[b,score(b)]),mx=Math.max(0,...sc.map(x=>x[1]));if(mx)subj=sc.filter(x=>x[1]===mx).map(x=>x[0])}
    const what=wantWb&&!wantBk?'дасгал ажлын дэвтэр':wantBk&&!wantWb?'сурах бичиг':'сурах бичиг, дасгал ажлын дэвтэр';
    lastLib={g,what:wantWb&&!wantBk?'дасгал ажлын дэвтэр':'сурах бичиг'};
    if(qt.length&&subj.length){
      const hits=g?subj.filter(b=>String(b.grade)===g):subj;
      hits.sort((a,b)=>a.grade-b.grade);
      if(!g&&hits.length>3){const sj=hits[0].subject||hits[0].title.replace(/\s*\d.*$/,'');
        return {text:`${sj} — ${hits.length} ангийн ${what} бий. Хэддүгээр ангийнх хэрэгтэй вэ?`,options:[...new Set(hits.map(b=>b.grade))].map(x=>`${x}-р ангийн ${sj} ${what.includes(',')?(hits[0].kind===WB?'дасгал ажлын дэвтэр':'сурах бичиг'):what}`)};}
      if(hits.length){const top=hits.slice(0,6);
        return {text:`${g?g+'-р ангийн ':''}${what}:\n`+top.map(b=>`• ${b.title} (${b.grade}-р анги${b.kind===WB?', онлайн бөглөнө':''})`).join('\n'),links:top.map(link)};}
      const gs=[...new Set(subj.map(b=>+b.grade))].sort((a,b)=>a-b);
      return {text:`${g}-р ангийн энэ хичээлийн ${what} цахим санд алга. Дараах ангиудад байна:`,options:gs.slice(0,12).map(x=>`${x}-р ангийн ${subj[0].subject} ${what.split(',')[0]}`)};
    }
    if(g){
      const inG=pool.filter(b=>String(b.grade)===g);
      if(!inG.length)return {text:`${g}-р ангийн ${what} цахим санд одоогоор алга.`,links:[{t:'📚 Цахим сан',u:'#library'}]};
      const bk=inG.filter(b=>b.kind!==WB), wk=inG.filter(b=>b.kind===WB);
      return {text:`${g}-р анги — ${[bk.length&&bk.length+' сурах бичиг',wk.length&&wk.length+' дасгал ажлын дэвтэр'].filter(Boolean).join(', ')}:\n`+
        (bk.length?'📘 '+bk.map(b=>b.subject||b.title).join(', ')+'\n':'')+(wk.length?'✏️ '+wk.map(b=>b.subject||b.title).join(', ')+'\n':'')+
        'Хичээлийн нэрээ бичвэл холбоосыг нь өгье (ж: “'+g+'-р ангийн '+((bk[0]||wk[0]).subject||'математик')+' '+(bk.length?'сурах бичиг':'дасгал ажлын дэвтэр')+'”).',
        links:[{t:`📚 ${g}-р ангийн цахим сан`,u:'#library',g}]};
    }
    return {text:`Цахим санд 1–12-р ангийн ${lib.filter(b=>b.kind!==WB).length} сурах бичиг, ${lib.filter(b=>b.kind===WB).length} дасгал ажлын дэвтэр бий. Хэддүгээр ангийнх хэрэгтэй вэ?`,
      options:['1','2','3','4','5','6','7','8','9','10','11','12'].map(x=>`${x}-р ангийн ${what.split(',')[0]}`)};
  }
  async function ask(q,history){
    const n=norm(q);
    if(/^дахин эхлэх$/.test(n)){quiz=null;return advise('клуб сонгох')}
    if(quiz&&!wantsAdvice(n)){ // Санал болгох явцад хамааралгүй асуулт ирвэл энгийн горимд шилжинэ
      const t={...quiz,ints:[...quiz.ints]};readFacts(n,t);
      if(JSON.stringify(t)===JSON.stringify(quiz)&&!/мэдэхгүй|хамаагүй|бүгд/.test(n))quiz=null;
    }
    if(quiz||wantsAdvice(n))return advise(q);
    {let L=libAnswer(q);
      // Өмнөх асуултын үргэлжлэл: “7-р анги”, “математик” гэх мэт богино хариулт
      if(!L&&lastLib&&toks(q).length<=4&&!wantsAdvice(n)){const gm=n.match(/^\s*(1[0-2]|[1-9])\s*-?\s*(р|дугаар|дүгээр)?\s*(анги\S*)?\s*$/);
        const t=gm?`${gm[1]}-р ангийн ${lastLib.what}`:`${lastLib.g?lastLib.g+'-р ангийн ':''}${q} ${lastLib.what}`;
        const L2=libAnswer(t);if(L2&&(gm||(L2.links&&L2.links.some(l=>l.u!=='#library'))))L=L2;}
      if(L){quiz=null;return L}
      lastLib=null;}
    if(await remoteOn()){
      try{
        const r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json','X-S79':'1'},body:JSON.stringify({q,history})});
        const j=await r.json(); if(r.ok&&j.answer)return j.answer;
      }catch(e){}
    }
    return answer(q);
  }
  return {answer,ask,advise,lastClub:()=>lastClub,reset:()=>{docs=null;quiz=null;lastClub=null;lastLib=null}};
})();
