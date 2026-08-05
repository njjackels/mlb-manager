
const APP_VERSION='1.01';
const D=window.INITIAL_DATA, KEY='kyle-mlb-team-manager-v1';
const silhouette=`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 210"><rect width="180" height="210" fill="#e5e8ec"/><circle cx="90" cy="67" r="39" fill="#8e98a5"/><path d="M24 210c3-58 28-91 66-91s63 33 66 91" fill="#8e98a5"/></svg>`)}`;
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{players:D.players,transactions:[]};
function ensureImportedTradeHistory(){
  const version=String(D.tradeImportVersion||'');
  if(!version||state.tradeImportVersion===version)return;
  // Corrected import: start from the official spreadsheet only.
  // This removes Phase 1 test trades and replaces the earlier imported records.
  state.tradeHistory=Array.isArray(D.tradeHistoryImported)?structuredClone(D.tradeHistoryImported):[];
  state.tradeImportVersion=version;
}
ensureImportedTradeHistory();
function ensureUniqueInternalPlayerIds(){
  const seen=new Set();let changed=false;
  for(const p of state.players){
    let base=String(p.id||p.mlbId||('custom-'+Date.now()));
    let candidate=base,n=2;
    while(seen.has(candidate))candidate=`${base}-${n++}`;
    if(String(p.id)!==candidate){p.id=candidate;changed=true}
    seen.add(candidate);
  }
  if(changed)localStorage.setItem(KEY,JSON.stringify(state));
}
ensureUniqueInternalPlayerIds();
let current='Cover', search='', targetPlayer='';
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function photo(p){return p.mlbId?`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${p.mlbId}/headshot/67/current`:silhouette}
function salary(p){return ['AAA','AA','A','Rookie'].includes(p.roster)?p.minorSalary:p.mlbSalary}

function parseSalary(value){
  const cleaned=String(value??'').trim().replace(/[$,\s]/g,'');
  if(cleaned==='')return 0;
  const amount=Number(cleaned);
  return Number.isFinite(amount)?amount:NaN;
}
function baseballPositions(p){
  const raw=String(p?.positions||'').replace(/[⏵⏴]/g,'').trim();
  const parts=raw.split('/').map(x=>x.trim().toUpperCase()).filter(Boolean);
  return [...new Set(parts)];
}
function isPitcher(p){
  return baseballPositions(p).some(pos=>['SP','RP','P'].includes(pos));
}
function eligiblePositions(p){
  const parts=baseballPositions(p);
  if(isPitcher(p))return [...new Set([...(parts.length?parts:['RP']),'P','BENCH'])];
  return [...new Set([...(parts.length?parts:['UTL']),'UTL','BENCH'])];
}
function currentPosition(p,fallback=''){
  const eligible=eligiblePositions(p);
  const chosen=String(p?.currentPosition||fallback||'').trim().toUpperCase();
  return eligible.includes(chosen)?chosen:'';
}
function positionOptions(p,selected=''){
  const eligible=eligiblePositions(p);
  const chosen=String(selected||p?.currentPosition||'').trim().toUpperCase();
  const valid=eligible.includes(chosen)?chosen:'';
  return `<option value=""${valid?'':' selected'}>Choose position...</option>`+eligible.map(pos=>`<option value="${esc(pos)}"${pos===valid?' selected':''}>${esc(pos)}</option>`).join('');
}
const MLB_LINEUP_SLOTS=[
  {id:'C',label:'C',kind:'hit'}, {id:'1B',label:'1B',kind:'hit'}, {id:'2B',label:'2B',kind:'hit'},
  {id:'SS',label:'SS',kind:'hit'}, {id:'3B',label:'3B',kind:'hit'}, {id:'LF',label:'LF',kind:'hit'},
  {id:'CF',label:'CF',kind:'hit'}, {id:'RF',label:'RF',kind:'hit'}, {id:'UTL',label:'UTL',kind:'hit'},
  {id:'P',label:'P',kind:'p'},
  ...Array.from({length:5},(_,i)=>({id:`SP-${i+1}`,label:'SP',kind:'sp'})),
  ...Array.from({length:7},(_,i)=>({id:`RP-${i+1}`,label:'RP',kind:'rp'})),
  ...Array.from({length:4},(_,i)=>({id:`BENCH-${i+1}`,label:`BENCH ${i+1}`,kind:'bench'}))
];
function slotDefinition(id){return MLB_LINEUP_SLOTS.find(s=>s.id===id)}
function firstOpenSlot(kind,players,excludeId=''){
  const used=new Set(players.filter(p=>p.id!==excludeId).map(p=>p.lineupSlot).filter(Boolean));
  return MLB_LINEUP_SLOTS.find(s=>s.kind===kind&&!used.has(s.id))?.id||'';
}
function preferredSlotKind(position){
  if(position==='P')return 'p';
  if(position==='SP')return 'sp';
  if(position==='RP')return 'rp';
  return 'hit';
}
function baseballOnlyPositions(p){
  return baseballPositions(p).filter(pos=>['C','1B','2B','3B','SS','LF','CF','RF','SP','RP','P'].includes(pos));
}
function automaticPositionForPlayer(p){
  const positions=baseballOnlyPositions(p);
  return positions.length===1?positions[0]:'';
}
function openSlotForPosition(position,players,excludeId=''){
  const used=new Set(players.filter(x=>x.id!==excludeId).map(x=>x.lineupSlot).filter(Boolean));
  if(['C','1B','2B','3B','SS','LF','CF','RF','UTL','P'].includes(position))return used.has(position)?'':position;
  if(position==='SP')return MLB_LINEUP_SLOTS.find(s=>s.kind==='sp'&&!used.has(s.id))?.id||'';
  if(position==='RP')return MLB_LINEUP_SLOTS.find(s=>s.kind==='rp'&&!used.has(s.id))?.id||'';
  if(position==='BENCH')return MLB_LINEUP_SLOTS.find(s=>s.kind==='bench'&&!used.has(s.id))?.id||'';
  return '';
}
function assignDefaultMlbSlot(p,players){
  const auto=automaticPositionForPlayer(p);
  p.currentPosition=auto;
  let slot=auto?openSlotForPosition(auto,players,p.id):'';
  if(auto&&!slot){
    slot=firstOpenSlot('bench',players,p.id);
    if(slot)p.currentPosition='BENCH';
  }
  p.lineupSlot=slot;
  return slot;
}

function initializeMlbLineupSlots(players,slotByName=new Map()){
  let changed=false;const used=new Set();
  for(const p of players){
    if(p.lineupSlot&&slotDefinition(p.lineupSlot)&&!used.has(p.lineupSlot)){used.add(p.lineupSlot);continue}
    const saved=String(slotByName.get(String(p.name||'').toLowerCase())||p.currentPosition||'').toUpperCase();
    let slot='';
    if(saved)slot=openSlotForPosition(saved,players,p.id);
    if(!slot&&!saved){
      const auto=automaticPositionForPlayer(p);
      if(auto){slot=openSlotForPosition(auto,players,p.id);if(slot)p.currentPosition=auto}
    }
    if(!slot&&saved==='BENCH')slot=firstOpenSlot('bench',players,p.id);
    p.lineupSlot=slot;
    if(slot)used.add(slot);
    changed=true;
  }
  if(changed)save();
}
function movePlayerToLineupSlot(p,newSlot,players){
  const oldSlot=p.lineupSlot||'';if(oldSlot===newSlot)return;
  const occupant=players.find(x=>x.id!==p.id&&x.lineupSlot===newSlot);
  p.lineupSlot=newSlot;
  if(occupant)occupant.lineupSlot=oldSlot||firstOpenSlot('bench',players,p.id)||'';
}
window.changePlayerPosition=(id,value)=>{
  const p=state.players.find(x=>x.id===id);if(!p)return;
  value=String(value||'').toUpperCase();
  const allowed=eligiblePositions(p);if(!allowed.includes(value))return;
  const old=currentPosition(p);p.currentPosition=value;
  if(p.roster==='MLB'&&!isInjuredCoverage(p)){
    const players=state.players.filter(x=>x.active!==false&&x.roster==='MLB'&&!isInjuredCoverage(x));
    initializeMlbLineupSlots(players);
    let target='';
    if(['C','1B','2B','SS','3B','LF','CF','RF','UTL'].includes(value))target=value;
    else if(value==='BENCH')target=firstOpenSlot('bench',players,p.id)||p.lineupSlot;
    else if(value==='P')target='P';
    else if(value==='SP')target=firstOpenSlot('sp',players,p.id)||p.lineupSlot;
    else if(value==='RP')target=firstOpenSlot('rp',players,p.id)||p.lineupSlot;
    if(target)movePlayerToLineupSlot(p,target,players);
  }
  log('Position Changed',p,`${old} to ${value}`);save();render();
};
function assignmentStatus(p){return ['INJ','CVG'].includes(String(p.rosterStatus||p.status||'').toUpperCase())?String(p.rosterStatus||p.status).toUpperCase():'ACTIVE'}
function assignmentValue(p){const s=assignmentStatus(p);return s==='ACTIVE'?(p.roster||'Unassigned'):s}
function assignmentLabel(p){const s=assignmentStatus(p);return s==='ACTIVE'?(p.roster||'Unassigned'):`${s} · ${p.roster||p.returnRoster||'MLB'}`}
function setRosterAssignment(p,value){
  const old=assignmentLabel(p);
  const validLevels=['MLB','AAA','AA','A','Rookie'];
  if(value==='INJ'||value==='CVG'){
    // Preserve the player's actual home roster while placing him in the
    // dedicated Injured or Coverage section on that roster page.
    const home=validLevels.includes(p.roster)?p.roster:(validLevels.includes(p.returnRoster)?p.returnRoster:'MLB');
    p.active=true;p.roster=home;p.returnRoster=home;p.rosterStatus=value;p.status=value;
    p.lineupSlot='';
    const h=playerHighlights(p).filter(x=>x!=='injured');
    if(value==='INJ')h.push('injured');
    setPlayerHighlights(p,h);
  }else if(value==='Unassigned'){
    p.active=false;p.roster='Unassigned';p.rosterStatus='ACTIVE';p.status='';p.returnRoster='';p.lineupSlot='';
    setPlayerHighlights(p,playerHighlights(p).filter(x=>x!=='injured'));
  }else if(validLevels.includes(value)){
    p.active=true;p.roster=value;p.returnRoster=value;p.rosterStatus='ACTIVE';p.status='';
    // Keep the displayed level synchronized with the roster assignment.
    p.currentLevel=value;p.realLevel=value;
    if(value==='MLB'){
      const mlbPlayers=state.players.filter(x=>x.active!==false&&x.roster==='MLB'&&!isInjuredCoverage(x));
      assignDefaultMlbSlot(p,mlbPlayers);
    }else{
      p.lineupSlot='';
    }
    setPlayerHighlights(p,playerHighlights(p).filter(x=>x!=='injured'));
  }
  return old;
}
function isInjuredCoverage(p){return ['INJ','CVG'].includes(assignmentStatus(p))}
function playerHighlights(p){
  const h=Array.isArray(p.highlights)?p.highlights:[];
  return ['injured','mlb-level','top-100','team-top-10','40-man'].filter(x=>h.includes(x));
}
function highlightRowClass(p){const h=playerHighlights(p);return h.length?' player-highlight '+h.map(x=>'highlight-'+x).join(' '):''}
function highlightBadges(p){const h=playerHighlights(p),labels={'injured':'Injured','mlb-level':'MLB','top-100':'Top 100','team-top-10':'Team Top 10','40-man':'40-man'};return h.length?`<div class="player-highlight-badges">${h.map(x=>`<span class="highlight-badge ${x}">${labels[x]}</span>`).join('')}</div>`:''}
function setPlayerHighlights(p,values){p.highlights=['injured','mlb-level','top-100','team-top-10','40-man'].filter(x=>values.includes(x))}
function nav(){
  const pages=D.sheetOrder.filter(x=>x!=='Partial Contract Coverage');
  const labels={
    '2026_Roster':`MLB (${activeMlbPlayers().length}/26)`,
    'AAA_Nashville':`AAA (${activeMinorAt('AAA').length}/26)`,
    'AA_Baltimore':`AA (${activeMinorAt('AA').length}/26)`,
    'A_Houston':`A (${activeMinorAt('A').length}/26)`,
    'RK_Anaheim':`Rookie (${activeMinorAt('Rookie').length}/26)`
  };
  let h='<div class="navsection">Workbook Pages</div>'+pages.map(x=>`<button class="navbtn ${current===x?'active':''}" data-page="${x}">${labels[x]||x.replaceAll('_',' ')}</button>`).join('');
  $('#nav').innerHTML=h;
  document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>{current=b.dataset.page;render()});
}
function toolbar(){return `<div class="toolbar"><input class="search" id="search" placeholder="Search player, position, team, note..." value="${search.replaceAll('"','&quot;')}"><button class="btn primary" onclick="openAdd()">Add Player</button><button class="btn" onclick="openTrade()">Record Trade</button><button class="btn" onclick="resetData()">Reset Copy</button></div>`}
function filtered(level){let q=search.toLowerCase();return state.players.filter(p=>p.active!==false&&(level==='All Players'||p.roster===level)&&(!q||[p.name,p.positions,p.mlbTeam,p.notes,p.contractType,p.roster].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name))}
function card(p){return `<article class="card"><img class="headshot" src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette"><div><div class="name">${p.name}</div><div class="meta">${p.positions||'Position unknown'} · ${p.mlbTeam||'No MLB club'} · Age ${p.age||'?'}</div><span class="tag">${p.roster}</span><div class="salary">${money(salary(p))}</div><div class="meta">${p.contractType||'No contract type'} · Final: ${p.finalYear||'N/A'} · Options: ${p.options||'N/A'}</div>${p.notes?`<div class="meta">${p.notes}</div>`:''}</div><div class="cardactions"><button class="mini" onclick="movePlayer('${p.id}','AAA')">Move to AAA</button><button class="mini" onclick="movePlayer('${p.id}','MLB')">Promote to MLB</button><button class="mini" onclick="editPlayer('${p.id}')">Edit Contract</button><button class="mini" onclick="releasePlayer('${p.id}')">Release</button>${p.url?`<a class="mini" target="_blank" href="${p.url}">Player Page</a>`:''}</div></article>`}
function dashboard(){let active=state.players.filter(p=>p.active!==false), mlb=active.filter(p=>p.roster==='MLB'), payroll=mlb.reduce((s,p)=>s+salary(p),0);return `${toolbar()}<h2>Team Dashboard</h2><div class="kpis"><div class="kpi"><span>MLB Players</span><b>${mlb.length}</b></div><div class="kpi"><span>MLB Payroll</span><b>${money(payroll)}</b></div><div class="kpi"><span>Cap Space</span><b>${money(D.cap-payroll)}</b></div><div class="kpi"><span>All Active Players</span><b>${active.length}</b></div></div><div class="panel"><div class="panelhead"><b>Recent Transactions</b></div>${state.transactions.slice().reverse().slice(0,8).map(t=>`<div class="transaction"><b>${t.type}</b> · ${t.player||t.details}<br><small>${new Date(t.date).toLocaleString()}${t.details?' · '+t.details:''}</small></div>`).join('')||'<div class="empty">No website transactions recorded yet.</div>'}</div>`}
function rosterPage(level){let ps=filtered(level);return `${toolbar()}<div class="panelhead"><h2>${level} Roster</h2><b>${ps.length} players</b></div><div class="cards">${ps.map(card).join('')||'<div class="empty">No matching players.</div>'}</div>`}
const coverLinks={
'TapaTalk':'https://www.tapatalk.com/groups/mlb_dynasty_101_v2/',
'ESPN Team Page':'https://fantasy.espn.com/baseball/team?leagueId=34991&teamId=8',
'Roster Resource':'https://www.fangraphs.com/roster-resource/depth-charts/orioles',
'Baseball America':'https://www.baseballamerica.com/',
'Prospect1500':'https://www.prospects1500.com/',
'Discord':'https://discord.com/channels/@me',
'Google Docs':'https://docs.google.com/spreadsheets/d/1sH1jDOe4xIBM2zvGwFxE4-qvAHFRRjg9cPcL7ess2_I/edit'
};
const moneyLabels=['MLB Cap Limit:','MLB Current Cap:','MLB Balance Available:','AAA Cap Balance:','AA Cap Balance:','A Cap Balance:','Rookie Cap Balance:','MiLB Cap Limit:','MiLB Current Cap:','MiLB Balance Available:'];
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function rosterSheet(p){return {MLB:'2026_Roster',AAA:'AAA_Nashville',AA:'AA_Baltimore',A:'A_Houston',Rookie:'RK_Anaheim',RK:'RK_Anaheim'}[p.roster]||'Player Key'}
function findPlayerFromCover(){let input=$('#coverPlayerSearch'),q=(input?.value||'').trim().toLowerCase();if(!q)return;let p=state.players.find(x=>x.active!==false&&x.name.toLowerCase()===q)||state.players.find(x=>x.active!==false&&x.name.toLowerCase().includes(q));if(!p){alert('Player not found.');return}targetPlayer=p.name;current=rosterSheet(p);render()}
function coverPage(){
  const m=D.sheets.Cover||[];
  const val=(r,c)=>m[r]?.[c]??'';
  const metric=(label,value,isMoney=false)=>`<div class="cover-metric"><span>${esc(label)}</span><strong>${isMoney?money(value):esc(value)}</strong></div>`;
  const section=(title,subtitle,items,cls='')=>`<section class="cover-section ${cls}"><div class="cover-section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div><div class="cover-metrics">${items.join('')}</div></section>`;
  const links=Object.entries(coverLinks).map(([name,url])=>`<a class="cover-site-link" target="_blank" rel="noopener" href="${url}"><span>${esc(name)}</span><b>Open</b></a>`).join('');
  const search=`<section class="cover-search-card"><div><h3>Player Search</h3><p>Find a player on any roster page.</p></div><div class="cover-search-wrap"><div class="cover-search-autocomplete"><input id="coverPlayerSearch" class="cover-player-search" autocomplete="off" placeholder="Enter player name"><div id="coverPlayerSuggestions" class="cover-player-suggestions" hidden></div></div><button class="btn primary" onclick="findPlayerFromCover()">Search Player</button></div></section>`;
  return `<div class="cover-page">
    <div class="cover-title"><p>Major League Roster</p><h2>${esc(val(1,1)||'NEW JERSEY JACKELS')}</h2></div>
    <div class="cover-dashboard-grid">
      <div class="cover-main-column">
        ${section('Major League Roster','New Jersey Jackels',[
          metric('MLB Cap Limit',val(2,2),true),
          metric('MLB Current Cap',val(3,2),true),
          metric('MLB Balance Available',val(4,2),true),
          metric('MLB Roster Limit',val(6,2)),
          metric('MLB Current Roster',val(7,2)),
          metric('MLB Spots Open',val(8,2)),
          metric('Injured Players',val(9,2))
        ],'major-section')}
        ${search}
      </div>
      <div class="cover-minors-column">
        <div class="cover-minor-grid">
          ${section('AAA Roster','Minimum salary $150,000',[
            metric('AAA Cap Balance',val(2,5),true),metric('AAA Roster Limit',val(4,5)),metric('AAA Current Roster',val(5,5)),metric('AAA Spots Open',val(6,5))
          ])}
          ${section('A Roster','Minimum salary $50,000',[
            metric('A Cap Balance',val(2,8),true),metric('A Roster Limit',val(4,8)),metric('A Current Roster',val(5,8)),metric('A Spots Open',val(6,8))
          ])}
          ${section('AA Roster','Minimum salary $75,000',[
            metric('AA Cap Balance',val(9,5),true),metric('AA Roster Limit',val(11,5)),metric('AA Current Roster',val(12,5)),metric('AA Spots Open',val(13,5))
          ])}
          ${section('Rookie Roster','Minimum salary $50,000',[
            metric('Rookie Cap Balance',val(9,8),true),metric('Rookie Roster Limit',val(11,8)),metric('Rookie Current Roster',val(12,8)),metric('Rookie Spots Open',val(13,8))
          ])}
        </div>
        ${section('Minor League Total','All four minor league levels',[
          metric('MiLB Cap Limit',val(16,8),true),metric('MiLB Current Cap',val(17,8),true),metric('MiLB Balance Available',val(18,8),true),metric('MiLB Roster Limit',val(20,8)),metric('MiLB Current Roster',val(21,8)),metric('MiLB Spots Open',val(22,8))
        ],'milb-total')}
      </div>
      <aside class="cover-links-card"><div class="cover-section-head"><div><h3>Links</h3><p>League and player research sites</p></div></div><div class="cover-links-list">${links}</div></aside>
    </div>
  </div>`
}

