/* 대입 탐색 노트 — 성적 입력 없는 탐색/비교/공유 도구
 * 데이터: 2027 NAVI (경기 지원이력 스냅샷). 모든 수치는 과거 관찰값입니다. */
'use strict';

const $ = s => document.querySelector(s);
const VIEW = $('#view');
const DATA_VER = 'v1';

// programs.json 필드 인덱스
const U=0, T=1, J=2, M=3, G=4, MJ=5, GJR=6, CW=7, C50=8, C70=9, GN=10, G30=11, G50=12, G70=13, SC=14;

let META=null, P=null, S=null;          // meta, programs, scales
let crossCache = {};                     // uidx -> shard
let state = { tab:'search', q:'', types:new Set(), gyeol:'', region:'', sort:'pop', limit:60,
              band:3.0, bandW:0.25, bandLimit:40, detail:null, minN:3 };

/* ---------- 유틸 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (v, suf='') => (v === null || v === undefined) ? '–' : v + suf;
const cutfmt = v => (v === null || v === undefined) ? '–' : v.toFixed(2);
function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._tm); t._tm = setTimeout(()=>t.hidden=true, 1800);
}
function rateHtml(app, win){
  if(!app) return '<td class="num">–</td>';
  const r = win/app*100;
  const cls = r>=30 ? 'rate-hi' : (r<10 ? 'rate-lo' : '');
  const w = Math.max(2, Math.min(60, r*0.6));
  return `<td class="num ${cls}">${r.toFixed(0)}% <span class="ratebar" style="width:${w}px"></span></td>`;
}

/* ---------- 장바구니 ---------- */
function cart(){ try{ return JSON.parse(localStorage.getItem('navi_cart_'+DATA_VER)) || []; }catch(e){ return []; } }
function setCart(ids){
  localStorage.setItem('navi_cart_'+DATA_VER, JSON.stringify(ids));
  const n = ids.length, el = $('#cartN');
  el.hidden = !n; el.textContent = n;
}
function toggleCart(i){
  const c = cart(); const k = c.indexOf(i);
  if(k >= 0){ c.splice(k,1); toast('목록에서 뺐어요'); }
  else { if(c.length >= 20){ toast('최대 20개까지 담을 수 있어요'); return; } c.push(i); toast('내 목록에 담았어요 🗂️'); }
  setCart(c);
  // 탐색 탭에선 결과 목록만 갱신 (검색창 포커스 유지)
  if(state.tab==='search' && $('#results')) updateResults(); else render();
}

/* ---------- 라우팅 ---------- */
window.addEventListener('hashchange', route);
document.querySelectorAll('#tabbar button').forEach(b =>
  b.addEventListener('click', () => { location.hash = '#tab=' + b.dataset.tab; }));

function route(){
  const h = location.hash.slice(1);
  const q = new URLSearchParams(h);
  if(q.has('p')){ state.detail = +q.get('p'); state.tab = 'detail'; }
  else if(q.has('cart')){ state.tab = 'shared'; state.sharedIds = q.get('cart').split('.').map(Number).filter(n=>!isNaN(n)); }
  else { state.tab = q.get('tab') || 'search'; state.detail = null; }
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === state.tab));
  render();
  VIEW.scrollIntoView ? window.scrollTo(0,0) : null;
}

/* ---------- 부팅 ---------- */
async function boot(){
  VIEW.innerHTML = '<div class="empty">데이터 불러오는 중… (첫 접속만 몇 초 걸려요)</div>';
  try{
    const [m, p, s] = await Promise.all([
      fetch('data/meta.json').then(r=>r.json()),
      fetch('data/programs.json').then(r=>r.json()),
      fetch('data/scales.json').then(r=>r.json()),
    ]);
    META=m; P=p; S=s;
    // 검색 인덱스
    P.forEach((r,i) => r._s = (META.univs[r[U]] + ' ' + r[M] + ' ' + r[J]).toLowerCase());
    setCart(cart());
    route();
  }catch(e){
    VIEW.innerHTML = `<div class="empty">데이터를 불러오지 못했어요.<br><span class="small">${esc(e.message)}</span></div>`;
  }
}

function render(){
  if(!P) return;
  if(state.tab==='search') renderSearch();
  else if(state.tab==='detail') renderDetail();
  else if(state.tab==='band') renderBand();
  else if(state.tab==='cart') renderCart();
  else if(state.tab==='shared') renderShared();
  else renderHelp();
}

