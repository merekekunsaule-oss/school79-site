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
        qt=>`${ic} ${n.title}${n.date?` (${fmtDate(n.date)})`:''}\n${bestPart(n.text,qt||[])}`,{date:n.date||''})));
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
        '\n'+String(p.wins||'').split('\n').filter(w=>w&&!w.startsWith('—')).slice(0,4).map(w=>'• '+w).join('\n')));
    g('ads').forEach(a=>add('ad',`${a.title} зар ${a.cat||''}`,a.desc,
      ()=>`🛒 ${a.title} — ${a.deal?'үнэ тохиролцоно':+a.price?(+a.price).toLocaleString()+'₮':'үнэгүй'}.\n${cut(a.desc,200)}\n📞 ${a.contact||''}`));
    g('faq').forEach(f=>add('faq',f.q,f.a,()=>f.a));
    add('contact','холбоо барих утас утасны дугаар имэйл и-мэйл хаяг байршил ажлын цаг цагийн хуваарь','',
      ()=>['Сургуулийн холбоо барих мэдээлэл:',cfg.phone&&`📞 ${cfg.phone}`,cfg.email&&`✉️ ${cfg.email}`,cfg.address&&`📍 ${cfg.address}`,cfg.hours&&`🕘 Ажлын цаг: ${cfg.hours}`].filter(Boolean).join('\n'));
    add('stats','сурагч сурагчид тоо хэдэн багш ажилтан нийт жилийн түүх байгуулагдсан он клубын тоо','',
      ()=>`📊 Манай сургууль: ${home.students||'—'} сурагч, ${home.staff||'—'} багш ажилтан, ${g('clubs').length} клуб дугуйлан. 1974 онд байгуулагдсан, ${home.years||''} жилийн түүхтэй.`);
    if(home.dirText)add('director',`захирал ${home.dirName||''} мэндчилгээ удирдлага`,home.dirText,
      ()=>`👩‍💼 Захирал: ${home.dirName}.\n${cut(home.dirText,300)}`);
    if(home.about)add('about','сургуулийн тухай танилцуулга түүх байгуулагдсан',home.about,()=>`🏫 ${home.about}`);
    D.forEach(d=>{d.tt=new Set(toks(d.title).map(stem));d.bt=new Set(toks(d.body).map(stem))});
    return D;
  }
  const has=(set,s)=>{if(set.has(s))return true;for(const x of set){const a=x.length<s.length?x:s,b=a===x?s:x;if(a.length>=3&&b.startsWith(a))return true}return false};
  // Ерөнхий үгс (бараг бүх бичлэгт байдаг) — бага жинтэй
  const GEN=new Set(['багш','нар','анги','клуб','дугуй','сургалт','хичээ','мэдээ','сурагч','ажилт','тэмцээ'].map(stem));
  const isGen=t=>[...GEN].some(g=>t.startsWith(g)||g.startsWith(t));
  // Мэдээ/хуудасны текстээс асуултад хамгийн тохирох хэсгийг сонгох
  function bestPart(text,qt){const parts=String(text||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);if(parts.length<2)return cut(text,450);
    let bi=0,bs=-1;parts.forEach((p,i)=>{const ts=new Set(toks(p).map(stem));const sc=qt.filter(t=>!isGen(t)&&has(ts,t)).length;if(sc>bs){bs=sc;bi=i}});
    return bs>0?cut(parts[bi],700):cut(parts[0],450)}

  function answer(q){
    docs=docs||build();
    const n=norm(q);
    if(/^\s*(сайн уу|сайн байна уу|сайн байна|hello|hi|мэнд)\W*$/.test(n))return 'Сайн байна уу! 😊 Би сайтад байгаа мэдээллээс хайж хариулна. Багш, клуб, мэдээ, арга хэмжээ, холбоо барих зэргийг асуугаарай.';
    if(/баярлалаа|thanks|thank you/.test(n))return 'Баярлалаа! Өөр асуулт байвал асуугаарай. 😊';

    // “5а ангийн багш хэн бэ?” — даасан анги
    const cls=n.match(/(?:^|\s)(\d{1,2})\s*-?\s*([а-яө])(?=\s|$|\s*анги)/);
    if(cls&&/багш|анги/.test(n)){
      const key=cls[1]+cls[2];
      const hits=docs.filter(d=>d.kind==='teacher'&&norm(d.t.homeroom||'').replace(/\s/g,'')===key);
      if(hits.length)return `${key} ангийн даасан багш:\n\n`+hits.map(d=>d.render()).join('\n\n');
    }
    if(/(хэд|хэдэн|тоо)/.test(n)&&/(сурагч|багш|ажилтан|клуб|дугуйлан|жил)/.test(n)&&!/анги/.test(n))return docs.find(d=>d.kind==='stats').render();
    const qt=[...new Set(toks(q).filter(t=>!STOP.has(t)).map(stem))];
    // Олимпиадын хуваарь — зарлал доторх сургуулийн шатны жагсаалтыг шууд харуулна
    if(/олимпиад/.test(n)&&/хуваар|хэзээ|огноо|өдөр|шат/.test(n)){
      const ann=(S79.get('announcements')||[]).find(a=>/олимпиад/i.test(a.title)&&/шатны хуваарь/.test(a.text||''));
      if(ann){const blk=String(ann.text).split(/\n\s*\n/).find(b=>/шатны хуваарь/.test(b));return `🏅 ${ann.title}\n\n${blk}\n\nДүүрэг, нийслэл, улсын шатны хуваарийг “Мэдээ” → “Зарлал” хэсгээс үзнэ үү.`}
    }
    if(!qt.length)return fallback();
    const spec=qt.filter(t=>!isGen(t));
    const scored=docs.map(d=>{let s=0,m=0,ms=0;qt.forEach(t=>{const g=isGen(t);if(has(d.tt,t)){s+=g?0.5:3;m++;if(!g)ms++}else if(has(d.bt,t)){s+=g?0.2:1;m++;if(!g)ms++}});
      if(spec.length&&!ms)return {d,s:0};
      if(m===qt.length)s+=2; if(['contact','stats','director','about'].includes(d.kind))s+=0.5; return {d,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s||String(b.d.date||'').localeCompare(String(a.d.date||'')));
    if(!scored.length)return fallback();

    const wantList=/багш нар|багшууд|бүх|жагсаа|ямар ямар|хэн хэн|клубууд|клубүүд|дугуйлангууд|мэдээнүүд/.test(n);
    const top=scored[0].s, best=scored.filter(x=>x.s>=top-1);
    // Олон багш таарвал жагсаалтаар
    let tch=best.filter(x=>x.d.kind==='teacher');
    if(tch.length>1&&spec.length){const rs=tch.filter(x=>{const ts=new Set(toks(x.d.t.r+' '+(x.d.t.s||'')).map(stem));return spec.every(t=>has(ts,t))});if(rs.length)tch=rs}
    if(tch.length>=2&&(wantList||tch.length>=3||/багш/.test(n)&&tch.length===best.length)){
      const L=tch.slice(0,15).map(x=>`• ${x.d.t.n} — ${x.d.t.r}${x.d.t.e?`, ${x.d.t.e} жил`:''}`);
      return `Тохирох ${tch.length} багш олдлоо:\n${L.join('\n')}${tch.length>15?'\n…':''}\n\nДэлгэрэнгүйг “Багш нар” хэсгээс үзнэ үү.`;
    }
    if(/клуб|дугуйлан|секц/.test(n)&&(wantList||best.filter(x=>x.d.kind==='club').length>=3)){
      const cl=docs.filter(d=>d.kind==='club');
      return `Манай сургуульд ${cl.length} клуб, дугуйлан байна:\n`+cl.map(d=>`• ${d.c.ico||''} ${d.c.name}${d.c.day?` — ${d.c.day}`:''}`).join('\n')+'\n\n“Клуб” хэсгээс дэлгэрэнгүй үзэж, бүртгүүлээрэй.';
    }
    const first=scored[0].d;
    const more=scored.slice(1).map(x=>x.d).filter(d=>d!==first&&d.kind!=='page').slice(0,2);
    return first.render(qt)+(more.length&&scored[1].s>=top-1?'\n\nХолбоотой: '+more.map(d=>cut(d.title.split(' ').slice(0,6).join(' '),40)).join('; '):'');
  }
  function fallback(){
    const cfg=S79.get('settings')||{};
    return 'Уучлаарай, энэ асуултын хариулт сайтад оруулсан мэдээлэлд олдсонгүй.'+(cfg.phone?` 📞 ${cfg.phone} утсаар`:'')+' “Холбоо барих” хэсгээр хүсэлт илгээж лавлана уу.';
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