function mlbRosterWarnings(activePlayers,rosterLimit=26){
  const warnings=[];
  if(activePlayers.length>rosterLimit)warnings.push(`${activePlayers.length-rosterLimit} player${activePlayers.length-rosterLimit===1?' is':'s are'} over the ${rosterLimit}-player limit.`);
  const missing=activePlayers.filter(p=>!p.currentPosition||!p.lineupSlot);
  if(missing.length)warnings.push(`${missing.length} MLB player${missing.length===1?' needs':'s need'} a Current Position: ${missing.map(p=>p.name).join(', ')}.`);
  const grouped=new Map();
  activePlayers.forEach(p=>{if(!p.lineupSlot)return;const a=grouped.get(p.lineupSlot)||[];a.push(p.name);grouped.set(p.lineupSlot,a)});
  const duplicates=[...grouped.entries()].filter(([,names])=>names.length>1);
  if(duplicates.length)warnings.push(`Duplicate roster slots: ${duplicates.map(([slot,names])=>`${slot} (${names.join(', ')})`).join('; ')}.`);
  return warnings;
}
function rosterWarningsHtml(warnings){
  return warnings.length?`<div class="roster-warning-box"><strong>Roster Check</strong>${warnings.map(w=>`<div>${esc(w)}</div>`).join('')}</div>`:'';
}