/* ---------- 1) 탐색 ---------- */
function filtered(){
  const toks = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for(let i=0;i<P.length;i++){
    const r = P[i];
    if(toks.length && !toks.every(t => r._s.includes(t))) continue;
    if(state.types.size && !state.types.has(r[T])) continue;
    if(state.gyeol && r[G] !== state.gyeol && r[G] !== '공통') continue;  // 자유전공(공통)은 인문·자연 어디서든 보이게
    if(state.region && META.regions[r[U]] !== state.region) continue;
    out.push(i);
  }
  const key = state.sort;
  out.sort((a,b) => {
    const A=P[a], B=P[b];
    if(key==='pop')  return (B[GN]||0)-(A[GN]||0);
    if(key==='cutA') return (A[C50]??99)-(B[C50]??99);
    if(key==='cutD') return (B[C50]??-1)-(A[C50]??-1);
    return META.univs[A[U]].localeCompare(META.univs[B[U]],'ko') || A[M].localeCompare(B[M],'ko');
  });
  return out;
}

function pItem(i){
  const r = P[i], inCart = cart().includes(i);
  return `<div class="pitem" data-p="${i}">
    <div class="body">
      <div class="t1">${esc(META.univs[r[U]])} <span class="tag ${esc(r[T])}">${esc(r[T])}</span>
        ${r[G]?`<span class="tag 계열">${esc(r[G])}</span>`:''}</div>
      <div class="t2">${esc(r[M])} · ${esc(r[J])}${r[GN]?` · 작년 지원사례 ${r[GN]}명`:''}</div>
    </div>
    <div class="cut">${r[C50]!==null?`<b>${cutfmt(r[C50])}</b><div class="small">발표 50%컷</div>`:`<div class="small" style="max-width:56px">작년 기록<br>없음</div>`}</div>
    <button class="cartbtn ${inCart?'in':''}" data-cart="${i}" aria-label="담기">${inCart?'✅':'➕'}</button>
  </div>`;
}

function updateResults(){
  const ids = filtered();
  const shown = ids.slice(0, state.limit);
  $('#rescount').textContent = `${ids.length.toLocaleString()}개 전형 · 컷은 대학이 발표한 2026 입시결과(50%, 환산등급)`;
  const box = $('#results');
  box.innerHTML = (shown.map(pItem).join('') || '<div class="empty">조건에 맞는 전형이 없어요</div>')
    + (ids.length>shown.length?`<button class="btn ghost loadmore" id="more">더 보기 (${(ids.length-shown.length).toLocaleString()}개 남음)</button>`:'');
  bindCommon(box);
  const more = $('#more'); if(more) more.addEventListener('click', ()=>{ state.limit+=100; updateResults(); });
}

function renderSearch(){
  const regions = [...new Set(META.regions.filter(Boolean))].sort();
  VIEW.innerHTML = `
  <div class="card no-print">
    <input type="search" id="q" placeholder="대학·학과 검색  (예: 간호, 아주대, 심리)" value="${esc(state.q)}" autocomplete="off">
    <div class="chips">
      ${['교과','종합','논술','실기'].map(t=>`<button class="chip ${state.types.has(t)?'on':''}" data-type="${t}">${t}</button>`).join('')}
      <span style="width:6px"></span>
      ${['인문','자연','예체능'].map(g=>`<button class="chip ${state.gyeol===g?'on':''}" data-gyeol="${g}">${g}</button>`).join('')}
    </div>
    <div class="row">
      <select id="region"><option value="">모든 지역</option>
        ${regions.map(r=>`<option ${state.region===r?'selected':''}>${esc(r)}</option>`).join('')}</select>
      <select id="sort">
        <option value="pop" ${state.sort==='pop'?'selected':''}>많이 지원한 순</option>
        <option value="name" ${state.sort==='name'?'selected':''}>대학명 순</option>
        <option value="cutA" ${state.sort==='cutA'?'selected':''}>컷 높은 학과부터</option>
        <option value="cutD" ${state.sort==='cutD'?'selected':''}>컷 낮은 학과부터</option>
      </select>
    </div>
    <div class="mut" id="rescount" style="margin-top:6px"></div>
  </div>
  <div class="plist" id="results"></div>`;
  updateResults();

  // 입력창은 다시 그리지 않는다 — 결과만 갱신 (포커스·키보드 유지)
  let tm = null;
  $('#q').addEventListener('input', e => {
    clearTimeout(tm);
    tm = setTimeout(()=>{ state.q = e.target.value; state.limit=60; updateResults(); }, 150);
  });
  $('#region').addEventListener('change', e => { state.region = e.target.value; state.limit=60; updateResults(); });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; updateResults(); });
  document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{
    const t=b.dataset.type; state.types.has(t)?state.types.delete(t):state.types.add(t);
    b.classList.toggle('on'); state.limit=60; updateResults(); }));
  document.querySelectorAll('[data-gyeol]').forEach(b=>b.addEventListener('click',()=>{
    state.gyeol = state.gyeol===b.dataset.gyeol ? '' : b.dataset.gyeol;
    document.querySelectorAll('[data-gyeol]').forEach(x=>x.classList.toggle('on', x.dataset.gyeol===state.gyeol));
    state.limit=60; updateResults(); }));
}

