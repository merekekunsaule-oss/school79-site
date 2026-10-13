/* 79-р сургуулийн AI туслах — сайтад оруулсан мэдээлэл (CMS) дээр тулгуурлан хариулна.
   1) Сервер дээр Claude API тохируулсан бол /api/ask-аар байгалийн хэлээр хариулна.
   2) Үгүй бол (эсвэл алдаа гарвал) энэ файлын хайлтын хөдөлгүүр бүх мэдээллээс хайж хариулна. */
const S79Assistant=(()=>{
  const STOP=new Set(('вэ бэ юу юуг хэн хэнийг ямар ямархуу хаана хэзээ хэд хэдэн хэдэх уу үү юм байна байдаг байгаа '+
    'нь ба болон тухай талаар мэдээлэл мэдээллийг өгөөч өгнө хэлээч хэлнэ үү гэж гэдэг энэ тэр манай танай '+
    'сургууль сургуулийн сургуульд 79 79-р дүгээр бол л ч гэх мэт вэ? надад би та бид асуух асуулт').split(' '));
  const norm=s=>String(s??'').toLowerCase().replace(/ё/g,'е');
  const toks=s=>norm(s).match(/[a-zа-яөү0-9]+/g)||[];
  // Монгол үгийн нөхцөлийг ойролцоогоор таслах: “математикийн” → “математик”
  const stem=t=>t.length<=4?t:t.slice(0,Math.max(4,t.length-3));
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const cut=(s,n)=>{s=clean(s);return s.length>n?s.slice(0,n).replace(/\s\S*$/,'')+'…':s};
  const fmtDate=d=>d?String(d).replace(/-/g,'.'):'';

  let docs=null;
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
    g('clubs').forEach(c=>add('club',`${c.name} ${c.cat} клуб дугуйлан`,`${c.t} ${c.d} ${c.goal||''} ${c.acts||''} ${c.place||''} ${c.day||''} ${c.grade||''}`,
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

  function answer(q){
    docs=docs||build();
    const n=norm(q);
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
    const qt=[...new Set(toks(q).filter(t=>!STOP.has(t)).map(stem))];
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
      if(m===qt.length)s+=2; if(['contact','stats','director','about'].includes(d.kind))s+=0.5; return {d,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||String(b.d.date||'').localeCompare(String(a.d.date||'')));
    if(!scored.length)return fallback();

    // Асуултын төрлөөр тохирох бичлэгийн төрлийг давуу болгох
    const pref=/үнэ|хэдээр|хэд вэ|зарна|авах/.test(n)?['ad']:/клуб|дугуйлан|секц/.test(n)?['club']:/хэзээ|огноо|болох/.test(n)?['events','announcements','news','club']:[];
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
    return brief(first,n);
  }
  // Асуултын төрлийг тодорхойлж, зөвхөн асуусан зүйлийг товч хариулна
  const first1=t=>{t=clean(t);const m=t.match(/^.*?[.!?](?=\s|$)/);return cut(m?m[0]:t,200)};
  const price=a=>a.deal?'үнэ тохиролцоно':+a.price?(+a.price).toLocaleString()+'₮':'үнэгүй';
  function brief(d,n){
    const I={when:/хэзээ|хэдэн цаг|цагт|аль өдөр|өдөр|гараг|огноо|хэдний/.test(n),where:/хаана|байршил|хаяг|аль байр|хаана байдаг/.test(n),
      phone:/утас|дугаар/.test(n),who:/хэн|удирдагч|дасгалжуулагч|багш нь/.test(n),
      years:/хэдэн жил|туршлага|хэдэн жилийн/.test(n),price:/үнэ|хэдээр|хэдэн төгрөг/.test(n),grade:/аль анги|хэддүгээр анги|хэдэн анги|хамрагд|нас/.test(n),
      cls:/заадаг|ямар анги|аль ангид/.test(n)};
    switch(d.kind){
      case 'club':{const c=d.c,N=c.name;
        if(I.when)return c.day?`${N} — ${c.day}.`:`${N} — хичээллэх цаг сайтад алга.`+(c.phone?` 📞 ${c.phone}`:'');
        if(I.where)return c.place?`${N} — ${c.place}.`:`${N} — байршил сайтад алга.`;
        if(I.phone)return c.phone?`${N}: 📞 ${c.phone}`:`${N} — утас сайтад алга.`;
        if(I.who)return c.t?`${N} — удирдагч: ${c.t}.`:`${N} — удирдагч сайтад алга.`;
        if(I.grade)return c.grade?`${N} — ${/^[\d\s–-]+$/.test(c.grade)?c.grade+'-р анги':c.grade}.`:`${N} — хамрагдах анги сайтад алга.`;
        return `${N}`+(c.t?`, удирдагч ${c.t}`:'')+(c.day?`. 🕒 ${c.day}`:'')+(c.place?`. 📍 ${c.place}`:'')+'.';}
      case 'teacher':{const t=d.t;
        if(I.years)return t.e?`${t.n} — ${t.e} жил ажиллаж байна.`:`${t.n}-ийн ажилласан жил сайтад алга.`;
        if(I.cls)return t.classes?`${t.n} заадаг анги: ${t.classes}.`:`${t.n}-ийн заадаг анги сайтад алга.`;
        return `${t.n} — ${t.r}`+(t.e?`, ${t.e} жил`:'')+(t.rank?`, ${t.rank.toLowerCase()}`:'')+(t.homeroom?`, ${t.homeroom} ангийн даасан багш`:'')+'.';}
      case 'news':case 'announcements':case 'events':{const o=d.o;
        if(I.when)return `${o.title} — ${fmtDate(o.date)}${o.place?`, ${o.place}`:''}.`;
        if(I.where&&o.place)return `${o.title} — ${o.place}.`;
        return `${o.title} (${fmtDate(o.date)}). ${first1(o.text)}`;}
      case 'pride':{const p=d.o;return `${p.n} — ${p.title||''} (${p.sport||''}), ${p.grad||''}.`;}
      case 'ad':{const a=d.o;if(I.phone)return `${a.title}: 📞 ${a.contact}`;return `${a.title} — ${price(a)}. 📞 ${a.contact}`;}
      case 'contact':{const c=S79.get('settings')||{};
        if(I.phone)return `📞 ${c.phone||'—'}`+(c.email&&/имэйл|и-мэйл|мэйл/.test(n)?`, ✉️ ${c.email}`:'');
        if(/имэйл|и-мэйл|мэйл/.test(n))return `✉️ ${c.email||'—'}`;
        if(I.where)return `📍 ${c.address||'—'}`;
        if(I.when)return `🕘 Ажлын цаг: ${c.hours||'—'}`;
        return d.render();}
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
  async function ask(q,history){
    if(await remoteOn()){
      try{
        const r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json','X-S79':'1'},body:JSON.stringify({q,history})});
        const j=await r.json(); if(r.ok&&j.answer)return j.answer;
      }catch(e){}
    }
    return answer(q);
  }
  return {answer,ask,reset:()=>{docs=null}};
})();