function mlbRosterPage(){
  const source=D.sheets['2026_Roster']||[];
  const slotByName=new Map();
  for(let i=4;i<source.length;i++){
    const slot=String(source[i]?.[0]??'').trim();
    const name=String(source[i]?.[1]??'').trim();
    if(name)slotByName.set(name.toLowerCase(),slot);
  }
  const q=search.toLowerCase();
  const allMlb=state.players.filter(p=>p.active!==false&&p.roster==='MLB');
  const activeAll=allMlb.filter(p=>!isMlbInjuredCoverage(p));
  initializeMlbLineupSlots(activeAll,slotByName);
  const visible=p=>!q||[p.name,p.positions,p.mlbTeam,p.notes,p.contractType,p.roster].join(' ').toLowerCase().includes(q);
  const active=activeAll.filter(visible), injured=allMlb.filter(p=>assignmentStatus(p)==='INJ').filter(visible), coverage=allMlb.filter(p=>assignmentStatus(p)==='CVG').filter(visible);
  const bySlot=new Map();
  for(const p of active){
    if(slotDefinition(p.lineupSlot)&&!bySlot.has(p.lineupSlot))bySlot.set(p.lineupSlot,p);
  }
  // Show every active MLB player. Players with blank, invalid, or duplicate slots
  // appear below the fixed roster instead of disappearing.
  const displayedIds=new Set([...bySlot.values()].map(p=>p.id));
  const unassigned=active.filter(p=>!displayedIds.has(p.id));
  const playerCells=p=>`<td><button class="photo-button" onclick="openPlayerDetails('${p.id}')" title="View ${esc(p.name)}"><img class="roster-photo" src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette" alt="${esc(p.name)}"></button></td><td><div class="player-cell">${p.url?`<a class="player-name-link" target="_blank" rel="noopener" href="${esc(p.url)}" title="Open Baseball Savant">${esc(p.name)}</a>`:`<span class="player-name-link">${esc(p.name)}</span>`}${highlightBadges(p)}<button class="details-link" onclick="openPlayerDetails('${p.id}')">View details</button></div></td><td><select class="position-select" aria-label="Current position for ${esc(p.name)}" onchange="changePlayerPosition('${p.id}',this.value)">${positionOptions(p,currentPosition(p))}</select></td><td>${esc(p.age)}</td><td>${esc(p.positions)}</td><td>${esc(p.mlbTeam)}</td><td>${esc(p.currentLevel||p.realLevel||'')}</td><td class="currency-cell">${money(p.mlbSalary)}</td><td>${esc(p.finalYear)}</td><td>${esc(p.options)}</td><td>${esc(p.contractType)}</td><td class="notes-cell">${esc(p.notes)}</td><td class="row-actions"><button class="mini" onclick="openPlayerDetails('${p.id}')">View</button><button class="mini" onclick="editPlayer('${p.id}')">Edit</button><button class="mini danger" onclick="releasePlayer('${p.id}')">Release</button></td>`;
  const renderSlotRow=slot=>{
    const p=bySlot.get(slot.id);
    const hit=p&&targetPlayer&&p.name.toLowerCase()===targetPlayer.toLowerCase();
    return `<tr class="${hit?'player-hit':''}${p?highlightRowClass(p):' empty-roster-slot'}"><td class="fixed-slot">${slot.label}</td>${p?playerCells(p):`<td></td><td class="empty-player-cell"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`}</tr>`;
  };
  const hitterSlots=MLB_LINEUP_SLOTS.filter(slot=>slot.kind==='hit');
  const pitcherSlots=MLB_LINEUP_SLOTS.filter(slot=>['p','sp','rp'].includes(slot.kind));
  const benchSlots=MLB_LINEUP_SLOTS.filter(slot=>slot.kind==='bench');
  const sectionRows=(title,slots)=>`<tr class="section-row"><td colspan="14">${title}</td></tr>${slots.map(renderSlotRow).join('')}`;
  const slotRows=sectionRows('Hitters',hitterSlots)+sectionRows('Pitchers',pitcherSlots)+sectionRows('Bench',benchSlots);
  const statusRows=players=>players.map(p=>`<tr class="${highlightRowClass(p)}"><td class="fixed-slot">${assignmentStatus(p)}</td>${playerCells(p)}</tr>`).join('');
  const unassignedRows=unassigned.map(p=>`<tr class="${highlightRowClass(p)}"><td class="fixed-slot">UNASSIGNED</td>${playerCells(p)}</tr>`).join('');
  const injuredRows=statusRows(injured),coverageRows=statusRows(coverage);
  const val=(r,c)=>source[r]?.[c]??'';
  // Cap includes every MLB-assigned player plus every injured/coverage player,
  // even when an injured player is temporarily attached to a minor roster.
  const capPlayers=state.players.filter(p=>p.active!==false&&(p.roster==='MLB'||isInjuredCoverage(p)));
  const capUsed=capPlayers.reduce((sum,p)=>sum+(Number(p.mlbSalary)||0),0);
  const rosterLimit=Number(val(8,22))||26;
  const activeCount=activeAll.length;
  const freeSpace=(Number(D.cap)||Number(val(6,22))||0)-capUsed;
  const side=`<aside class="roster-info-sidebar"><section class="roster-info-card"><h3>Roster Information</h3><div class="info-line"><span>Cap</span><strong>${money(capUsed)} of ${money(D.cap||val(6,22))}</strong></div><div class="info-line"><span>Free Space</span><strong>${money(freeSpace)}</strong></div><div class="info-line"><span>Players</span><strong>${activeCount} of ${rosterLimit}</strong></div></section></aside>`;
  const warnings=activeMinorAt(cfg.level).length>MINOR_ROSTER_LIMIT
    ?[`${activeMinorAt(cfg.level).length-MINOR_ROSTER_LIMIT} player${activeMinorAt(cfg.level).length-MINOR_ROSTER_LIMIT===1?' is':'s are'} over the ${MINOR_ROSTER_LIMIT}-player limit.`]
    :[];
  return `<div class="roster-web-page">${toolbar()}${rosterWarningsHtml(warnings)}<div class="roster-page-head"><div><h2>Major League Roster</h2><p>New Jersey Jackels</p></div><strong>${allMlb.length} listed players</strong></div><div class="roster-layout"><div class="roster-table-panel"><table class="roster-web-table"><thead><tr><th>Slot</th><th>Photo</th><th>Player</th><th>Position</th><th>Age</th><th>Eligible Positions</th><th>Team</th><th>Level</th><th>Contract</th><th>Final Year</th><th>Options</th><th>Contract Type</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${slotRows}${unassignedRows?`<tr class="section-row"><td colspan="14">Unassigned MLB Players (${unassigned.length})</td></tr>${unassignedRows}`:''}${injuredRows?`<tr class="section-row injury-section-row"><td colspan="14">Injured (${injured.length})</td></tr>${injuredRows}`:''}${coverageRows?`<tr class="section-row coverage-section-row"><td colspan="14">Coverage (${coverage.length})</td></tr>${coverageRows}`:''}</tbody></table></div>${side}</div></div>`;
}

function minorRosterPage(sheetName,level){
  const q=search.toLowerCase();
  let ps=state.players.filter(p=>p.active!==false&&p.roster===level&&(!q||[p.name,p.positions,p.mlbTeam,p.notes,p.contractType,p.roster].join(' ').toLowerCase().includes(q)));
  const positionOrder=['C','1B','2B','3B','SS','LF','CF','RF','DH','UTL','SP','RP'];
  ps.forEach(p=>{if(!p.currentPosition)p.currentPosition=currentPosition(p)});
  ps.sort((a,b)=>{
    const ai=positionOrder.indexOf(currentPosition(a)),bi=positionOrder.indexOf(currentPosition(b));
    return (ai<0?999:ai)-(bi<0?999:bi)||a.name.localeCompare(b.name);
  });
  const row=p=>`<tr class="${highlightRowClass(p)}"><td><select class="position-select" aria-label="Current position for ${esc(p.name)}" onchange="changePlayerPosition('${p.id}',this.value)">${positionOptions(p)}</select></td><td><button class="photo-button" onclick="openPlayerDetails('${p.id}')"><img class="roster-photo" src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette" alt="${esc(p.name)}"></button></td><td><div class="player-cell"><span class="player-name-link">${esc(p.name)}</span>${highlightBadges(p)}<button class="details-link" onclick="openPlayerDetails('${p.id}')">View details</button></div></td><td>${esc(p.age)}</td><td>${esc(p.positions)}</td><td>${esc(p.mlbTeam)}</td><td>${esc(p.currentLevel||p.realLevel||'')}</td><td class="currency-cell">${money(p.minorSalary)}</td><td>${esc(p.finalYear)}</td><td>${esc(p.options)}</td><td>${esc(p.contractType)}</td><td class="notes-cell">${esc(p.notes)}</td><td class="row-actions"><button class="mini" onclick="openPlayerDetails('${p.id}')">View</button><button class="mini" onclick="editPlayer('${p.id}')">Edit</button><button class="mini danger" onclick="releasePlayer('${p.id}')">Release</button></td></tr>`;
  const warnings=mlbRosterWarnings(activeAll,rosterLimit);
  return `<div class="roster-web-page">${toolbar()}${rosterWarningsHtml(warnings)}<div class="roster-page-head"><div><h2>${esc(level)} Roster</h2><p>Change a player’s assigned position using the first column.</p></div><strong>${ps.length} players</strong></div><div class="roster-table-panel"><table class="roster-web-table"><thead><tr><th>Current Position</th><th>Photo</th><th>Player</th><th>Age</th><th>Eligible Positions</th><th>Team</th><th>Level</th><th>Contract</th><th>Final Year</th><th>Options</th><th>Contract Type</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${ps.map(row).join('')||'<tr><td colspan="13" class="empty">No matching players.</td></tr>'}</tbody></table></div></div>`;
}

function sheetPage(name){if(name==='Cover')return coverPage();if(name==='2026_Roster')return mlbRosterPage();if(name==='AAA_Nashville')return minorRosterPage(name,'AAA');if(name==='AA_Baltimore')return minorRosterPage(name,'AA');if(name==='A_Houston')return minorRosterPage(name,'A');if(name==='RK_Anaheim')return minorRosterPage(name,'Rookie');let m=D.sheets[name]||[];let rows=m.map((r,i)=>`<tr>${r.map(v=>{let hit=targetPlayer&&String(v).trim().toLowerCase()===targetPlayer.toLowerCase();return `<${i===0?'th':'td'} class="${hit?'player-hit':''}">${esc(v)}</${i===0?'th':'td'}>`}).join('')}</tr>`).join('');return `<h2>${name.replaceAll('_',' ')}</h2><div class="panel tablewrap"><table class="sheet-table">${rows}</table></div>`}
function transactions(){return `${toolbar()}<h2>Transactions</h2><div class="panel">${state.transactions.slice().reverse().map(t=>`<div class="transaction"><b>${t.type}</b> · ${t.player||''}<br><span>${t.details||''}</span><br><small>${new Date(t.date).toLocaleString()}</small></div>`).join('')||'<div class="empty">No transactions recorded.</div>'}</div>`}
function setupCoverPlayerSearch(){
  const input=$('#coverPlayerSearch'),box=$('#coverPlayerSuggestions');
  if(!input||!box)return;
  const players=state.players.filter(p=>p.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
  const draw=()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){box.hidden=true;box.innerHTML='';return}
    const matches=players.filter(p=>p.name.toLowerCase().includes(q)).slice(0,8);
    box.innerHTML=matches.map(p=>`<button type="button" class="cover-player-suggestion" data-name="${esc(p.name)}"><span>${esc(p.name)}</span><small>${esc(p.roster||'Player Key')}</small></button>`).join('');
    box.hidden=!matches.length;
    box.querySelectorAll('.cover-player-suggestion').forEach(btn=>btn.onclick=()=>{input.value=btn.dataset.name||'';box.hidden=true;findPlayerFromCover()});
  };
  input.oninput=draw;
  input.onfocus=draw;
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();box.hidden=true;findPlayerFromCover()}else if(e.key==='Escape')box.hidden=true};
  input.onblur=()=>setTimeout(()=>{box.hidden=true},150);
}
function render(){if(current==='Partial Contract Coverage')current='Cover';nav();let out=sheetPage(current);$('#main').innerHTML=out;window.silhouette=silhouette;let s=$('#search');if(s)s.oninput=e=>{search=e.target.value;render()};setupCoverPlayerSearch();if(targetPlayer){let hit=document.querySelector('.player-hit');if(hit){setTimeout(()=>hit.scrollIntoView({behavior:'smooth',block:'center'}),50)}targetPlayer=''}}
function log(type,p,details=''){state.transactions.push({type,player:p?.name||'',details,date:new Date().toISOString()});save()}
window.movePlayer=(id,level)=>{let p=state.players.find(x=>x.id===id);if(!p)return;const old=setRosterAssignment(p,level);log(level==='MLB'?'Promoted':'Roster Assignment Changed',p,`${old} to ${assignmentLabel(p)}`);save();render()}
window.releasePlayer=id=>{let p=state.players.find(x=>x.id===id);if(p&&confirm(`Release ${p.name}?`)){p.active=false;log('Released',p,`Released from ${p.roster}`);save();render()}}