function bindCommon(root){
  (root||document).querySelectorAll('[data-p]').forEach(el=>el.addEventListener('click', e=>{
    if(e.target.closest('[data-cart]')) return;
    location.hash = '#p=' + el.dataset.p;
  }));
  (root||document).querySelectorAll('[data-cart]').forEach(el=>el.addEventListener('click', e=>{
    e.stopPropagation(); toggleCart(+el.dataset.cart);
  }));
}

/* ---------- 2) 상세 ---------- */
async function loadCross(uidx){
  if(crossCache[uidx] !== undefined) return crossCache[uidx];
  try{
    const r = await fetch(`data/cross/${uidx}.json`);
    crossCache[uidx] = r.ok ? await r.json() : null;
  }catch(e){ crossCache[uidx] = null; }
  return crossCache[uidx];
}

let _uShort = null;
function univCandidates(name){
  // 교차지원 데이터의 대학명은 축약형(예: 가톨릭대, 한양대(ERICA))일 수 있음
  if(!_uShort){
    _uShort = META.univs.map(f => {
      const s = f.replace(/대학교/, '대');
      return [s, s.replace(/\(.*?\)/g, '')];
    });
  }
  const exact = META.univs.indexOf(name);
  if(exact >= 0) return [exact];
  const out = [];
  for(let i=0;i<_uShort.length;i++){
    const [withCampus, base] = _uShort[i];
    if(name === withCampus || name === base) out.push(i);
  }
  return out;
}
function findProgram(univName, t, j, m){
  const cands = univCandidates(univName);
  for(let i=0;i<P.length;i++){
    const r=P[i];
    if(cands.includes(r[U]) && r[T]===t && r[J]===j && r[M]===m) return i;
  }
  return -1;
}

async function renderDetail(){
  const i = state.detail, r = P[i];
  if(!r){ VIEW.innerHTML='<div class="empty">전형을 찾을 수 없어요</div>'; return; }
  const univ = META.univs[r[U]];
  const sc = r[SC]>=0 ? S[r[SC]] : null;
  const inCart = cart().includes(i);

  VIEW.innerHTML = `
  <button class="back no-print" onclick="history.back()">‹ 뒤로</button>
  <div class="card">
    <div class="row" style="align-items:flex-start">
      <div>
        <h2>${esc(univ)} <span class="tag ${esc(r[T])}">${esc(r[T])}</span></h2>
        <div class="mut">${esc(r[M])} · ${esc(r[J])}전형${r[G]?` · ${esc(r[G])}`:''} · ${esc(META.regions[r[U]]||'')}</div>
      </div>
      <button class="cartbtn no-print ${inCart?'in':''}" data-cart="${i}" style="flex:none">${inCart?'✅':'➕'}</button>
    </div>
    <h3 class="sec-of">🏫 대학이 발표한 작년(2026) 입시결과 <span class="src of">대학 발표</span></h3>
    <div class="mut small">대학이 공개한 공식 기록이에요 — 최종 등록자 기준 컷.</div>
    <div class="kv">
      <div class="cell"><div class="k">모집인원</div><div class="v">${fmt(r[MJ],'명')}</div></div>
      <div class="cell"><div class="k">경쟁률</div><div class="v">${fmt(r[GJR])}<small> :1</small></div></div>
      <div class="cell"><div class="k">추가합격</div><div class="v">${fmt(r[CW],'번')}</div></div>
      <div class="cell"><div class="k">50%컷</div><div class="v">${cutfmt(r[C50])}<small> 환산</small></div></div>
      <div class="cell"><div class="k">70%컷</div><div class="v">${cutfmt(r[C70])}<small> 환산</small></div></div>
    </div>
    ${(r[CW]&&r[MJ]&&r[CW]>=r[MJ])?`<div class="notice blue">🔄 작년 추가합격(${r[CW]}번)이 모집인원(${r[MJ]}명)의 ${(r[CW]/r[MJ]).toFixed(1)}배!
      최초 합격선보다 실제 문이 훨씬 넓었어요.</div>`:''}
    ${r[GN]?`
    <h3 class="sec-sa">👥 이 전형을 쓴 선배 ${r[GN]}명의 성적 분포 <span class="src sa">선배 사례</span></h3>
    <div class="mut small">이 도구가 모은 지원자 표본이에요 — 위의 공식 컷과는 다른 출처! (합격·불합격 모두 포함, 대학별 환산등급)</div>
    <div class="kv">
      <div class="cell"><div class="k">상위 30%</div><div class="v">${cutfmt(r[G30])}</div></div>
      <div class="cell"><div class="k">중간 50%</div><div class="v">${cutfmt(r[G50])}</div></div>
      <div class="cell"><div class="k">하위 70%</div><div class="v">${cutfmt(r[G70])}</div></div>
    </div>`:''}
    ${sc?`
    <h3 class="sec-sa">👥 이 전형 지원자들, 진짜 내신은? <span class="src sa">선배 사례 · ${sc.n||'?'}명</span></h3>
    <div class="mut small">${esc(univ)} ${esc(r[J])}전형 지원 표본 전체를 여러 잣대로 다시 잰 값이에요.</div>
    <div class="scroll"><table>
      <tr><th>기준</th><th class="num">상위30%</th><th class="num">50%</th><th class="num">70%</th></tr>
      <tr><td>대학 환산등급</td>${sc.univ.map(v=>`<td class="num">${cutfmt(v)}</td>`).join('')}</tr>
      <tr><td><b>전교과 (9등급)</b></td>${sc.jeon.map(v=>`<td class="num"><b>${cutfmt(v)}</b></td>`).join('')}</tr>
      <tr><td>국영수사과</td>${sc.gnssg.map(v=>`<td class="num">${cutfmt(v)}</td>`).join('')}</tr>
    </table></div>
    <div class="notice blue">💡 대학 환산등급과 전교과 등급이 크게 다르면, 이 대학이 유리한 과목만 반영한다는 뜻!
      환산컷만 보고 지레 포기하지 말고 전교과 기준으로 다시 봐요.</div>
    <button class="btn ghost no-print" id="goBand">📊 전교과 ${cutfmt(sc.jeon[1])} 근처 성적대는 어디를 많이 쓸까?</button>
    `:''}
  </div>

  <div class="card">
    <h2>이 전형을 쓴 선배들이 <u>같이</u> 쓴 곳 <span class="src sa">선배 사례</span></h2>
    <div class="mut small">작년 이 전형에 지원한 <b>비슷한 성적대 선배들</b>이 함께 낸 원서와 그 결과예요</div>
    <div id="crossBox"><div class="empty small">불러오는 중…</div></div>
  </div>
  <div class="notice">⚠️ 과거 기록의 <b>관찰</b>이지 추천이 아니에요. 사례 수가 적으면(n이 작으면) 우연일 수 있어요.
    최종 판단은 꼭 선생님과 상담으로!</div>`;

  bindCommon();
  const gb = $('#goBand');
  if(gb) gb.addEventListener('click', ()=>{ state.band = Math.round(sc.jeon[1]*10)/10; location.hash='#tab=band'; });

  // 교차지원 로드 (학과 단위 → 없으면 전형 단위 폴백)
  const shard = await loadCross(r[U]);
  const box = $('#crossBox');
  if(!box) return;
  let rows = [], mode = 'dept';
  if(shard){
    const exact = `${r[T]}|${r[J]}|${r[G]}|${r[M]}`;
    if(shard[exact]) rows = shard[exact].slice();
    else{
      const pre = `${r[T]}|${r[J]}|`, suf = `|${r[M]}`;
      for(const k in shard) if(k.startsWith(pre) && k.endsWith(suf)) rows = rows.concat(shard[k]);
    }
  }
  if(!rows.length){
    // 전형 단위 폴백: [지역,대학,전형유형,전형,계열,지원,합격] → 공용 포맷으로 변환
    try{
      const r2 = await fetch(`data/cross2/${r[U]}.json`);
      if(r2.ok){
        const s2 = await r2.json();
        let raw = s2[`${r[T]}|${r[J]}|${r[G]}`];
        if(!raw){ const pre = `${r[T]}|${r[J]}|`; raw = Object.keys(s2).filter(k=>k.startsWith(pre)).flatMap(k=>s2[k]); }
        if(raw && raw.length){
          rows = raw.map(x=>[x[0],x[1],x[2],x[3],x[4],'',null,x[5],x[6]]);
          mode = 'type';
        }
      }
    }catch(e){}
  }
  if(!rows.length){ box.innerHTML = '<div class="empty small">이 전형은 교차지원 기록이 없어요</div>'; return; }

  const draw = ()=>{
    const minN = state.minN;
    const rs = rows.filter(x=>x[7]>=minN).sort((a,b)=>b[7]-a[7]);
    const total = rows.reduce((s,x)=>s+x[7],0);
    box.innerHTML = `
      ${mode==='type'?`<div class="notice blue small">이 학과 단위 기록은 없어서, <b>같은 전형(${esc(r[J])})을 쓴 선배 전체</b> 기준으로 보여드려요.</div>`:''}
      <div class="chips no-print">
        ${[1,3,5,10].map(n=>`<button class="chip ${minN===n?'on':''}" data-minn="${n}">${n}건 이상</button>`).join('')}
        <span class="mut small" style="align-self:center">총 ${total.toLocaleString()}건의 원서</span>
      </div>
      <div class="scroll"><table>
        <tr><th>어디를</th><th>어떤 전형으로</th><th class="num">지원</th><th class="num">합격률</th></tr>
        ${rs.slice(0,40).map(x=>{
          const pi = x[5] ? findProgram(x[1], x[2], x[3], x[5]) : -1;
          return `<tr ${pi>=0?`data-p="${pi}" style="cursor:pointer"`:''}>
            <td><b>${esc(x[1])}</b>${x[5]?`<br><span class="mut small">${esc(x[5])}</span>`:''}</td>
            <td>${esc(x[3])}<br><span class="mut small">${esc(x[2])}${x[4]?' · '+esc(x[4]):''}</span></td>
            <td class="num">${x[7]}</td>${rateHtml(x[7],x[8])}</tr>`;
        }).join('')}
      </table></div>
      ${rs.length>40?`<div class="mut small" style="margin-top:6px">상위 40곳만 표시 (전체 ${rs.length}곳)</div>`:''}
      ${!rs.length?'<div class="empty small">사례 수 조건을 낮춰보세요</div>':''}`;
    box.querySelectorAll('[data-minn]').forEach(b=>b.addEventListener('click',()=>{ state.minN=+b.dataset.minn; draw(); }));
    bindCommon(box);
  };
  draw();
}