function canonicalExactPlayerName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-zA-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}
function exactPlayerFromTradeAsset(asset){
  const first=tradeText(asset).split(',')[0].trim().replace(/^[-•\s]+/,'');
  if(!first)return null;
  const key=canonicalExactPlayerName(first);
  return state.players.find(p=>canonicalExactPlayerName(p.name)===key)||null;
}
function exactTradesForPlayer(player){
  const key=canonicalExactPlayerName(player?.name);
  if(!key)return [];
  return (state.tradeHistory||[]).filter(t=>(t.teams||[]).some(side=>tradeLines(side.sends).some(item=>{
    const p=exactPlayerFromTradeAsset(item);return p&&canonicalExactPlayerName(p.name)===key;
  }))).sort((a,b)=>tradeText(b.date).localeCompare(tradeText(a.date)));
}
function playerTradeHistoryHtml(player){
  const trades=exactTradesForPlayer(player);
  if(!trades.length)return '<p class="trade-none">No confirmed exact-match trades found.</p>';
  return trades.map(t=>{
    const date=formatTradeDate(t.date);
    const dateHtml=t.url?`<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${date}</a>`:`<strong>${date}</strong>`;
    const sides=(t.teams||[]).map(side=>`<div><strong>${esc(side.team)}</strong>: ${tradeLines(side.sends).map(esc).join('; ')}</div>`).join('');
    return `<article class="profile-trade"><div class="profile-trade-head">${dateHtml}<span>${(t.teams||[]).map(side=>esc(side.team)).join(' ↔ ')}</span></div>${sides}</article>`;
  }).join('');
}
function linkedExactTradeAsset(item){
  const p=exactPlayerFromTradeAsset(item);
  if(!p)return esc(item);
  const raw=tradeText(item),first=raw.split(',')[0].trim().replace(/^[-•\s]+/,'');
  const safe=esc(raw),safeFirst=esc(first);
  const button=`<button class="trade-player-link" onclick="openPlayerDetails('${esc(p.id)}')">${safeFirst}</button>`;
  const idx=safe.indexOf(safeFirst);
  return idx>=0?safe.slice(0,idx)+button+safe.slice(idx+safeFirst.length):safe;
}
window.openPlayerDetails=id=>{
  const p=state.players.find(x=>x.id===id);if(!p)return;
  const d=$('#playerDetails');
  $('#detailPhoto').src=photo(p);$('#detailPhoto').onerror=function(){this.onerror=null;this.src=window.silhouette};
  $('#detailName').textContent=p.name||'Player';
  $('#detailSubtitle').textContent=[p.positions,p.mlbTeam,p.age?`Age ${p.age}`:''].filter(Boolean).join(' · ');
  $('#detailRoster').textContent=assignmentLabel(p);
  $('#detailSalary').textContent=money(salary(p));
  $('#detailFinalYear').textContent=p.finalYear||'N/A';
  $('#detailOptions').textContent=p.options||'N/A';
  $('#detailContractType').textContent=p.contractType||'N/A';
  $('#detailLevel').textContent=p.currentLevel||p.realLevel||'N/A';
  $('#detailNotes').textContent=p.notes||'No notes entered.';
  const tradeHistory=$('#detailTradeHistory');if(tradeHistory)tradeHistory.innerHTML=playerTradeHistoryHtml(p);
  const highlights=playerHighlights(p);
  $('#detailHighlightInjured').checked=highlights.includes('injured');
  $('#detailHighlightMlbLevel').checked=highlights.includes('mlb-level');
  $('#detailHighlightTop100').checked=highlights.includes('top-100');
  $('#detailHighlightTeamTop10').checked=highlights.includes('team-top-10');
  $('#detailHighlight40Man').checked=highlights.includes('40-man');
  $('#detailSaveHighlights').onclick=()=>{
    const values=[];
    if($('#detailHighlightInjured').checked)values.push('injured');
    if($('#detailHighlightMlbLevel').checked)values.push('mlb-level');
    if($('#detailHighlightTop100').checked)values.push('top-100');
    if($('#detailHighlightTeamTop10').checked)values.push('team-top-10');
    if($('#detailHighlight40Man').checked)values.push('40-man');
    setPlayerHighlights(p,values);log('Highlights Updated',p,values.length?values.join(', '):'Cleared');save();d.close();render();
  };
  const link=$('#detailSavant');
  if(p.url){link.href=p.url;link.hidden=false}else{link.hidden=true;link.removeAttribute('href')}
  $('#detailEdit').onclick=()=>{d.close();editPlayer(id)};
  const levelSelect=$('#detailMoveLevel');
  levelSelect.value=assignmentValue(p);
  $('#detailMove').onclick=()=>{const level=levelSelect.value;d.close();movePlayer(id,level)};
  const assigned=p.active!==false&&p.roster&&p.roster!=='Unassigned';$('#detailRelease').hidden=!assigned;$('#detailRelease').onclick=()=>{d.close();releasePlayer(id)};
  d.showModal();
}
window.editPlayer=id=>{let p=state.players.find(x=>x.id===id);openPlayerDialog(p)}
window.openAdd=()=>openPlayerDialog(null)
function refreshPositionSelect(f,p){
  const select=f.elements.currentPosition;if(!select)return;
  const selected=select.value||p?.currentPosition||'';
  const temp={positions:f.elements.positions?.value||p?.positions||'',currentPosition:selected};
  select.innerHTML=positionOptions(temp,selected);
  select.disabled=!String(temp.positions||'').trim();
}
function openPlayerDialog(p){let d=$('#playerDialog'),f=$('#playerForm');f.reset();f.dataset.id=p?.id||'';for(let k of ['name','age','positions','mlbTeam','roster','mlbSalary','minorSalary','finalYear','options','contractType','notes','mlbId','url'])if(f.elements[k])f.elements[k].value=p?.[k]??'';refreshPositionSelect(f,p);
  const posHelp=$('#currentPositionHelp');if(posHelp){const count=baseballOnlyPositions(p||{positions:f.elements.positions?.value||''}).length;posHelp.textContent=count>1?'Multiple eligible positions. Choose the exact MLB position or Bench.':'Choose the current MLB position. Single-position players may be assigned automatically when promoted.';}if(f.elements.positions)f.elements.positions.oninput=()=>refreshPositionSelect(f,{...p,currentPosition:f.elements.currentPosition?.value||p?.currentPosition});$('#playerTitle').textContent=p?'Edit Player':'Add Player';d.showModal()}
$('#playerForm').onsubmit=e=>{e.preventDefault();let f=e.target,fd=Object.fromEntries(new FormData(f));let p=state.players.find(x=>x.id===f.dataset.id);if(!p){p={id:fd.mlbId||('custom-'+Date.now()),active:true,status:'',realLevel:'',fortyMan:'',rank:'',source:''};state.players.push(p)}Object.assign(p,fd,{mlbSalary:parseSalary(fd.mlbSalary),minorSalary:parseSalary(fd.minorSalary)});log(f.dataset.id?'Contract Edited':'Added',p);save();$('#playerDialog').close();render()}
window.openTrade=()=>{$('#tradeForm').reset();$('#tradeDialog').showModal()}
$('#tradeForm').onsubmit=e=>{e.preventDefault();let fd=Object.fromEntries(new FormData(e.target));state.transactions.push({type:'Trade',player:fd.player,details:`${fd.direction}: ${fd.details}`,date:new Date().toISOString()});save();$('#tradeDialog').close();render()}
window.resetData=()=>{if(confirm('Reset all website changes and reload the workbook copy?')){localStorage.removeItem(KEY);state={players:structuredClone(D.players),transactions:[]};render()}}
render();

/* Player Key master database enhancements */
photo = function(p){
  if(p.photoUrl) return p.photoUrl;
  return p.mlbId?`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${p.mlbId}/headshot/67/current`:silhouette;
};