/* ---------- 3) 성적대 탐색 ---------- */
function renderBand(){
  const c = state.band, w = state.bandW || 0.25, lo = +(c-w).toFixed(2), hi = +(c+w).toFixed(2);
  // 전형(대학×전형) 단위: 전교과 50%가 밴드 안
  if(!state._scProgs){
    // 전형(scale)별 프로그램 목록 + 대표 계열, 1회만 계산
    state._scProgs = {}; state._scG = {};
    const cnt = {};
    for(let i=0;i<P.length;i++){
      const k = P[i][SC];
      if(k<0) continue;
      (state._scProgs[k] = state._scProgs[k] || []).push(i);
      const g = P[i][G];
      if(g){ (cnt[k] = cnt[k] || {})[g] = (cnt[k][g]||0)+1; }
    }
    for(const k in state._scProgs) state._scProgs[k].sort((a,b)=>(P[b][GN]||0)-(P[a][GN]||0));
    for(const k in cnt) state._scG[k] = Object.entries(cnt[k]).sort((a,b)=>b[1]-a[1])[0][0];
  }
  const hits = [];
  for(let si=0; si<S.length; si++){
    const s = S[si];
    if(s.jeon[1]===null || s.jeon[1]<lo || s.jeon[1]>hi || (s.n||0)<5 || !state._scProgs[si]) continue;
    // 계열 필터: 그 계열 학과가 하나라도 있는 전형만
    if(state.bandG && !state._scProgs[si].some(i=>P[i][G]===state.bandG||P[i][G]==='공통')) continue;
    hits.push(si);
  }
  hits.sort((a,b)=>(S[b].n||0)-(S[a].n||0));
  const shown = hits.slice(0, state.bandLimit);

  // 펼침 목록: 계열 필터가 켜져 있으면 그 계열 학과만
  const progOf = {};
  for(const si of shown){
    progOf[si] = state.bandG ? state._scProgs[si].filter(i=>P[i][G]===state.bandG||P[i][G]==='공통') : state._scProgs[si];
  }

  VIEW.innerHTML = `
  <div class="card">
    <h2>내 성적대는 어디를 많이 쓸까? <span class="src sa">선배 사례</span></h2>
    <div class="mut small">전교과 9등급 기준. 내 등급을 알면 직접 입력, 대충이면 슬라이더로.</div>
    <div class="bandsel">
      <input type="number" id="bandNum" min="1" max="9" step="0.01" value="${c}" inputmode="decimal"
             style="flex:0 0 92px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);padding:9px 10px;font-size:17px;font-weight:800;text-align:center">
      <input type="range" id="band" min="1" max="6.5" step="0.05" value="${c}">
    </div>
    <div class="chips">
      <span class="mut small" style="align-self:center">범위</span>
      ${[0.1,0.25,0.5].map(x=>`<button class="chip ${w===x?'on':''}" data-bw="${x}">±${x}</button>`).join('')}
      <span class="bandval mut small" style="align-self:center;min-width:0">→ ${lo.toFixed(2)}~${hi.toFixed(2)} 검색</span>
    </div>
    <div class="chips">
      ${['인문','자연','예체능'].map(g=>`<button class="chip ${state.bandG===g?'on':''}" data-bg="${g}">${g}</button>`).join('')}
      <span class="mut small" style="align-self:center">전형의 주요 계열 기준</span>
    </div>
    <div class="mut small">이 성적대 선배들이 실제 많이 낸 전형 순 · 지원자 5명 이상만</div>
  </div>
  <div class="plist">
    ${shown.map(si=>{
      const s=S[si], ps=progOf[si]||[], first=ps[0];
      const univ = first!==undefined ? META.univs[P[first][U]] : '';
      const jname = first!==undefined ? P[first][J] : '';
      const tname = first!==undefined ? P[first][T] : '';
      const gtag = state.bandG || state._scG[si];
      return `<details>
        <summary>${esc(univ)} <span class="tag ${esc(tname)}">${esc(tname)}</span> ${esc(jname)}
          ${gtag?`<span class="tag 계열">${esc(gtag)}</span>`:''}
          <span class="mut small"> · ${s.n}명 지원 · 전교과 50% ${cutfmt(s.jeon[1])} (환산 ${cutfmt(s.univ[1])})</span></summary>
        <div class="plist" style="margin-top:8px">
          ${state.bandG?`<div class="mut small">${esc(state.bandG)} 학과만 표시 중</div>`:''}
          ${ps.slice(0,8).map(pItem).join('')}
          ${ps.length>8?`<div class="mut small">외 ${ps.length-8}개 학과 — 탐색 탭에서 "${esc(univ)}" 검색</div>`:''}</div>
      </details>`;
    }).join('') || '<div class="empty">이 성적대 데이터가 부족해요 — 슬라이더를 옮겨보세요</div>'}
  </div>
  ${hits.length>shown.length?`<button class="btn ghost loadmore" id="bmore">더 보기 (${hits.length-shown.length}개)</button>`:''}
  <div class="notice">⚠️ "많이 썼다"는 것이지 "붙었다/맞다"는 뜻이 아니에요. 각 전형을 눌러 합격률까지 확인!</div>`;

  const setBand = v => { if(isNaN(v)||v<1||v>9) return; state.band=Math.round(v*100)/100; state.bandLimit=40; renderBand(); };
  $('#band').addEventListener('change', e=>setBand(+e.target.value));
  $('#band').addEventListener('input', e=>{
    const v=+e.target.value, ww=state.bandW||0.25;
    $('#bandNum').value=v;
    VIEW.querySelector('.bandval').textContent = `→ ${(v-ww).toFixed(2)}~${(v+ww).toFixed(2)} 검색`; });
  $('#bandNum').addEventListener('change', e=>setBand(+e.target.value));
  document.querySelectorAll('[data-bw]').forEach(b=>b.addEventListener('click',()=>{ state.bandW=+b.dataset.bw; state.bandLimit=40; renderBand(); }));
  document.querySelectorAll('[data-bg]').forEach(b=>b.addEventListener('click',()=>{ state.bandG = state.bandG===b.dataset.bg ? '' : b.dataset.bg; state.bandLimit=40; renderBand(); }));
  const bm=$('#bmore'); if(bm) bm.addEventListener('click',()=>{ state.bandLimit+=40; renderBand(); });
  bindCommon();
}

/* ---------- 4) 내 목록 ---------- */
function cartText(ids){
  return '📋 내 관심 대학 목록\n' + ids.map((i,k)=>{
    const r=P[i];
    return `${k+1}. ${META.univs[r[U]]} ${r[M]} (${r[T]}·${r[J]}) — 작년 50%컷 ${cutfmt(r[C50])}, 경쟁률 ${fmt(r[GJR])}:1`;
  }).join('\n') + '\n\n' + shareUrl(ids);
}
function shareUrl(ids){
  return location.origin + location.pathname + '#cart=' + ids.join('.');
}

function renderCart(){
  const ids = cart();
  VIEW.innerHTML = `
  <div class="card">
    <h2>🗂️ 내 목록 <span class="mut small">${ids.length}/20</span></h2>
    <div class="mut small">상담 전에 이 목록을 만들어 오면 이야기가 빨라져요.</div>
  </div>
  ${ids.length ? `
  <div class="plist">${ids.map((i,k)=>{
    const r=P[i];
    return `<div class="pitem" data-p="${i}">
      <div class="body">
        <div class="t1">${k+1}. ${esc(META.univs[r[U]])} <span class="tag ${esc(r[T])}">${esc(r[T])}</span></div>
        <div class="t2">${esc(r[M])} · ${esc(r[J])} · 50%컷 ${cutfmt(r[C50])} · 경쟁률 ${fmt(r[GJR])}:1${r[CW]?` · 추합 ${r[CW]}번`:''}</div>
      </div>
      <div class="no-print" style="display:flex;gap:4px">
        <button class="cartbtn" data-up="${k}" ${k===0?'disabled':''}>↑</button>
        <button class="cartbtn" data-cart="${i}">🗑️</button>
      </div>
    </div>`;}).join('')}
  </div>
  <div class="card no-print">
    <h3 style="margin-top:0">공유하기</h3>
    <div class="row" style="flex-wrap:wrap">
      <button class="btn" id="shShare">📤 공유</button>
      <button class="btn ghost" id="shLink">🔗 링크 복사</button>
      <button class="btn ghost" id="shText">📝 텍스트 복사</button>
      <button class="btn line" id="shPrint">🖨️ 인쇄</button>
    </div>
    <div class="mut small" style="margin-top:8px">링크를 받은 사람(친구·선생님)은 이 목록을 그대로 볼 수 있어요.</div>
  </div>` : '<div class="empty">아직 담은 전형이 없어요.<br>탐색에서 ➕ 를 눌러 담아보세요!</div>'}`;

  bindCommon();
  document.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click', e=>{
    e.stopPropagation();
    const k=+b.dataset.up, c=cart(); [c[k-1],c[k]]=[c[k],c[k-1]]; setCart(c); renderCart(); }));
  if(!ids.length) return;
  $('#shLink').addEventListener('click', async()=>{ await navigator.clipboard.writeText(shareUrl(ids)); toast('링크 복사 완료! 카톡에 붙여넣어요'); });
  $('#shText').addEventListener('click', async()=>{ await navigator.clipboard.writeText(cartText(ids)); toast('텍스트 복사 완료!'); });
  $('#shPrint').addEventListener('click', ()=>window.print());
  $('#shShare').addEventListener('click', async()=>{
    if(navigator.share){ try{ await navigator.share({title:'내 관심 대학 목록', text:cartText(ids)}); }catch(e){} }
    else { await navigator.clipboard.writeText(cartText(ids)); toast('텍스트를 복사했어요'); }
  });
}