function databasePage(){
  const q=search.trim().toLowerCase();
  const players=state.players.filter(p=>!q||[p.name,p.positions,p.mlbTeam,p.mlbId,p.url,p.roster,p.databaseNotes].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
  const assigned=state.players.filter(p=>p.active!==false&&p.roster&&p.roster!=='Unassigned').length;
  const rows=players.map(p=>{
    const isAssigned=p.active!==false&&p.roster&&p.roster!=='Unassigned';
    const name=p.url?`<a target="_blank" rel="noopener" href="${esc(p.url)}">${esc(p.name)}</a>`:`<span>${esc(p.name)}</span>`;
    return `<tr>
      <td><button class="photo-button database-photo-edit" onclick="openPlayerDetails('${p.id}')" title="View ${esc(p.name)}"><img class="roster-photo" src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette" alt="${esc(p.name)}"></button></td>
      <td><div class="database-player">${name}${highlightBadges(p)}<small>${esc(p.positions||'Position not entered')} · ${esc(p.mlbTeam||'No MLB club')}</small></div></td>
      <td>${esc(p.age||'')}</td><td>${esc(p.mlbId||'')}</td><td>${esc(p.bats||'')}</td><td>${esc(p.throws||'')}</td>
      <td><span class="database-status ${isAssigned?'assigned':''}">${isAssigned?esc(assignmentLabel(p)):'Unassigned'}</span></td>
      <td>${p.photoUrl?'Custom photo':p.mlbId?'MLB headshot':'Silhouette'}</td>
      <td class="database-actions"><button class="btn small" onclick="openPlayerDetails('${p.id}')">View</button><button class="btn small" onclick="editDatabasePlayer('${p.id}')">Edit</button>${!isAssigned?`<button class="btn small primary" onclick="addDatabasePlayerToRoster('${p.id}')">Add to Roster</button>`:''}<button class="btn small danger" onclick="deleteDatabasePlayer('${p.id}')">Delete</button></td>
    </tr>`;
  }).join('');
  return `<div class="database-page"><div class="toolbar"><input class="search" id="search" placeholder="Search Player Key..." value="${esc(search)}"><button class="btn primary" onclick="newDatabasePlayer()">Add to Player Key</button><button class="btn" onclick="resetData()">Reset Copy</button></div><div class="database-head"><div><h2>Player Key</h2><p>Your master player database. Roster additions can only come from this list.</p></div><div class="database-summary">${players.length} shown · ${assigned} assigned</div></div><div class="database-table-wrap"><table class="database-table"><thead><tr><th>Photo</th><th>Player</th><th>Age</th><th>MLB ID</th><th>Bats</th><th>Throws</th><th>Roster Status</th><th>Photo Source</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="9" class="empty">No players found.</td></tr>'}</tbody></table></div></div>`;
}

const sheetPageBeforeDatabase=sheetPage;
sheetPage=function(name){if(name==='Player Key')return databasePage();return sheetPageBeforeDatabase(name)};

function populateDatabaseForm(p){
  const f=$('#playerForm');f.reset();f.dataset.id=p?.id||'';
  for(const k of ['name','age','positions','mlbTeam','mlbId','url','photoUrl','bats','throws','databaseNotes','roster','mlbSalary','minorSalary','finalYear','options','contractType','notes']){
    if(f.elements[k])f.elements[k].value=(k==='roster'?assignmentValue(p||{}):(p?.[k]??''));
  }
  const h=playerHighlights(p||{});
  if(f.elements.highlightInjured)f.elements.highlightInjured.checked=h.includes('injured');
  if(f.elements.highlightMlbLevel)f.elements.highlightMlbLevel.checked=h.includes('mlb-level');
  if(f.elements.highlightTop100)f.elements.highlightTop100.checked=h.includes('top-100');
  if(f.elements.highlightTeamTop10)f.elements.highlightTeamTop10.checked=h.includes('team-top-10');
  if(f.elements.highlight40Man)f.elements.highlight40Man.checked=h.includes('40-man');
  refreshPositionSelect(f,p);
  if(f.elements.positions)f.elements.positions.oninput=()=>refreshPositionSelect(f,{...p,currentPosition:f.elements.currentPosition?.value||''});
}
window.quickRosterAssignment=value=>{
  const f=$('#playerForm');if(!f)return;
  f.elements.roster.value=value;
  const note=$('#quickRosterNote');
  if(note)note.textContent=value==='MLB'?'MLB selected. Choose Current Position for multi-position players.':`${value} selected.`;
};
window.editDatabasePlayer=id=>{const p=state.players.find(x=>x.id===id);if(!p)return;populateDatabaseForm(p);$('#playerTitle').textContent='Edit Player Key';$('#playerDialog').showModal()};
window.editPlayer=window.editDatabasePlayer;
window.newDatabasePlayer=()=>{populateDatabaseForm(null);$('#playerTitle').textContent='Add to Player Key';$('#playerDialog').showModal()};

function assignMlbPositionFromPlayerKey(p,position){
  position=String(position||'').trim().toUpperCase();
  if(!position||p.roster!=='MLB'||isInjuredCoverage(p))return true;
  const allowed=eligiblePositions(p);
  if(!allowed.includes(position))return false;
  const players=state.players.filter(x=>x.active!==false&&x.roster==='MLB'&&!isInjuredCoverage(x));
  initializeMlbLineupSlots(players);
  p.currentPosition=position;
  let target='';
  if(['C','1B','2B','SS','3B','LF','CF','RF','UTL'].includes(position))target=position;
  else if(position==='P')target='P';
  else if(position==='SP')target=firstOpenSlot('sp',players,p.id)||'';
  else if(position==='RP')target=firstOpenSlot('rp',players,p.id)||'';
  else if(position==='BENCH')target=firstOpenSlot('bench',players,p.id)||'';
  if(!target){alert(`There is no open ${position} roster spot.`);return false}
  movePlayerToLineupSlot(p,target,players);
  return true;
}

$('#playerForm').onsubmit=e=>{
  e.preventDefault();
  const f=e.target,fd=Object.fromEntries(new FormData(f));
  let p=state.players.find(x=>x.id===f.dataset.id);
  const creating=!p;
  if(creating){
    const duplicate=state.players.find(x=>x.name.trim().toLowerCase()===fd.name.trim().toLowerCase());
    if(duplicate){alert('That player is already in the Player Key.');return}
    p={id:fd.mlbId||('custom-'+Date.now()),active:false,status:'',realLevel:'',fortyMan:'',rank:'',source:'Player Key'};
    state.players.push(p);
  }
  const oldId=p.id;
  const rosterChoice=fd.roster||assignmentValue(p);
  const selectedPosition=String(fd.currentPosition||'').trim().toUpperCase();
  delete fd.roster;
  delete fd.currentPosition;
  const mlbSalary=parseSalary(fd.mlbSalary),minorSalary=parseSalary(fd.minorSalary);
  if(Number.isNaN(mlbSalary)||Number.isNaN(minorSalary)){alert('Enter a valid salary, such as 3250000 or $3,250,000.');return}
  Object.assign(p,fd,{mlbSalary,minorSalary});
  setRosterAssignment(p,rosterChoice);
  if(selectedPosition&&!assignMlbPositionFromPlayerKey(p,selectedPosition))return;
  const chosenHighlights=[fd.highlightInjured?'injured':'',fd.highlightMlbLevel?'mlb-level':'',fd.highlightTop100?'top-100':'',fd.highlightTeamTop10?'team-top-10':'',fd.highlight40Man?'40-man':''].filter(Boolean);
  if(assignmentStatus(p)==='INJ'&&!chosenHighlights.includes('injured'))chosenHighlights.push('injured');
  setPlayerHighlights(p,chosenHighlights);
  delete p.highlightInjured;delete p.highlightMlbLevel;delete p.highlightTop100;delete p.highlightTeamTop10;delete p.highlight40Man;
  if(creating&&fd.mlbId&&!state.players.some(x=>x!==p&&x.id===fd.mlbId))p.id=fd.mlbId;
  if(!p.roster)p.roster='Unassigned';
  log(creating?'Player Key Added':'Player Key Updated',p,creating?'Added to master database':'Player information updated');
  save();$('#playerDialog').close();render();
};

function eligibleDatabasePlayers(){return state.players.filter(p=>p.active===false||!p.roster||p.roster==='Unassigned').sort((a,b)=>a.name.localeCompare(b.name))}
function normalizedName(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function editDistance(a,b){a=normalizedName(a);b=normalizedName(b);const m=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)m[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length]}
function playerSearchScore(p,q){const name=normalizedName(p.name),query=normalizedName(q);if(!query)return 999;if(name===query)return 0;if(name.startsWith(query))return 1;if(name.split(' ').some(x=>x.startsWith(query)))return 2;if(name.includes(query))return 3;const words=name.split(' '),qw=query.split(' ');const close=qw.every(term=>words.some(w=>editDistance(w,term)<=Math.max(1,Math.floor(term.length/4))));return close?4:999}
function rosterPlayerMatches(q){return state.players.map(p=>({p,score:playerSearchScore(p,q)})).filter(x=>x.score<999).sort((a,b)=>a.score-b.score||a.p.name.localeCompare(b.p.name)).slice(0,10).map(x=>x.p)}
function populateRosterFormFromDatabase(p){
  const f=$('#rosterAddForm'),preview=$('#rosterPlayerPreview'),help=$('#rosterPlayerHelp');
  if(!f||!p)return;
  f.elements.selectedPlayerId.value=p.id;
  f.elements.playerName.value=p.name||'';
  f.elements.roster.value=(p.roster&&p.roster!=='Unassigned')?p.roster:'MLB';
  f.elements.mlbSalary.value=p.mlbSalary||'';
  f.elements.minorSalary.value=p.minorSalary||'';
  f.elements.finalYear.value=p.finalYear||'';
  f.elements.options.value=p.options||'';
  f.elements.contractType.value=p.contractType||'';
  f.elements.notes.value=p.notes||'';
  const assigned=p.active!==false&&p.roster&&p.roster!=='Unassigned';
  help.textContent=assigned?`${p.name} is currently assigned to ${assignmentLabel(p)}. You can move him from Player Key View Details.`:`${p.name} loaded from Player Key.`;
  if(preview){
    preview.innerHTML=`<img src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette"><div><strong>${esc(p.name)}</strong><span>${esc(p.positions||'Position unknown')} · ${esc(p.mlbTeam||'No MLB club')} · MLB ID ${esc(p.mlbId||p.id||'Not entered')}</span></div><em>${assigned?esc(assignmentLabel(p)):'Available'}</em>`;
    preview.hidden=false;
  }
}
function clearRosterSelection(){
  const f=$('#rosterAddForm'),preview=$('#rosterPlayerPreview');
  if(f)f.elements.selectedPlayerId.value='';
  if(preview){preview.hidden=true;preview.innerHTML='';}
}
function wireRosterAutocomplete(){
  const input=$('#rosterPlayerSearch'),box=$('#rosterPlayerSuggestions'),help=$('#rosterPlayerHelp');if(!input||!box)return;
  const draw=()=>{const q=input.value.trim();if(!q){box.hidden=true;box.innerHTML='';help.textContent='Start typing. Matching Player Key names will appear below.';return}const matches=rosterPlayerMatches(q);box.innerHTML=matches.map(p=>{const assigned=p.active!==false&&p.roster&&p.roster!=='Unassigned';return `<button type="button" class="player-suggestion" data-id="${esc(p.id)}"><img src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette"><span><strong>${esc(p.name)}</strong><small>${esc(p.positions||'Position unknown')} · ${esc(p.mlbTeam||'No MLB club')}</small></span><em class="${assigned?'assigned':''}">${assigned?esc(assignmentLabel(p)):'Available'}</em></button>`}).join('')||'<div class="player-suggestion-empty">No close matches in Player Key.</div>';box.hidden=false;box.querySelectorAll('.player-suggestion').forEach(btn=>btn.onclick=()=>{const p=state.players.find(x=>x.id===btn.dataset.id);if(!p)return;populateRosterFormFromDatabase(p);box.hidden=true;});};
  input.oninput=()=>{clearRosterSelection();draw();};input.onfocus=draw;input.onkeydown=e=>{if(e.key==='Escape')box.hidden=true};
}
function openRosterAddFor(p){
  const d=$('#rosterAddDialog'),f=$('#rosterAddForm'),preview=$('#rosterPlayerPreview');f.reset();
  if(preview){preview.hidden=true;preview.innerHTML='';}
  if(p)populateRosterFormFromDatabase(p);
  d.showModal();wireRosterAutocomplete();
}
window.openAdd=()=>openRosterAddFor(null);
window.addDatabasePlayerToRoster=id=>{const p=state.players.find(x=>x.id===id);if(p)openRosterAddFor(p)};
$('#rosterAddForm').onsubmit=e=>{
  e.preventDefault();const f=e.target,fd=Object.fromEntries(new FormData(f));
  const p=state.players.find(x=>x.id===fd.selectedPlayerId);
  if(!p){alert('Choose a player from the Player Key results before adding him.');return}
  if(p.active!==false&&p.roster&&p.roster!=='Unassigned'){alert(`${p.name} is already assigned to ${p.roster}.`);return}
  const mlbSalary=parseSalary(fd.mlbSalary),minorSalary=parseSalary(fd.minorSalary);if(Number.isNaN(mlbSalary)||Number.isNaN(minorSalary)){alert('Enter a valid salary, such as 3250000 or $3,250,000.');return}setRosterAssignment(p,fd.roster);p.mlbSalary=mlbSalary;p.minorSalary=minorSalary;p.finalYear=fd.finalYear;p.options=fd.options;p.contractType=fd.contractType;p.notes=fd.notes;
  log('Added to Roster',p,`Added from Player Key to ${assignmentLabel(p)}`);save();$('#rosterAddDialog').close();render();
};

window.deleteDatabasePlayer=id=>{
  const p=state.players.find(x=>x.id===id);if(!p)return;
  if(p.active!==false&&p.roster&&p.roster!=='Unassigned'){alert(`Move or release ${p.name} before deleting him from the Player Key.`);return}
  if(confirm(`Delete ${p.name} from the Player Key? This cannot be undone unless you reset the copy.`)){
    state.players=state.players.filter(x=>x.id!==id);log('Player Key Deleted',p,'Removed from master database');save();render();
  }
};

// A release removes the roster assignment but keeps the player available in the Player Key.
window.releasePlayer=id=>{let p=state.players.find(x=>x.id===id);if(p&&confirm(`Release ${p.name}? He will remain in the Player Key.`)){const old=p.roster;p.active=false;p.roster='Unassigned';p.rosterStatus='ACTIVE';p.status='';p.returnRoster='';log('Released',p,`Released from ${old}; retained in Player Key`);save();render()}};

render();

/* Interactive minor league roster pages and live cover summaries */
const MINOR_PAGE_CONFIG={
  AAA_Nashville:{level:'AAA',title:'AAA Roster',team:'Nashville',sheet:'AAA_Nashville'},
  AA_Baltimore:{level:'AA',title:'AA Roster',team:'Baltimore',sheet:'AA_Baltimore'},
  A_Houston:{level:'A',title:'A Roster',team:'Houston',sheet:'A_Houston'},
  RK_Anaheim:{level:'Rookie',title:'Rookie Roster',team:'Anaheim',sheet:'RK_Anaheim'}
};
const MINOR_LEVELS=['AAA','AA','A','Rookie'];
const MINOR_ROSTER_LIMIT=26;
const MILB_CAP_LIMIT=22100000;

function workbookMinorGroups(sheetName){
  const rows=D.sheets[sheetName]||[], result=new Map();
  let group='Infielders';
  for(const row of rows){
    const first=String(row?.[0]??'').trim();
    const upper=first.toUpperCase().replace(/\s+/g,' ');
    if(upper.includes('I N F I E L D')){group='Infielders';continue}
    if(upper.includes('O U T F I E L D')){group='Outfielders';continue}
    if(upper==='STARTING PITCHERS'){group='Starting Pitchers';continue}
    if(upper==='RELIEF PITCHERS'){group='Relief Pitchers';continue}
    if(!first||upper==='PLAYER'||!state.players.some(p=>p.name.toLowerCase()===first.toLowerCase()))continue;
    result.set(first.toLowerCase(),group);
  }
  return result;
}
function inferMinorGroup(p,sheetName){
  if(['Infielders','Outfielders','Starting Pitchers','Relief Pitchers'].includes(p.minorGroup))return p.minorGroup;
  const workbookGroup=workbookMinorGroups(sheetName).get(String(p.name||'').toLowerCase());
  if(workbookGroup)return workbookGroup;
  const pos=String(p.positions||'').toUpperCase();
  if(/(^|\/)SP(\s|\/|$)/.test(pos)||pos.includes('SP '))return 'Starting Pitchers';
  if(/(^|\/)RP(\s|\/|$)/.test(pos)||pos.includes('RP '))return 'Relief Pitchers';
  if(/(^|\/)(LF|CF|RF|OF)(\/|$)/.test(pos))return 'Outfielders';
  return 'Infielders';
}
function initializeMinorRosters(){
  if(state.minorRostersInitialized)return;
  const released=new Set((state.transactions||[]).filter(t=>t.type==='Released').map(t=>String(t.player||'').toLowerCase()));
  for(const cfg of Object.values(MINOR_PAGE_CONFIG)){
    const groups=workbookMinorGroups(cfg.sheet);
    for(const name of groups.keys()){
      const p=state.players.find(x=>String(x.name||'').toLowerCase()===name);
      if(!p||released.has(name))continue;
      if((!p.roster||p.roster==='Unassigned')&&p.active!==false){p.roster=cfg.level;p.active=true;}
      else if((!p.roster||p.roster==='Unassigned')&&p.active===false){p.roster=cfg.level;p.active=true;}
    }
  }
  state.minorRostersInitialized=true;save();
}
function activeAt(level){return state.players.filter(p=>p.active!==false&&p.roster===level)}
function mlbSlotMap(){
  const source=D.sheets['2026_Roster']||[], map=new Map();
  for(let i=4;i<source.length;i++){
    const slot=String(source[i]?.[0]??'').trim().toUpperCase();
    const name=String(source[i]?.[1]??'').trim().toLowerCase();
    if(name)map.set(name,slot);
  }
  return map;
}
function isMlbInjuredCoverage(p){
  // Once a player has an explicit saved roster status, that saved status is
  // the source of truth. Do not let the original workbook's old INJ/CVG row
  // override a later move made from the Player Key.
  if(Object.prototype.hasOwnProperty.call(p,'rosterStatus'))return isInjuredCoverage(p);
  if(isInjuredCoverage(p))return true;
  const slot=mlbSlotMap().get(String(p.name||'').toLowerCase())||'';
  return ['INJ','CVG'].includes(slot)||/\b(?:INJ|IL|COVERAGE|CVG)\b/i.test(String(p.notes||''));
}
function activeMlbPlayers(){return activeAt('MLB').filter(p=>!isMlbInjuredCoverage(p))}
function injuredCoverageMlbPlayers(){return activeAt('MLB').filter(isMlbInjuredCoverage)}
function activeMinorAt(level){return activeAt(level).filter(p=>!isInjuredCoverage(p))}
function minorSalaryTotal(level){return activeAt(level).reduce((sum,p)=>sum+(Number(p.minorSalary)||0),0)}
function minorCounts(level,sheetName){
  const counts={'Infielders':0,'Outfielders':0,'Starting Pitchers':0,'Relief Pitchers':0};
  for(const p of activeMinorAt(level))counts[inferMinorGroup(p,sheetName)]++;
  return counts;
}
function minorRosterRow(p,group){
  const hit=targetPlayer&&p.name.toLowerCase()===targetPlayer.toLowerCase();
  const groups=['Infielders','Outfielders','Starting Pitchers','Relief Pitchers'];
  const groupControl=isInjuredCoverage(p)?esc(group):`<select class="position-select minor-group-select" aria-label="Minor league group for ${esc(p.name)}" onchange="changeMinorGroup('${p.id}',this.value)">${groups.map(g=>`<option value="${g}"${g===group?' selected':''}>${g.replace(' Pitchers','')}</option>`).join('')}</select>`;
  return `<tr class="${hit?'player-hit':''}${highlightRowClass(p)}"><td>${groupControl}</td><td><button class="photo-button" onclick="openPlayerDetails('${p.id}')" title="View ${esc(p.name)}"><img class="roster-photo" src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette" alt="${esc(p.name)}"></button></td><td><div class="player-cell">${p.url?`<a class="player-name-link" target="_blank" rel="noopener" href="${esc(p.url)}" title="Open Baseball Savant">${esc(p.name)}</a>`:`<span class="player-name-link">${esc(p.name)}</span>`}${highlightBadges(p)}<button class="details-link" onclick="openPlayerDetails('${p.id}')">View details</button></div></td><td>${esc(p.age)}</td><td>${esc(p.positions)}</td><td>${esc(p.mlbTeam)}</td><td>${esc(p.currentLevel||p.realLevel||'')}</td><td class="currency-cell">${money(p.minorSalary)}</td><td>${esc(p.finalYear)}</td><td>${esc(p.options)}</td><td>${esc(p.contractType)}</td><td class="notes-cell">${esc(p.notes)}</td><td class="row-actions"><button class="mini" onclick="openPlayerDetails('${p.id}')">View</button><button class="mini" onclick="editPlayer('${p.id}')">Edit</button><button class="mini danger" onclick="releasePlayer('${p.id}')">Release</button></td></tr>`;
}
window.changeMinorGroup=(id,value)=>{
  const p=state.players.find(x=>x.id===id);
  const allowed=['Infielders','Outfielders','Starting Pitchers','Relief Pitchers'];
  if(!p||!allowed.includes(value))return;
  const old=p.minorGroup||'Workbook/default';p.minorGroup=value;
  log('Minor League Group Changed',p,`${old} to ${value}`);save();render();
};
function minorRosterPage(pageName){
  const cfg=MINOR_PAGE_CONFIG[pageName],q=search.toLowerCase();
  const assigned=activeAt(cfg.level).filter(p=>!q||[p.name,p.positions,p.mlbTeam,p.notes,p.contractType,p.currentLevel,p.realLevel,assignmentLabel(p)].join(' ').toLowerCase().includes(q));
  const all=assigned.filter(p=>!isInjuredCoverage(p));
  const injured=assigned.filter(p=>assignmentStatus(p)==='INJ').sort((a,b)=>a.name.localeCompare(b.name));
  const coverage=assigned.filter(p=>assignmentStatus(p)==='CVG').sort((a,b)=>a.name.localeCompare(b.name));
  const inactive=[...injured,...coverage];
  const groups=['Infielders','Outfielders','Starting Pitchers','Relief Pitchers'];
  const grouped=Object.fromEntries(groups.map(g=>[g,all.filter(p=>inferMinorGroup(p,cfg.sheet)===g).sort((a,b)=>a.name.localeCompare(b.name))]));
  const counts=minorCounts(cfg.level,cfg.sheet),salaryTotal=minorSalaryTotal(cfg.level),spots=Math.max(0,MINOR_ROSTER_LIMIT-activeMinorAt(cfg.level).length);
  const activeSections=groups.map(g=>grouped[g].length?`<tr class="section-row"><td colspan="13">${g} (${grouped[g].length})</td></tr>${grouped[g].map(p=>minorRosterRow(p,g)).join('')}`:'').join('');
  const injuredSection=injured.length?`<tr class="section-row injury-section-row"><td colspan="13">Injured (${injured.length})</td></tr>${injured.map(p=>minorRosterRow(p,'INJ')).join('')}`:'';
  const coverageSection=coverage.length?`<tr class="section-row coverage-section-row"><td colspan="13">Coverage (${coverage.length})</td></tr>${coverage.map(p=>minorRosterRow(p,'CVG')).join('')}`:'';
  const body=activeSections+injuredSection+coverageSection;
  const side=`<aside class="roster-info-sidebar"><section class="roster-info-card"><h3>Roster Information</h3><div class="info-line"><span>Salary Total</span><strong>${money(salaryTotal)}</strong></div><div class="info-line"><span>Active Players</span><strong>${activeMinorAt(cfg.level).length} of ${MINOR_ROSTER_LIMIT}</strong></div><div class="info-line"><span>Injured</span><strong>${injured.length}</strong></div><div class="info-line"><span>Coverage</span><strong>${coverage.length}</strong></div><div class="info-line"><span>Spots Open</span><strong>${spots}</strong></div></section><section class="roster-info-card"><h3>Position Breakdown</h3>${groups.map(g=>`<div class="info-line"><span>${g}</span><strong>${counts[g]}</strong></div>`).join('')}</section></aside>`;
  const warnings=mlbRosterWarnings(activeAll,rosterLimit);
  return `<div class="roster-web-page">${toolbar()}${rosterWarningsHtml(warnings)}<div class="roster-page-head"><div><h2>${cfg.title}</h2><p>${cfg.team}. Use the Group dropdown to move a player between position sections.</p></div><strong>${activeMinorAt(cfg.level).length} active · ${injured.length} INJ · ${coverage.length} CVG</strong></div><div class="roster-layout"><div class="roster-table-panel"><table class="roster-web-table"><thead><tr><th>Group</th><th>Photo</th><th>Player</th><th>Age</th><th>Position</th><th>Team</th><th>MLB Level</th><th>Contract</th><th>Final Year</th><th>Options</th><th>Contract Type</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${body||'<tr><td colspan="13" class="empty">No players on this roster.</td></tr>'}</tbody></table></div>${side}</div></div>`;
}

function topRankedProspectsPage(){
  const q=search.toLowerCase();
  const rosterOrder={MLB:0,AAA:1,AA:2,A:3,Rookie:4};
  const prospects=state.players
    .filter(p=>p.active!==false&&['MLB','AAA','AA','A','Rookie'].includes(p.roster)&&playerHighlights(p).includes('top-100'))
    .filter(p=>!q||[p.name,p.positions,p.mlbTeam,p.notes,p.contractType,p.roster,p.currentLevel,p.realLevel,assignmentLabel(p)].join(' ').toLowerCase().includes(q))
    .sort((a,b)=>(rosterOrder[a.roster]??99)-(rosterOrder[b.roster]??99)||a.name.localeCompare(b.name));
  const row=p=>`<tr class="${highlightRowClass(p)}"><td>${esc(assignmentLabel(p))}</td><td><button class="photo-button" onclick="openPlayerDetails('${p.id}')" title="View ${esc(p.name)}"><img class="roster-photo" src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette" alt="${esc(p.name)}"></button></td><td><div class="player-cell">${p.url?`<a class="player-name-link" target="_blank" rel="noopener" href="${esc(p.url)}" title="Open Baseball Savant">${esc(p.name)}</a>`:`<span class="player-name-link">${esc(p.name)}</span>`}${highlightBadges(p)}<button class="details-link" onclick="openPlayerDetails('${p.id}')">View details</button></div></td><td>${esc(p.age)}</td><td>${esc(p.positions)}</td><td>${esc(p.mlbTeam)}</td><td>${esc(p.currentLevel||p.realLevel||p.roster||'')}</td><td class="currency-cell">${money(salary(p))}</td><td>${esc(p.finalYear)}</td><td>${esc(p.options)}</td><td>${esc(p.contractType)}</td><td class="notes-cell">${esc(p.notes)}</td><td class="row-actions"><button class="mini" onclick="openPlayerDetails('${p.id}')">View</button><button class="mini" onclick="editPlayer('${p.id}')">Edit</button></td></tr>`;
  const warnings=mlbRosterWarnings(activeAll,rosterLimit);
  return `<div class="roster-web-page">${toolbar()}${rosterWarningsHtml(warnings)}<div class="roster-page-head"><div><h2>Top Ranked Prospects</h2><p>Players marked Top 100 across all five roster pages.</p></div><strong>${prospects.length} prospects</strong></div><div class="roster-table-panel"><table class="roster-web-table"><thead><tr><th>Roster</th><th>Photo</th><th>Player</th><th>Age</th><th>Position</th><th>Team</th><th>MLB Level</th><th>Contract</th><th>Final Year</th><th>Options</th><th>Contract Type</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${prospects.map(row).join('')||'<tr><td colspan="13" class="empty">No players are marked Top 100.</td></tr>'}</tbody></table></div></div>`;
}

const sheetPageWithDatabase=sheetPage;
sheetPage=function(name){if(name==='Top Ranked Prospects'||name==='Top Ranked Players')return topRankedProspectsPage();if(MINOR_PAGE_CONFIG[name])return minorRosterPage(name);return sheetPageWithDatabase(name)};

function liveMlbMetrics(){
  const currentPlayers=activeAt('MLB');
  const capPlayers=state.players.filter(p=>p.active!==false&&(p.roster==='MLB'||isInjuredCoverage(p)));
  const used=capPlayers.reduce((sum,p)=>sum+(Number(p.mlbSalary)||0),0);
  const activePlayers=currentPlayers.filter(p=>!isMlbInjuredCoverage(p));
  const injured=state.players.filter(p=>p.active!==false&&assignmentStatus(p)==='INJ').length;
  const coverage=state.players.filter(p=>p.active!==false&&assignmentStatus(p)==='CVG').length;
  return {used,limit:Number(D.cap)||116250000,count:activePlayers.length,rosterLimit:26,injured,coverage};
}
function goToPage(name){current=name;render()}
coverPage=function(){
  const mlb=liveMlbMetrics(),minorTotal=MINOR_LEVELS.reduce((s,l)=>s+minorSalaryTotal(l),0),minorCount=MINOR_LEVELS.reduce((s,l)=>s+activeMinorAt(l).length,0);
  const metric=(label,value,isMoney=false)=>`<div class="cover-metric"><span>${esc(label)}</span><strong>${isMoney?money(value):esc(value)}</strong></div>`;
  const section=(title,subtitle,items,cls='',page='')=>`<section class="cover-section ${cls} ${page?'clickable-cover-section':''}" ${page?`onclick="goToPage('${page}')" title="Open ${esc(title)}"`:''}><div class="cover-section-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${page?'<b class="cover-open-label">Open</b>':''}</div><div class="cover-metrics">${items.join('')}</div></section>`;
  const links=Object.entries(coverLinks).map(([name,url])=>`<a class="cover-site-link" target="_blank" rel="noopener" href="${url}"><span>${esc(name)}</span><b>Open</b></a>`).join('');
  const searchBox=`<section class="cover-search-card"><div><h3>Player Search</h3><p>Find a player on any roster page.</p></div><div class="cover-search-wrap"><div class="cover-search-autocomplete"><input id="coverPlayerSearch" class="cover-player-search" autocomplete="off" placeholder="Enter player name"><div id="coverPlayerSuggestions" class="cover-player-suggestions" hidden></div></div><button class="btn primary" onclick="findPlayerFromCover()">Search Player</button></div></section>`;
  const minorSection=(level,page,title,team)=>section(title,team,[metric(`${level} Salary Total`,minorSalaryTotal(level),true),metric(`${level} Roster Limit`,MINOR_ROSTER_LIMIT),metric(`${level} Current Roster`,activeMinorAt(level).length),metric(`${level} Injured/Coverage`,activeAt(level).filter(isInjuredCoverage).length),metric(`${level} Spots Open`,Math.max(0,MINOR_ROSTER_LIMIT-activeMinorAt(level).length))],'',page);
  const minorPositionTotals={'Infielders':0,'Outfielders':0,'Starting Pitchers':0,'Relief Pitchers':0};
  for(const cfg of Object.values(MINOR_PAGE_CONFIG)){
    const counts=minorCounts(cfg.level,cfg.sheet);
    for(const group of Object.keys(minorPositionTotals))minorPositionTotals[group]+=counts[group]||0;
  }
  const minorBreakdown=`<section class="cover-section cover-position-breakdown"><div class="cover-section-head"><div><h3>Minor League Position Breakdown</h3></div></div><div class="cover-metrics">${Object.entries(minorPositionTotals).map(([label,value])=>metric(label,value)).join('')}</div></section>`;
  return `<div class="cover-page"><div class="cover-title"><p>Major League Roster</p><h2>NEW JERSEY JACKELS</h2></div><div class="cover-dashboard-grid"><div class="cover-main-column">${section('Major League Roster','New Jersey Jackels',[metric('MLB Cap Limit',mlb.limit,true),metric('MLB Current Cap',mlb.used,true),metric('MLB Balance Available',mlb.limit-mlb.used,true),metric('MLB Roster Limit',mlb.rosterLimit),metric('MLB Current Roster',mlb.count),metric('MLB Spots Open',Math.max(0,mlb.rosterLimit-mlb.count)),metric('Injured',mlb.injured),metric('Coverage',mlb.coverage)],'major-section','2026_Roster')}${searchBox}</div><div class="cover-minors-column"><div class="cover-minor-grid">${minorSection('AAA','AAA_Nashville','AAA Roster','Nashville')}${minorSection('A','A_Houston','A Roster','Houston')}${minorSection('AA','AA_Baltimore','AA Roster','Baltimore')}${minorSection('Rookie','RK_Anaheim','Rookie Roster','Anaheim')}</div>${section('Minor League Total','All four minor league levels',[metric('MiLB Cap Limit',MILB_CAP_LIMIT,true),metric('MiLB Current Cap',minorTotal,true),metric('MiLB Balance Available',MILB_CAP_LIMIT-minorTotal,true),metric('MiLB Roster Limit',MINOR_ROSTER_LIMIT*4),metric('MiLB Current Roster',minorCount),metric('MiLB Spots Open',Math.max(0,MINOR_ROSTER_LIMIT*4-minorCount))],'milb-total')}</div><div class="cover-side-column"><aside class="cover-links-card"><div class="cover-section-head"><div><h3>Links</h3><p>League and player research sites</p></div></div><div class="cover-links-list">${links}</div></aside>${minorBreakdown}</div></div></div>`;
};

const originalOpenAdd=window.openAdd;
window.openAdd=()=>{originalOpenAdd();const f=$('#rosterAddForm');if(!f)return;const map={'2026_Roster':'MLB','AAA_Nashville':'AAA','AA_Baltimore':'AA','A_Houston':'A','RK_Anaheim':'Rookie'};if(map[current])f.elements.roster.value=map[current]};
window.goToPage=goToPage;
// Repair any existing active MLB records that were saved without a lineup slot.
// This includes players moved to MLB before this fix was installed.
const repairMlbPlayers=state.players.filter(p=>p.active!==false&&p.roster==='MLB'&&!isInjuredCoverage(p));
initializeMlbLineupSlots(repairMlbPlayers);
initializeMinorRosters();
render();
/* Live Field Map */
function fieldPlayers(){
  const players=activeMlbPlayers();initializeMlbLineupSlots(players);return players;
}
function fieldPlayerCard(p,compact=false){
  return `<button class="field-player-card ${compact?'compact':''}" onclick="openPlayerDetails('${p.id}')" title="View ${esc(p.name)}"><img src="${photo(p)}" onerror="this.onerror=null;this.src=window.silhouette" alt="${esc(p.name)}"><span><strong>${esc(p.name)}</strong><small>${money(p.mlbSalary)}</small></span></button>`;
}
function fieldMapPage(){
  const players=fieldPlayers();
  const playerAt=id=>players.find(p=>p.lineupSlot===id);
  const bench=players.filter(p=>String(p.lineupSlot||'').startsWith('BENCH-'));
  const bullpen=players.filter(p=>String(p.lineupSlot||'').startsWith('RP-'));
  const starters=players.filter(p=>String(p.lineupSlot||'').startsWith('SP-'));
  const flexPitcher=playerAt('P');
  const spot=(id,label)=>{const p=playerAt(id);return `<div class="diamond-spot spot-${id.toLowerCase()}"><span class="position-label">${label}</span>${p?fieldPlayerCard(p):`<span class="empty-position">Empty</span>`}</div>`};
  const list=(title,items)=>`<section class="field-side-list"><div class="field-side-head"><h3>${title}</h3><strong>${items.length}</strong></div><div class="field-side-players">${items.map(p=>fieldPlayerCard(p,true)).join('')||`<p class="field-empty">No players assigned.</p>`}</div></section>`;
  return `<div class="field-map-page">${toolbar()}<div class="field-map-head"><div><h2>Field Map</h2><p>Uses the same fixed slots shown on the MLB roster page.</p></div><strong>${players.length} active players</strong></div><div class="field-map-layout"><div class="diamond-wrap"><div class="baseball-diamond">${spot('LF','LF')}${spot('CF','CF')}${spot('RF','RF')}${spot('SS','SS')}${spot('2B','2B')}${spot('3B','3B')}${spot('1B','1B')}${flexPitcher?spot('P','P'):spot('SP-1','SP')}${spot('C','C')}</div></div><aside class="field-map-sidebar">${list('Starting Pitchers',starters)}${list('Bullpen',bullpen)}${list('Bench',bench)}</aside></div></div>`;
}

const sheetPageBeforeFieldMap=sheetPage;
sheetPage=function(name){if(name==='Field Map')return fieldMapPage();return sheetPageBeforeFieldMap(name)};
render();

/* Database-driven Depth Chart */
const DEPTH_CHART_POSITIONS=[
  {id:'C',label:'Catcher'},
  {id:'1B',label:'First Base'},
  {id:'2B',label:'Second Base'},
  {id:'SS',label:'Shortstop'},
  {id:'3B',label:'Third Base'},
  {id:'LF',label:'Left Field'},
  {id:'CF',label:'Center Field'},
  {id:'RF',label:'Right Field'},
  {id:'UTL',label:'Utility'},
  {id:'SP',label:'Starting Pitcher'},
  {id:'RP',label:'Relief Pitcher'}
];
function ensureDepthChartState(){
  if(!state.depthChart||typeof state.depthChart!=='object')state.depthChart={};
  for(const pos of DEPTH_CHART_POSITIONS){
    if(!Array.isArray(state.depthChart[pos.id]))state.depthChart[pos.id]=Array(5).fill('');
    state.depthChart[pos.id]=state.depthChart[pos.id].slice(0,5);
    while(state.depthChart[pos.id].length<5)state.depthChart[pos.id].push('');
  }
}
function depthEligiblePlayers(position){
  return state.players.filter(p=>{
    if(p.active===false)return false;
    const positions=baseballPositions(p);
    if(position==='UTL')return !isPitcher(p);
    if(position==='SP')return positions.includes('SP');
    if(position==='RP')return positions.includes('RP')||positions.includes('P');
    return positions.includes(position);
  }).sort((a,b)=>a.name.localeCompare(b.name));
}
function depthPlayerOption(p,selected){
  const detail=[p.roster||'Unassigned',p.mlbTeam||'No club'].join(' · ');
  return `<option value="${esc(p.id)}"${String(p.id)===String(selected)?' selected':''}>${esc(p.name)} (${esc(detail)})</option>`;
}
window.updateDepthChart=(position,index,value)=>{
  ensureDepthChartState();
  state.depthChart[position][Number(index)]=String(value||'');
  save();
  render();
};
function depthChartPage(){
  ensureDepthChartState();
  const rows=DEPTH_CHART_POSITIONS.map(pos=>{
    const players=depthEligiblePlayers(pos.id);
    const cells=Array.from({length:5},(_,i)=>{
      const selected=state.depthChart[pos.id][i]||'';
      return `<td><label class="depth-slot-label" for="depth-${pos.id}-${i}">${i+1}</label><select id="depth-${pos.id}-${i}" class="depth-select" onchange="updateDepthChart('${pos.id}',${i},this.value)"><option value="">Open slot</option>${players.map(p=>depthPlayerOption(p,selected)).join('')}</select></td>`;
    }).join('');
    return `<tr><th scope="row"><span class="depth-position-code">${esc(pos.id)}</span><span>${esc(pos.label)}</span></th>${cells}</tr>`;
  }).join('');
  return `<div class="depth-chart-page">${toolbar()}<div class="roster-page-head"><div><h2>Depth Chart</h2><p>Select up to five players at each position. Choices pull from the Player Key and save automatically.</p></div><strong>${state.players.filter(p=>p.active!==false).length} database players</strong></div><div class="depth-chart-panel"><table class="depth-chart-table"><thead><tr><th>Position</th><th>1st</th><th>2nd</th><th>3rd</th><th>4th</th><th>5th</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
const sheetPageBeforeDepthChart=sheetPage;
sheetPage=function(name){if(name==='Depth Chart')return depthChartPage();return sheetPageBeforeDepthChart(name)};
ensureDepthChartState();
save();
render();


/* Searchable Trade History, Phase 1 */
if(!Array.isArray(state.tradeHistory))state.tradeHistory=[];
let tradeSearch='';
let tradeTeamFilter='';
let tradeYearFilter='';
let tradeSort='newest';

function tradeText(value){return String(value??'').trim()}
function tradeLines(value){
  return tradeText(value).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}
function tradeTeams(){
  const teams=new Set();
  (state.tradeHistory||[]).forEach(t=>(t.teams||[]).forEach(side=>{if(tradeText(side.team))teams.add(tradeText(side.team))}));
  return [...teams].sort((a,b)=>a.localeCompare(b));
}
function tradeYears(){
  return [...new Set((state.tradeHistory||[]).map(t=>tradeText(t.date).slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
}
function tradeSearchText(t){
  return [t.date,t.title,...(t.teams||[]).flatMap(x=>[x.team,x.sends])].join(' ').toLowerCase();
}
function filteredTrades(){
  const q=tradeSearch.toLowerCase().trim();
  const rows=(state.tradeHistory||[]).filter(t=>{
    const matchesSearch=!q||tradeSearchText(t).includes(q);
    const matchesTeam=!tradeTeamFilter||(t.teams||[]).some(x=>tradeText(x.team)===tradeTeamFilter);
    const matchesYear=!tradeYearFilter||tradeText(t.date).startsWith(tradeYearFilter);
    return matchesSearch&&matchesTeam&&matchesYear;
  });
  return rows.sort((a,b)=>{
    const d=tradeText(a.date).localeCompare(tradeText(b.date));
    return tradeSort==='oldest'?d:-d;
  });
}
function formatTradeDate(value){
  if(!value)return 'Date not entered';
  const d=new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime())?esc(value):d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
}
function tradeSideCard(side){
  const items=tradeLines(side.sends);
  return `<section class="trade-side"><h4>${esc(side.team||'Team not entered')}</h4><div class="trade-receives-label">${esc(side.label||'Sends')}</div>${items.length?`<ul>${items.map(x=>`<li>${linkedExactTradeAsset(x)}</li>`).join('')}</ul>`:'<p class="trade-none">No assets entered.</p>'}</section>`;
}
function tradeCard(t){
  const title=t.title?`<h3>${esc(t.title)}</h3>`:'';
  const dateText=formatTradeDate(t.date);
  const dateHtml=tradeText(t.url)?`<a class="trade-date trade-date-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" title="Open original Tapatalk trade">${dateText}</a>`:`<div class="trade-date">${dateText}</div>`;
  return `<article class="trade-card"><div class="trade-card-head"><div>${dateHtml}${title}<div class="trade-team-summary">${(t.teams||[]).map(x=>esc(x.team)).join(' ↔ ')}</div></div><div class="trade-card-actions"><button class="btn small" onclick="editTrade('${esc(t.id)}')">Edit</button><button class="btn small danger" onclick="deleteTrade('${esc(t.id)}')">Delete</button></div></div><div class="trade-sides ${(t.teams||[]).length===3?'three-way':''}">${(t.teams||[]).map(tradeSideCard).join('')}</div></article>`;
}
function tradeHistoryPage(){
  const teams=tradeTeams(),years=tradeYears(),rows=filteredTrades();
  const teamOptions=teams.map(x=>`<option value="${esc(x)}"${x===tradeTeamFilter?' selected':''}>${esc(x)}</option>`).join('');
  const yearOptions=years.map(x=>`<option value="${esc(x)}"${x===tradeYearFilter?' selected':''}>${esc(x)}</option>`).join('');
  return `<div class="trade-history-page"><div class="trade-history-head"><div><h2>Trade History</h2><p>Search trades by player, team, draft pick, salary coverage, year, or notes.</p></div><button class="btn primary" onclick="openTrade()">Add Trade</button></div><div class="trade-filters"><input id="tradeSearchInput" class="search" placeholder="Search trade history..." value="${esc(tradeSearch)}"><select id="tradeTeamFilter"><option value="">All teams</option>${teamOptions}</select><select id="tradeYearFilter"><option value="">All years</option>${yearOptions}</select><select id="tradeSort"><option value="newest"${tradeSort==='newest'?' selected':''}>Newest first</option><option value="oldest"${tradeSort==='oldest'?' selected':''}>Oldest first</option></select><button class="btn" onclick="clearTradeFilters()">Clear</button></div><div class="trade-result-summary"><strong>${rows.length}</strong> of ${(state.tradeHistory||[]).length} trades shown</div><div class="trade-list">${rows.map(tradeCard).join('')||`<div class="trade-empty"><h3>No trades found</h3><p>${(state.tradeHistory||[]).length?'Try changing the search or filters.':'Phase 1 is ready. Add a test trade to check the page before the spreadsheet import.'}</p><button class="btn primary" onclick="openTrade()">Add Test Trade</button></div>`}</div></div>`;
}
function bindTradeHistoryControls(){
  const searchInput=$('#tradeSearchInput');
  if(searchInput)searchInput.oninput=e=>{tradeSearch=e.target.value;render()};
  const team=$('#tradeTeamFilter');
  if(team)team.onchange=e=>{tradeTeamFilter=e.target.value;render()};
  const year=$('#tradeYearFilter');
  if(year)year.onchange=e=>{tradeYearFilter=e.target.value;render()};
  const sort=$('#tradeSort');
  if(sort)sort.onchange=e=>{tradeSort=e.target.value;render()};
}
window.clearTradeFilters=()=>{tradeSearch='';tradeTeamFilter='';tradeYearFilter='';tradeSort='newest';render()};
function setTradeTeam3Visibility(){
  const form=$('#tradeForm'),block=$('#tradeTeam3Block');
  if(!form||!block)return;
  const three=form.elements.tradeType.value==='3-team';
  block.hidden=!three;
  form.elements.team3.required=three;
  form.elements.team3Sends.required=three;
}
function populateTradeTeamList(){
  const list=$('#tradeTeamList');
  if(list)list.innerHTML=tradeTeams().map(x=>`<option value="${esc(x)}"></option>`).join('');
}
window.openTrade=()=>{
  const form=$('#tradeForm');
  form.reset();
  form.dataset.id='';
  form.elements.tradeDate.value=new Date().toISOString().slice(0,10);
  $('#tradeDialogTitle').textContent='Add Trade';
  $('#tradeSaveButton').textContent='Save Trade';
  populateTradeTeamList();
  setTradeTeam3Visibility();
  $('#tradeDialog').showModal();
};
window.editTrade=id=>{
  const t=(state.tradeHistory||[]).find(x=>String(x.id)===String(id));
  if(!t)return;
  const form=$('#tradeForm');form.reset();form.dataset.id=t.id;
  form.elements.tradeDate.value=t.date||'';
  form.elements.tradeType.value=(t.teams||[]).length===3?'3-team':'2-team';
  form.elements.title.value=t.title||'';
  if(form.elements.tradeUrl)form.elements.tradeUrl.value=t.url||'';
  (t.teams||[]).forEach((side,i)=>{const n=i+1;if(form.elements[`team${n}`])form.elements[`team${n}`].value=side.team||'';if(form.elements[`team${n}Sends`])form.elements[`team${n}Sends`].value=side.sends||''});
  $('#tradeDialogTitle').textContent='Edit Trade';$('#tradeSaveButton').textContent='Save Changes';populateTradeTeamList();setTradeTeam3Visibility();$('#tradeDialog').showModal();
};
window.deleteTrade=id=>{
  const t=(state.tradeHistory||[]).find(x=>String(x.id)===String(id));
  if(!t||!confirm(`Delete the ${formatTradeDate(t.date)} trade involving ${(t.teams||[]).map(x=>x.team).join(', ')}?`))return;
  state.tradeHistory=state.tradeHistory.filter(x=>String(x.id)!==String(id));save();render();
};
const tradeTypeControl=$('#tradeType');
if(tradeTypeControl)tradeTypeControl.onchange=setTradeTeam3Visibility;
$('#tradeForm').onsubmit=e=>{
  e.preventDefault();
  const form=e.target,fd=Object.fromEntries(new FormData(form));
  const count=fd.tradeType==='3-team'?3:2;
  const teams=Array.from({length:count},(_,i)=>({team:tradeText(fd[`team${i+1}`]),sends:tradeText(fd[`team${i+1}Sends`])}));
  if(new Set(teams.map(x=>x.team.toLowerCase())).size!==teams.length){alert('Each side of the trade must use a different team name.');return}
  const record={id:form.dataset.id||`trade-${Date.now()}`,date:fd.tradeDate,title:tradeText(fd.title),url:tradeText(fd.tradeUrl),teams,source:'manual'};
  const existing=(state.tradeHistory||[]).findIndex(x=>String(x.id)===String(record.id));
  if(existing>=0)state.tradeHistory[existing]=record;else state.tradeHistory.push(record);
  save();$('#tradeDialog').close();current='Trade History';render();
};

const sheetPageBeforeTradeHistory=sheetPage;
sheetPage=function(name){if(name==='Trade History')return tradeHistoryPage();return sheetPageBeforeTradeHistory(name)};
const renderBeforeTradeHistory=render;
render=function(){renderBeforeTradeHistory();if(current==='Trade History')bindTradeHistoryControls()};
const navBeforeTradeHistory=nav;
nav=function(){
  navBeforeTradeHistory();
  const n=$('#nav');
  if(!n)return;
  if(!n.querySelector('[data-page="Trade History"]')){
    const button=document.createElement('button');button.className=`navbtn ${current==='Trade History'?'active':''}`;button.dataset.page='Trade History';button.textContent='Trade History';button.onclick=()=>{current='Trade History';render()};n.appendChild(button);
  }
  const playerKey=n.querySelector('[data-page="Player Key"]');
  if(playerKey)n.appendChild(playerKey);
};
window.resetData=()=>{if(confirm('Reset all website changes and reload the workbook copy?')){localStorage.removeItem(KEY);state={players:structuredClone(D.players),transactions:[],tradeHistory:structuredClone(D.tradeHistoryImported||[]),tradeImportVersion:D.tradeImportVersion||''};ensureDepthChartState();save();render()}};

// Preserve focus and caret position when live-search results redraw the page.
// This applies to the roster, Player Key, and Trade History search fields.
const renderBeforeFocusPreservation=render;
render=function(){
  const active=document.activeElement;
  const focusState=active&&active.id&&['INPUT','TEXTAREA'].includes(active.tagName)
    ?{id:active.id,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}
    :null;
  renderBeforeFocusPreservation();
  if(focusState){
    const replacement=document.getElementById(focusState.id);
    if(replacement){
      replacement.focus({preventScroll:true});
      if(typeof replacement.setSelectionRange==='function'){
        const max=String(replacement.value||'').length;
        const start=Math.min(focusState.start??max,max);
        const end=Math.min(focusState.end??start,max);
        replacement.setSelectionRange(start,end,focusState.direction||'none');
      }
    }
  }
};

document.title=`MLB Dynasty Team Manager v${APP_VERSION}`;
const versionTarget=document.querySelector('header small');
if(versionTarget)versionTarget.textContent=`Version ${APP_VERSION} · Changes save in this browser`;


/* Version 1.00: Data protection, validation, and stable-release tools */
function backupPayload(){
  return {
    app:'MLB Dynasty Team Manager',
    version:APP_VERSION,
    exportedAt:new Date().toISOString(),
    data:structuredClone(state)
  };
}
function downloadJson(filename,value){
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.exportBackup=()=>{
  const stamp=new Date().toISOString().slice(0,10);
  downloadJson(`MLB-Team-Manager-Backup-${stamp}.json`,backupPayload());
};
function validateBackupPayload(payload){
  const candidate=payload&&payload.data?payload.data:payload;
  if(!candidate||typeof candidate!=='object')throw new Error('The selected file does not contain app data.');
  if(!Array.isArray(candidate.players))throw new Error('The selected file is missing the player database.');
  if(candidate.tradeHistory!=null&&!Array.isArray(candidate.tradeHistory))throw new Error('Trade History has an invalid format.');
  if(candidate.transactions!=null&&!Array.isArray(candidate.transactions))throw new Error('Transactions have an invalid format.');
  for(const player of candidate.players){
    if(!player||typeof player!=='object'||!String(player.name||'').trim())throw new Error('At least one player record is invalid.');
  }
  return candidate;
}
window.chooseBackupFile=()=>document.getElementById('backupImportInput')?.click();
const backupInput=document.getElementById('backupImportInput');
if(backupInput)backupInput.onchange=async e=>{
  const file=e.target.files?.[0];
  e.target.value='';
  if(!file)return;
  try{
    const text=await file.text();
    const imported=validateBackupPayload(JSON.parse(text));
    const playerCount=imported.players.length;
    const tradeCount=(imported.tradeHistory||[]).length;
    if(!confirm(`Import this backup?\n\nPlayers: ${playerCount}\nTrades: ${tradeCount}\n\nThis will replace the data currently saved in this browser.`))return;
    state=structuredClone(imported);
    state.transactions=Array.isArray(state.transactions)?state.transactions:[];
    state.tradeHistory=Array.isArray(state.tradeHistory)?state.tradeHistory:[];
    ensureUniqueInternalPlayerIds();ensureDepthChartState();save();render();
    alert('Backup imported successfully.');
  }catch(err){alert(`Import failed: ${err.message||'The file could not be read.'}`)}
};
window.resetData=()=>{
  const entered=prompt('This replaces all browser changes with the original workbook copy.\n\nType RESET to continue.');
  if(entered!=='RESET')return;
  localStorage.removeItem(KEY);
  state={players:structuredClone(D.players),transactions:[],tradeHistory:structuredClone(D.tradeHistoryImported||[]),tradeImportVersion:D.tradeImportVersion||''};
  ensureDepthChartState();save();render();
  alert('The app has been reset to the original workbook copy.');
};
function dataManagementPage(){
  const bytes=new Blob([JSON.stringify(state)]).size;
  const size=bytes<1024?`${bytes} bytes`:`${(bytes/1024).toFixed(1)} KB`;
  const lastTransaction=(state.transactions||[]).at(-1);
  return `<div class="data-page">
    <div class="data-page-head"><div><h2>Backup and Restore</h2><p>Protect the player database, roster assignments, trades, and settings saved in this browser.</p></div><span class="stable-badge">Version ${APP_VERSION} Stable</span></div>
    <div class="data-summary-grid">
      <div class="data-stat"><span>Players</span><strong>${state.players.length}</strong></div>
      <div class="data-stat"><span>Trades</span><strong>${(state.tradeHistory||[]).length}</strong></div>
      <div class="data-stat"><span>Transactions</span><strong>${(state.transactions||[]).length}</strong></div>
      <div class="data-stat"><span>Saved Data</span><strong>${size}</strong></div>
    </div>
    <section class="data-card"><div><h3>Export Backup</h3><p>Download one JSON file containing all app data. Keep it with your other league files.</p></div><button class="btn primary" onclick="exportBackup()">Export Data</button></section>
    <section class="data-card"><div><h3>Import Backup</h3><p>Restore a prior backup or move the app to another browser. You will see a summary before any data is replaced.</p></div><button class="btn" onclick="chooseBackupFile()">Import Data</button></section>
    <section class="data-card danger-card"><div><h3>Reset App</h3><p>Replace all browser changes with the original workbook copy. This requires typing RESET.</p></div><button class="btn danger" onclick="resetData()">Reset App</button></section>
    <div class="data-note"><strong>Storage status:</strong> Changes save automatically in this browser.${lastTransaction?` Last recorded change: ${esc(new Date(lastTransaction.date).toLocaleString())}.`:''}</div>
  </div>`;
}
const sheetPageBeforeDataManagement=sheetPage;
sheetPage=function(name){if(name==='Data Management')return dataManagementPage();return sheetPageBeforeDataManagement(name)};
const navBeforeDataManagement=nav;
nav=function(){
  navBeforeDataManagement();
  const n=document.getElementById('nav');if(!n)return;
  if(!n.querySelector('[data-page="Data Management"]')){
    const section=document.createElement('div');section.className='navsection';section.textContent='App';
    const button=document.createElement('button');button.className=`navbtn ${current==='Data Management'?'active':''}`;button.dataset.page='Data Management';button.textContent='Backup and Restore';button.onclick=()=>{current='Data Management';render()};
    n.append(section,button);
  }
};

save();render();