function renderShared(){
  const ids = (state.sharedIds||[]).filter(i=>P[i]);
  VIEW.innerHTML = `
  <div class="card"><h2>📬 공유받은 목록 <span class="mut small">${ids.length}개</span></h2></div>
  <div class="plist">${ids.map((i,k)=>{
    const r=P[i];
    return `<div class="pitem" data-p="${i}">
      <div class="body"><div class="t1">${k+1}. ${esc(META.univs[r[U]])} <span class="tag ${esc(r[T])}">${esc(r[T])}</span></div>
      <div class="t2">${esc(r[M])} · ${esc(r[J])} · 50%컷 ${cutfmt(r[C50])} · 경쟁률 ${fmt(r[GJR])}:1</div></div></div>`;
  }).join('')}</div>
  <div class="card no-print"><button class="btn" id="adopt">이 목록을 내 목록으로 가져오기</button></div>`;
  bindCommon();
  $('#adopt').addEventListener('click', ()=>{
    const merged=[...new Set([...cart(), ...ids])].slice(0,20);
    setCart(merged); toast('내 목록에 합쳤어요'); location.hash='#tab=cart'; });
}

/* ---------- 5) 안내 ---------- */
function renderHelp(){
  VIEW.innerHTML = `
  <div class="card">
    <h2>💡 이 사이트 쓰는 법</h2>
    <p class="small" style="margin:8px 0">성적을 입력할 필요 없어요. 자기 성적은 자기가 대충 아니까,
    자유롭게 구경하고 → 마음에 드는 곳을 담고 → 그 목록으로 선생님과 상담하면 됩니다.</p>
    <h3>🔍 탐색</h3>
    <p class="small">대학·학과 이름으로 검색하고, 학과를 누르면 <b>작년에 그 전형을 쓴 선배들이 같이 쓴 곳과 결과</b>가 나와요. 여기가 이 사이트의 핵심!</p>
    <h3>📊 성적대</h3>
    <p class="small">전교과 등급대를 슬라이더로 고르면, 그 성적대 선배들이 실제로 많이 낸 전형이 나와요.</p>
    <h3>🗂️ 내 목록</h3>
    <p class="small">➕로 담고, 순서를 정리하고, 링크로 공유하거나 인쇄해서 상담 때 가져오세요.</p>
  </div>
  <div class="card">
    <h2>🏷️ 두 가지 숫자, 출처가 달라요</h2>
    <p class="small" style="margin:8px 0"><span class="src of">대학 발표</span> — 대학이 공식 공개한 작년 입시결과예요.
    모집인원·경쟁률·추가합격·50%/70%컷이 여기 해당해요. 최종 등록자 기준이라 가장 믿을 만하지만, 그 대학의 환산 방식으로 계산된 등급이에요.</p>
    <p class="small" style="margin:8px 0"><span class="src sa">선배 사례</span> — 이 도구가 모은 작년 지원자 표본이에요.
    성적 분포, 여러 잣대로 다시 잰 내신, "같이 쓴 곳", 성적대 탐색이 여기 해당해요. 합격·불합격이 모두 섞여 있고 표본 크기(n)에 따라 흔들릴 수 있어요.</p>
    <p class="small" style="margin:8px 0">👉 그래서 <b>같은 화면에 두 숫자가 다르게 보이는 게 정상</b>이에요. "대학 발표 컷"은 붙은 사람들 기준, "선배 사례 분포"는 쓴 사람들 전체 기준이니까요.</p>
  </div>
  <div class="card">
    <h2>⚠️ 꼭 알아두기</h2>
    <ul class="small" style="padding-left:18px;display:flex;flex-direction:column;gap:6px">
      <li>모든 수치는 <b>작년(2026학년도) 기록</b>이에요. 올해는 모집인원·전형이 바뀔 수 있어요.</li>
      <li>"같이 쓴 곳"은 과거의 <b>관찰</b>이지 추천이 아니에요. 선배들이 항상 옳은 선택을 한 것도 아니고요.</li>
      <li>사례 수(n)가 작을수록 우연일 가능성이 커요. n을 항상 같이 보세요.</li>
      <li>대학별 환산등급끼리는 서로 비교하면 안 돼요. 비교는 <b>전교과 기준</b> 행으로!</li>
      <li>수능최저, 면접, 서류는 여기 다 안 담겨 있어요. <b>최종 판단은 반드시 선생님과 상담</b>으로.</li>
    </ul>
  </div>
  <div class="card mut small">데이터: ${esc(META.src)} · 빌드 ${esc(META.built)} · 학생 개인정보는 어떤 것도 저장하지 않아요.</div>`;
}

boot();
