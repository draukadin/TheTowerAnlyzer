const API='http://localhost:8080/api';
let allReports=[],activeId=null,activePayload=null,activeView='reports',currentTab='stats';

async function init(){
  await loadModSubstats();
  try{
    const [reportsRes,dupsRes]=await Promise.all([
      fetch(`${API}/reports`),
      fetch(`${API}/reports/duplicates`)
    ]);
    if(!reportsRes.ok)throw new Error(reportsRes.statusText);
    allReports=await reportsRes.json();
    setStatus(true,`${allReports.length} reports loaded`);
    populateFolderFilter();
    renderSidebar(allReports);
    if(dupsRes.ok){
      const dups=await dupsRes.json();
      renderDuplicateWarning(dups);
    }
  }catch(e){
    setStatus(false,'Cannot reach server');
    document.getElementById('reportList').innerHTML=
      '<div class="loading-placeholder" style="color:var(--red)">Server offline — is Spring Boot running on :8080?</div>';
  }
}

function renderDuplicateWarning(groups){
  const el=document.getElementById('duplicateWarning');
  if(!groups||!groups.length){el.style.display='none';return;}
  const lines=groups.map(g=>{
    const [keep,...dupes]=g.runNumbers;
    return `Runs #${dupes.join(', #')} duplicate Run #${keep}`;
  });
  el.style.display='';
  el.innerHTML=`<strong>⚠️ Duplicate reports detected</strong><br>${lines.join('<br>')}<br>
    <span style="color:var(--muted)">Use the 🗑️ button on each duplicate to remove it.</span>`;
}

async function fetchReports(){
  const btn=document.getElementById('fetchBtn');
  btn.disabled=true;
  btn.classList.add('loading');
  btn.textContent='Fetching…';
  try{
    const res=await fetch(`${API}/reports/fetch`,{method:'POST'});
    if(!res.ok)throw new Error(res.statusText);
    const data=await res.json();
    const n=data.processed;
    btn.textContent=n>0?`↓ Fetched ${n} report${n===1?'':'s'}`:'No new reports';
    if(n>0){
      const res2=await fetch(`${API}/reports`);
      allReports=await res2.json();
      populateFolderFilter();
      renderSidebar(visibleReports());
      setStatus(true,`${allReports.length} reports loaded`);
    }
  }catch(e){
    btn.textContent='Fetch failed';
    setStatus(false,'Fetch error');
  }finally{
    btn.disabled=false;
    btn.classList.remove('loading');
    setTimeout(()=>{btn.textContent='↓ Fetch New Reports';},3000);
  }
}

function setStatus(ok,msg){
  document.getElementById('statusDot').className='status-dot'+(ok?'':' err');
  document.getElementById('statusText').textContent=msg;
}

function populateFolderFilter(){
  const folders=[...new Set(allReports.map(r=>r.runType))].sort();
  const sel=document.getElementById('folderFilter');
  const prev=sel.value;
  sel.innerHTML='<option value="">All run types</option>';
  folders.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;sel.appendChild(o);});
  if(prev&&folders.includes(prev))sel.value=prev;
}

function filterFolder(folder){
  renderSidebar(folder?allReports.filter(r=>r.runType===folder):allReports);
}

function visibleReports(){
  const f=document.getElementById('folderFilter').value;
  return f?allReports.filter(r=>r.runType===f):allReports;
}

function renderSidebar(reports){
  const list=document.getElementById('reportList');
  list.innerHTML='';
  if(!reports.length){list.innerHTML='<div class="loading-placeholder">No reports found</div>';return;}
  reports.forEach(r=>{
    const item=document.createElement('div');
    item.className='report-item'+(r.id===activeId?' active':'');
    item.innerHTML=`
      <div class="report-item-header">
        <div class="report-item-name">#${r.runNumber} <span class="tier-badge">T${r.tier}</span> <span class="wave-badge">⚡ ${r.wave.toLocaleString()}</span></div>
        <button class="report-delete-btn" title="Delete report">🗑️</button>
      </div>
      <div class="report-item-meta">
        ${r.runType?`<span class="folder-badge">${r.runType}</span>`:''}
        ${r.towerEra?`<span class="era-badge" title="${r.towerEra}">${r.towerEra}</span>`:''}
      </div>
      <div class="report-item-meta">
        <span>📅 ${r.battleDate}</span>
        <span style="color:var(--red);font-size:10px">💀 ${r.killedBy||'?'}</span>
      </div>`;
    item.querySelector('.report-delete-btn').addEventListener('click', e=>{
      e.stopPropagation();
      showDeleteModal(r);
    });
    item.addEventListener('click',()=>selectReport(r));
    list.appendChild(item);
  });
}

let deleteModalTarget=null;

function showDeleteModal(r){
  deleteModalTarget=r;
  document.getElementById('deleteModalTitle').textContent=`Delete Report #${r.runNumber}?`;
  document.getElementById('deleteModal').style.display='flex';
}

function closeDeleteModal(){
  document.getElementById('deleteModal').style.display='none';
  deleteModalTarget=null;
}

async function confirmDelete(deleteSourceFile){
  const r=deleteModalTarget;
  closeDeleteModal();
  try{
    const res=await fetch(`${API}/reports/${encodeURIComponent(r.id)}?deleteSourceFile=${deleteSourceFile}`,{method:'DELETE'});
    if(!res.ok)throw new Error((await res.json()).message||res.statusText);
    allReports=allReports.filter(x=>x.id!==r.id);
    if(activeId===r.id){
      activeId=null;
      document.getElementById('mainContent').innerHTML=`
        <div class="empty-state"><div class="icon">🗼</div><h2>Select a report</h2>
        <p>Choose a battle report from the sidebar to see detailed stats, diagnosis, and comparisons.</p></div>`;
    }
    renderSidebar(visibleReports());
    fetch(`${API}/reports/duplicates`).then(r=>r.json()).then(renderDuplicateWarning).catch(()=>{});
  }catch(e){
    alert('Delete failed: '+e.message);
  }
}

async function selectReport(summary){
  activeId=summary.id; currentTab='stats';
  renderSidebar(visibleReports());
  document.getElementById('mainContent').innerHTML=
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading…</div>';
  try{
    const res=await fetch(`${API}/reports/${encodeURIComponent(summary.id)}`);
    if(!res.ok)throw new Error(res.statusText);
    activePayload=await res.json();
    renderReportView(summary,activePayload);
  }catch(e){
    document.getElementById('mainContent').innerHTML=
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function navToggle(grpId){
  const btn=document.getElementById(grpId);
  const group=btn.closest('.nav-group');
  const isOpen=group.classList.contains('open');
  // Close all groups first
  document.querySelectorAll('.nav-group.open').forEach(g=>g.classList.remove('open'));
  // Toggle this one
  if(!isOpen)group.classList.add('open');
}
// Close nav dropdowns when clicking outside
document.addEventListener('click',e=>{
  if(!e.target.closest('.nav-group')){
    document.querySelectorAll('.nav-group.open').forEach(g=>g.classList.remove('open'));
  }
  if(!e.target.closest('.filter-dropdown')){
    document.querySelectorAll('.filter-dropdown.open').forEach(d=>d.classList.remove('open'));
  }
});

function showView(view){
  activeView=view;
  // Map each view to its group id
  const viewGroup={
    reports:'grp-reports',versions:'grp-reports',incometrend:'grp-reports',
    cells:'grp-labs',labspeed:'grp-labs',labs:'grp-labs',labplanner:'grp-labs',shortestlabs:'grp-labs',
    shards:'grp-modules',modules:'grp-modules',
    uw:'grp-upgrades',workshop:'grp-upgrades',guardian:'grp-upgrades',bots:'grp-upgrades',cards:'grp-upgrades',
    relics:'grp-collectibles',cosmetics:'grp-collectibles',
    currencies:'grp-meta',tierpb:'grp-meta',tournament:'grp-meta',
    admin:null
  };
  // Close any open dropdown
  document.querySelectorAll('.nav-group.open').forEach(g=>g.classList.remove('open'));
  // Update group button highlights
  document.querySelectorAll('.nav-group-btn').forEach(b=>b.classList.remove('group-active'));
  const grpId=viewGroup[view];
  if(grpId)document.getElementById(grpId).classList.add('group-active');
  // Update individual nav-btn highlights
  document.querySelectorAll('.nav-btn').forEach(b=>{
    const fn=b.getAttribute('onclick')||'';
    b.classList.toggle('active',fn.includes(`'${view}'`));
  });
  if(view==='cells')renderCellsView();
  else if(view==='incometrend')renderIncomeTrendView();
  else if(view==='labspeed')renderLabSpeedView();
  else if(view==='shards')renderShardsView();
  else if(view==='uw')renderUwView();
  else if(view==='modules')renderModulesView();
  else if(view==='effectbans')renderEffectBansView();
  else if(view==='relics')renderRelicsView();
  else if(view==='labs')renderLabsView();
  else if(view==='cosmetics')renderCosmeticsView();
  else if(view==='currencies')renderCurrenciesView();
  else if(view==='tierpb')renderTierPbView();
  else if(view==='workshop')renderWorkshopView();
  else if(view==='cards')renderCardsView();
  else if(view==='bots')renderBotsView();
  else if(view==='guardian')renderGuardianView();
  else if(view==='versions')renderVersionTrackerView();
  else if(view==='tournament')renderTournamentView();
  else if(view==='labplanner')renderLabPlannerView();
  else if(view==='shortestlabs')renderShortestLabsView();
  else if(view==='admin')renderAdminView();
  else if(activeId&&activePayload)renderReportView(allReports.find(r=>r.id===activeId),activePayload);
  else document.getElementById('mainContent').innerHTML=`
    <div class="empty-state"><div class="icon">🗼</div><h2>Select a report</h2>
    <p>Choose a battle report from the sidebar.</p></div>`;
}

function switchTab(tab){
  currentTab=tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  const summary=allReports.find(r=>r.id===activeId);
  if(tab==='stats')renderStatsPanel(summary,activePayload);
  else if(tab==='diagnosis')renderDiagnosisPanel(summary);
  else if(tab==='compare')renderComparePanel(summary);
}

function renderReportView(summary,payload){
  const isTournament=summary.runType&&summary.runType.toLowerCase()==='tournament';
  document.getElementById('mainContent').innerHTML=`
    <div class="report-header">
      <div class="report-title">${summary.runType} — T${summary.tier} Wave ${summary.wave.toLocaleString()}</div>
      <div class="report-subtitle">
        <span>📅 ${summary.battleDate}</span>
        <span>${fmtDuration(summary.realTimeSeconds)} real · ${fmtDuration(summary.gameTimeSeconds)} game</span>
        <span id="reportVersionWrap" class="report-version" title="Tower version">🏗️ ${summary.towerEra||'—'}</span>
        <span><span class="killed-by">💀 ${summary.killedBy||'Unknown'}</span></span>
      </div>
      ${isTournament?`<div id="tournamentLink" style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px">
        <span style="color:var(--muted)">Loading conditions…</span>
      </div>`:''}
    </div>
    <div class="tab-bar">
      <div class="tab active" data-tab="stats" onclick="switchTab('stats')">Stats</div>
      <div class="tab" data-tab="diagnosis" onclick="switchTab('diagnosis')">Diagnosis</div>
      <div class="tab" data-tab="compare" onclick="switchTab('compare')">Compare</div>
    </div>
    <div id="tabPanel"></div>`;
  renderStatsPanel(summary,payload);
  hydrateReportVersion(summary);
  if(isTournament)renderTournamentConditionsRow(summary);
}

// Replace the static tower-version label with a filterable input so the user can re-tag a
// report's version (stored in runs.tower_era). A <datalist> gives a scrollable, type-to-filter
// suggestion list (a long <select> popup would overflow the screen). Options come from the
// Version Tracker; a version not in the tracker is still allowed.
async function hydrateReportVersion(summary){
  const el=document.getElementById('reportVersionWrap');
  if(!el)return;
  let versions=[];
  try{ versions=await fetch(`${API}/versions`).then(r=>r.json()); }catch(e){ return; }
  const current=summary.towerEra?String(summary.towerEra):'';
  const opts=versions.map(v=>`<option value="${v.version}"></option>`).join('');
  el.innerHTML=`🏗️ <input class="report-version-select" list="reportVersionOptions"
      value="${current}" placeholder="0.0.0" spellcheck="false"
      title="Type to filter, or pick a tracked version (format x.y.z)"
      onchange="saveReportVersion('${summary.id}',this.value,'${current}')">
    <datalist id="reportVersionOptions">${opts}</datalist>`;
}

async function saveReportVersion(runId,version,prev){
  version=(version||'').trim();
  // Only accept a full x.y.z version; otherwise revert so we never silently mis-tag a report.
  if(!/^\d+\.\d+\.\d+$/.test(version)){
    const inp=document.querySelector('#reportVersionWrap input');
    if(inp)inp.value=prev||'';
    return;
  }
  if(version===prev)return;
  await fetch(`${API}/reports/${encodeURIComponent(runId)}/version`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({version})});
  // Refresh the cached list so the new version sticks if the report is reopened.
  try{
    const res=await fetch(`${API}/reports`);
    allReports=await res.json();
    renderSidebar(visibleReports());
  }catch(e){}
}

async function renderTournamentConditionsRow(summary){
  const el=document.getElementById('tournamentLink');
  if(!el)return;
  try{
    const [tournamentsRes,condRes]=await Promise.all([
      fetch(`${API}/tournaments`),
      summary.tournamentId?fetch(`${API}/reports/${encodeURIComponent(summary.id)}/tournament-conditions`):Promise.resolve(null)
    ]);
    const allTournaments=await tournamentsRes.json();
    const runDate=new Date(summary.battleDate+'T12:00:00');
    // Candidate tournaments: date within 1 day of the run's battle_date
    const nearby=allTournaments.filter(t=>{
      const td=new Date(t.date+'T12:00:00');
      return Math.abs((td-runDate)/86400000)<=1;
    }).sort((a,b)=>a.date.localeCompare(b.date));

    if(summary.tournamentId){
      const conds=condRes?await condRes.json():[];
      const linked=allTournaments.find(t=>t.id===summary.tournamentId);
      const pills=conds.map(c=>`<span class="tourn-cond-pill ${c.category}" title="${c.name}">${c.acronym}</span>`).join('');
      el.innerHTML=`<span style="color:var(--muted)">🏆 ${linked?linked.date+' '+linked.league:'Linked'}</span>${pills}
        <button class="btn" style="font-size:10px;padding:2px 8px;margin-left:2px" onclick="unlinkTournamentRun('${summary.id}')">Unlink</button>`;
    }else{
      if(nearby.length===0){
        el.innerHTML=`<span style="color:var(--muted)">No tournaments near this date</span>`;
        return;
      }
      const opts=nearby.map(t=>{
        const acros=(t.conditions||[]).map(c=>c.acronym).join(', ');
        return `<option value="${t.id}">${t.date} ${t.league}${acros?' — '+acros:''}</option>`;
      }).join('');
      el.innerHTML=`<select id="tournLinkSel" style="font-size:11px;padding:2px 6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);border-radius:4px">
          <option value="">— link tournament —</option>${opts}</select>
        <button class="btn btn-primary" style="font-size:10px;padding:2px 8px" onclick="linkTournamentRun('${summary.id}')">Link</button>`;
    }
  }catch(e){
    el.innerHTML=`<span style="color:var(--muted);font-size:11px">Could not load tournament data</span>`;
  }
}

async function linkTournamentRun(runId){
  const sel=document.getElementById('tournLinkSel');
  const tid=sel&&sel.value;
  if(!tid)return;
  await fetch(`${API}/reports/${encodeURIComponent(runId)}/tournament/${tid}`,{method:'PUT'});
  const res=await fetch(`${API}/reports`);
  allReports=await res.json();
  const summary=allReports.find(r=>r.id===runId);
  if(summary&&activePayload)renderReportView(summary,activePayload);
}

async function unlinkTournamentRun(runId){
  await fetch(`${API}/reports/${encodeURIComponent(runId)}/tournament`,{method:'DELETE'});
  const res=await fetch(`${API}/reports`);
  allReports=await res.json();
  const summary=allReports.find(r=>r.id===runId);
  if(summary&&activePayload)renderReportView(summary,activePayload);
}

function renderStatsPanel(summary,p){
  const s=p.sectionMap;
  const br=s.BATTLE_REPORT||{}, dmg=s.DAMAGE||{}, dmgBlk=s.DAMAGE_BLOCKED||{};
  const dmgTkn=s.DAMAGE_TAKEN||{}, coins=s.COINS||{}, cash=s.CASH||{};
  const curr=s.CURRENCIES||{}, rec=s.RECORDS||{}, util=s.UTILITY||{};
  const counts=s.COUNTS||{}, enemies=s.TOTAL_ENEMIES||{};
  const destroyedBy=s.ENEMIES_DESTROYED_BY||{}, kwea=s.KILLED_WITH_EFFECT_ACTIVE||{};
  const hp=s.BONUS_HEALTH_GAINED||{}, hregen=s.HEALTH_REGENERATED||{};

  const totalDmgRaw=raw(dmg.damageDealt);
  const totalEnemies=enemies.totalEnemies||0;
  const totalKills=(destroyedBy.projectiles||0)+(destroyedBy.thorns||0)+(destroyedBy.landMines||0)+
    (destroyedBy.orbs||0)+(destroyedBy.chainLightning||0)+(destroyedBy.smartMissiles||0)+
    (destroyedBy.innerLandMines||0)+(destroyedBy.poisonSwamp||0)+(destroyedBy.deathRay||0)+
    (destroyedBy.blackHole||0)+(destroyedBy.flameBot||0)+(destroyedBy.other||0);

  const dmgSrc=[
    ['Orbs',raw(dmg.orbs)],['Chain Lightning',raw(dmg.chainLightning)],
    ['Thorns',raw(dmg.thorns)],['Black Hole',raw(dmg.blackHole)],
    ['Projectiles',raw(dmg.projectiles)],['Land Mines',raw(dmg.landMines)],
    ['Smart Missiles',raw(dmg.smartMissiles)],['Flame Bot',raw(dmg.flameBot)],
    ['Inner Land Mines',raw(dmg.innerLandMines)],['Death Wave',raw(dmg.deathWave)],
    ['Rend Armor',raw(dmg.rendArmor)],['Death Ray',raw(dmg.deathRay)],
    ['Attack Chip',raw(dmg.attackChip)],['Electrons',raw(dmg.electrons)],
    ['Poison Swamp',raw(dmg.poisonSwamp)]
  ].filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);

  const killSrc=[
    ['Orbs',destroyedBy.orbs||0],['Chain Lightning',destroyedBy.chainLightning||0],
    ['Land Mines',destroyedBy.landMines||0],['Projectiles',destroyedBy.projectiles||0],
    ['Smart Missiles',destroyedBy.smartMissiles||0],['Flame Bot',destroyedBy.flameBot||0],
    ['Black Hole',destroyedBy.blackHole||0],['Thorns',destroyedBy.thorns||0],
    ['Inner Land Mines',destroyedBy.innerLandMines||0],['Death Ray',destroyedBy.deathRay||0],
    ['Poison Swamp',destroyedBy.poisonSwamp||0],['Other',destroyedBy.other||0]
  ].filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);

  const blkSrc=[
    ['Defense %',raw(dmgBlk.defensePercent)],['Chrono Field',raw(dmgBlk.chronoField)],
    ['Chain Thunder',raw(dmgBlk.chainThunder)],['Flame Bot',raw(dmgBlk.flameBot)],
    ['Primordial Collapse',raw(dmgBlk.primordialCollapse)],
    ['Defense Absolute',raw(dmgBlk.defenseAbsolute)],
    ['Neg. Mass Projector',raw(dmgBlk.negativeMassProjector)]
  ].filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
  const totalBlk=blkSrc.reduce((a,[,v])=>a+v,0);

  const coinSrc=[
    ['Golden Tower',raw(coins.goldenTower)],['Black Hole',raw(coins.blackHole)],
    ['Other Bonuses',raw(coins.otherCoinBonuses)],['Golden Bot',raw(coins.goldenBot)],
    ['Death Wave',raw(coins.deathWave)],['Spotlight',raw(coins.spotlight)],
    ['Critical Coin',raw(coins.criticalCoin)],['Wave Skip',raw(coins.waveSkip)],
    ['Coins Fetched',raw(coins.coinsFetched)],['Bounty Coins',raw(coins.bountyCoins)]
  ].filter(([,v])=>v>0).sort(([,a],[,b])=>b-a);
  const totalCoins=raw(coins.coinsEarned);

  const enemyTypes=[
    ['Basic',enemies.basic||0],['Fast',enemies.fast||0],['Tank',enemies.tank||0],
    ['Ranged',enemies.ranged||0],['Boss',enemies.boss||0],['Protector',enemies.protector||0],
    ['Vampires',enemies.vampires||0],['Rays',enemies.rays||0],['Scatters',enemies.scatters||0],
    ['Saboteur',enemies.saboteur||0],['Commander',enemies.commander||0],['Overcharge',enemies.overcharge||0]
  ].filter(([,v])=>v>0);

  function barsHtml(rows,maxV,cls=''){
    return rows.map(([k,v])=>`<tr>
      <td>${k}</td>
      <td><div class="bar-row"><div class="bar-fill ${cls}" style="width:${Math.round(v/(maxV||1)*120)}px"></div></div></td>
      <td class="val-num">${fmtRaw(v)}</td>
      <td class="val-pct">${pct(v,maxV)}%</td>
    </tr>`).join('');
  }

  document.getElementById('tabPanel').innerHTML=`
    <div class="section-title">Overview</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Coins Earned</div><div class="value gold">${disp(br.coinsEarned)}</div></div>
      <div class="stat-card"><div class="label">Coins / Hour</div><div class="value gold">${disp(br.coinsPerHour)}</div></div>
      <div class="stat-card"><div class="label">Cells Earned</div><div class="value accent">${disp(br.cellsEarned)}</div></div>
      <div class="stat-card"><div class="label">Cells / Hour</div><div class="value accent">${disp(br.cellsPerHour)}</div></div>
      <div class="stat-card"><div class="label">Damage Dealt</div><div class="value">${disp(dmg.damageDealt)}</div></div>
      <div class="stat-card"><div class="label">Total Enemies</div><div class="value">${totalEnemies.toLocaleString()}</div></div>
      <div class="stat-card"><div class="label">Cash Earned</div><div class="value green">${disp(cash.cashEarned)}</div></div>
      <div class="stat-card"><div class="label">Tower Era</div><div class="value" style="font-size:0.8rem">${br.towerEra||'—'}</div></div>
    </div>
    <div class="section-title">Records</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Highest Coins/Min</div><div class="value gold">${disp(rec.highestCoinsPerMinute)}</div></div>
      <div class="stat-card"><div class="label">Largest Wave Skip</div><div class="value accent">${rec.largestWaveSkip||0}</div></div>
      <div class="stat-card"><div class="label">Most Coins from Skip</div><div class="value gold">${disp(rec.mostCoinsFromWaveSkip)}</div></div>
      <div class="stat-card"><div class="label">Missile Stack</div><div class="value">${rec.largestSmartMissileStack||0}</div></div>
      <div class="stat-card"><div class="label">Golden Combo</div><div class="value gold">${rec.largestGoldenCombo||0}</div></div>
      <div class="stat-card"><div class="label">Inner Mine Charge</div><div class="value">${disp(rec.largestInnerLandmineCharge)}</div></div>
    </div>
    <div class="section-title">Damage Breakdown</div>
    <div class="two-col">
      <div class="table-section"><table>
        <thead><tr><th>Source</th><th></th><th>Damage</th><th>%</th></tr></thead>
        <tbody>${barsHtml(dmgSrc,totalDmgRaw)}</tbody>
      </table></div>
      <div class="table-section"><table>
        <thead><tr><th>Killed by</th><th></th><th>Kills</th><th>%</th></tr></thead>
        <tbody>${barsHtml(killSrc,totalKills,'gold')}</tbody>
      </table></div>
    </div>
    <div class="section-title">Defense &amp; Economy</div>
    <div class="two-col">
      <div class="table-section"><table>
        <thead><tr><th>Damage Blocked</th><th></th><th>Amount</th><th>%</th></tr></thead>
        <tbody>${barsHtml(blkSrc,totalBlk,'green')}</tbody>
      </table></div>
      <div class="table-section"><table>
        <thead><tr><th>Coin Source</th><th></th><th>Coins</th><th>%</th></tr></thead>
        <tbody>${barsHtml(coinSrc,totalCoins,'gold')}</tbody>
      </table></div>
    </div>
    <div class="section-title">Survival</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Lifesteal</div><div class="value green">${disp(hregen.lifeSteal)}</div></div>
      <div class="stat-card"><div class="label">Wall Health Regen</div><div class="value green">${disp(hregen.wallHealthRegen)}</div></div>
      <div class="stat-card"><div class="label">Tower Health Regen</div><div class="value green">${disp(hregen.towerHealthRegen)}</div></div>
      <div class="stat-card"><div class="label">Bonus HP (DW)</div><div class="value green">${disp(hp.fromDeathWave)}</div></div>
      <div class="stat-card"><div class="label">Tower Damage Taken</div><div class="value red">${disp(dmgTkn.tower)}</div></div>
      <div class="stat-card"><div class="label">Wall Damage Taken</div><div class="value red">${disp(dmgTkn.wall)}</div></div>
    </div>
    <div class="section-title">Enemy Composition</div>
    <div class="two-col">
      <div class="table-section"><table>
        <thead><tr><th>Type</th><th></th><th>Count</th><th>%</th></tr></thead>
        <tbody>${barsHtml(enemyTypes,totalEnemies,'orange')}</tbody>
      </table></div>
      <div class="table-section"><table>
        <thead><tr><th>Effect Active</th><th>Kills</th></tr></thead>
        <tbody>${[['Golden Tower',kwea.goldenTower],['Spotlight',kwea.spotlight],
          ['Golden Bot',kwea.goldenBot],['Death Wave',raw(kwea.deathWave)],
          ['Amplify Bot',kwea.amplifyBot],['Death Penalty',kwea.deathPenalty]]
          .filter(([,v])=>v>0)
          .map(([k,v])=>`<tr><td>${k}</td><td class="val-num">${Number(v).toLocaleString()}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="section-title">Utility &amp; Counts</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Recovery Packages</div><div class="value accent">${util.recoveryPackages||0}</div></div>
      <div class="stat-card"><div class="label">Free Atk Upgrades</div><div class="value accent">${util.freeAttackUpgrades||0}</div></div>
      <div class="stat-card"><div class="label">Free Def Upgrades</div><div class="value accent">${util.freeDefenseUpgrades||0}</div></div>
      <div class="stat-card"><div class="label">Free Util Upgrades</div><div class="value accent">${util.freeUtilityUpgrades||0}</div></div>
      <div class="stat-card"><div class="label">Waves Skipped</div><div class="value">${counts.wavesSkipped||0}</div></div>
      <div class="stat-card"><div class="label">Land Mines Spawned</div><div class="value">${(counts.landMinesSpawned||0).toLocaleString()}</div></div>
      <div class="stat-card"><div class="label">Enemy Atk Lvls Skip</div><div class="value">${util.enemyAttackLevelSkipped||0}</div></div>
      <div class="stat-card"><div class="label">Enemy HP Lvls Skip</div><div class="value">${util.enemyHealthLevelSkipped||0}</div></div>
    </div>
    <div class="section-title">Currencies &amp; Shards</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Gems</div><div class="value gold">${curr.gems||0}</div></div>
      <div class="stat-card"><div class="label">Ad Gems</div><div class="value gold">${curr.adGems||0}</div></div>
      <div class="stat-card"><div class="label">Fetch Gems</div><div class="value gold">${curr.fetchGems||0}</div></div>
      <div class="stat-card"><div class="label">Medals</div><div class="value">${curr.medals||0}</div></div>
      <div class="stat-card"><div class="label">Reroll Shards</div><div class="value accent">${disp(curr.reRollShardsEarned)}</div></div>
      <div class="stat-card"><div class="label">Cannon Shards</div><div class="value">${curr.cannonShards||0}</div></div>
      <div class="stat-card"><div class="label">Armor Shards</div><div class="value">${curr.armorShards||0}</div></div>
      <div class="stat-card"><div class="label">Common Modules</div><div class="value">${curr.commonModules||0}</div></div>
      <div class="stat-card"><div class="label">Rare Modules</div><div class="value accent">${curr.rareModules||0}</div></div>
      <div class="stat-card"><div class="label">Generator Shards</div><div class="value">${curr.generatorShards||0}</div></div>
      <div class="stat-card"><div class="label">Core Shards</div><div class="value">${curr.coreShards||0}</div></div>
    </div>
`;
}

async function renderDiagnosisPanel(summary){
  document.getElementById('tabPanel').innerHTML=
    '<div class="loading-placeholder" style="padding:3rem;text-align:center">Running diagnosis…</div>';
  try{
    const res=await fetch(`${API}/reports/${encodeURIComponent(summary.id)}/diagnosis`);
    const d=await res.json();
    const failureName=(d.primaryFailure||'Unknown').replace(/_/g,' ');
    document.getElementById('tabPanel').innerHTML=`
      <div class="diag-card">
        <div class="diag-header">
          <span class="diag-badge ${d.confidence}">${d.confidence}</span>
          <span class="diag-title">${failureName}</span>
        </div>
        <div class="diag-explanation">${d.explanation}</div>
        <div class="diag-metrics">
          <div class="diag-metric"><div class="label">Swarm Kill Share</div><div class="value">${fmtPct(d.swarmKillShare)}</div></div>
          <div class="diag-metric"><div class="label">Heavy Kill Share</div><div class="value">${fmtPct(d.heavyKillShare)}</div></div>
          <div class="diag-metric"><div class="label">Block Efficiency</div><div class="value">${fmtPct(d.blockEfficiency)}</div></div>
          <div class="diag-metric"><div class="label">Vampire Density</div><div class="value">${fmtPct(d.vampireDensity)}</div></div>
          <div class="diag-metric"><div class="label">Ranged Density</div><div class="value">${fmtPct(d.rangedDensity)}</div></div>
          <div class="diag-metric"><div class="label">Life Steal</div><div class="value">${fmtRaw(d.lifeStealRaw)}</div></div>
        </div>
      </div>
      ${d.observations&&d.observations.length?`
        <div class="section-title">Secondary Observations (${d.observations.length})</div>
        <div class="obs-list">${d.observations.map(o=>`
          <div class="obs-item">
            <div class="obs-label">${o.label}</div>
            <div class="obs-detail">${o.detail}</div>
          </div>`).join('')}
        </div>`:''}
      `;
  }catch(e){
    document.getElementById('tabPanel').innerHTML=
      `<div class="empty-state" style="height:auto;padding:3rem"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  }
}


function renderComparePanel(summary){
  const others=allReports.filter(r=>r.id!==summary.id);
  const opts=others.map(r=>`<option value="${r.id}">${r.runType} — T${r.tier} Wave ${r.wave.toLocaleString()}${r.towerEra?' — '+r.towerEra:''}</option>`).join('');
  document.getElementById('tabPanel').innerHTML=`
    <div class="compare-controls">
      <span style="font-size:13px;color:var(--muted)">Compare against:</span>
      <select class="compare-select" id="compareSelect">${opts}</select>
      <button class="btn btn-primary" onclick="runComparison('${summary.id}')">Compare</button>
    </div>
    <div id="compareResult"></div>`;
}

async function runComparison(id1){
  const id2=document.getElementById('compareSelect').value;
  if(!id2)return;
  document.getElementById('compareResult').innerHTML='<div class="loading-placeholder">Comparing…</div>';
  try{
    const res=await fetch(`${API}/reports/${encodeURIComponent(id1)}/comparison/${encodeURIComponent(id2)}`);
    const [r1,r2,delta]=await res.json();
    const lowerBetter=new Set(['DAMAGE_TAKEN.tower','DAMAGE_TAKEN.wall']);
    const sections=[
      ['BATTLE_REPORT',['tier','wave','coinsEarned','coinsPerHour','cellsEarned','cellsPerHour','killedBy','towerEra'],'Battle Report'],
      ['RECORDS',['highestCoinsPerMinute','largestWaveSkip','mostCoinsFromWaveSkip','largestSmartMissileStack','largestGoldenCombo'],'Records'],
      ['DAMAGE',['damageDealt','projectiles','orbs','chainLightning','thorns','landMines','smartMissiles','flameBot','blackHole','deathWave','deathRay'],'Damage'],
      ['DAMAGE_TAKEN',['tower','wall'],'Damage Taken'],
      ['DAMAGE_BLOCKED',['defensePercent','chronoField','chainThunder','flameBot','primordialCollapse'],'Damage Blocked'],
      ['HEALTH_REGENERATED',['lifeSteal','wallHealthRegen','towerHealthRegen'],'Health Regenerated'],
      ['COINS',['coinsEarned','goldenTower','blackHole','goldenBot','deathWave','spotlight'],'Coins'],
      ['CURRENCIES',['cellsEarned','gems','medals','reRollShardsEarned'],'Currencies'],
      ['ENEMIES_DESTROYED_BY',['orbs','chainLightning','landMines','projectiles','smartMissiles','flameBot'],'Enemies Destroyed By'],
    ];
    let html=`<div class="table-section"><table>
      <thead><tr><th>Field</th><th>${id1}</th><th>${id2}</th><th>Delta</th></tr></thead><tbody>`;
    sections.forEach(([sec,fields,title])=>{
      html+=`<tr><td colspan="4" style="background:var(--surface2);font-size:11px;text-transform:uppercase;
        letter-spacing:1px;color:var(--muted);padding:8px 13px">${title}</td></tr>`;
      const s1=(r1.sectionMap||{})[sec]||{};
      const s2=(r2.sectionMap||{})[sec]||{};
      const sd=(delta.sectionMap||{})[sec]||{};
      fields.forEach(f=>{
        const isLower=lowerBetter.has(`${sec}.${f}`);
        const dv=sd[f];
        const dRaw=typeof dv==='object'&&dv!==null?dv.raw:dv;
        const dStr=fmtField(dv);
        let dClass='delta-neu';
        if(dRaw&&dRaw!==0){const good=isLower?dRaw<0:dRaw>0;dClass=good?'delta-pos':'delta-neg';}
        html+=`<tr>
          <td style="color:var(--muted)">${camel(f)}</td>
          <td style="font-family:var(--mono);font-size:13px">${fmtField(s1[f])}</td>
          <td style="font-family:var(--mono);font-size:13px">${fmtField(s2[f])}</td>
          <td class="${dClass}">${dStr}</td>
        </tr>`;
      });
    });
    html+='</tbody></table></div>';
    html+='<div style="height:2rem"></div>';
    document.getElementById('compareResult').innerHTML=html;
  }catch(e){
    document.getElementById('compareResult').innerHTML=`<div style="color:var(--red);padding:1rem">${e.message}</div>`;
  }
}

function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


async function renderCellsView(){
  document.getElementById('mainContent').innerHTML=`
    <div class="report-title" style="margin-bottom:1rem">Cell Income Tracker</div>
    <div class="window-controls">
      <label>Window:</label>
      <input type="range" min="3" max="90" value="30" id="cellDaysSlider" oninput="updateCellDays(this.value)">
      <span id="cellDaysLabel">30 days</span>
    </div>
    <div id="cellsPanel"><div class="loading-placeholder">Loading…</div></div>`;
  loadCells(30);
}

function updateCellDays(val){
  document.getElementById('cellDaysLabel').textContent=val+' days';
  loadCells(val);
}

async function loadCells(days){
  try{
    const res=await fetch(`${API}/analysis/cells?days=${days}`);
    const d=await res.json();
    const maxCph=Math.max(...d.dataPoints.map(p=>p.cellsPerHour),1);
    document.getElementById('cellsPanel').innerHTML=`
      <div class="stat-grid" style="margin-bottom:1.5rem">
        <div class="stat-card"><div class="label">Runs Analyzed</div><div class="value accent">${d.runsAnalyzed}</div></div>
        <div class="stat-card"><div class="label">Avg Cells/Hour</div><div class="value green">${fmtRaw(d.averageCellsPerHour)}</div></div>
        <div class="stat-card"><div class="label">Total Cells Earned</div><div class="value accent">${fmtRaw(d.totalCellsEarned)}</div></div>
        <div class="stat-card"><div class="label">Avg Cells/Run</div><div class="value">${fmtRaw(d.averageCellsPerRun)}</div></div>
      </div>
      <table class="trend-table">
        <thead><tr><th>Date</th><th>Folder</th><th style="text-align:right">Tier</th><th style="text-align:right">Wave</th><th style="text-align:right">Cells Earned</th><th style="text-align:right">Cells/Hour</th><th>Duration</th><th>Relative Cells/Hour</th></tr></thead>
        <tbody>${d.dataPoints.map(p=>`<tr>
          <td>${p.battleDate}</td>
          <td style="color:var(--muted)">${p.folder}</td>
          <td class="val-num">T${p.tier}</td>
          <td class="val-num">${p.wave.toLocaleString()}</td>
          <td class="val-num">${fmtRaw(p.cellsEarned)}</td>
          <td class="val-num">${fmtRaw(p.cellsPerHour)}</td>
          <td style="color:var(--muted)">${fmtDuration(p.realTimeSeconds)}</td>
          <td><div class="bar-fill green" style="width:${Math.round(p.cellsPerHour/maxCph*80)}px;height:5px;border-radius:3px;display:inline-block"></div></td>
        </tr>`).join('')}</tbody>
      </table>
      <div style="height:2rem"></div>`;
  }catch(e){
    document.getElementById('cellsPanel').innerHTML=`<div style="color:var(--red);padding:1rem">${e.message}</div>`;
  }
}

// ── Income Trends ────────────────────────────────────────────────────────

let incomeTrendData=null;

async function renderIncomeTrendView(){
  document.getElementById('mainContent').innerHTML=`
    <div class="report-title" style="margin-bottom:1rem">Income Trends</div>
    <div class="window-controls">
      <label>Window:</label>
      <input type="range" min="7" max="90" value="30" id="incomeDaysSlider" oninput="updateIncomeDays(this.value)">
      <span id="incomeDaysLabel">30 days</span>
      <label style="margin-left:16px;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="incomeMetricToggle" onchange="renderIncomeCharts()">
        Show cumulative earned (instead of rate/hour)
      </label>
    </div>
    <div id="incomeFilters" class="window-controls" style="flex-wrap:wrap;gap:16px;align-items:flex-start">
      <div class="loading-placeholder">Loading filters…</div>
    </div>
    <div id="incomeStats" class="stat-grid" style="margin-bottom:1.5rem"></div>
    <div class="section-title" id="incomeCoinsTitle">Coin Income</div>
    <div id="incomeCoinsChart" class="chart-container"></div>
    <div class="section-title" id="incomeCellsTitle">Cell Income</div>
    <div id="incomeCellsChart" class="chart-container"></div>`;
  await loadIncomeFilters();
}

function updateIncomeDays(val){
  document.getElementById('incomeDaysLabel').textContent=val+' days';
  loadIncomeTrend(val);
}

function toggleFilterDropdown(id){
  const dd=document.getElementById(id);
  const isOpen=dd.classList.contains('open');
  document.querySelectorAll('.filter-dropdown.open').forEach(d=>d.classList.remove('open'));
  if(!isOpen)dd.classList.add('open');
}

async function loadIncomeFilters(){
  try{
    const res=await fetch(`${API}/analysis/income-trend/filters`);
    const f=await res.json();
    document.getElementById('incomeFilters').innerHTML=`
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Tier</div>
        <div class="filter-dropdown" id="incomeTierDropdown">
          <button type="button" class="filter-dropdown-btn" id="incomeTierDropdownBtn" onclick="toggleFilterDropdown('incomeTierDropdown')">All Tiers</button>
          <div class="filter-dropdown-panel">
            ${f.tiers.map(t=>`<label class="filter-chip">
              <input type="checkbox" class="income-tier-filter" value="${t}" onchange="onIncomeFilterChange()">
              T${t}
            </label>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Run Type</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${f.runTypes.map(rt=>`<label class="filter-chip">
            <input type="checkbox" class="income-runtype-filter" value="${rt}" ${rt.toLowerCase()==='farming'?'checked':''} onchange="onIncomeFilterChange()">
            ${rt}
          </label>`).join('')}
        </div>
      </div>`;
    await selectDefaultIncomeTier(f.tiers);
  }catch(e){
    document.getElementById('incomeFilters').innerHTML=`<div style="color:var(--red)">${e.message}</div>`;
  }
}

async function selectDefaultIncomeTier(tiers){
  const days=document.getElementById('incomeDaysSlider').value;
  try{
    const res=await fetch(`${API}/analysis/income-trend?days=${days}&runType=Farming`);
    const data=await res.json();
    const counts={};
    data.dataPoints.forEach(p=>{counts[p.tier]=(counts[p.tier]||0)+1;});
    let bestTier=null,bestCount=0;
    for(const t of tiers){
      const c=counts[t]||0;
      if(c>bestCount){bestCount=c;bestTier=t;}
    }
    if(bestTier!=null){
      const cb=document.querySelector(`.income-tier-filter[value="${bestTier}"]`);
      if(cb)cb.checked=true;
    }
  }catch(e){
    // fall back to no tier filter (all tiers) if the probe request fails
  }
  updateIncomeTierButtonLabel();
  await loadIncomeTrend(days);
}

function updateIncomeTierButtonLabel(){
  const btn=document.getElementById('incomeTierDropdownBtn');
  if(!btn)return;
  const checked=[...document.querySelectorAll('.income-tier-filter:checked')].map(el=>el.value);
  btn.textContent=checked.length===0?'All Tiers':checked.length===1?`T${checked[0]}`:`${checked.length} Tiers`;
}

function onIncomeFilterChange(){
  updateIncomeTierButtonLabel();
  loadIncomeTrend(document.getElementById('incomeDaysSlider').value);
}

function buildIncomeFilterPillsHtml(){
  const tiers=[...document.querySelectorAll('.income-tier-filter:checked')].map(el=>`T${el.value}`);
  const runTypes=[...document.querySelectorAll('.income-runtype-filter:checked')].map(el=>el.value);
  const pills=[...(tiers.length?tiers:['All Tiers']), ...(runTypes.length?runTypes:['All Run Types'])];
  return pills.map(p=>`<span class="filter-pill">${p}</span>`).join('');
}

async function loadIncomeTrend(days){
  try{
    const tiers=[...document.querySelectorAll('.income-tier-filter:checked')].map(el=>el.value);
    const runTypes=[...document.querySelectorAll('.income-runtype-filter:checked')].map(el=>el.value);
    const params=new URLSearchParams({days});
    tiers.forEach(t=>params.append('tier',t));
    runTypes.forEach(rt=>params.append('runType',rt));

    const res=await fetch(`${API}/analysis/income-trend?${params.toString()}`);
    incomeTrendData=await res.json();
    renderIncomeCharts();
  }catch(e){
    document.getElementById('incomeCoinsChart').innerHTML=`<div style="color:var(--red);padding:1rem">${e.message}</div>`;
  }
}

function renderIncomeCharts(){
  if(!incomeTrendData)return;
  const cumulative=document.getElementById('incomeMetricToggle').checked;
  const points=incomeTrendData.dataPoints;
  const pillsHtml=buildIncomeFilterPillsHtml();
  document.getElementById('incomeCoinsTitle').innerHTML=`Coin Income${pillsHtml}`;
  document.getElementById('incomeCellsTitle').innerHTML=`Cell Income${pillsHtml}`;

  const totalCoins=points.reduce((s,p)=>s+p.coinsEarned,0);
  const totalCells=points.reduce((s,p)=>s+p.cellsEarned,0);
  const avgCph=points.length?points.reduce((s,p)=>s+p.coinsPerHour,0)/points.length:0;
  const avgCellsph=points.length?points.reduce((s,p)=>s+p.cellsPerHour,0)/points.length:0;
  document.getElementById('incomeStats').innerHTML=`
    <div class="stat-card"><div class="label">Runs Analyzed</div><div class="value accent">${incomeTrendData.runsAnalyzed}</div></div>
    <div class="stat-card"><div class="label">Total Coins Earned</div><div class="value gold">${fmtCoins(totalCoins)}</div></div>
    <div class="stat-card"><div class="label">Total Cells Earned</div><div class="value green">${fmtRaw(totalCells)}</div></div>
    <div class="stat-card"><div class="label">Avg Coins/Hour</div><div class="value gold">${fmtCoins(avgCph)}</div></div>
    <div class="stat-card"><div class="label">Avg Cells/Hour</div><div class="value green">${fmtRaw(avgCellsph)}</div></div>`;

  drawLineChart('incomeCoinsChart', points,
      p=>cumulative?p.coinsEarned:p.coinsPerHour, '--gold', cumulative?'Coins Earned':'Coins / Hour');
  drawLineChart('incomeCellsChart', points,
      p=>cumulative?p.cellsEarned:p.cellsPerHour, '--green', cumulative?'Cells Earned':'Cells / Hour');
}

function drawLineChart(containerId, points, accessor, colorVar, yLabel){
  points=[...points].sort((a,b)=>a.battleEpochSeconds-b.battleEpochSeconds);
  const container=document.getElementById(containerId);
  container.innerHTML='';
  const width=container.clientWidth||800, height=260;
  const margin={top:16,right:24,bottom:30,left:70};

  if(!points.length){
    container.innerHTML=`<div class="loading-placeholder">No runs in this window</div>`;
    return;
  }

  const color=getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim()||'#4f8ef7';
  const muted=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();

  const svg=d3.select(container).append('svg')
      .attr('viewBox',`0 0 ${width} ${height}`)
      .attr('width','100%').attr('height',height);

  const x=d3.scaleTime()
      .domain(d3.extent(points,p=>new Date(p.battleEpochSeconds*1000)))
      .range([margin.left,width-margin.right]);
  const y=d3.scaleLinear()
      .domain([0,d3.max(points,accessor)*1.1||1])
      .range([height-margin.bottom,margin.top]);

  svg.append('g')
      .attr('transform',`translate(0,${height-margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6))
      .call(g=>g.selectAll('text').attr('fill',muted).attr('font-size','11px'))
      .call(g=>g.selectAll('line,path').attr('stroke',muted).attr('stroke-opacity',0.3));

  svg.append('g')
      .attr('transform',`translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(v=>fmtRaw(v)))
      .call(g=>g.selectAll('text').attr('fill',muted).attr('font-size','11px'))
      .call(g=>g.selectAll('line,path').attr('stroke',muted).attr('stroke-opacity',0.3));

  const line=d3.line()
      .x(p=>x(new Date(p.battleEpochSeconds*1000)))
      .y(p=>y(accessor(p)));

  svg.append('path')
      .datum(points)
      .attr('fill','none')
      .attr('stroke',color)
      .attr('stroke-width',2)
      .attr('d',line);

  svg.append('g').selectAll('circle')
      .data(points).enter().append('circle')
      .attr('cx',p=>x(new Date(p.battleEpochSeconds*1000)))
      .attr('cy',p=>y(accessor(p)))
      .attr('r',3.5)
      .attr('fill',color)
      .append('title')
      .text(p=>`${p.battleDate}  T${p.tier}  ${p.runType}\n${yLabel}: ${fmtRaw(accessor(p))}`);
}

async function renderLabSpeedView(){
  document.getElementById('mainContent').innerHTML=`
    <div class="report-title" style="margin-bottom:1rem">Lab Speed Affordability</div>
    <div class="window-controls">
      <label>Window:</label>
      <input type="range" min="3" max="90" value="30" id="labDaysSlider" oninput="updateLabDays(this.value)">
      <span id="labDaysLabel">30 days</span>
    </div>
    <div class="window-controls" style="margin-top:-1rem;flex-wrap:wrap;gap:16px">
      <div style="display:flex;align-items:center;gap:8px">
        <label>Cells on Hand:</label>
        <input type="number" id="labCellsOnHand" min="0" value="0"
          style="width:130px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
                 color:var(--text);padding:4px 8px;font-size:13px;font-family:var(--mono)"
          onchange="loadLabSpeed(document.getElementById('labDaysSlider').value)">
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label>Safety Buffer:</label>
        <input type="number" id="labSafetyBuffer" min="0" value="0"
          style="width:130px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
                 color:var(--text);padding:4px 8px;font-size:13px;font-family:var(--mono)"
          onchange="loadLabSpeed(document.getElementById('labDaysSlider').value)">
      </div>
    </div>
    <div id="labPanel"><div class="loading-placeholder">Loading…</div></div>`;
  loadLabSpeed(30);
}

function updateLabDays(val){
  document.getElementById('labDaysLabel').textContent=val+' days';
  loadLabSpeed(val);
}

async function loadLabSpeed(days){
  try{
    const cellsOnHand=Number(document.getElementById('labCellsOnHand')?.value)||0;
    const safetyBuffer=Number(document.getElementById('labSafetyBuffer')?.value)||0;
    const res=await fetch(`${API}/analysis/lab-speed?days=${days}&cellsOnHand=${cellsOnHand}&safetyBuffer=${safetyBuffer}`);
    const d=await res.json();
    const opt=d.optimalCombination;
    const farm=d.farmingCombination;
    const dt=d.deadTimeStats;
    const cr=d.cellReserve;
    const fmtHrs=h=>{if(h==null||h<0)return '—';if(h<1)return Math.round(h*60)+'m';if(h<24)return h.toFixed(1)+'h';return (h/24).toFixed(1)+'d';};
    document.getElementById('labPanel').innerHTML=`
      <div class="stat-grid" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">Runs Analyzed</div><div class="value accent">${d.runsAnalyzed}</div></div>
        <div class="stat-card"><div class="label">Farming CPH</div><div class="value green">${fmtRaw(d.averageCellsPerHour)}</div></div>
        <div class="stat-card"><div class="label">Effective CPH</div><div class="value ${d.effectiveCellsPerHour>=d.averageCellsPerHour*0.9?'green':'gold'}">${fmtRaw(d.effectiveCellsPerHour)}</div></div>
        <div class="stat-card"><div class="label">Net Cells/Hour</div><div class="value ${opt.netCellsPerHour>=0?'green':'red'}">${fmtRaw(opt.netCellsPerHour)}</div></div>
      </div>
      <div class="optimal-card" style="margin-bottom:1rem">
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Dead Time · ${fmtHrs(dt.hoursSinceLastRun)} since last run</div>
        <div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:13px;margin-bottom:8px">
          <span>Active: <b style="color:var(--text);font-family:var(--mono)">${fmtHrs(dt.totalActiveHours)}</b></span>
          <span>Dead: <b style="color:${dt.deadTimePercent>50?'var(--red)':'var(--muted)'};font-family:var(--mono)">${fmtHrs(dt.totalDeadHours)}</b></span>
          <span>Calendar: <b style="color:var(--text);font-family:var(--mono)">${fmtHrs(dt.totalCalendarHours)}</b></span>
          <span>Dead %: <b style="color:${dt.deadTimePercent>50?'var(--red)':'var(--muted)'};font-family:var(--mono)">${dt.deadTimePercent.toFixed(1)}%</b></span>
        </div>
        <div style="font-size:11px;color:var(--muted)">Effective CPH = cells earned ÷ calendar time (farming + idle). Affordability uses Effective CPH.</div>
      </div>
      <div class="optimal-card">
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Optimal Combination</div>
        <div class="optimal-slots">${opt.slots.map((s,i)=>`
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Slot ${i+1}</div>
            <div class="optimal-slot-badge ${s==='None'?'none':''}">${s}</div>
          </div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--muted);margin-top:8px">
          Total cost: <span style="color:var(--text);font-family:var(--mono)">${fmtRaw(opt.totalCostPerHour)}/hr</span> ·
          <span style="color:var(--text);font-family:var(--mono)">${fmtRaw(opt.totalCostPerDay)}/day</span> ·
          Net: <span style="color:${opt.netCellsPerHour>=0?'var(--green)':'var(--red)'};font-family:var(--mono)">${fmtRaw(opt.netCellsPerHour)}/hr</span>
        </div>
      </div>
      <div class="optimal-card" style="border-color:rgba(245,200,66,0.3)">
        <div style="font-size:12px;color:var(--gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
          Farming Speeds <span style="color:var(--muted);font-weight:400">(${fmtRaw(d.averageCellsPerHour)} CPH while active)</span>
        </div>
        <div class="optimal-slots">${farm.slots.map((s,i)=>`
          <div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Slot ${i+1}</div>
            <div class="optimal-slot-badge ${s==='None'?'none':''}">${s}</div>
          </div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--muted);margin-top:8px">
          Total cost: <span style="color:var(--text);font-family:var(--mono)">${fmtRaw(farm.totalCostPerHour)}/hr</span> ·
          <span style="color:var(--text);font-family:var(--mono)">${fmtRaw(farm.totalCostPerDay)}/day</span>
        </div>
        ${cr.burnRatePerHour>0?`
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
            Draws down reserves at <span style="color:var(--gold);font-family:var(--mono)">${fmtRaw(cr.burnRatePerHour)}/hr</span>
            (farming cost − effective earn rate)
          </div>
          ${cr.cellsOnHand>0?`
          <div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:13px">
            <span>Spendable: <b style="color:var(--text);font-family:var(--mono)">${fmtRaw(cr.spendableCells)}</b></span>
            <span>Sustains for: <b style="color:${cr.burndownHours!=null&&cr.burndownHours<24?'var(--red)':'var(--gold)'};font-family:var(--mono)">${fmtHrs(cr.burndownHours)}</b></span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:6px">After burndown, drop to Sustainable Speeds above.</div>
          `:`<div style="font-size:12px;color:var(--muted)">Enter cells on hand above to see burndown time.</div>`}
        </div>`:`
        <div style="margin-top:8px;font-size:12px;color:var(--green)">Farming speeds are sustainable indefinitely.</div>`}
      </div>
      <div class="section-title">Per-Slot Breakdown</div>
      <div class="lab-grid">${d.slots.map(slot=>`
        <div class="lab-slot">
          <div class="lab-slot-title">Slot ${slot.slot}</div>
          <div class="lab-slot-max ${slot.maxAffordableSpeed==='None'?'none':''}">${slot.maxAffordableSpeed}</div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:6px">max affordable</div>
          ${slot.options.map(o=>`
            <div class="speed-row ${o.affordable?'affordable':'unaffordable'}">
              <span class="spd">${o.speed}</span>
              <span class="cost">${fmtRaw(o.costPerHour)}/hr</span>
            </div>`).join('')}
        </div>`).join('')}
      </div>
      <div style="height:2rem"></div>`;
  }catch(e){
    document.getElementById('labPanel').innerHTML=`<div style="color:var(--red);padding:1rem">${e.message}</div>`;
  }
}

let _shardModuleLevels = {cannon:1,armor:1,generator:1,core:1};

function shardLevelInputs(moduleLevels){
  const savedTgt = k => localStorage.getItem('shardTarget_' + k) || '161';
  const savedDiscount = () => localStorage.getItem('shardDiscountLevel') || '0';
  const numInput = (id, min, max, val, onChange) =>
    `<input type="number" id="${id}" min="${min}" max="${max}" value="${val}"
      style="width:70px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
             color:var(--text);padding:4px 8px;font-size:13px;font-family:var(--mono)"
      onchange="${onChange}">`;
  const typeLabel = {'cannon':'Cannon','armor':'Armor','generator':'Generator','core':'Core'};
  return `
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:-0.5rem;margin-bottom:0.5rem">
      <div style="display:grid;grid-template-columns:repeat(4,auto);gap:8px 20px;align-items:center">
        ${['cannon','armor','generator','core'].map(t=>`
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">${typeLabel[t]}</div>
            <div style="display:flex;align-items:center;gap:6px">
              <label style="font-size:12px;color:var(--muted)">Cur:</label>
              <span id="shardLvl_${t}" style="width:70px;display:inline-block;background:var(--surface2);border:1px solid var(--border);
                border-radius:var(--radius);color:var(--muted);padding:4px 8px;font-size:13px;font-family:var(--mono);
                text-align:right" title="From Modules table (max level across owned ${typeLabel[t]} modules)">${moduleLevels[t]}</span>
              <label style="font-size:12px;color:var(--muted)">→ Tgt:</label>
              ${numInput('shardTgt_'+t, 2,300,savedTgt(t), `localStorage.setItem('shardTarget_${t}',this.value);reloadShards()`)}
            </div>
          </div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px;border-top:1px solid var(--border);padding-top:8px">
        <label style="font-size:12px" title="Module Shard Cost lab level (0–30, each level = 1% discount)">Shard Cost Lab Lvl:</label>
        ${numInput('shardDiscountLvl',0,30,savedDiscount(),`localStorage.setItem('shardDiscountLevel',this.value);reloadShards()`)}
        <span id="shardDiscountPct" style="font-size:12px;color:var(--gold)">${savedDiscount()}%</span>
      </div>
    </div>`;
}

function reloadShards(){
  const disc=Number(document.getElementById('shardDiscountLvl')?.value)||0;
  document.getElementById('shardDiscountPct').textContent=disc+'%';
  loadShards(document.getElementById('shardDaysSlider').value);
}

async function renderShardsView(){
  const mods = await fetch(`${API}/modules`).then(r=>r.json()).catch(()=>[]);
  const maxByType = {cannon:1,armor:1,generator:1,core:1};
  for(const mod of mods){
    const t = mod.type?.toLowerCase();
    if(t in maxByType && mod.level > maxByType[t]) maxByType[t] = mod.level;
  }
  _shardModuleLevels = maxByType;

  document.getElementById('mainContent').innerHTML=`
    <div class="report-title" style="margin-bottom:1rem">Shard Earning Rate</div>
    <div class="window-controls" style="margin-bottom:0.5rem">
      <label>Window:</label>
      <input type="range" min="3" max="90" value="30" id="shardDaysSlider" oninput="updateShardDays(this.value)">
      <span id="shardDaysLabel">30 days</span>
      <label style="margin-left:1rem">Source:</label>
      <select id="shardDataSource" onchange="reloadShards()"
        style="background:var(--surface);border:1px solid var(--border2);border-radius:6px;
               color:var(--text);font-size:12px;padding:4px 8px;font-family:var(--font)">
        <option value="BATTLE_REPORTS">Battle Reports (farming runs only, fetched shards)</option>
        <option value="SNAPSHOTS">Currency Snapshots (all sources blended, all run types)</option>
      </select>
    </div>
    <div id="shardSourceNote" style="font-size:12px;color:var(--muted);margin-bottom:0.75rem">
      Farming runs only · excludes Tournament, Dissonance, Event
    </div>
    ${shardLevelInputs(_shardModuleLevels)}
    <div id="shardsPanel"><div class="loading-placeholder">Loading…</div></div>`;
  loadShards(30);
}

function updateShardDays(val){
  document.getElementById('shardDaysLabel').textContent=val+' days';
  loadShards(val);
}

async function loadShards(days){
  const lvl=t=>_shardModuleLevels[t]||1;
  const tgt=t=>Number(document.getElementById('shardTgt_'+t)?.value)||161;
  const cannon=lvl('cannon'),armor=lvl('armor'),generator=lvl('generator'),core=lvl('core');
  const cannonTgt=tgt('cannon'),armorTgt=tgt('armor'),generatorTgt=tgt('generator'),coreTgt=tgt('core');
  const discount=Number(document.getElementById('shardDiscountLvl')?.value)||0;
  const dataSource=document.getElementById('shardDataSource')?.value||'BATTLE_REPORTS';
  const isSnapshots=dataSource==='SNAPSHOTS';

  // Update source note
  const noteEl=document.getElementById('shardSourceNote');
  if(noteEl){
    if(isSnapshots){
      // Fetch snapshot count and warn if low
      try{
        const cnt=await fetch(`${API}/analysis/shards/snapshot-count`).then(r=>r.json());
        noteEl.innerHTML=cnt<5
          ? `<span style="color:var(--orange)">⚠ Only ${cnt} snapshot${cnt===1?'':'s'} on record — accumulate at least 5 via Export Context before relying on this mode (need 4 intervals for reliable 2σ filtering).</span>`
          : `<span style="color:var(--green)">✓ ${cnt} snapshots · rates computed from currency inventory deltas</span>`;
      }catch(e){noteEl.textContent='Currency Snapshots mode';}
    } else {
      noteEl.textContent='Farming runs only · excludes Tournament, Dissonance, Event';
    }
  }

  try{
    const url=isSnapshots
      ? `${API}/analysis/shards?days=${days}`
          +`&cannonLevel=${cannon}&armorLevel=${armor}&generatorLevel=${generator}&coreLevel=${core}`
          +`&shardCostDiscountLevel=${discount}`
          +`&targetLevel=${cannonTgt}`
          +`&dataSource=SNAPSHOTS`
      : `${API}/analysis/shards?days=${days}`
          +`&cannonLevel=${cannon}&armorLevel=${armor}&generatorLevel=${generator}&coreLevel=${core}`
          +`&shardCostDiscountLevel=${discount}`
          +`&cannonTargetLevel=${cannonTgt}&armorTargetLevel=${armorTgt}&generatorTargetLevel=${generatorTgt}&coreTargetLevel=${coreTgt}`
          +`&dataSource=BATTLE_REPORTS`;
    const res=await fetch(url);
    const d=await res.json();
    const zeroShards={cannon:0,armor:0,generator:0,core:0};
    const a=d.averages??zeroShards, sd=d.stdDev??zeroShards, pr=d.projections??{};
    const pts=d.dataPoints??[];

    const fmtH=h=>{
      if(h==null||h<0)return '—';
      if(h<1)return Math.round(h*60)+'m';
      if(h<24)return h.toFixed(1)+'h';
      return (h/24).toFixed(1)+'d';
    };

    const discountBadge=proj=>proj.discountLevel>0
      ? `<span style="color:var(--green);font-size:10px"> (${proj.discountLevel}% off)</span>`
      : '';

    const nextLine=proj=>{
      const hasDiscount=proj.discountLevel>0 && proj.shardsToNextLevelEffective!==proj.shardsToNextLevelBase;
      return `next upgrade: `
        + (hasDiscount
            ? `<span style="text-decoration:line-through;color:var(--muted)">${proj.shardsToNextLevelBase.toLocaleString()}</span> `
              + `<b style="color:var(--gold)">${proj.shardsToNextLevelEffective.toLocaleString()}</b>${discountBadge(proj)}`
            : `<b style="color:var(--gold)">${proj.shardsToNextLevelEffective.toLocaleString()}</b>`)
        + ` · <b style="color:var(--gold)">${fmtH(proj.hoursToNextLevel)}</b>`;
    };

    const lvl161Line=proj=>{
      if(proj.shardsToTargetLevelEffective<=0) return `<span style="color:var(--green)">✓ Already at Lvl ${proj.targetLevel}+</span>`;
      const hasDiscount=proj.discountLevel>0 && proj.shardsToTargetLevelEffective!==proj.shardsToTargetLevelBase;
      return `To <b style="color:var(--accent2)">Lvl ${proj.targetLevel}</b>: `
        + (hasDiscount
            ? `<span style="text-decoration:line-through;color:var(--muted)">${proj.shardsToTargetLevelBase.toLocaleString()}</span> `
              + `<b style="color:var(--accent)">${proj.shardsToTargetLevelEffective.toLocaleString()}</b>${discountBadge(proj)}`
            : `<b style="color:var(--accent)">${proj.shardsToTargetLevelEffective.toLocaleString()}</b>`)
        + ` · <b style="color:var(--accent)">${fmtH(proj.hoursToTargetLevel)}</b>`;
    };

    const projCard=(label,avg,std,proj)=>`
      <div class="stat-card">
        <div class="label">${label} · Avg/hr</div>
        <div class="value green">${fmtRaw(avg)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">±${fmtRaw(std)} std dev</div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.8">
          <b style="color:var(--text)">Lvl ${proj.currentLevel}</b> · ${nextLine(proj)}<br>
          ${lvl161Line(proj)}
        </div>
      </div>`;

    const maxRate=Math.max(...pts.flatMap(p=>[p.cannonPerHour,p.armorPerHour,p.generatorPerHour,p.corePerHour]),1);

    document.getElementById('shardsPanel').innerHTML=`
      <div class="stat-grid" style="margin-bottom:1.5rem">
        <div class="stat-card"><div class="label">Runs Analyzed</div><div class="value accent">${d.runsAnalyzed}</div></div>
        ${projCard('Cannon',   a.cannon,    sd.cannon,    pr.cannon)}
        ${projCard('Armor',    a.armor,     sd.armor,     pr.armor)}
        ${projCard('Generator',a.generator, sd.generator, pr.generator)}
        ${projCard('Core',     a.core,      sd.core,      pr.core)}
      </div>
      <table class="trend-table">
        <thead><tr>
          <th>Date</th><th style="text-align:right">Tier</th><th style="text-align:right">Wave</th>
          <th style="text-align:right">Cannon/hr</th><th style="text-align:right">Armor/hr</th>
          <th style="text-align:right">Generator/hr</th><th style="text-align:right">Core/hr</th>
          <th>Duration</th><th>Best Rate</th>
        </tr></thead>
        <tbody>${pts.map(p=>{
          const best=Math.max(p.cannonPerHour,p.armorPerHour,p.generatorPerHour,p.corePerHour);
          return `<tr>
            <td>${p.battleDate}</td>
            <td class="val-num">T${p.tier}</td>
            <td class="val-num">${p.wave.toLocaleString()}</td>
            <td class="val-num">${fmtRaw(p.cannonPerHour)}</td>
            <td class="val-num">${fmtRaw(p.armorPerHour)}</td>
            <td class="val-num">${fmtRaw(p.generatorPerHour)}</td>
            <td class="val-num">${fmtRaw(p.corePerHour)}</td>
            <td style="color:var(--muted)">${fmtDuration(p.realTimeSeconds)}</td>
            <td><div class="bar-fill green" style="width:${Math.round(best/maxRate*80)}px;height:5px;border-radius:3px;display:inline-block"></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <div style="height:2rem"></div>`;
  }catch(e){
    document.getElementById('shardsPanel').innerHTML=`<div style="color:var(--red);padding:1rem">${e.message}</div>`;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function raw(v){if(v==null)return 0;if(typeof v==='object'&&'raw'in v)return v.raw;return Number(v)||0;}
function disp(v){if(v==null)return '0';if(typeof v==='object'&&'display'in v)return v.display;return String(v);}
function fmtField(v){
  if(v==null)return '—';
  if(typeof v==='object'&&'display'in v)return v.display;
  if(typeof v==='number')return v.toLocaleString();
  return String(v);
}
function fmtRaw(n){
  if(n==null||n===''||isNaN(n))return '0';
  n=Number(n);
  const a=Math.abs(n);
  if(a>=1e33)return(n/1e33).toFixed(2)+'d'; if(a>=1e30)return(n/1e30).toFixed(2)+'N';
  if(a>=1e27)return(n/1e27).toFixed(2)+'O'; if(a>=1e24)return(n/1e24).toFixed(2)+'S';
  if(a>=1e21)return(n/1e21).toFixed(2)+'s'; if(a>=1e18)return(n/1e18).toFixed(2)+'Q';
  if(a>=1e15)return(n/1e15).toFixed(2)+'q'; if(a>=1e12)return(n/1e12).toFixed(2)+'T';
  if(a>=1e9)return(n/1e9).toFixed(2)+'B';   if(a>=1e6)return(n/1e6).toFixed(2)+'M';
  if(a>=1e3)return(n/1e3).toFixed(2)+'K';
  return Number.isInteger(n)?n.toString():n.toFixed(2);
}
function fmtDuration(s){
  if(s==null) return '—';
  s = Math.round(s);
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60), sec=s%60;
  if(d>0) return `${d}d ${h}h ${m}m`;
  if(h>0) return `${h}h ${m}m`;
  if(m>0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtCoins(n){
  if(n==null) return '—';
  if(n>=1e21) return (n/1e21).toFixed(2)+'Sx';
  if(n>=1e18) return (n/1e18).toFixed(2)+'Qi';
  if(n>=1e15) return (n/1e15).toFixed(2)+'Qa';
  if(n>=1e12) return (n/1e12).toFixed(2)+'T';
  if(n>=1e9)  return (n/1e9).toFixed(2)+'B';
  if(n>=1e6)  return (n/1e6).toFixed(2)+'M';
  if(n>=1e3)  return (n/1e3).toFixed(1)+'K';
  return n.toLocaleString();
}
function fmtPct(v){return v!=null?(v*100).toFixed(1)+'%':'—';}
function pct(v,total){return total?Math.round((v/total)*100):0;}
function camel(s){return s.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());}

// ── UW Tracker ─────────────────────────────────────────────────────────────

const UW_COLORS={
  CL:'#4facf7', SM:'#7c9fcf', DW:'#f26b6b', CF:'#3dd68c',
  ILM:'#a875f7', GT:'#f5c842', PS:'#6bcf7c', BH:'#6b9ef2', SP:'#d0d0d0'
};

const UW_FMT={
  'Damage':      v=>`x${fmtUwN(v)}`,
  'Quantity':    v=>`x${fmtUwN(v)}`,
  'Chance':      v=>`${v}%`,
  'Duration':    v=>`${fmtUwN(v)}s`,
  '-Speed':      v=>`${fmtUwN(v)}%`,
  'Cooldown':    v=>`${fmtUwN(v)}s`,
  'Multiplier':  v=>`x${v}`,
  'Angle':       v=>`${fmtUwN(v)}°`,
  'Size':        v=>`${fmtUwN(v)}m`,
  'Smite':       v=>`${v}%`,
  'Cover Fire':  v=>`${fmtUwN(v)}s`,
  'Kill Wall':   v=>`x${fmtUwN(v)}`,
  'Chrono Loop': v=>`${v} r/2s`,
  'Charged Mines':v=>`${v}/s`,
  'Golden Combo':v=>`${v}%`,
  'Death Creep': v=>`+${fmtUwN(v)}%`,
  'Consume':     v=>`${v}%`,
  'Light Range': v=>`x${v}`
};
function fmtUwN(v){return Number.isInteger(v)?v.toLocaleString():v;}
function fmtStatVal(label,val){const f=UW_FMT[label];return f?f(val):String(val);}
// callTpl: a string like 'setStatLevel(42,__V__)' — __V__ is replaced with the value
function mkSpin(val,min,max,disabled,callTpl){
  const w=disabled?'spin-wrap spin-disabled':'spin-wrap';
  const call=v=>callTpl.replace('__V__',v);
  const decClick=`var i=this.nextElementSibling,v=Math.max(${min},(parseInt(i.value)||0)-1);i.value=v;${call('v')}`;
  const incClick=`var i=this.previousElementSibling,v=Math.min(${max},(parseInt(i.value)||0)+1);i.value=v;${call('v')}`;
  return `<div class="${w}">
    <button class="spin-btn" tabindex="-1" onclick="${decClick}">−</button>
    <input type="text" inputmode="numeric" class="spin-val" value="${val}"
      onblur="${call(`Math.min(Math.max(parseInt(this.value)||0,${min}),${max})`)}"
      onkeydown="if(event.key==='Enter')this.blur()">
    <button class="spin-btn" tabindex="-1" onclick="${incClick}">+</button>
  </div>`;
}

let uwHidden=new Set(JSON.parse(localStorage.getItem('uw-hidden')||'[]'));
let uwCache=null;
function updateUwSummaryChips(uws){
  const totalInvested=uws.flatMap(u=>u.stats).reduce((s,st)=>s+st.stonesInvested,0);
  const totalNextAll=uws.flatMap(u=>u.stats).reduce((s,st)=>s+st.stonesToMax,0);
  const totalToTargets=uws.flatMap(u=>u.stats).reduce((s,st)=>s+st.stonesToTarget,0);
  const unlocked=uws.filter(u=>u.unlocked).length;
  const el=id=>document.getElementById(id);
  if(el('uw-chip-unlocked'))el('uw-chip-unlocked').textContent=`${unlocked} / 9`;
  if(el('uw-chip-invested'))el('uw-chip-invested').textContent=totalInvested.toLocaleString();
  if(el('uw-chip-to-targets'))el('uw-chip-to-targets').textContent=totalToTargets.toLocaleString();
  if(el('uw-chip-to-max'))el('uw-chip-to-max').textContent=totalNextAll.toLocaleString();
}
async function setStatLevelSpin(statId,level){
  saveUwScroll();
  await fetch(`${API}/uw/stat/${statId}/level`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({level})});
  const res=await fetch(`${API}/uw`);
  const uws=await res.json();
  uwCache=uws;
  const uw=uws.find(u=>u.stats.some(s=>s.statId===statId));
  if(uw){const wrap=document.querySelector(`.uw-card-wrap[data-code="${uw.code}"]`);if(wrap)wrap.innerHTML=renderUwCard(uw);}
  updateUwSummaryChips(uws);
  restoreUwScroll();
}
async function setTargetLevelSpin(statId,level){
  saveUwScroll();
  await fetch(`${API}/uw/stat/${statId}/target-level`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({level})});
  const res=await fetch(`${API}/uw`);
  const uws=await res.json();
  uwCache=uws;
  const uw=uws.find(u=>u.stats.some(s=>s.statId===statId));
  if(uw){const wrap=document.querySelector(`.uw-card-wrap[data-code="${uw.code}"]`);if(wrap)wrap.innerHTML=renderUwCard(uw);}
  updateUwSummaryChips(uws);
  restoreUwScroll();
}
function uwToggleHidden(code){
  if(uwHidden.has(code))uwHidden.delete(code);else uwHidden.add(code);
  localStorage.setItem('uw-hidden',JSON.stringify([...uwHidden]));
  document.querySelectorAll('.uw-filter-pill').forEach(p=>{
    p.classList.toggle('hidden-uw',uwHidden.has(p.dataset.code));
  });
  document.querySelectorAll('.uw-card-wrap').forEach(w=>{
    w.style.display=uwHidden.has(w.dataset.code)?'none':'';
  });
}

async function renderUwView(){
  document.getElementById('mainContent').innerHTML=
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading UW data…</div>';
  try{
    const res=await fetch(`${API}/uw`);
    if(!res.ok)throw new Error(res.statusText);
    const uws=await res.json();
    const totalInvested=uws.flatMap(u=>u.stats).reduce((s,st)=>s+st.stonesInvested,0);
    const totalNextAll=uws.flatMap(u=>u.stats).reduce((s,st)=>s+st.stonesToMax,0);
    const totalToTargets=uws.flatMap(u=>u.stats).reduce((s,st)=>s+st.stonesToTarget,0);
    const unlocked=uws.filter(u=>u.unlocked).length;
    const filterPills=uws.map(u=>{
      const color=UW_COLORS[u.code]||'var(--accent)';
      const hidden=uwHidden.has(u.code);
      return `<span class="uw-filter-pill${hidden?' hidden-uw':''}" data-code="${u.code}"
        style="border-color:${color};color:${color}" onclick="uwToggleHidden('${u.code}')">
        ${u.name}</span>`;
    }).join('');
    document.getElementById('mainContent').innerHTML=`
      <div class="report-title" style="margin-bottom:1rem">Ultimate Weapons</div>
      <div class="uw-stones-total">
        <div class="uw-stones-chip"><div class="lbl">UWs Unlocked</div><div class="val" id="uw-chip-unlocked">${unlocked} / 9</div></div>
        <div class="uw-stones-chip"><div class="lbl">Total Stones Invested</div><div class="val" id="uw-chip-invested">${totalInvested.toLocaleString()}</div></div>
        <div class="uw-stones-chip"><div class="lbl">Stones to Planned Targets</div><div class="val" style="color:var(--orange)" id="uw-chip-to-targets">${totalToTargets.toLocaleString()}</div></div>
        <div class="uw-stones-chip"><div class="lbl">Stones to Max Everything</div><div class="val" id="uw-chip-to-max">${totalNextAll.toLocaleString()}</div></div>
      </div>
      <div class="uw-filter-bar"><span class="uw-filter-lbl">Show:</span>${filterPills}</div>
      <div class="uw-grid">${uws.map(u=>`<div class="uw-card-wrap" data-code="${u.code}" style="${uwHidden.has(u.code)?'display:none':''}">${renderUwCard(u)}</div>`).join('')}</div>`;
  }catch(e){
    document.getElementById('mainContent').innerHTML=
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function renderUwCard(uw){
  const color=UW_COLORS[uw.code]||'var(--accent)';
  const baseStats=uw.stats.filter(s=>s.statKey!=='UW_PLUS');
  const uwPlus=uw.stats.find(s=>s.statKey==='UW_PLUS');
  const uwStonesToTarget=uw.stats.reduce((s,st)=>s+st.stonesToTarget,0);
  return `
    <div class="uw-card" style="border-top:3px solid ${color}">
      <div class="uw-card-header">
        <span class="uw-name" style="color:${color}">${uw.name}</span>
        <label class="uw-toggle">
          <input type="checkbox" ${uw.unlocked?'checked':''}
            onchange="setUwUnlocked(${uw.uwId},this.checked)"> Unlocked
        </label>
        <label class="uw-toggle">
          <input type="checkbox" ${uw.uwPlusUnlocked?'checked':''} ${!uw.unlocked?'disabled':''}
            onchange="setUwPlusUnlocked(${uw.uwId},this.checked)"> ${uw.uwPlusName}
        </label>
        ${uwStonesToTarget>0?`<span style="font-size:10px;color:var(--orange);white-space:nowrap;margin-left:4px">→ ${uwStonesToTarget.toLocaleString()} stones</span>`:''}
      </div>
      <div class="uw-table-wrap">
      <table class="uw-stats-table">
        <thead><tr>
          <th>Stat</th><th>Value</th>
          <th style="text-align:right">Lvl</th>
          <th style="text-align:right">Target</th>
          <th style="text-align:right">→ Target</th>
          <th style="text-align:right">Invested</th>
          <th style="text-align:right">→ Max</th>
        </tr></thead>
        <tbody>
          ${baseStats.map(s=>renderUwStatRow(s,uw.unlocked,false)).join('')}
          ${uwPlus?renderUwStatRow(uwPlus,uw.unlocked,!uw.uwPlusUnlocked,true):''}
        </tbody>
      </table>
      </div>
    </div>`;
}

function renderUwStatRow(stat,uwUnlocked,isLocked,isUwPlus=false){
  const disabled=!uwUnlocked||isLocked;
  const valDisplay=disabled?'—':fmtStatVal(stat.label,stat.currentValue);
  const investedDisplay=disabled?'—':stat.stonesInvested.toLocaleString();
  const toMaxDisplay=disabled?'—':(stat.stonesToMax>0?stat.stonesToMax.toLocaleString():'<span style="color:var(--green);font-size:10px">Max</span>');
  const toTargetDisplay=disabled?'—':(stat.stonesToTarget>0
    ?`<span style="color:var(--orange)">${stat.stonesToTarget.toLocaleString()}</span>`
    :(stat.targetLevel>0&&stat.targetLevel<=stat.currentLevel
      ?'<span style="color:var(--green);font-size:10px">Met</span>'
      :'—'));
  const atMax=!disabled&&stat.currentLevel>=stat.maxLevel;
  const rowClass=`${disabled?'uw-row-locked':atMax?'uw-row-maxed':''}${isUwPlus?' uw-plus-row':''}`;
  const nextRowClass=`uw-next-row${isUwPlus?' uw-plus-row':''}`;
  const nextPreview=(!disabled&&!atMax&&stat.nextValue!=null&&stat.stonesToNext!=null)
    ?`<span class="uw-next-preview">${fmtStatVal(stat.label,stat.currentValue)} → ${fmtStatVal(stat.label,stat.nextValue)}</span> · ${stat.stonesToNext} stones`
    :'';
  const lvlCell=mkSpin(stat.currentLevel,0,stat.maxLevel,disabled,`setStatLevelSpin(${stat.statId},__V__)`);
  const tgtCell=atMax
    ?`<span class="uw-max-label">—</span>`
    :mkSpin(stat.targetLevel,0,stat.maxLevel,disabled,`setTargetLevelSpin(${stat.statId},__V__)`);
  return `<tr class="${rowClass}">
    <td>${stat.label}</td>
    <td class="uw-val">${valDisplay}</td>
    <td class="uw-lvl-cell">${lvlCell}</td>
    <td class="uw-lvl-cell">${tgtCell}</td>
    <td class="uw-stones">${toTargetDisplay}</td>
    <td class="uw-stones">${investedDisplay}</td>
    <td class="uw-stones">${toMaxDisplay}</td>
  </tr>
  ${nextPreview?`<tr class="${nextRowClass}"><td></td><td colspan="6">${nextPreview}</td></tr>`:''}`;
}

function saveUwScroll(){sessionStorage.setItem('uw-scroll',document.getElementById('mainContent').scrollTop);}
function restoreUwScroll(){
  const top=parseInt(sessionStorage.getItem('uw-scroll')||'0',10);
  requestAnimationFrame(()=>document.getElementById('mainContent').scrollTop=top);
}
async function refreshUwView(){await renderUwView();restoreUwScroll();}

async function setUwUnlocked(uwId,unlocked){
  saveUwScroll();
  await fetch(`${API}/uw/${uwId}/unlocked`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({unlocked})});
  refreshUwView();
}
async function setUwPlusUnlocked(uwId,unlocked){
  saveUwScroll();
  await fetch(`${API}/uw/${uwId}/uw-plus-unlocked`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({unlocked})});
  refreshUwView();
}
async function setStatLevel(statId,level){
  saveUwScroll();
  await fetch(`${API}/uw/stat/${statId}/level`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({level})});
  refreshUwView();
}
async function setTargetLevel(statId,level){
  saveUwScroll();
  await fetch(`${API}/uw/stat/${statId}/target-level`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({level})});
  refreshUwView();
}

// ── Module Tracker ──────────────────────────────────────────────────────────

const MOD_TYPE_COLOR={Cannon:'var(--orange)',Generator:'var(--green)',Armor:'var(--accent)',Core:'var(--accent2)'};
const MOD_RARITIES=['Epic','Epic+','Legendary','Legendary+','Mythic','Mythic+','Ancestral'];
const MOD_COPY_RARITIES=['Epic','Epic+','Legendary','Legendary+','Mythic','Mythic+'];
const MOD_SUB_RARITIES=['Common','Rare','Epic','Legendary','Mythic','Ancestral'];

function modRarityColor(rarity){
  if(rarity==='Epic'||rarity==='Epic+') return 'var(--accent2)';
  if(rarity==='Legendary'||rarity==='Legendary+') return 'var(--orange)';
  if(rarity==='Mythic'||rarity==='Mythic+') return 'var(--red)';
  return 'var(--green)'; // Ancestral + stars
}

function modRarityLabel(mod){
  if(mod.rarity==='Ancestral'){
    return mod.stars>0?`Ancestral ${'★'.repeat(mod.stars)}`:'Ancestral';
  }
  return mod.rarity;
}

// Max upgrade level a module can reach, gated by its rarity (Ancestral adds 20/star).
const MOD_RARITY_MAX_LEVEL={
  'Epic':60,'Epic+':80,'Legendary':100,'Legendary+':120,
  'Mythic':140,'Mythic+':160,'Ancestral':200,
};
function modMaxLevel(mod){
  if(mod.rarity==='Ancestral') return 200+(mod.stars||0)*20; // 0★=200 … 5★=300
  return MOD_RARITY_MAX_LEVEL[mod.rarity]||200;
}

let _modFilters={owned:null,rarity:null,type:null};

function modHiddenKey(id){return `mod-hidden-${id}`;}
function isModHidden(id){return localStorage.getItem(modHiddenKey(id))==='1';}
function toggleModHidden(id){
  const nowHidden=!isModHidden(id);
  if(nowHidden) localStorage.setItem(modHiddenKey(id),'1');
  else localStorage.removeItem(modHiddenKey(id));
  // Update pill in place
  document.querySelectorAll(`.mod-pill[data-mod-id="${id}"]`).forEach(el=>el.classList.toggle('mod-pill-hidden',nowHidden));
  // Show/hide card in place
  const card=document.getElementById(`mod-card-${id}`);
  if(card) card.style.display=nowHidden?'none':'';
}

function renderModFilters(mods){
  const rarityOpts=['','Epic','Epic+','Legendary','Legendary+','Mythic','Mythic+','Ancestral','1★','2★','3★','4★','5★'];
  const typeOpts=['','Cannon','Armor','Generator','Core'];
  return `<div class="mod-filter-bar">
    <span class="mod-filter-label">Filter:</span>
    <select class="mod-select" onchange="_modFilters.owned=this.value||null;refreshModulesView()">
      <option value="">All</option>
      <option value="owned"${_modFilters.owned==='owned'?' selected':''}>Owned</option>
      <option value="unowned"${_modFilters.owned==='unowned'?' selected':''}>Not Owned</option>
    </select>
    <select class="mod-select" onchange="_modFilters.type=this.value||null;refreshModulesView()">
      ${typeOpts.map(t=>`<option value="${t}"${_modFilters.type===t&&t?' selected':''}>${t||'All Types'}</option>`).join('')}
    </select>
    <select class="mod-select" onchange="_modFilters.rarity=this.value||null;refreshModulesView()">
      ${rarityOpts.map(r=>`<option value="${r}"${_modFilters.rarity===r&&r?' selected':''}>${r||'All Rarities'}</option>`).join('')}
    </select>
    <button class="mod-filter-clear" onclick="_modFilters={owned:null,rarity:null,type:null};refreshModulesView()">Clear</button>
  </div>`;
}

function modMatchesFilters(mod){
  if(_modFilters.owned==='owned'&&!mod.owned) return false;
  if(_modFilters.owned==='unowned'&&mod.owned) return false;
  if(_modFilters.type&&mod.type!==_modFilters.type) return false;
  if(_modFilters.rarity){
    const r=_modFilters.rarity;
    if(r.endsWith('★')){
      const stars=parseInt(r);
      if(mod.rarity!=='Ancestral'||mod.stars!==stars) return false;
    } else {
      if(mod.rarity!==r) return false;
    }
  }
  return true;
}

let MOD_SUBSTATS={};

async function loadModSubstats(){
  try{
    const res=await fetch(`${API}/modules/substats`);
    if(res.ok) MOD_SUBSTATS=await res.json();
  }catch(e){ /* keep empty; UI falls back to raw key names */ }
}

function modSubstatLabel(type,key){
  const list=MOD_SUBSTATS[type]||[];
  return (list.find(s=>s.key===key)||{label:key}).label;
}

function abilityRarity(rarity){
  if(rarity==='Ancestral'||rarity==='Mythic+'||rarity==='Mythic')return 'Mythic';
  if(rarity==='Legendary+'||rarity==='Legendary')return 'Legendary';
  return 'Epic';
}
function currentAbilityDisplay(mod){
  const key=mod.rarity==='Ancestral'?'Ancestral'
    :mod.rarity.startsWith('Mythic')?'Mythic'
    :mod.rarity.startsWith('Legendary')?'Legendary':'Epic';
  return mod.abilityValues[key]||'—';
}

async function renderModulesView(){
  document.getElementById('mainContent').innerHTML=
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading modules…</div>';
  try{
    const res=await fetch(`${API}/modules`);
    if(!res.ok)throw new Error(res.statusText);
    const mods=await res.json();
    const types=['Cannon','Armor','Generator','Core'];
    const owned=mods.filter(m=>m.owned).length;
    let html=`<div class="report-title" style="margin-bottom:1rem">Module Tracker</div>
      <div class="uw-stones-total" style="margin-bottom:1rem">
        <div class="uw-stones-chip"><div class="lbl">Natural Epics Owned</div><div class="val">${owned} / 24</div></div>
        ${MOD_PRESETS.flatMap(p=>MOD_SLOTS.map(s=>{
          const count=mods.filter(m=>(m.presets||[]).some(a=>a.preset===p&&a.slot===s)).length;
          return `<div class="uw-stones-chip"><div class="lbl">${p} ${s.charAt(0).toUpperCase()+s.slice(1)}</div><div class="val">${count} / 4</div></div>`;
        })).join('')}
      </div>
      ${renderModFilters(mods)}`;
    for(const type of types){
      const allOfType=mods.filter(m=>m.type===type);
      const visible=allOfType.filter(m=>modMatchesFilters(m)&&!isModHidden(m.id));
      if(allOfType.length===0) continue;
      const pills=allOfType.map(m=>{
        const h=isModHidden(m.id);
        return `<span class="mod-pill${h?' mod-pill-hidden':''}" data-mod-id="${m.id}" onclick="toggleModHidden(${m.id})" title="${m.name}">${m.code}</span>`;
      }).join('');
      const bulkMain=localStorage.getItem(`modBulkMain-${type}`)||'161';
      const bulkAssist=localStorage.getItem(`modBulkAssist-${type}`)||'141';
      html+=`<div class="mod-type-section">
        <div class="mod-type-header">
          <span class="mod-type-badge ${type}">${type}</span>
          <div class="mod-pills">${pills}</div>
          <div class="mod-bulk-level" title="Set the level of every owned ${type} module assigned to a Primary (main) or Assist preset slot. Each module is clamped to its rarity's max level.">
            <span class="mod-bulk-label">Set level →</span>
            <label class="mod-label">Main</label>
            <input class="mod-input" type="number" id="bulkMain-${type}" min="0" max="300" value="${bulkMain}">
            <label class="mod-label">Assist</label>
            <input class="mod-input" type="number" id="bulkAssist-${type}" min="0" max="300" value="${bulkAssist}">
            <button class="mod-bulk-apply" onclick="modBulkSetLevel('${type}')">Apply</button>
          </div>
        </div>
        <div class="mod-grid">${allOfType.filter(m=>modMatchesFilters(m)).map(m=>renderModCard(m,mods)).join('')}</div>
      </div>`;
    }
    document.getElementById('mainContent').innerHTML=html;
  }catch(e){
    document.getElementById('mainContent').innerHTML=
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

const MOD_PRESETS=['Farming','Tournament','Testing'];
const MOD_SLOTS=['primary','assist'];

function renderPresetChips(mod, allMods){
  const myPresets=new Set((mod.presets||[]).map(p=>`${p.preset}:${p.slot}`));
  // For each combo, check if another module of the same type already holds it
  const takenCombos=new Set();
  for(const other of allMods){
    if(other.id===mod.id||other.type!==mod.type)continue;
    for(const p of (other.presets||[])) takenCombos.add(`${p.preset}:${p.slot}`);
  }
  return MOD_PRESETS.flatMap(preset=>MOD_SLOTS.map(slot=>{
    const key=`${preset}:${slot}`;
    const active=myPresets.has(key);
    const taken=!active&&takenCombos.has(key);
    const label=`${preset} ${slot.charAt(0).toUpperCase()+slot.slice(1)}`;
    return `<span class="mod-preset-chip${active?' active '+preset:''}${taken?' taken':''}"
      title="${taken?'Already assigned to another '+mod.type+' module':''}"
      onclick="${taken?'':`modTogglePreset(${mod.id},'${preset}','${slot}',${active})`}"
    >${label}</span>`;
  })).join('');
}

function renderModCard(mod, allMods){
  const color=modRarityColor(mod.rarity);
  const rarityLabel=modRarityLabel(mod);

  const rarityOpts=MOD_RARITIES.map(r=>`<option value="${r}"${r===mod.rarity?' selected':''}>${r}</option>`).join('');
  const starsOpts=Array.from({length:6},(_,i)=>`<option value="${i}"${i===mod.stars?' selected':''}>${i}★</option>`).join('');
  const abilityChips=Object.entries(mod.abilityValues).map(([r,v])=>{
    const isCurrentTier=(mod.rarity.startsWith(r))||(r==='Ancestral'&&mod.rarity==='Ancestral');
    return `<span class="mod-ability-chip${isCurrentTier?' current':''}" title="${r}">${r[0]}: ${v}</span>`;
  }).join('');

  // Sub-stats: 8 slots, unlocked at levels 1,1,41,101,141,161,201,241
  const SLOT_UNLOCK=[1,1,41,101,141,161,201,241];
  const typeSubstats=MOD_SUBSTATS[mod.type]||[];

  let substatRows='';
  for(let slot=0;slot<8;slot++){
    const unlockLevel=SLOT_UNLOCK[slot];
    const slotUnlocked=mod.level>=unlockLevel;
    const ss=mod.substats.find(s=>s.slot===slot);
    const keyVal=ss?ss.key:'';
    const rar=ss?ss.rarity||'Common':'Common';
    const locked=ss&&ss.locked;
    const rarCss=rar.replace('+','');
    const rarDisplay=ss
      ?`<span class="mod-substat-rarity ${rarCss}">${rar}</span>`
      :`<span class="mod-substat-rarity Common" style="opacity:0.3">—</span>`;
    const lockedStyle=slotUnlocked?'':'opacity:0.35;pointer-events:none';
    const unlockNote=!slotUnlocked?`<span style="font-size:10px;color:var(--muted)">Lvl ${unlockLevel}</span>`:'';
    substatRows+=`<div class="mod-substat-row" style="${lockedStyle}">
      <span class="mod-slot-num">${slot+1}</span>
      ${rarDisplay}
      <select class="mod-select" style="flex:1;font-size:11px" ${!slotUnlocked?'disabled':''}
        onchange="modSetSubstatKey(${mod.id},${slot},this.value,'${rar}',${locked})">
        ${typeSubstats.map(s=>`<option value="${s.key}"${s.key===keyVal?' selected':''}>${s.label}</option>`).join('')}
        ${!keyVal?'<option value="" selected disabled>— empty —</option>':''}
      </select>
      <select class="mod-select" style="width:80px;font-size:11px" ${!slotUnlocked?'disabled':''}
        onchange="modSetSubstatRarity(${mod.id},${slot},'${keyVal}',this.value,${locked})">
        ${MOD_SUB_RARITIES.map(r=>`<option value="${r}"${r===rar?' selected':''}>${r}</option>`).join('')}
      </select>
      <button class="mod-lock-btn${locked?' locked':''}" title="${locked?'Unlock':'Lock'}"
        onclick="modToggleLock(${mod.id},${slot},'${keyVal}','${rar}',${locked})">${locked?'🔒':'🔓'}</button>
      ${ss?`<button class="mod-lock-btn" title="Clear" onclick="modClearSubstat(${mod.id},${slot})" style="color:var(--red)">✕</button>`:''}
      ${unlockNote}
    </div>`;
  }

  // Copies
  const copies=mod.copies||[];
  const copyChips=copies.map((r,i)=>
    `<span class="mod-copy-chip ${r.replace('+','')}" title="Click to remove" onclick="modClearCopy(${mod.id},${i})">${r} ✕</span>`
  ).join('');
  const addCopyOpts=MOD_COPY_RARITIES.map(r=>`<option value="${r}">${r}</option>`).join('');
  const addCopyBtn=copies.length<5
    ?`<select class="mod-select" style="font-size:11px" onchange="modAddCopy(${mod.id},${copies.length},this.value);this.selectedIndex=0">
        <option value="" disabled selected>+ Add copy</option>${addCopyOpts}</select>`:'';

  const bodyHtml=`<div class="mod-body">
    <div class="mod-effect">${mod.effectTemplate}</div>
      <div class="mod-ability-row">${abilityChips}</div>
      <div class="mod-controls">
        <span class="mod-label">Rarity</span>
        <select class="mod-select" onchange="modSaveState(${mod.id},${mod.owned},this.value,${mod.stars},${mod.level})">
          ${rarityOpts}
        </select>
        ${mod.rarity==='Ancestral'?`<select class="mod-select" onchange="modSaveState(${mod.id},${mod.owned},'${mod.rarity}',parseInt(this.value),${mod.level})">
          ${starsOpts}
        </select>`:''}
        <span class="mod-label">Lvl</span>
        <input class="mod-input" type="number" min="0" max="${modMaxLevel(mod)}" value="${mod.level}"
          title="Max level for ${modRarityLabel(mod)} is ${modMaxLevel(mod)}"
          onchange="modSaveState(${mod.id},${mod.owned},'${mod.rarity}',${mod.stars},Math.min(Math.max(parseInt(this.value)||0,0),${modMaxLevel(mod)}))">
      </div>
      <div class="mod-substats">
        <div class="mod-substats-title">Sub-stats</div>
        ${substatRows}
      </div>
      <div class="mod-copies">
        <div class="mod-copies-title">Merge Copies &nbsp;<span style="color:var(--muted);font-size:10px">(click to remove)</span></div>
        <div class="mod-copies-row">${copyChips}${addCopyBtn}</div>
      </div>
      <div class="mod-presets">
        <div class="mod-presets-title">Presets</div>
        <div class="mod-preset-chips">${renderPresetChips(mod,allMods)}</div>
      </div>
      <div class="mod-footer">
        <span>Shattered epics:
          <input class="mod-input" type="number" min="0" value="${mod.shatteredEpics}"
            style="width:48px;display:inline-block"
            onchange="modSetShattered(${mod.id},parseInt(this.value))">
        </span>
      </div>
    </div>`;
  return `<div id="mod-card-${mod.id}" class="mod-card${mod.owned?' owned':''}" style="border-top:3px solid ${color}${isModHidden(mod.id)?';display:none':''}">
    <div class="mod-card-header">
      <span class="mod-code" style="color:${color}">${mod.code}</span>
      <span class="mod-name">${mod.name}</span>
      <span class="mod-rarity-badge" style="color:${color}">${rarityLabel}</span>
      <label class="uw-toggle" style="margin-left:auto">
        <input type="checkbox" ${mod.owned?'checked':''} onchange="modSetOwned(${mod.id},this.checked)"> Owned
      </label>
    </div>
    ${bodyHtml}
  </div>`;
}

function modScrollKey(){return 'mod-scroll';}
function saveModScroll(){sessionStorage.setItem(modScrollKey(),document.getElementById('mainContent').scrollTop);}
function restoreModScroll(){
  const top=parseInt(sessionStorage.getItem(modScrollKey())||'0',10);
  requestAnimationFrame(()=>document.getElementById('mainContent').scrollTop=top);
}
async function refreshModulesView(){await renderModulesView();restoreModScroll();}

// ── Effect Bans ────────────────────────────────────────────────────────────────

const RARITY_ORDER=['Common','Rare','Epic','Legendary','Mythic','Ancestral'];

function ebRarityBadge(minRarity){
  return `<span class="eb-rarity ${minRarity}" title="Available from ${minRarity}">${minRarity[0]}</span>`;
}

function ebGroupedOptions(substats){
  const groups={};
  for(const s of substats){
    const r=s.minRarity||'Common';
    if(!groups[r]) groups[r]=[];
    groups[r].push(s);
  }
  return RARITY_ORDER
    .filter(r=>groups[r]?.length)
    .map(r=>`<optgroup label="${r}">${groups[r].map(s=>`<option value="${s.key}">${s.label}</option>`).join('')}</optgroup>`)
    .join('');
}

async function renderEffectBansView(){
  const el=document.getElementById('mainContent');
  el.innerHTML='<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading effect bans…</div>';
  try{
    const [bansRes]=await Promise.all([
      fetch(`${API}/modules/bans`),
      MOD_SUBSTATS.Cannon?Promise.resolve():loadModSubstats(),
    ]);
    if(!bansRes.ok) throw new Error(bansRes.statusText);
    const bans=await bansRes.json();

    const ORDER=['Cannon','Generator','Armor','Core'];
    const banMap=Object.fromEntries(bans.map(b=>[b.moduleType,b]));

    let html=`<div class="report-title" style="margin-bottom:0.25rem">Module Effect Bans</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:1rem">
        Ban sub-stats from appearing when rolling a module type. Sub-stats available from lower rarities
        (C=Common, R=Rare, E=Epic, L=Legendary) appear more frequently and are generally higher priority to ban.
        Ban slots unlock via the Effect Bans labs.
      </div>
      <div class="eb-grid">`;

    for(const type of ORDER){
      const b=banMap[type]||{moduleType:type,maxBans:0,banned:[]};
      const color=MOD_TYPE_COLOR[type];
      const slotsUsed=b.banned.length;
      const maxBans=b.maxBans;
      const isFull=slotsUsed>=maxBans;
      const substats=MOD_SUBSTATS[type]||[];
      const substatMap=Object.fromEntries(substats.map(s=>[s.key,s]));
      const available=substats.filter(s=>!b.banned.includes(s.key));

      const bannedRows=b.banned.length
        ? b.banned.map(key=>{
            const s=substatMap[key]||{label:key,minRarity:'Common'};
            return `<div class="eb-banned-row">
              ${ebRarityBadge(s.minRarity||'Common')}
              <span class="eb-banned-label">${s.label}</span>
              <button class="eb-remove-btn" title="Remove ban" onclick="ebRemoveBan('${type}','${key}')">✕</button>
            </div>`;
          }).join('')
        : `<span class="eb-empty">No bans set</span>`;

      const addRow=maxBans===0
        ? `<div style="font-size:11px;color:var(--muted);font-style:italic">Research ${type} Effect Bans lab to unlock ban slots.</div>`
        : `<div class="eb-add-row">
            <select class="eb-add-select" id="eb-sel-${type}" ${isFull?'disabled':''}>
              <option value="" disabled selected>— choose sub-stat —</option>
              ${ebGroupedOptions(available)}
            </select>
            <button class="eb-add-btn" ${isFull?'disabled':''} onclick="ebAddBan('${type}')">Ban</button>
          </div>`;

      html+=`<div class="eb-card" style="border-top-color:${color}">
        <div class="eb-header">
          <span class="mod-type-badge ${type}">${type}</span>
          <span class="eb-slots${isFull?' full':''}">${slotsUsed} / ${maxBans} ban${maxBans===1?'':'s'} used</span>
        </div>
        <div class="eb-banned-list">${bannedRows}</div>
        ${addRow}
      </div>`;
    }

    html+='</div>';
    el.innerHTML=html;
  }catch(e){
    el.innerHTML=`<div style="padding:2rem;color:var(--red)">Failed to load effect bans: ${e.message}</div>`;
  }
}

async function ebAddBan(type){
  const sel=document.getElementById(`eb-sel-${type}`);
  const key=sel?.value;
  if(!key) return;
  const res=await fetch(`${API}/modules/bans/${encodeURIComponent(type)}/${encodeURIComponent(key)}`,{method:'PUT'});
  if(!res.ok){
    const msg=await res.text();
    alert(`Could not add ban: ${msg}`);
    return;
  }
  renderEffectBansView();
}

async function ebRemoveBan(type,key){
  const res=await fetch(`${API}/modules/bans/${encodeURIComponent(type)}/${encodeURIComponent(key)}`,{method:'DELETE'});
  if(!res.ok){
    alert('Failed to remove ban.');
    return;
  }
  renderEffectBansView();
}


async function modSaveState(id,owned,rarity,stars,level){
  saveModScroll();
  await fetch(`${API}/modules/${id}/state`,{method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({owned,rarity,stars,level})});
  refreshModulesView();
}
async function modSetOwned(id,owned){
  saveModScroll();
  const mods=await(await fetch(`${API}/modules`)).json();
  const m=mods.find(x=>x.id===id);
  const level=owned&&m.level===0?1:m.level;
  await fetch(`${API}/modules/${id}/state`,{method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({owned,rarity:m.rarity,stars:m.stars,level})});
  refreshModulesView();
}
async function modSetSubstatKey(id,slot,key,rar,locked){
  saveModScroll();
  if(!key){await fetch(`${API}/modules/${id}/substat/${slot}`,{method:'DELETE'});refreshModulesView();return;}
  await fetch(`${API}/modules/${id}/substat/${slot}`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({key,rarity:rar,locked})});
  refreshModulesView();
}
async function modSetSubstatRarity(id,slot,key,rarity,locked){
  if(!key)return;
  saveModScroll();
  await fetch(`${API}/modules/${id}/substat/${slot}`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({key,rarity,locked})});
  refreshModulesView();
}
async function modToggleLock(id,slot,key,rarity,locked){
  if(!key)return;
  saveModScroll();
  await fetch(`${API}/modules/${id}/substat/${slot}`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({key,rarity,locked:!locked})});
  refreshModulesView();
}
async function modClearSubstat(id,slot){
  saveModScroll();
  await fetch(`${API}/modules/${id}/substat/${slot}`,{method:'DELETE'});
  refreshModulesView();
}
async function modAddCopy(id,copyIndex,rarity){
  saveModScroll();
  await fetch(`${API}/modules/${id}/copy/${copyIndex}`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({rarity})});
  refreshModulesView();
}
async function modClearCopy(id,copyIndex){
  saveModScroll();
  await fetch(`${API}/modules/${id}/copy/${copyIndex}`,{method:'DELETE'});
  refreshModulesView();
}
async function modTogglePreset(id,preset,slot,active){
  saveModScroll();
  if(active){
    await fetch(`${API}/modules/${id}/preset/${preset}/${slot}`,{method:'DELETE'});
  }else{
    await fetch(`${API}/modules/${id}/preset/${preset}/${slot}`,{method:'PUT'});
  }
  refreshModulesView();
}

async function modSetShattered(id,count){
  await fetch(`${API}/modules/${id}/shattered`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({count})});
}

// Bulk-set the level of every owned module of a type that's assigned to a Primary (main)
// or Assist preset slot. Each module is clamped to its rarity's max level.
async function modBulkSetLevel(type){
  const mainLvl=Math.max(parseInt(document.getElementById(`bulkMain-${type}`).value)||0,0);
  const assistLvl=Math.max(parseInt(document.getElementById(`bulkAssist-${type}`).value)||0,0);
  localStorage.setItem(`modBulkMain-${type}`,mainLvl);
  localStorage.setItem(`modBulkAssist-${type}`,assistLvl);
  saveModScroll();
  const mods=await(await fetch(`${API}/modules`)).json();
  const updates=[];
  for(const m of mods){
    if(m.type!==type||!m.owned) continue;
    const slots=new Set((m.presets||[]).map(p=>p.slot));
    let target=null;
    if(slots.has('primary')) target=mainLvl;        // Primary slot wins if assigned to both
    else if(slots.has('assist')) target=assistLvl;
    if(target===null) continue;
    const lvl=Math.min(target,modMaxLevel(m));
    if(lvl===m.level) continue;
    updates.push(fetch(`${API}/modules/${m.id}/state`,{method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({owned:m.owned,rarity:m.rarity,stars:m.stars,level:lvl})}));
  }
  await Promise.all(updates);
  refreshModulesView();
}

// ── Relics ─────────────────────────────────────────────────────────────────

const RELIC_STAT_CATEGORIES = {
  'Misc':    ['Lab Speed','Bot Range'],
  'Damage':  ['Damage','Ultimate Damage','Attack Speed','Crit Chance','Crit Factor',
               'Damage / Meter','Super Critical Chance','Super Critical Mult','Rend Armor Mult'],
  'Defense': ['Health','Health Regen','Defense %','Defense Absolute','Thorns',
               'Knockback Force','Orb Speed','Wall Rebuild'],
  'Utility': ['Cash','Coins','Free Attack Upgrade','Free Defense Upgrade','Free Utility Upgrade',
               'Recovery Amount','Enemy Attack Level Skip','Enemy Health Level Skip']
};

const RELIC_STAT_UNITS = {'Bot Range':'m','Wall Rebuild':'s'};

let relicData=[], relicTypeFilter='All', relicOwnedFilter='All', relicSearch='', relicSortCol='type', relicSortDir=1;
let gemStoreData=[], relicsTab='collection';

function relicStatCategory(stat){
  for(const [cat,stats] of Object.entries(RELIC_STAT_CATEGORIES))
    if(stats.includes(stat)) return cat;
  return 'Utility';
}

function fmtRelicVal(stat, val){
  const unit = RELIC_STAT_UNITS[stat];
  if(unit) return val + unit;
  return Math.round(val * 100) + '%';
}

async function renderRelicsView(){
  document.getElementById('mainContent').innerHTML=
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading relics…</div>';
  try{
    const [r1, r2] = await Promise.all([
      fetch(`${API}/relics`),
      fetch(`${API}/gem-store/rotation`)
    ]);
    if(!r1.ok) throw new Error(r1.statusText);
    relicData = await r1.json();
    gemStoreData = r2.ok ? await r2.json() : [];
    buildRelicsPage();
  }catch(e){
    document.getElementById('mainContent').innerHTML=
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildRelicsPage(){
  const owned = relicData.filter(r=>r.owned).length;
  const total = relicData.length;

  // Type counts: Guild, Anniversary, Milestone, Tournament, Event (Standard+Premium)
  const typeCounts = {Guild:0, Anniversary:0, Milestone:0, Tournament:0, Event:0};
  const typeOwnedCounts = {Guild:0, Anniversary:0, Milestone:0, Tournament:0, Event:0};
  for(const r of relicData){
    const bucket = (r.type==='Standard'||r.type==='Premium') ? 'Event' : r.type;
    typeCounts[bucket]++;
    if(r.owned) typeOwnedCounts[bucket]++;
  }

  // Stat summary
  const statOwned = {}, statTotal = {};
  for(const r of relicData){
    statTotal[r.bonusStat] = (statTotal[r.bonusStat]||0) + r.bonusValue;
    if(r.owned) statOwned[r.bonusStat] = (statOwned[r.bonusStat]||0) + r.bonusValue;
  }

  // Dashboard cards
  const dashHtml = Object.entries(typeCounts).map(([type, tot])=>{
    const own = typeOwnedCounts[type];
    return `<div class="relic-dash-card">
      <div class="lbl">${type}</div>
      <div class="val" style="color:var(--green)">${own}<span style="font-size:.9rem;color:var(--muted)"> / ${tot}</span></div>
    </div>`;
  }).join('');

  // Stat summary table
  let statHtml = '';
  for(const [cat, stats] of Object.entries(RELIC_STAT_CATEGORIES)){
    const rows = stats.filter(s => statTotal[s]!=null).map(s=>{
      const own = statOwned[s]||0;
      const tot = statTotal[s]||0;
      const missing = tot - own;
      const missingStr = missing > 0 ? `<span class="relic-missing">−${fmtRelicVal(s,missing)}</span>` : '<span style="color:var(--green);font-size:11px">Complete</span>';
      return `<tr>
        <td>${s}</td>
        <td class="relic-owned-val">${fmtRelicVal(s,own)}</td>
        <td class="relic-total-val">${fmtRelicVal(s,tot)}</td>
        <td>${missingStr}</td>
      </tr>`;
    }).join('');
    if(!rows) continue;
    statHtml += `<tr class="cat-row"><td colspan="4">${cat}</td></tr>${rows}`;
  }

  document.getElementById('mainContent').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
      <div class="report-title">Relics</div>
      <button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="openAddRelicModal()">+ Add Relic</button>
    </div>
    <div class="tab-bar">
      <div class="tab${relicsTab==='collection'?' active':''}" onclick="showRelicsTab('collection')">Collection</div>
      <div class="tab${relicsTab==='gemstore'?' active':''}" onclick="showRelicsTab('gemstore')">Gem Store</div>
    </div>

    <div id="relicCollectionTab"${relicsTab!=='collection'?' style="display:none"':''}>
      <div class="section-title">Owned by Type</div>
      <div class="relic-dashboard">
        <div class="relic-dash-card" style="border-color:rgba(79,142,247,.3)">
          <div class="lbl">Total</div>
          <div class="val" style="color:var(--accent)">${owned}<span style="font-size:.9rem;color:var(--muted)"> / ${total}</span></div>
        </div>
        ${dashHtml}
      </div>

      <div class="section-title">Stat Summary</div>
      <table class="relic-stat-table">
        <thead><tr><th>Stat</th><th>Owned</th><th>Total Available</th><th>Missing</th></tr></thead>
        <tbody>${statHtml}</tbody>
      </table>

      <div class="section-title">All Relics</div>
      <div class="relic-filters">
        <input class="relic-search" type="text" placeholder="Search…" value="${escHtml(relicSearch)}"
          oninput="relicSearch=this.value;renderRelicTable()">
        ${['All','Standard','Premium','Milestone','Tournament','Anniversary','Guild'].map(t=>
          `<button class="relic-filter-btn${relicTypeFilter===t?' active':''}" onclick="relicTypeFilter='${t}';document.querySelectorAll('.relic-filter-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');renderRelicTable()">${t}</button>`
        ).join('')}
        <button class="relic-filter-btn${relicOwnedFilter==='Owned'?' active':''}" onclick="relicOwnedFilter=relicOwnedFilter==='Owned'?'All':'Owned';this.classList.toggle('active');renderRelicTable()">Owned only</button>
        <button class="relic-filter-btn${relicOwnedFilter==='Missing'?' active':''}" onclick="relicOwnedFilter=relicOwnedFilter==='Missing'?'All':'Missing';this.classList.toggle('active');renderRelicTable()">Missing only</button>
      </div>
      <div id="relicTableWrap"></div>
    </div>

    <div id="relicGemStoreTab"${relicsTab!=='gemstore'?' style="display:none"':''}>
      <div id="gemStoreContent"></div>
    </div>`;

  if(relicsTab==='collection') renderRelicTable();
  else buildGemStoreTab();
}

function renderRelicTable(){
  let rows = relicData.slice();
  if(relicTypeFilter!=='All') rows=rows.filter(r=>r.type===relicTypeFilter);
  if(relicOwnedFilter==='Owned') rows=rows.filter(r=>r.owned);
  if(relicOwnedFilter==='Missing') rows=rows.filter(r=>!r.owned);
  if(relicSearch){
    const q=relicSearch.toLowerCase();
    rows=rows.filter(r=>r.name.toLowerCase().includes(q)||r.bonusStat.toLowerCase().includes(q)||r.obtainCondition.toLowerCase().includes(q));
  }
  rows.sort((a,b)=>{
    let av=a[relicSortCol]??'', bv=b[relicSortCol]??'';
    if(typeof av==='boolean') av=av?0:1, bv=bv?0:1;
    return av<bv?-relicSortDir:av>bv?relicSortDir:0;
  });

  const thSort = col => `onclick="relicSortCol='${col}';relicSortDir=relicSortCol==='${col}'?-relicSortDir:1;renderRelicTable()"`;
  document.getElementById('relicTableWrap').innerHTML = `
    <table class="relic-table">
      <thead><tr>
        <th ${thSort('name')}>Name</th>
        <th ${thSort('rarity')}>Rarity</th>
        <th ${thSort('type')}>Type</th>
        <th ${thSort('bonusStat')}>Stat</th>
        <th ${thSort('bonusValue')} style="text-align:right">Value</th>
        <th>How to Obtain</th>
        <th style="text-align:center">Owned</th>
        <th style="text-align:center">Actions</th>
      </tr></thead>
      <tbody>${rows.map(r=>`
        <tr class="${r.owned?'owned-row':'not-owned-row'}">
          <td style="font-weight:600">${escHtml(r.name)}</td>
          <td><span class="rarity-badge ${r.rarity}">${r.rarity}</span></td>
          <td><span class="type-badge ${r.type}">${r.type}</span></td>
          <td style="color:var(--muted)">${escHtml(r.bonusStat)}</td>
          <td style="text-align:right;font-family:var(--mono);color:var(--accent)">${fmtRelicVal(r.bonusStat,r.bonusValue)}</td>
          <td style="font-size:12px;color:var(--muted)">${escHtml(r.obtainCondition)}</td>
          <td style="text-align:center">
            <label class="owned-toggle" title="${r.owned?'Mark not owned':'Mark owned'}">
              <input type="checkbox" ${r.owned?'checked':''} onchange="relicSetOwned(${r.id},this.checked)">
            </label>
          </td>
          <td style="text-align:center;white-space:nowrap">
            <button class="relic-action-btn" title="Edit" onclick="openEditRelicModal(${r.id})">✎</button>
            <button class="relic-action-btn relic-action-del" title="Delete" onclick="deleteRelic(${r.id})">🗑</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="height:2rem"></div>`;
}

async function relicSetOwned(id, owned){
  const r = relicData.find(x=>x.id===id);
  if(r) r.owned = owned;
  await fetch(`${API}/relics/${id}/owned`,{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({owned})});
  buildRelicsPage();
  // Restore scroll
  const el = document.getElementById('relicTableWrap');
  if(el) requestAnimationFrame(()=>el.scrollIntoView({behavior:'instant',block:'nearest'}));
}

const RELIC_STATS = [
  'Lab Speed','Bot Range','Damage','Ultimate Damage','Attack Speed','Crit Chance','Crit Factor',
  'Damage / Meter','Super Critical Chance','Super Critical Mult','Rend Armor Mult',
  'Health','Health Regen','Defense %','Defense Absolute','Thorns','Knockback Force',
  'Orb Speed','Wall Rebuild','Cash','Coins','Free Attack Upgrade','Free Defense Upgrade',
  'Free Utility Upgrade','Recovery Amount','Enemy Attack Level Skip','Enemy Health Level Skip'
];

let editingRelicId = null;

function openAddRelicModal(){
  editingRelicId = null;
  document.getElementById('relicModalTitle').textContent = 'Add New Relic';
  document.getElementById('relicModalSaveBtn').textContent = 'Add Relic';
  document.getElementById('newRelicName').value = '';
  document.getElementById('newRelicRarity').value = 'Rare';
  document.getElementById('newRelicType').value = 'Standard';
  document.getElementById('newRelicStat').value = '';
  document.getElementById('newRelicValue').value = '';
  document.getElementById('newRelicCondition').value = '';
  document.getElementById('addRelicModal').style.display='flex';
}
function openEditRelicModal(id){
  const r = relicData.find(x=>x.id===id);
  if(!r) return;
  editingRelicId = id;
  document.getElementById('relicModalTitle').textContent = 'Edit Relic';
  document.getElementById('relicModalSaveBtn').textContent = 'Save Changes';
  document.getElementById('newRelicName').value = r.name;
  document.getElementById('newRelicRarity').value = r.rarity;
  document.getElementById('newRelicType').value = r.type;
  document.getElementById('newRelicStat').value = r.bonusStat;
  document.getElementById('newRelicValue').value = r.bonusValue;
  document.getElementById('newRelicCondition').value = r.obtainCondition;
  document.getElementById('addRelicModal').style.display='flex';
}
function closeAddRelicModal(){
  editingRelicId = null;
  document.getElementById('addRelicModal').style.display='none';
}
async function deleteRelic(id){
  const r = relicData.find(x=>x.id===id);
  if(!r) return;
  if(!confirm(`Delete relic "${r.name}"? This cannot be undone.`)) return;
  try{
    const res = await fetch(`${API}/relics/${id}`,{method:'DELETE'});
    if(!res.ok){
      const msg = await res.text();
      alert(msg || 'Failed to delete relic.');
      return;
    }
    const list = await fetch(`${API}/relics`);
    relicData = await list.json();
    buildRelicsPage();
  }catch(e){alert('Failed to delete: '+e.message);}
}

function showRelicsTab(tab){
  relicsTab=tab;
  document.querySelectorAll('#mainContent .tab').forEach(t=>
    t.classList.toggle('active', t.textContent.toLowerCase().replace(' ','')===tab));
  document.getElementById('relicCollectionTab').style.display = tab==='collection' ? '' : 'none';
  document.getElementById('relicGemStoreTab').style.display  = tab==='gemstore'    ? '' : 'none';
  if(tab==='collection') renderRelicTable();
  else buildGemStoreTab();
}

function buildGemStoreTab(){
  const el = document.getElementById('gemStoreContent');
  if(!el) return;

  // Group entries by (startDate, variant)
  const weekMap = {};
  for(const e of gemStoreData){
    const key = e.startDate + '|' + (e.variant||'');
    if(!weekMap[key]) weekMap[key] = {startDate:e.startDate, variant:e.variant||'', slots:{}};
    weekMap[key].slots[e.slot] = e;
  }
  const weeks = Object.values(weekMap).sort((a,b) =>
    b.startDate.localeCompare(a.startDate) || a.variant.localeCompare(b.variant));

  if(!weeks.length){
    el.innerHTML='<div class="loading-placeholder">No rotation data yet.</div>';
    return;
  }

  // Find latest start date
  const latestDate = weeks[0].startDate;

  function slotCard(entry, label, isPremium){
    if(!entry) return `<div class="gs-slot-card"><div class="gs-slot-label${isPremium?' premium':''}">${label}</div><div style="color:var(--muted);font-size:13px">—</div></div>`;
    return `<div class="gs-slot-card">
      <div class="gs-slot-label${isPremium?' premium':''}">${label}</div>
      <div class="gs-relic-name">${escHtml(entry.relicName)}</div>
      <div style="margin-bottom:4px"><span class="rarity-badge ${entry.rarity}">${entry.rarity}</span></div>
      <div class="gs-relic-stat">${escHtml(entry.bonusStat)} · ${fmtRelicVal(entry.bonusStat, entry.bonusValue)}</div>
    </div>`;
  }

  // Current rotation(s)
  const currentWeeks = weeks.filter(w => w.startDate === latestDate);
  let currentHtml = '';
  for(const w of currentWeeks){
    const variantLabel = w.variant ? `<span class="gs-variant-badge">Variant ${w.variant}</span>` : '';
    currentHtml += `
      <div style="margin-bottom:6px;font-size:13px;color:var(--muted)">Week of ${w.startDate}${variantLabel}</div>
      <div class="gs-current-grid">
        ${slotCard(w.slots['STANDARD_1'], 'Standard 1', false)}
        ${slotCard(w.slots['STANDARD_2'], 'Standard 2', false)}
        ${slotCard(w.slots['PREMIUM_1'],  'Premium 1',  true)}
        ${slotCard(w.slots['PREMIUM_2'],  'Premium 2',  true)}
      </div>`;
  }

  // History table (all weeks)
  function cellHtml(entry){
    if(!entry) return '<td style="color:var(--muted)">—</td>';
    return `<td><span style="font-weight:600">${escHtml(entry.relicName)}</span><br>
      <span style="font-size:11px;color:var(--muted)">${escHtml(entry.bonusStat)} · ${fmtRelicVal(entry.bonusStat, entry.bonusValue)}</span></td>`;
  }

  const historyRows = weeks.map(w => {
    const isCurrent = w.startDate === latestDate;
    const variantBadge = w.variant ? `<span class="gs-variant-badge">${w.variant}</span>` : '';
    return `<tr class="${isCurrent?'gs-current-row':''}">
      <td style="white-space:nowrap;font-family:var(--mono);font-size:12px">${w.startDate}${variantBadge}</td>
      ${cellHtml(w.slots['STANDARD_1'])}
      ${cellHtml(w.slots['STANDARD_2'])}
      ${cellHtml(w.slots['PREMIUM_1'])}
      ${cellHtml(w.slots['PREMIUM_2'])}
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <div class="section-title" style="margin:0;border:none">Current Rotation</div>
      <button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="openAddRotationModal()">+ Add Rotation</button>
    </div>
    ${currentHtml}
    <div class="section-title">History</div>
    <table class="gs-history-table">
      <thead><tr>
        <th>Week of</th>
        <th>Standard 1</th>
        <th>Standard 2</th>
        <th>Premium 1</th>
        <th>Premium 2</th>
      </tr></thead>
      <tbody>${historyRows}</tbody>
    </table>
    <div style="height:2rem"></div>`;
}

function openAddRotationModal(){
  // Populate datalists from relicData
  const names = relicData.map(r=>r.name).sort();
  const opts = names.map(n=>`<option value="${escHtml(n)}">`).join('');
  ['gsS1','gsS2','gsP1','gsP2'].forEach(id=>{
    const dl = document.getElementById(id+'List');
    if(dl) dl.innerHTML = opts;
  });
  // Default start date to next Monday from latest rotation
  const latestDate = gemStoreData.length
    ? gemStoreData.reduce((max,e)=>e.startDate>max?e.startDate:max,'')
    : '';
  if(latestDate){
    const d = new Date(latestDate+'T12:00:00');
    d.setDate(d.getDate()+7);
    document.getElementById('gsStartDate').value = d.toISOString().slice(0,10);
  }
  document.getElementById('gsVariant').value='';
  ['gsS1','gsS2','gsP1','gsP2'].forEach(id=>{document.getElementById(id).value='';});
  document.getElementById('addRotationModal').style.display='flex';
}
function closeAddRotationModal(){
  document.getElementById('addRotationModal').style.display='none';
}

async function saveRotation(){
  const startDate = document.getElementById('gsStartDate').value.trim();
  const s1 = document.getElementById('gsS1').value.trim();
  const s2 = document.getElementById('gsS2').value.trim();
  const p1 = document.getElementById('gsP1').value.trim();
  const p2 = document.getElementById('gsP2').value.trim();
  const variant = document.getElementById('gsVariant').value.trim();
  if(!startDate||!s1||!s2||!p1||!p2){alert('All four relic slots are required.');return;}
  try{
    const res = await fetch(`${API}/gem-store/rotation`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({startDate,standard1:s1,standard2:s2,premium1:p1,premium2:p2,variant})
    });
    if(!res.ok){const t=await res.text();throw new Error(t||res.statusText);}
    closeAddRotationModal();
    const r2 = await fetch(`${API}/gem-store/rotation`);
    gemStoreData = await r2.json();
    buildGemStoreTab();
  }catch(e){
    alert('Failed to save rotation: '+e.message);
  }
}

// ── Labs ─────────────────────────────────────────────────────────────────────
let labData = [];
let labCategoryFilter = 'All';
let labHideComplete = false;
let labSearch = '';
let labCellSpeedIdx = 0;
function labCellSpeedMult(){ return LP_SPEEDS[labCellSpeedIdx].value; }
function labSpeedDec(){ if(labCellSpeedIdx>0){labCellSpeedIdx--;const el=document.getElementById('lab-speed-val');if(el)el.value=LP_SPEEDS[labCellSpeedIdx].label;renderLabTables();} }
function labSpeedInc(){ if(labCellSpeedIdx<LP_SPEEDS.length-1){labCellSpeedIdx++;const el=document.getElementById('lab-speed-val');if(el)el.value=LP_SPEEDS[labCellSpeedIdx].label;renderLabTables();} }

const LAB_CATEGORIES = ['Main','Attack','Defense','Utility','Ultimate Weapons','Cards','Perks','Bots','Enemies','Modules','Battle Condition'];

async function renderLabsView(){
  document.getElementById('mainContent').innerHTML=
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading labs…</div>';
  try{
    const [labRes, costsRes, multRes] = await Promise.all([
      fetch(`${API}/labs`),
      fetch(`${API}/labs/costs`),
      fetch(`${API}/labs/multipliers`),
    ]);
    if(!labRes.ok) throw new Error(labRes.statusText);
    labData = await labRes.json();
    labCostCache = await costsRes.json();
    labMultipliers = await multRes.json();
    buildLabsPage();
  }catch(e){
    document.getElementById('mainContent').innerHTML=
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildLabsPage(){
  const total = labData.length;
  const complete = labData.filter(l => l.currentLevel >= l.maxLevel).length;
  const atTarget = labData.filter(l => l.targetLevel != null && l.currentLevel >= l.targetLevel).length;
  const withTarget = labData.filter(l => l.targetLevel != null).length;

  const speedCard = `<div class="labs-summary-stat">
      <div class="lbl">Speed Up</div>
      <div class="val" style="display:flex;align-items:center;gap:0">
        <div class="spin-wrap">
          <button class="spin-btn" tabindex="-1" onclick="labSpeedDec()">−</button>
          <input type="text" id="lab-speed-val" class="spin-val" readonly value="${LP_SPEEDS[labCellSpeedIdx].label}" style="width:80px;text-align:center">
          <button class="spin-btn" tabindex="-1" onclick="labSpeedInc()">+</button>
        </div>
      </div>
    </div>`;
  const summaryHtml = `
    <div class="labs-summary-bar">
      <div class="labs-summary-stat"><div class="lbl">Total Labs</div><div class="val">${total}</div></div>
      <div class="labs-summary-stat"><div class="lbl">Maxed Out</div><div class="val" style="color:var(--green)">${complete}</div></div>
      <div class="labs-summary-stat"><div class="lbl">At Target</div><div class="val" style="color:var(--accent)">${atTarget} / ${withTarget}</div></div>
      ${speedCard}
    </div>`;

  const filterBtns = ['All',...LAB_CATEGORIES].map(c=>
    `<button class="labs-filter-btn${labCategoryFilter===c?' active':''}" onclick="labCategoryFilter='${c}';document.querySelectorAll('.labs-filter-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');renderLabTables()">${c}</button>`
  ).join('');

  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:1rem">Labs</div>
    ${summaryHtml}
    <div class="labs-controls">
      <input class="labs-search" type="text" placeholder="Search labs…" value="${escHtml(labSearch)}"
        oninput="labSearch=this.value;renderLabTables()">
      ${filterBtns}
      <button class="labs-filter-btn${labHideComplete?' active':''}" onclick="labHideComplete=!labHideComplete;this.classList.toggle('active');renderLabTables()">Hide Maxed</button>
    </div>
    <div id="labTablesWrap"></div>`;

  renderLabTables();
}

function renderLabTables(){
  let rows = labData.slice();
  if(labCategoryFilter !== 'All') rows = rows.filter(l => l.category === labCategoryFilter);
  if(labHideComplete) rows = rows.filter(l => l.currentLevel < l.maxLevel);
  if(labSearch){
    const q = labSearch.toLowerCase();
    rows = rows.filter(l => l.name.toLowerCase().includes(q));
  }

  const byCategory = {};
  for(const lab of rows){
    if(!byCategory[lab.category]) byCategory[lab.category] = [];
    byCategory[lab.category].push(lab);
  }

  let html = '';
  for(const cat of LAB_CATEGORIES){
    const labs = byCategory[cat];
    if(!labs || !labs.length) continue;
    html += `<div class="labs-category">
      <div class="labs-category-title">${cat}</div>
      <table class="labs-table">
        <thead><tr>
          <th style="width:35%">Lab</th>
          <th>Level</th>
          <th>Target</th>
          <th>Cost to Target</th>
          <th>Time to Target</th>
          <th>Max</th>
          <th style="min-width:80px">Progress</th>
        </tr></thead>
        <tbody>${labs.map(lab => {
          const isComplete = lab.currentLevel >= lab.maxLevel;
          const pct = Math.min(100, Math.round((lab.currentLevel / lab.maxLevel) * 100));
          const fillClass = isComplete ? 'complete' : '';
          const lvlCell = mkSpin(lab.currentLevel, 0, lab.maxLevel, false, `labSetLevel(${lab.id},__V__)`);
          const tgtCell = isComplete
            ? `<span class="lab-max-label">—</span>`
            : mkSpin(lab.targetLevel ?? lab.currentLevel, lab.currentLevel, lab.maxLevel, false, `labSetTarget(${lab.id},__V__)`);
          const {cost: costToTgt, dur: durToTgt} = labCostAndTimeToTarget(lab);
          const costHtml = isComplete
            ? `<span class="lab-max-label">—</span>`
            : costToTgt != null
              ? `<span style="font-family:var(--mono);color:var(--gold)">${fmtCoins(costToTgt)}</span>`
              : `<span style="color:var(--muted);font-size:11px">—</span>`;
          const timeHtml = isComplete
            ? `<span class="lab-max-label">—</span>`
            : durToTgt != null
              ? `<span style="font-family:var(--mono);color:var(--accent)">${fmtDuration(durToTgt / labCellSpeedMult())}</span>`
              : `<span style="color:var(--muted);font-size:11px">—</span>`;
          return `<tr class="${isComplete?'lab-row-maxed':''}">
            <td style="font-weight:500;cursor:pointer;color:var(--accent)"
              onclick="showLabCosts(${lab.id})"
              title="Click to view cost breakdown">${escHtml(lab.name)}</td>
            <td>${lvlCell}</td>
            <td>${tgtCell}</td>
            <td>${costHtml}</td>
            <td>${timeHtml}</td>
            <td style="font-family:var(--mono);color:${isComplete?'#f5c842':'var(--muted)'}">${isComplete?'★ ':''}${lab.maxLevel}</td>
            <td>
              <div class="labs-progress" title="${pct}%">
                <div class="labs-progress-fill ${fillClass}" style="width:${pct}%"></div>
              </div>
            </td>
          </tr>
          <tr id="lab-cost-${lab.id}" style="display:none">
            <td colspan="7" style="padding:8px 16px 12px 24px;background:var(--surface2)">
              <span style="color:var(--muted);font-size:12px">Loading…</span>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  if(!html) html = '<div style="color:var(--muted);padding:2rem;text-align:center">No labs match the current filter.</div>';
  document.getElementById('labTablesWrap').innerHTML = html;
}

// ── Shortest Labs to Max ──────────────────────────────────────────────────────

let slMaxDays = 14;
let slCellSpeedIdx = 0;

async function renderShortestLabsView(){
  const speedOpts = LP_SPEEDS.map((s,i) =>
    `<option value="${i}" ${i===slCellSpeedIdx?'selected':''}>${s.label}</option>`
  ).join('');

  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:0.5rem">Shortest to Max</div>
    <div style="color:var(--muted);font-size:13px;margin-bottom:1.2rem;max-width:640px">
      Labs that can be fully researched to max level within your time budget — useful for
      picking quick wins to improve gem rush efficiency.
    </div>
    <div class="labs-controls" style="align-items:flex-end">
      <div class="form-group" style="margin-bottom:0;min-width:140px">
        <label class="form-label">Max Days</label>
        <input class="form-input" type="number" min="1" step="1" id="sl-max-days" value="${slMaxDays}">
      </div>
      <div class="form-group" style="margin-bottom:0;min-width:140px">
        <label class="form-label">Cell Speed</label>
        <select class="form-input" id="sl-cell-speed">${speedOpts}</select>
      </div>
      <button class="btn btn-primary" onclick="slCalculate()">Calculate</button>
    </div>
    <div id="slResultsWrap"></div>`;

  await slCalculate();
}

async function slCalculate(){
  const daysInput = document.getElementById('sl-max-days');
  const speedSel = document.getElementById('sl-cell-speed');
  slMaxDays = Math.max(1, parseInt(daysInput.value) || 1);
  daysInput.value = slMaxDays;
  slCellSpeedIdx = +speedSel.value;
  const cellSpeed = LP_SPEEDS[slCellSpeedIdx].value;

  const wrap = document.getElementById('slResultsWrap');
  wrap.innerHTML = '<div class="loading-placeholder" style="padding:3rem;text-align:center">Loading…</div>';

  try{
    const params = new URLSearchParams({maxDays: slMaxDays, cellSpeed});
    const [costMap, allLabs] = await Promise.all([
      fetch(`${API}/labs/shortestLabs?${params}`).then(r => r.json()),
      fetch(`${API}/labs`).then(r => r.json()),
    ]);
    slRenderResults(costMap, allLabs);
  }catch(e){
    wrap.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function slRenderResults(costMap, allLabs){
  const labById = new Map(allLabs.map(l => [String(l.id), l]));
  const rows = Object.entries(costMap)
    .map(([id, c]) => ({lab: labById.get(id), id, ...c}))
    .sort((a,b) => a.durationSeconds - b.durationSeconds);

  const wrap = document.getElementById('slResultsWrap');
  if(!rows.length){
    wrap.innerHTML = '<div style="color:var(--muted);padding:2rem;text-align:center">No labs can be maxed within that time budget.</div>';
    return;
  }

  wrap.innerHTML = `<table class="labs-table" style="margin-top:0.8rem">
    <thead><tr>
      <th style="width:35%">Lab</th>
      <th>Category</th>
      <th>To Level</th>
      <th>Time</th>
      <th>Coin Cost</th>
    </tr></thead>
    <tbody>${rows.map(r => `
      <tr>
        <td style="font-weight:500">${escHtml(r.lab?.name ?? `Lab ${r.id}`)}</td>
        <td style="color:var(--muted)">${escHtml(r.lab?.category ?? '—')}</td>
        <td style="font-family:var(--mono)">${r.level}</td>
        <td style="font-family:var(--mono);color:var(--accent)">${fmtDuration(r.durationSeconds)}</td>
        <td style="font-family:var(--mono);color:var(--gold)">${fmtRaw(r.coinCost)}</td>
      </tr>`).join('')}</tbody>
  </table>`;
}

async function labSetLevel(id, newLevel){
  const lab = labData.find(l => l.id === id);
  if(!lab) return;
  newLevel = Math.min(Math.max(newLevel|0, 0), lab.maxLevel);
  lab.currentLevel = newLevel;
  if(lab.name === 'Labs Speed' || lab.name === 'Labs Coin Discount'){
    const res = await fetch(`${API}/labs/multipliers`);
    labMultipliers = await res.json();
  }
  await fetch(`${API}/labs/${id}/state`,{method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({currentLevel: newLevel, targetLevel: lab.targetLevel})});
  renderLabTables();
}

async function labSetTarget(id, newTarget){
  const lab = labData.find(l => l.id === id);
  if(!lab) return;
  const targetLevel = newTarget == null || newTarget === '' ? null
    : Math.min(Math.max(newTarget|0, lab.currentLevel + 1), lab.maxLevel);
  lab.targetLevel = targetLevel;
  await fetch(`${API}/labs/${id}/state`,{method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({currentLevel: lab.currentLevel, targetLevel})});
  renderLabTables();
}

function labCostAndTimeToTarget(lab){
  if(!labMultipliers) return {cost: null, dur: null};
  const costs = labCostCache[lab.id] || labCostCache[String(lab.id)];
  if(!costs) return {cost: null, dur: null};
  const target = lab.targetLevel ?? lab.maxLevel;
  if(target <= lab.currentLevel) return {cost: null, dur: null};
  const {speedMult, costMult} = labMultipliers;
  const remaining = costs.filter(c => c.level > lab.currentLevel && c.level <= target);
  const cost = remaining.reduce((a,c) => a + (c.coinCost || 0), 0) * costMult;
  const dur  = remaining.reduce((a,c) => a + (c.durationSeconds || 0), 0) / speedMult;
  return {cost: cost || null, dur: dur || null};
}


let labCostCache = {};

async function showLabCosts(id){
  const el = document.getElementById(`lab-cost-${id}`);
  if(el.style.display !== 'none'){el.style.display='none';return;}
  el.style.display='table-row';
  const lab = labData.find(l => l.id === id);
  const cached = labCostCache[id] || labCostCache[String(id)];
  if(cached){renderLabCostTable(id, lab, cached);return;}
  el.querySelector('td').innerHTML = '<span style="color:var(--muted);font-size:12px">Loading…</span>';
  const res = await fetch(`${API}/labs/${id}/costs`);
  const costs = await res.json();
  labCostCache[id] = costs;
  renderLabCostTable(id, lab, costs);
}

let labMultipliers = null;
async function getLabMultipliers(){
  if(!labMultipliers){
    const res = await fetch(`${API}/labs/multipliers`);
    labMultipliers = await res.json();
  }
  return labMultipliers;
}

async function renderLabCostTable(id, lab, costs){
  const {currentLevel, targetLevel, maxLevel} = lab;
  const el = document.getElementById(`lab-cost-${id}`);
  if(!costs.length){el.querySelector('td').innerHTML='<span style="color:var(--muted);font-size:12px">No cost data available.</span>';return;}

  const {speedMult, costMult, labsSpeedLevel, coinDiscountLevel, relicLabSpeedBonus} = await getLabMultipliers();
  const effective_target = targetLevel != null ? targetLevel : maxLevel;
  const remaining = costs.filter(c => c.level > currentLevel && c.level <= effective_target);
  const totalRemainingDur = remaining.reduce((a,c)=>(c.durationSeconds||0)+a, 0);
  const totalRemainingCost = remaining.reduce((a,c)=>(c.coinCost||0)+a, 0);
  const adjRemainingDur = totalRemainingDur / speedMult;
  const adjRemainingCost = totalRemainingCost * costMult;
  const allDur = costs.reduce((a,c)=>(c.durationSeconds||0)+a, 0);
  const allCost = costs.reduce((a,c)=>(c.coinCost||0)+a, 0);

  const relicNote = relicLabSpeedBonus > 0 ? ` + ${(relicLabSpeedBonus*100).toFixed(1)}% relics` : '';
  const multiplierNote = `<span style="color:var(--muted);font-size:11px">Labs Speed L${labsSpeedLevel} (${speedMult.toFixed(2)}x total${relicNote}) &nbsp;·&nbsp; Coin Discount L${coinDiscountLevel} (${(coinDiscountLevel*0.3).toFixed(1)}% off)</span>`;

  el.querySelector('td').innerHTML = `
    <div style="padding:8px 0 2px;display:flex;gap:24px;font-size:12px;margin-bottom:4px;flex-wrap:wrap">
      <span style="color:var(--muted)">To target (adjusted): <b style="color:var(--accent)">${fmtDuration(adjRemainingDur)}</b> &nbsp;/&nbsp; <b style="color:var(--gold)">${fmtCoins(adjRemainingCost)} coins</b></span>
      <span style="color:var(--muted)">To target (raw): <b style="color:var(--muted)">${fmtDuration(totalRemainingDur)}</b> &nbsp;/&nbsp; <b style="color:var(--muted)">${fmtCoins(totalRemainingCost)} coins</b></span>
      <span style="color:var(--muted)">Total all levels (raw): <b style="color:var(--muted)">${fmtDuration(allDur)}</b> &nbsp;/&nbsp; <b style="color:var(--muted)">${fmtCoins(allCost)} coins</b></span>
    </div>
    <div style="margin-bottom:8px">${multiplierNote}</div>
    <table style="border-collapse:collapse;font-size:12px;font-family:var(--mono);width:auto">
      <thead><tr>
        <th style="padding:3px 10px 3px 0;color:var(--muted);font-size:10px;text-align:right">Lvl</th>
        <th style="padding:3px 10px;color:var(--muted);font-size:10px">Duration (adj)</th>
        <th style="padding:3px 10px;color:var(--muted);font-size:10px;text-align:right">Coins (adj)</th>
        <th style="padding:3px 10px;color:var(--muted);font-size:10px">Duration (raw)</th>
        <th style="padding:3px 10px;color:var(--muted);font-size:10px;text-align:right">Coins (raw)</th>
      </tr></thead>
      <tbody>${costs.map(c=>{
        const done = c.level <= currentLevel;
        const inRange = c.level > currentLevel && c.level <= effective_target;
        const style = done ? 'opacity:.4' : inRange ? 'color:var(--text)' : 'color:var(--muted)';
        const adjDur = c.durationSeconds != null ? c.durationSeconds / speedMult : null;
        const adjCost = c.coinCost != null ? c.coinCost * costMult : null;
        return `<tr style="${style}">
          <td style="padding:2px 10px 2px 0;text-align:right">${c.level}</td>
          <td style="padding:2px 10px">${fmtDuration(adjDur)}</td>
          <td style="padding:2px 10px;text-align:right">${fmtCoins(adjCost)}</td>
          <td style="padding:2px 10px;color:var(--muted)">${fmtDuration(c.durationSeconds)}</td>
          <td style="padding:2px 10px;text-align:right;color:var(--muted)">${fmtCoins(c.coinCost)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

async function saveNewRelic(){
  const name = document.getElementById('newRelicName').value.trim();
  const rarity = document.getElementById('newRelicRarity').value;
  const type = document.getElementById('newRelicType').value;
  const bonusStat = document.getElementById('newRelicStat').value;
  const bonusValue = parseFloat(document.getElementById('newRelicValue').value);
  const obtainCondition = document.getElementById('newRelicCondition').value.trim();
  if(!name||!bonusStat||isNaN(bonusValue)){alert('Name, stat and value are required.');return;}
  try{
    const editing = editingRelicId != null;
    const resp = await fetch(editing ? `${API}/relics/${editingRelicId}` : `${API}/relics`,{
      method: editing ? 'PUT' : 'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,rarity,type,bonusStat,bonusValue,obtainCondition})});
    if(!resp.ok){
      const msg = await resp.text();
      alert(msg || 'Failed to save relic.');
      return;
    }
    closeAddRelicModal();
    const res=await fetch(`${API}/relics`);
    relicData=await res.json();
    buildRelicsPage();
  }catch(e){alert('Failed to save: '+e.message);}
}

// ── Cosmetics ─────────────────────────────────────────────────────────────────
let cosmeticData = [], cosmeticSearch = '', cosmeticOwnedFilter = 'All';

async function renderCosmeticsView() {
  document.getElementById('mainContent').innerHTML =
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading cosmetics…</div>';
  try {
    const res = await fetch(`${API}/cosmetics`);
    if (!res.ok) throw new Error(res.statusText);
    cosmeticData = await res.json();
    buildCosmeticsPage();
  } catch(e) {
    document.getElementById('mainContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildCosmeticsPage() {
  const categories = [
    { id: 'event',          label: 'Event Skins' },
    { id: 'milestone_skin', label: 'Milestone Skins' },
    { id: 'song',           label: 'Songs' },
    { id: 'guardian',       label: 'Guardians' },
    { id: 'menu',           label: 'Menu' },
    { id: 'profile_banner', label: 'Profile Banners' },
  ];

  // Summary per logical category
  const bonusRate = { tower_skin: 0.004, background_skin: 0.008, milestone_skin: 0.004,
                      song: 0.006, guardian: 0.006, menu: 0.006, profile_banner: 0.006 };

  // Event skins: deduplicate by eventId (count each event once for the summary)
  const events = groupEventSkins(cosmeticData);
  const eventOwned   = events.filter(e => e.towerOwned || e.bgOwned).length;
  const towerOwned   = cosmeticData.filter(i => i.categoryId === 'tower_skin'      && i.owned).length;
  const bgOwned      = cosmeticData.filter(i => i.categoryId === 'background_skin' && i.owned).length;
  const towerBonus   = towerOwned * 0.004;
  const bgBonus      = bgOwned * 0.008;
  const towerMax     = cosmeticData.filter(i => i.categoryId === 'tower_skin').length;
  const bgMax        = cosmeticData.filter(i => i.categoryId === 'background_skin').length;

  function catSummary(catId) {
    const items = cosmeticData.filter(i => i.categoryId === catId);
    const owned = items.filter(i => i.owned).length;
    const bonus = owned * (bonusRate[catId] || 0);
    const maxBonus = items.length * (bonusRate[catId] || 0);
    return { items, owned, total: items.length, bonus, maxBonus };
  }

  const totalActive = cosmeticData.filter(i => i.owned).reduce((s, i) => s + bonusRate[i.categoryId], 0);
  const totalMax    = cosmeticData.reduce((s, i) => s + bonusRate[i.categoryId], 0);

  // Summary cards
  const summaryHtml = `
    <div class="cosmetic-sum-card" style="border-color:rgba(79,142,247,.3)">
      <div class="lbl">Total Bonus</div>
      <div class="count" style="color:var(--accent)">x${totalActive.toFixed(3)}<span> / x${totalMax.toFixed(3)}</span></div>
    </div>
    <div class="cosmetic-sum-card">
      <div class="lbl">Event Towers</div>
      <div class="count">${towerOwned}<span> / ${towerMax}</span></div>
      <div class="bonus">+${(towerBonus*100).toFixed(1)}%</div>
    </div>
    <div class="cosmetic-sum-card">
      <div class="lbl">Event Backgrounds</div>
      <div class="count">${bgOwned}<span> / ${bgMax}</span></div>
      <div class="bonus">+${(bgBonus*100).toFixed(1)}%</div>
    </div>
    ${['milestone_skin','song','guardian','menu','profile_banner'].map(cid => {
      const s = catSummary(cid);
      const lbl = { milestone_skin:'Milestone Skins', song:'Songs', guardian:'Guardians',
                    menu:'Menu', profile_banner:'Profile Banners' }[cid];
      return `<div class="cosmetic-sum-card">
        <div class="lbl">${lbl}</div>
        <div class="count">${s.owned}<span> / ${s.total}</span></div>
        <div class="bonus">+${(s.bonus*100).toFixed(1)}%</div>
      </div>`;
    }).join('')}`;

  document.getElementById('mainContent').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <div class="report-title">Cosmetics</div>
      <button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="openAddCosmeticModal()">+ Add Cosmetic</button>
    </div>
    <div class="section-title">Bonus Summary</div>
    <div class="cosmetic-summary">${summaryHtml}</div>

    <div class="cosmetic-controls">
      <input class="cosmetic-search" type="text" placeholder="Search by name or event…"
        value="${escHtml(cosmeticSearch)}" oninput="cosmeticSearch=this.value;buildCosmeticsPage()">
      <button class="cosmetic-filter-btn${cosmeticOwnedFilter==='All'?' active':''}"
        onclick="cosmeticOwnedFilter='All';buildCosmeticsPage()">All</button>
      <button class="cosmetic-filter-btn${cosmeticOwnedFilter==='Owned'?' active':''}"
        onclick="cosmeticOwnedFilter='Owned';buildCosmeticsPage()">Owned only</button>
      <button class="cosmetic-filter-btn${cosmeticOwnedFilter==='Missing'?' active':''}"
        onclick="cosmeticOwnedFilter='Missing';buildCosmeticsPage()">Missing only</button>
    </div>

    <div class="section-title">Event Skins</div>
    ${renderEventSkinsTable(events)}

    <div class="section-title">Milestone Skins</div>
    ${renderSimpleTable(cosmeticData.filter(i=>i.categoryId==='milestone_skin'), 'milestone')}

    <div class="section-title">Songs</div>
    ${renderSimpleTable(cosmeticData.filter(i=>i.categoryId==='song'), 'simple')}

    <div class="section-title">Guardians</div>
    ${renderSimpleTable(cosmeticData.filter(i=>i.categoryId==='guardian'), 'simple')}

    <div class="section-title">Menu</div>
    ${renderSimpleTable(cosmeticData.filter(i=>i.categoryId==='menu'), 'simple')}

    <div class="section-title">Profile Banners</div>
    ${renderSimpleTable(cosmeticData.filter(i=>i.categoryId==='profile_banner'), 'simple')}
  `;
}

function groupEventSkins(data) {
  const map = new Map();
  for (const item of data) {
    if (item.categoryId !== 'tower_skin' && item.categoryId !== 'background_skin') continue;
    const key = item.eventId;
    if (!map.has(key)) map.set(key, { eventId: key, eventName: item.eventName, rerollMultiplier: item.rerollMultiplier,
      towerId: null, towerName: '', towerOwned: false, bgId: null, bgName: '', bgOwned: false });
    const e = map.get(key);
    if (item.categoryId === 'tower_skin') { e.towerId = item.id; e.towerName = item.name; e.towerOwned = item.owned; }
    else                                  { e.bgId    = item.id; e.bgName   = item.name; e.bgOwned   = item.owned; }
  }
  return [...map.values()];
}

function renderEventSkinsTable(events) {
  const q = cosmeticSearch.toLowerCase();
  let rows = events;
  if (q) rows = rows.filter(e =>
    e.eventName.toLowerCase().includes(q) ||
    e.towerName.toLowerCase().includes(q) ||
    e.bgName.toLowerCase().includes(q));
  if (cosmeticOwnedFilter === 'Owned')   rows = rows.filter(e => e.towerOwned && e.bgOwned);
  if (cosmeticOwnedFilter === 'Missing') rows = rows.filter(e => !e.towerOwned || !e.bgOwned);
  if (!rows.length) return '<div style="color:var(--muted);font-size:13px;padding:.5rem 0">No events match the current filter.</div>';
  return `<table class="cosmetic-table">
    <thead><tr>
      <th>Event</th><th>Tower Skin</th><th style="text-align:center">Owned</th>
      <th>Background Skin</th><th style="text-align:center">Owned</th><th>Reroll</th>
    </tr></thead>
    <tbody>${rows.map(e => `
      <tr class="${e.towerOwned&&e.bgOwned?'':'not-owned'}">
        <td style="font-weight:600">${escHtml(e.eventName)}</td>
        <td>${escHtml(e.towerName)}</td>
        <td style="text-align:center">
          <label class="owned-toggle" title="Tower skin owned">
            <input type="checkbox" ${e.towerOwned?'checked':''} onchange="toggleCosmetic(${e.towerId},this.checked)">
          </label>
        </td>
        <td>${escHtml(e.bgName)}</td>
        <td style="text-align:center">
          <label class="owned-toggle" title="Background skin owned">
            <input type="checkbox" ${e.bgOwned?'checked':''} onchange="toggleCosmetic(${e.bgId},this.checked)">
          </label>
        </td>
        <td>${e.rerollMultiplier > 1 ? `<span class="reroll-badge">x${e.rerollMultiplier}</span>` : ''}</td>
      </tr>`).join('')}
    </tbody></table>`;
}

function renderSimpleTable(items, mode) {
  const q = cosmeticSearch.toLowerCase();
  let rows = items;
  if (q) rows = rows.filter(i => i.name.toLowerCase().includes(q));
  if (cosmeticOwnedFilter === 'Owned')   rows = rows.filter(i => i.owned);
  if (cosmeticOwnedFilter === 'Missing') rows = rows.filter(i => !i.owned);
  if (!rows.length) return '<div style="color:var(--muted);font-size:13px;padding:.5rem 0">Nothing matches the current filter.</div>';
  const milestoneHeaders = mode === 'milestone'
    ? '<th>Tier</th><th>Unlock</th>'
    : '';
  return `<table class="cosmetic-table">
    <thead><tr>
      <th>Name</th>${milestoneHeaders}<th style="text-align:center">Owned</th>
    </tr></thead>
    <tbody>${rows.map(i => {
      const extra = mode === 'milestone' ? `
        <td><span class="milestone-badge">${escHtml(i.milestoneTier||'')}</span></td>
        <td><span class="unlock-badge ${i.milestoneUnlock==='Free'?'Free':'Pass'}">${escHtml(i.milestoneUnlock||'')}</span></td>` : '';
      return `<tr class="${i.owned?'':'not-owned'}">
        <td style="font-weight:600">${escHtml(i.name)}</td>${extra}
        <td style="text-align:center">
          <label class="owned-toggle">
            <input type="checkbox" ${i.owned?'checked':''} onchange="toggleCosmetic(${i.id},this.checked)">
          </label>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table>`;
}

async function toggleCosmetic(id, owned) {
  try {
    await fetch(`${API}/cosmetics/${id}/owned`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ owned })
    });
    const idx = cosmeticData.findIndex(i => i.id === id);
    if (idx >= 0) cosmeticData[idx] = { ...cosmeticData[idx], owned };
    buildCosmeticsPage();
  } catch(e) { alert('Failed to update: ' + e.message); }
}

function openAddCosmeticModal() {
  document.getElementById('addCosmeticModal').style.display = 'flex';
  onCosmeticCategoryChange();
}

function closeAddCosmeticModal() {
  document.getElementById('addCosmeticModal').style.display = 'none';
}

function onCosmeticCategoryChange() {
  const cat = document.getElementById('newCosmeticCategory').value;
  const isEvent = cat === 'event';
  const isMilestone = cat === 'milestone_skin';
  document.querySelectorAll('#addCosmeticModal .field-event').forEach(el => el.style.display = isEvent ? 'block' : 'none');
  document.querySelectorAll('#addCosmeticModal .field-item').forEach(el => el.style.display = isEvent ? 'none' : 'block');
  document.querySelectorAll('#addCosmeticModal .field-milestone').forEach(el => el.style.display = isMilestone ? 'block' : 'none');
}

async function saveNewCosmetic() {
  const cat = document.getElementById('newCosmeticCategory').value;
  try {
    let res;
    if (cat === 'event') {
      res = await fetch(`${API}/cosmetics/events`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          eventName:     document.getElementById('newEventName').value.trim(),
          reroll:        parseInt(document.getElementById('newEventReroll').value) || 1,
          towerSkinName: document.getElementById('newTowerSkinName').value.trim(),
          bgSkinName:    document.getElementById('newBgSkinName').value.trim()
        })
      });
    } else {
      res = await fetch(`${API}/cosmetics/items`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          categoryId:      cat,
          name:            document.getElementById('newCosmeticName').value.trim(),
          milestoneNumber: cat === 'milestone_skin' ? (parseInt(document.getElementById('newMilestoneNumber').value) || null) : null,
          milestoneTier:   cat === 'milestone_skin' ? document.getElementById('newMilestoneTier').value.trim() || null : null,
          milestoneUnlock: cat === 'milestone_skin' ? document.getElementById('newMilestoneUnlock').value || null : null
        })
      });
    }
    if (!res.ok) throw new Error(await res.text());
    cosmeticData = await res.json();
    closeAddCosmeticModal();
    buildCosmeticsPage();
  } catch(e) { alert('Failed to save: ' + e.message); }
}

// ── Currencies view ───────────────────────────────────────────────────────────

const CURRENCY_FIELDS = [
  { key: 'coins',              label: 'Coins',               type: 'tower' },
  { key: 'gems',               label: 'Gems',                type: 'int'   },
  { key: 'stones',             label: 'Stones',              type: 'int'   },
  { key: 'medals',             label: 'Medals',              type: 'int'   },
  { key: 'eliteCells',         label: 'Elite Cells',         type: 'tower' },
  { key: 'keys',               label: 'Keys',                type: 'int'   },
  { key: 'tokens',             label: 'Tokens',              type: 'int'   },
  { key: 'bits',               label: 'Bits',                type: 'int'   },
  { key: 'tournamentTickets',  label: 'Tournament Tickets',  type: 'int'   },
  { key: 'moduleTickets',      label: 'Module Tickets',      type: 'int'   },
  { key: 'cannonShards',       label: 'Cannon Shards',       type: 'int'   },
  { key: 'armorShards',        label: 'Armor Shards',        type: 'int'   },
  { key: 'generatorShards',    label: 'Generator Shards',    type: 'int'   },
  { key: 'coreShards',         label: 'Core Shards',         type: 'int'   },
  { key: 'reRollShards',       label: 'Reroll Shards',       type: 'int'   },
];

function towerNumberToDisplay(tn) {
  if (!tn) return '';
  // Serializer produces { display, raw, suffix }
  return tn.display ?? (tn.raw ?? '');
}

async function renderCurrenciesView() {
  const mc = document.getElementById('mainContent');
  mc.innerHTML = `<div class="report-title" style="margin-bottom:1rem">Currencies</div>
    <div id="currLoadMsg" style="color:var(--muted);font-size:13px;margin-bottom:1rem">Loading…</div>
    <div id="currForm" style="display:none">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:1.25rem">
        ${CURRENCY_FIELDS.map(f => `
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px">${f.label}</label>
            <input id="curr_${f.key}" type="text"
              style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
                     color:var(--text);padding:6px 10px;font-size:13px;font-family:var(--mono)">
          </div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn" onclick="saveCurrencies()">Save Snapshot</button>
        <span id="currSaveStatus" style="font-size:12px;color:var(--muted)"></span>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:0.75rem">
        Saving creates a timestamped snapshot used by the Shard Rate velocity tracker.
        Enter scaled values exactly as shown in-game (e.g. <em>21.33T</em>, <em>416.93K</em>).
      </p>
    </div>`;

  try {
    const data = await fetch(`${API}/player-tracker/currencies`).then(r => r.json());
    document.getElementById('currLoadMsg').style.display = 'none';
    document.getElementById('currForm').style.display = 'block';
    for (const f of CURRENCY_FIELDS) {
      const el = document.getElementById('curr_' + f.key);
      if (!el) continue;
      const v = data[f.key];
      if (f.type === 'tower') el.value = towerNumberToDisplay(v);
      else el.value = v ?? 0;
    }
  } catch(e) {
    document.getElementById('currLoadMsg').textContent = 'Failed to load: ' + e.message;
  }
}

async function saveCurrencies() {
  const status = document.getElementById('currSaveStatus');
  status.textContent = 'Saving…';
  try {
    const body = {};
    for (const f of CURRENCY_FIELDS) {
      const str = document.getElementById('curr_' + f.key)?.value ?? '';
      if (f.type === 'tower') {
        // Parse "21.33T" or "416.93K" → { raw: <flat>, suffix: "T" }
        const m = str.trim().match(/^([\d.]+)\s*([A-Za-z]*)$/);
        const coeff = m ? parseFloat(m[1]) : 0;
        const suf = m?.[2] || '';
        const scales = {K:1e3,M:1e6,B:1e9,T:1e12,Qa:1e15,Qi:1e18,Sx:1e21,Sp:1e24,Oc:1e27,No:1e30,Dc:1e33};
        const rawVal = coeff * (scales[suf] ?? 1);
        body[f.key] = { raw: rawVal, suffix: suf };
      } else {
        body[f.key] = parseInt(str.replace(/,/g, ''), 10) || 0;
      }
    }
    const res = await fetch(`${API}/player-tracker/currencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    status.style.color = 'var(--green)';
    status.textContent = 'Saved ✓';
    setTimeout(() => { status.textContent = ''; status.style.color = 'var(--muted)'; }, 3000);
  } catch(e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Save failed: ' + e.message;
  }
}

// ── Tier Personal Best ────────────────────────────────────────────────────

const DISSONANCE_TYPES = ['attack','defense','utility','uw'];
const DISSONANCE_LABELS = {attack:'Attack',defense:'Defense',utility:'Utility',uw:'Ult. Weapon'};

async function renderTierPbView() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div style="max-width:1050px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
        <div>
          <div class="report-title">Tier Personal Bests</div>
          <div style="color:var(--muted);font-size:13px">Wave counts per tier — dissonance boosts computed from Dissonant Echo lab level</div>
        </div>
        <button class="btn btn-primary" onclick="addTierPbRow()">+ Add Tier</button>
      </div>
      <div id="tierPbTournament" style="margin-bottom:1rem"></div>
      <div id="tierPbStatus" style="font-size:12px;color:var(--muted);margin-bottom:0.75rem;min-height:18px"></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:var(--surface);border-radius:var(--radius);overflow:hidden">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Tier</th>
            <th style="padding:9px 12px;text-align:left;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Wave PB</th>
            <th style="padding:9px 12px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px" colspan="2">Attack</th>
            <th style="padding:9px 12px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px" colspan="2">Defense</th>
            <th style="padding:9px 12px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px" colspan="2">Utility</th>
            <th style="padding:9px 12px;text-align:center;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px" colspan="2">Ult. Weapon</th>
          </tr>
          <tr style="background:var(--surface2);border-top:1px solid var(--border)">
            <th colspan="2"></th>
            ${['attack','defense','utility','uw'].map(() => `
              <th style="padding:4px 12px;text-align:center;font-size:10px;color:var(--muted);font-weight:500">Waves</th>
              <th style="padding:4px 12px;text-align:center;font-size:10px;color:var(--muted);font-weight:500">Boost</th>`).join('')}
          </tr>
        </thead>
        <tbody id="tierPbBody">
          <tr><td colspan="10" style="padding:2rem;text-align:center;color:var(--muted)">Loading…</td></tr>
        </tbody>
      </table>
    </div>`;

  try {
    const data = await fetch(`${API}/tier-pb`).then(r => r.json());
    renderTierPbTournament(data.tournamentBoost, data.echoLevels);
    renderTierPbRows(data.tiers);
  } catch(e) {
    document.getElementById('tierPbBody').innerHTML =
      `<tr><td colspan="10" style="padding:2rem;text-align:center;color:var(--red)">Failed to load: ${e.message}</td></tr>`;
  }
}

function renderTierPbTournament(boost, echoLevels) {
  const types = [
    {key:'attack',  label:'Attack',      color:'var(--red)'},
    {key:'defense', label:'Defense',     color:'var(--accent)'},
    {key:'utility', label:'Utility',     color:'var(--accent2)'},
    {key:'uw',      label:'Ult. Weapon', color:'var(--gold)'}
  ];
  document.getElementById('tierPbTournament').innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius);padding:14px 18px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:10px">
        Tournament Dissonance Boost
      </div>
      <div style="display:flex;gap:2rem;flex-wrap:wrap">
        ${types.map(t => `
          <div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:3px">${t.label}</div>
            <div style="font-size:1.3rem;font-weight:700;font-family:var(--mono);color:${t.color}">x${boost[t.key]}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">Echo Lv ${echoLevels[t.key]}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderTierPbRows(rows) {
  const tbody = document.getElementById('tierPbBody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:2rem;text-align:center;color:var(--muted)">No tiers yet — click Add Tier to get started.</td></tr>`;
    return;
  }
  const types = ['attack','defense','utility','uw'];
  tbody.innerHTML = rows.map(r => `
    <tr style="border-top:1px solid var(--border)">
      <td style="padding:7px 12px;font-family:var(--mono);font-weight:700;color:var(--accent)">T${r.tier}</td>
      <td style="padding:4px 8px"><input type="number" min="0" value="${r.wave}"
        style="width:90px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:4px 8px;font-family:var(--mono);font-size:13px"
        onchange="saveTierPbWave(${r.tier}, this.value)"></td>
      ${types.map(t => {
        const waves = r[t + 'Waves'];
        const color = waves >= 5000 ? 'rgba(61,214,140,0.15)' : waves > 0 ? 'rgba(245,158,66,0.15)' : '';
        const borderColor = waves >= 5000 ? 'rgba(61,214,140,0.4)' : waves > 0 ? 'rgba(245,158,66,0.4)' : 'var(--border2)';
        return `
        <td style="padding:4px 8px">
          <input type="number" min="0" max="5000" value="${waves}"
            style="width:80px;background:${color || 'var(--surface2)'};border:1px solid ${borderColor};border-radius:6px;color:var(--text);padding:4px 8px;font-family:var(--mono);font-size:13px"
            onchange="saveTierPbDissonance(${r.tier}, '${t.toUpperCase()}', this.value)">
        </td>
        <td style="padding:7px 12px;font-family:var(--mono);font-size:12px;color:var(--muted);text-align:center">x${r[t + 'Boost']}</td>`;
      }).join('')}
    </tr>`).join('');
}

async function saveTierPbWave(tier, wave) {
  await tierPbPatch(`${API}/tier-pb/${tier}/wave`, { wave: parseInt(wave) || 0 });
}

async function saveTierPbDissonance(tier, type, waves) {
  await tierPbPatch(`${API}/tier-pb/${tier}/dissonance`, { type, waves: parseInt(waves) || 0 });
}

async function tierPbPatch(url, body) {
  const status = document.getElementById('tierPbStatus');
  try {
    const res = await fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    status.style.color = 'var(--green)';
    status.textContent = 'Saved ✓';
    setTimeout(() => { status.textContent = ''; status.style.color = 'var(--muted)'; }, 2000);
  } catch(e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Save failed: ' + e.message;
  }
}

async function addTierPbRow() {
  const { tiers: rows } = await fetch(`${API}/tier-pb`).then(r => r.json());
  const nextTier = rows.length ? Math.max(...rows.map(r => r.tier)) + 1 : 1;
  await fetch(`${API}/tier-pb/${nextTier}`, { method: 'POST' });
  await renderTierPbView();
}

let verChangeRows = [];
let verModalMode = 'add'; // 'add' | 'edit'
let verEditingVersion = null;
let verVersionAuto = false; // true while the version field holds an unedited auto-suggestion

// Suggest the next version number from the latest existing version and the bump type.
// verData is sorted newest-first by semver, so verData[0] is the latest.
function suggestNextVersion(type) {
  const versions = window.verData || [];
  if (!versions.length) return '1.0.0';
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(versions[0].version || '');
  if (!m) return '1.0.0';
  let maj = +m[1], min = +m[2], pat = +m[3];
  switch ((type || '').toLowerCase()) {
    case 'major': maj++; min = 0; pat = 0; break;
    case 'minor': min++; pat = 0; break;
    default:      pat++; break; // Patch
  }
  return `${maj}.${min}.${pat}`;
}

// Fill the version field with a suggestion based on the current type, in add mode only.
function applyVersionSuggestion() {
  const verEl = document.getElementById('newVerVersion');
  verEl.value = suggestNextVersion(document.getElementById('newVerType').value);
  verVersionAuto = true;
}

// Wired to the Type dropdown: re-suggest only while adding and the field is untouched.
function onVerTypeChange() {
  if (verModalMode === 'add' && verVersionAuto) applyVersionSuggestion();
}

// Wired to the Version input: once the user types, stop overriding their value.
function onVerVersionInput() {
  verVersionAuto = false;
}

async function openPendingVersionModal() {
  const pending = window.verPending ?? [];
  if (pending.length === 0) { alert('No pending changes to process.'); return; }
  verModalMode = 'add';
  verEditingVersion = null;
  verChangeRows = [];
  document.getElementById('newVerVersion').readOnly = false;
  document.getElementById('newVerType').value = 'Patch';
  applyVersionSuggestion();
  document.getElementById('verChangeRowsEl').innerHTML = '';
  document.getElementById('verModalTitle').textContent = 'Process Pending Changes';
  document.getElementById('verModalSaveBtn').textContent = 'Add Version';
  document.getElementById('addVersionModal').style.display = 'flex';
  pending.forEach(ch => addVerChangeRow({
    category:   ch.category,
    entityName: ch.entityName,
    oldValue:   ch.oldValue,
    newValue:   ch.newValue,
    notes:      ch.notes,
  }, ch.id));
}

function openAddVersionModal() {
  verModalMode = 'add';
  verEditingVersion = null;
  verChangeRows = [];
  document.getElementById('newVerVersion').readOnly = false;
  document.getElementById('newVerType').value = 'Patch';
  applyVersionSuggestion();
  document.getElementById('verChangeRowsEl').innerHTML = '';
  document.getElementById('verModalTitle').textContent = 'Add New Version';
  document.getElementById('verModalSaveBtn').textContent = 'Add Version';
  document.getElementById('addVersionModal').style.display = 'flex';
  addVerChangeRow();
}
function openEditVersionModal(v) {
  verModalMode = 'edit';
  verEditingVersion = v.version;
  verChangeRows = [];
  document.getElementById('newVerVersion').value = v.version;
  document.getElementById('newVerVersion').readOnly = true;
  document.getElementById('newVerType').value = v.type;
  document.getElementById('verChangeRowsEl').innerHTML = '';
  document.getElementById('verModalTitle').textContent = 'Edit Version ' + v.version;
  document.getElementById('verModalSaveBtn').textContent = 'Save Changes';
  document.getElementById('addVersionModal').style.display = 'flex';
  if (v.changes && v.changes.length > 0) {
    v.changes.forEach(ch => addVerChangeRow(ch));
  } else {
    addVerChangeRow();
  }
}
function closeAddVersionModal() {
  document.getElementById('addVersionModal').style.display = 'none';
}
function addVerChangeRow(existing, pendingId) {
  const id = Date.now() + Math.random();
  verChangeRows.push(id);
  const cats = ['LAB','UW','MODULE','RELIC','WORKSHOP','WORKSHOP_PLUS','BOT','CHIP','CARDS','MASTERIES','OTHER'];
  const catDisplay = {'WORKSHOP_PLUS':'WORKSHOP+'};
  const catOptions = cats.map(c => `<option value="${c}"${existing && existing.category===c?' selected':''}>${catDisplay[c]||c}</option>`).join('');
  const pendingAttr = pendingId != null ? ` data-pending-id="${pendingId}"` : '';
  document.getElementById('verChangeRowsEl').insertAdjacentHTML('beforeend', `
    <div id="vcr-${id}"${pendingAttr} style="display:grid;grid-template-columns:110px 1fr 80px 80px 1fr auto;gap:6px;align-items:center;margin-bottom:6px">
      <select class="form-input" id="vcr-cat-${id}" style="font-size:12px;padding:5px 6px">${catOptions}</select>
      <input class="form-input" id="vcr-name-${id}" type="text" placeholder="Entity name" style="font-size:12px;padding:5px 8px" value="${existing ? existing.entityName : ''}">
      <input class="form-input" id="vcr-old-${id}"  type="text" placeholder="Old" style="font-size:12px;padding:5px 8px" value="${existing && existing.oldValue != null ? existing.oldValue : ''}">
      <input class="form-input" id="vcr-new-${id}"  type="text" placeholder="New" style="font-size:12px;padding:5px 8px" value="${existing ? existing.newValue : ''}">
      <input class="form-input" id="vcr-notes-${id}" type="text" placeholder="Notes (optional)" style="font-size:12px;padding:5px 8px" value="${existing && existing.notes ? existing.notes : ''}">
      <button class="btn" style="padding:4px 8px;font-size:12px;color:var(--red)" onclick="removeVerChangeRow(${id})">✕</button>
    </div>`);
}
async function removeVerChangeRow(id) {
  const el = document.getElementById('vcr-' + id);
  const pendingId = el?.dataset.pendingId;
  if (pendingId) {
    await fetch(`${API}/versions/pending/${pendingId}`, { method: 'DELETE' });
    window.verPending = (window.verPending ?? []).filter(p => String(p.id) !== String(pendingId));
    const btn = document.getElementById('verPendingBtn');
    if (btn && window.verPending.length > 0) btn.textContent = `⏳ Process Pending Changes (${window.verPending.length})`;
    else if (btn && window.verPending.length === 0) btn.style.display = 'none';
  }
  el?.remove();
  verChangeRows = verChangeRows.filter(r => r !== id);
}
async function saveNewVersion() {
  const version = document.getElementById('newVerVersion').value.trim();
  const type    = document.getElementById('newVerType').value;
  if (!version) { alert('Version is required.'); return; }
  const changes = verChangeRows
    .filter(id => document.getElementById('vcr-' + id))
    .map(id => ({
      category:   document.getElementById('vcr-cat-' + id).value,
      entityName: document.getElementById('vcr-name-' + id).value.trim(),
      oldValue:   document.getElementById('vcr-old-' + id).value.trim() || null,
      newValue:   document.getElementById('vcr-new-' + id).value.trim(),
      notes:      document.getElementById('vcr-notes-' + id).value.trim() || null
    }))
    .filter(c => c.entityName && c.newValue);
  const btn = document.getElementById('verModalSaveBtn');
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    let res;
    if (verModalMode === 'edit') {
      res = await fetch(`${API}/versions/${encodeURIComponent(verEditingVersion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, changes })
      });
    } else {
      res = await fetch(`${API}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, type, changes })
      });
    }
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (verModalMode === 'add') {
      await fetch(`${API}/versions/pending`, { method: 'DELETE' });
      window.verPending = [];
    }
    closeAddVersionModal();
    await renderVersionTrackerView();
    if (verModalMode === 'add' && !data.synced) showVerSyncBanner(data.version, data.syncTarget);
  } catch(e) {
    alert('Save failed: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = origText;
  }
}
function showVerSyncBanner(version, syncTarget) {
  const existing = document.getElementById('verSyncBanner');
  if (existing) existing.remove();
  const el = document.getElementById('verContent');
  if (!el) return;
  const target = syncTarget === 'ddb'
    ? 'the central database (DynamoDB)'
    : 'Google Sheet (cell B2)';
  el.insertAdjacentHTML('afterbegin', `
    <div id="verSyncBanner" style="display:flex;align-items:center;gap:12px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);border-radius:var(--radius);padding:10px 14px;margin-bottom:12px;font-size:13px">
      <span style="color:var(--red)">⚠</span>
      <span style="flex:1;color:var(--text)">Version <strong>${version}</strong> saved locally but failed to sync to ${target}. Battle reports won't auto-associate until synced.</span>
      <button id="verSyncRetryBtn" class="btn btn-primary" style="font-size:12px;padding:5px 12px" onclick="retrySyncVersion('${version}', '${syncTarget}')">Retry Sync</button>
    </div>`);
}
async function retrySyncVersion(version, syncTarget) {
  const btn = document.getElementById('verSyncRetryBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  const endpoint = syncTarget === 'ddb' ? 'sync-ddb' : 'sync-sheet';
  try {
    const res = await fetch(`${API}/versions/${encodeURIComponent(version)}/${endpoint}`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('verSyncBanner')?.remove();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Retry Sync'; }
    alert('Sync retry failed: ' + e.message);
  }
}

async function renderVersionTrackerView() {
  const mc = document.getElementById('mainContent');
  mc.innerHTML = `<div class="report-title" style="margin-bottom:1rem">Version Tracker</div>
    <div id="verMsg" style="color:var(--muted);font-size:13px">Loading…</div>
    <div id="verContent" style="display:none"></div>`;
  try {
    const [versions, pending] = await Promise.all([
      fetch(`${API}/versions`).then(r => r.json()),
      fetch(`${API}/versions/pending`).then(r => r.json()),
    ]);
    window.verData = versions;
    window.verPending = pending;
    document.getElementById('verMsg').style.display = 'none';
    const el = document.getElementById('verContent');
    el.style.display = 'block';
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">

        <p style="font-size:12px;color:var(--muted);margin:0">${versions.length} versions · click a row to expand changes</p>
        <div style="display:flex;gap:8px">
          <button class="btn" id="verPendingBtn" style="font-size:12px;padding:5px 14px;display:none" onclick="openPendingVersionModal()">⏳ Process Pending Changes</button>
          <button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="openAddVersionModal()">+ Add Version</button>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;background:var(--surface);border-radius:var(--radius);overflow:hidden">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="padding:9px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.5px;width:90px">Version</th>
            <th style="padding:9px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.5px;width:80px">Type</th>
            <th style="padding:9px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Summary</th>
            <th style="width:60px"></th>
          </tr>
        </thead>
        <tbody id="verTbody"></tbody>
      </table>`;
    if (pending.length > 0) {
      const btn = document.getElementById('verPendingBtn');
      if (btn) { btn.style.display = ''; btn.textContent = `⏳ Process Pending Changes (${pending.length})`; }
    }
    const tbody = document.getElementById('verTbody');
    versions.forEach((v, idx) => {
      const catClass = c => 'cat-' + c.toLowerCase();
      const catLabel = c => c === 'WORKSHOP_PLUS' ? 'WORKSHOP+' : c;
      const changeChips = v.changes.map(ch => {
        const arrow = ch.oldValue != null ? `${ch.oldValue} → ${ch.newValue}` : ch.newValue;
        const notes = ch.notes ? ` <span style="color:var(--muted);font-size:10px">(${ch.notes})</span>` : '';
        return `<span class="ver-chip ${catClass(ch.category)}">
          <span class="cat">${catLabel(ch.category)}</span>
          <span>${ch.entityName}: ${arrow}${notes}</span>
        </span>`;
      }).join('');
      const typeKey = v.type.toLowerCase();
      const rowId = `ver-changes-${idx}`;
      const vJson = JSON.stringify(v).replace(/'/g,"&#39;").replace(/"/g,'&quot;');
      tbody.insertAdjacentHTML('beforeend', `
        <tr class="ver-row" onclick="document.getElementById('${rowId}').classList.toggle('open')">
          <td style="font-family:var(--mono);font-weight:600">${v.version}</td>
          <td><span class="ver-badge ${typeKey}">${v.type}</span></td>
          <td style="color:var(--muted)">${v.summary}</td>
          <td style="text-align:right;padding-right:8px">
            <button class="btn" style="font-size:11px;padding:3px 10px" onclick="event.stopPropagation();openEditVersionModal(verData[${idx}])">Edit</button>
          </td>
        </tr>
        <tr class="ver-changes" id="${rowId}">
          <td colspan="4">
            <div class="ver-change-list">${changeChips || '<span style="color:var(--muted);font-size:12px">No structured changes recorded.</span>'}</div>
          </td>
        </tr>`);
    });
  } catch(e) {
    document.getElementById('verMsg').textContent = 'Failed to load: ' + e.message;
  }
}

// ── OAuth auth flow ──────────────────────────────────────────────────────────

let authPollInterval = null;

async function checkAuthAndInit() {
  try {
    const res = await fetch(`${API}/auth/status`);
    const data = await res.json();
    if (data.status === 'authenticated') {
      await init();
    } else if (data.status === 'pending') {
      showAuthModal(data.url);
      startAuthPolling();
    } else {
      showAuthModal(null, 'An error occurred during Google authorization. Please restart the application.');
    }
  } catch (e) {
    setStatus(false, 'Cannot reach server');
  }
}

function showAuthModal(url, errorMsg) {
  const overlay = document.getElementById('authModal');
  const msgEl   = document.getElementById('authModalMsg');
  const btn     = document.getElementById('authOpenBtn');
  const spinner = document.getElementById('authSpinner');

  if (errorMsg) {
    msgEl.textContent = errorMsg;
    msgEl.style.color = 'var(--red)';
    btn.style.display = 'none';
    spinner.style.display = 'none';
  } else if (url) {
    msgEl.textContent = 'The Tower Analyzer needs access to your Google Drive and Sheets. Click the button below to open the Google authorization page in a new tab, grant access, then return here.';
    msgEl.style.color = '';
    btn.style.display = '';
    btn.disabled = false;
    btn.onclick = () => window.open(url, '_blank');
    spinner.style.display = 'none';
  } else {
    msgEl.textContent = 'Preparing authorization link…';
    msgEl.style.color = 'var(--muted)';
    btn.style.display = '';
    btn.disabled = true;
    spinner.style.display = '';
  }

  overlay.style.display = 'flex';
}

function startAuthPolling() {
  if (authPollInterval) return;
  authPollInterval = setInterval(async () => {
    try {
      const res  = await fetch(`${API}/auth/status`);
      const data = await res.json();
      if (data.status === 'authenticated') {
        clearInterval(authPollInterval);
        authPollInterval = null;
        document.getElementById('authModal').style.display = 'none';
        await init();
      } else if (data.status === 'pending' && data.url) {
        // URL just became available — update the button
        const btn = document.getElementById('authOpenBtn');
        if (btn.disabled) showAuthModal(data.url);
      }
    } catch (_) { /* keep polling */ }
  }, 2000);
}

async function checkSetupThenAuth() {
  try {
    const res = await fetch(`${API}/setup/status`);
    const data = await res.json();
    if (data.step === 'complete') {
      checkAuthAndInit();
    } else {
      showSetupWizard(data.step);
    }
  } catch (e) {
    setStatus(false, 'Cannot reach server');
  }
}

checkSetupThenAuth();

// ── Workshop ──────────────────────────────────────────────────────────────────

// ── Cards state ───────────────────────────────────────────────────────────────
let cardsData=[],cardsSlots=[],cardsPresets=[],cardsAssignments={};
let cardsTab='collection',cardsRarityFilter='ALL',cardsSearch='',cardsHideUnowned=false;
let cardsActivePreset=null,cardsPendingSlot=null;

let wsData = null;          // all items from GET /api/workshop
let wsDiscounts = null;     // discount multipliers
let wsPlusProgress = null;  // Workshop+ unlock progress
let wsTab = 'workshop';     // 'workshop' | 'plus'
let wsCatFilter = 'All';    // 'All' | 'ATTACK' | 'DEFENSE' | 'UTILITY'
let wsHideMaxed = false;

async function renderWorkshopView() {
  document.getElementById('mainContent').innerHTML =
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading workshop…</div>';
  try {
    const [itemsRes, discRes, progressRes] = await Promise.all([
      fetch(`${API}/workshop`),
      fetch(`${API}/workshop/discounts`),
      fetch(`${API}/workshop/plus/unlock-progress`)
    ]);
    wsData = await itemsRes.json();
    wsDiscounts = await discRes.json();
    wsPlusProgress = await progressRes.json();
    buildWorkshopPage();
    // Prefetch Workshop+ costs in background so Next Cost column fills in
    wsPrefetchAllCosts().then(() => { if(document.getElementById('wsBody')) buildWorkshopPage(); });
  } catch(e) {
    document.getElementById('mainContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildWorkshopPage() {
  const isPlus = wsTab === 'plus';
  const items = wsData.filter(i => i.isPlus === isPlus);

  const maxed = items.filter(i => i.currentLevel >= i.maxLevel).length;
  const total = items.length;
  const totalBase = wsDiscounts ? items.reduce((s, i) => s + wsCoinSpent(i, 1.0), 0) : 0;
  const totalSpent = wsDiscounts
    ? items.reduce((s, i) => s + wsCoinSpent(i, isPlus ? wsPlusDisc(i.category) : wsDisc(i.category)), 0)
    : 0;
  const totalSaved = totalBase - totalSpent;

  const summaryHtml = `
    <div class="ws-summary-bar">
      <div class="ws-summary-chip"><div class="lbl">Items</div><div class="val">${total}</div></div>
      <div class="ws-summary-chip"><div class="lbl">Maxed</div><div class="val" style="color:var(--green)">${maxed}</div></div>
      <div class="ws-summary-chip"><div class="lbl">Total Invested</div><div class="val" style="color:var(--gold)">${fmtCoins(totalSpent)}</div></div>
      <div class="ws-summary-chip"><div class="lbl">Without Discount</div><div class="val">${fmtCoins(totalBase)}</div></div>
      <div class="ws-summary-chip"><div class="lbl">Saved</div><div class="val" style="color:var(--green)">${fmtCoins(totalSaved)}</div></div>
    </div>`;

  const discHtml = buildDiscountBar(isPlus);

  const tabBtns = `
    <button class="ws-tab-btn${wsTab==='workshop'?' active':''}" onclick="wsSetTab('workshop')">Workshop</button>
    <button class="ws-tab-btn${wsTab==='plus'?' ws-plus-active':''}" onclick="wsSetTab('plus')">Workshop+</button>`;

  const catBtns = ['All','ATTACK','DEFENSE','UTILITY'].map(c =>
    `<button class="ws-filter-btn ws-cat-btn${wsCatFilter===c?' active':''}" data-cat="${c}" onclick="wsSetCat('${c}')">${c==='All'?'All':c.charAt(0)+c.slice(1).toLowerCase()}</button>`
  ).join('');

  const hideBtn = `<button class="ws-filter-btn ws-hide-maxed-btn${wsHideMaxed?' active':''}" onclick="wsToggleHideMaxed()">Hide Maxed</button>`;

  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:1rem">Workshop</div>
    ${summaryHtml}
    ${discHtml}
    <div class="ws-controls">
      ${tabBtns}
      <span style="width:1px;height:20px;background:var(--border);display:inline-block;margin:0 4px"></span>
      ${catBtns}
      ${hideBtn}
    </div>
    <div id="wsBody"></div>`;

  renderWorkshopBody();
}

function buildDiscountBar(isPlus) {
  if (!wsDiscounts) return '';
  const cats = isPlus
    ? [['Attack', wsDiscounts.plusAttackCostMult], ['Defense', wsDiscounts.plusDefenseCostMult], ['Utility', wsDiscounts.plusUtilityCostMult]]
    : [['Attack', wsDiscounts.attackCostMult],     ['Defense', wsDiscounts.defenseCostMult],     ['Utility', wsDiscounts.utilityCostMult]];
  const chips = cats.map(([cat, mult]) => {
    const pct = Math.round((1 - mult) * 100);
    return `<div class="ws-discount-chip">${cat}: <span>${pct > 0 ? pct + '% off' : 'no discount'}</span></div>`;
  }).join('');
  return `<div class="ws-discount-bar">${chips}</div>`;
}

function renderWorkshopBody() {
  const isPlus = wsTab === 'plus';
  let items = wsData.filter(i => i.isPlus === isPlus);
  if (wsCatFilter !== 'All') items = items.filter(i => i.category === wsCatFilter);
  if (wsHideMaxed) items = items.filter(i => i.currentLevel < i.maxLevel);

  let html = '';

  // Workshop+ unlock progress panel at the top
  if (isPlus && wsPlusProgress.length > 0) {
    const filtered = wsCatFilter === 'All' ? wsPlusProgress : wsPlusProgress.filter(p => p.category === wsCatFilter);
    if (filtered.length > 0) {
      html += `<div class="ws-plus-unlock-section">
        <div class="ws-plus-unlock-title">Workshop+ Unlock Progress</div>
        <div class="ws-plus-unlock-grid">${filtered.map(renderPlusUnlockCard).join('')}</div>
      </div>`;
    }
  }

  // Group by category
  const cats = ['ATTACK','DEFENSE','UTILITY'];
  for (const cat of cats) {
    const catItems = items.filter(i => i.category === cat);
    if (!catItems.length) continue;
    html += `<div class="ws-category">
      <div class="ws-category-title">
        <span class="ws-cat-badge ${cat}">${cat.charAt(0)+cat.slice(1).toLowerCase()}</span>
      </div>
      <table class="ws-table">
        <thead><tr>
          <th style="width:30%">Item</th>
          <th class="r">Next Cost</th>
          <th class="r">Level</th>
          <th class="r">Target</th>
          <th class="r">Cost to Target</th>
          <th class="r">Max</th>
          <th style="min-width:90px">Progress</th>
          <th>Status</th>
        </tr></thead>
        <tbody>${catItems.map(item => renderWsRow(item, isPlus)).join('')}</tbody>
      </table>
    </div>`;
  }

  if (!html) html = '<div style="color:var(--muted);padding:2rem;text-align:center">No items match the current filter.</div>';
  document.getElementById('wsBody').innerHTML = html;
}

function renderWsRow(item, isPlus) {
  const maxed = item.currentLevel >= item.maxLevel;
  const locked = isPlus ? wsPlusItemLocked(item) : (!item.unlockGroupPurchased && item.unlockGroupCost !== 0);
  const pct = item.maxLevel > 0 ? Math.min(100, Math.round((item.currentLevel / item.maxLevel) * 100)) : 0;

  const disc = isPlus ? wsPlusDisc(item.category) : wsDisc(item.category);
  const nextCost = wsNextCost(item, disc);
  const nextCostHtml = maxed
    ? '<span style="color:var(--green);font-size:11px">Max</span>'
    : locked
      ? '—'
      : nextCost != null ? `<span style="font-family:var(--mono);color:var(--gold)">${fmtCoins(nextCost)}</span>` : '—';

  const statusHtml = isPlus ? wsPlusStatusHtml(item) : wsStatusHtml(item);

  const rowClass = maxed ? 'ws-maxed' : locked ? 'ws-locked' : '';

  const targetLevel = item.targetLevel ?? item.currentLevel;
  const costToTarget = !maxed && targetLevel !== '' && targetLevel > item.currentLevel
    ? wsCostToTarget(item, disc, targetLevel)
    : null;
  const costToTargetHtml = costToTarget == null || costToTarget === 0
    ? '<span style="color:var(--muted);font-size:11px">—</span>'
    : `<span style="font-family:var(--mono);color:var(--gold)">${fmtCoins(costToTarget)}</span>`;

  const lvlCell = maxed
    ? `<span class="ws-max-label">${item.maxLevel} ★</span>`
    : `<input class="ws-level-input" type="number" min="0" max="${item.maxLevel}"
        value="${item.currentLevel}" ${locked ? 'disabled' : ''}
        onchange="wsUpdateLevel(${item.id}, Math.min(Math.max(+this.value||0,0),${item.maxLevel}))">`;
  const tgtCell = maxed
    ? `<span class="ws-max-label">—</span>`
    : `<input class="ws-level-input" type="number" min="${item.currentLevel + 1}" max="${item.maxLevel}"
        value="${targetLevel}" placeholder="—" ${locked ? 'disabled' : ''}
        onchange="wsSetTarget(${item.id}, this.value===''?'':Math.min(Math.max(+this.value||0,${item.currentLevel+1}),${item.maxLevel}))">`;

  return `<tr class="${rowClass}">
    <td style="font-weight:500">${escHtml(item.name)}</td>
    <td class="r">${nextCostHtml}</td>
    <td class="r">${lvlCell}</td>
    <td class="r">${tgtCell}</td>
    <td class="r">${costToTargetHtml}</td>
    <td class="r" style="font-family:var(--mono);color:${maxed?'#f5c842':'var(--muted)'}">★ ${item.maxLevel}</td>
    <td>
      <div class="ws-progress">
        <div class="ws-progress-fill${maxed?' maxed':''}" style="width:${pct}%"></div>
      </div>
    </td>
    <td>${statusHtml}</td>
  </tr>`;
}

function wsStatusHtml(item) {
  if (item.currentLevel >= item.maxLevel) return '<span style="color:var(--green);font-size:11px">✓ Maxed</span>';
  if (item.unlockGroupPurchased) return '<span style="color:var(--muted);font-size:11px">Unlocked</span>';
  const cost = item.unlockGroupCost;
  if (cost === 0) return '<span style="color:var(--green);font-size:11px">Free</span>';
  return `<span class="ws-lock-badge purchasable" title="Click to mark group as purchased"
    onclick="wsPurchaseGroup(${item.unlockGroupId})">🔒 ${fmtCoins(cost)} coins</span>`;
}

function wsPlusStatusHtml(item) {
  if (item.currentLevel >= item.maxLevel) return '<span style="color:var(--green);font-size:11px">✓ Maxed</span>';
  if (item.currentLevel > 0) return '<span style="color:var(--muted);font-size:11px">Unlocked</span>';
  const prog = wsPlusProgress.find(p => p.itemId === item.id);
  // Lab-only gate (first item per category)
  if (item.plusUnlockLabName && item.plusUnlockCumulativeSpend == null) {
    if (prog && prog.labCompleted) return '<span style="color:var(--muted);font-size:11px">Unlocked</span>';
    return `<span class="ws-lock-badge" title="Requires lab: ${escHtml(item.plusUnlockLabName)}">🔬 Lab required</span>`;
  }
  // Spend gate
  if (prog) {
    if (!prog.labCompleted) return `<span class="ws-lock-badge" title="Requires lab: ${escHtml(item.plusUnlockLabName)}">🔬 Lab required</span>`;
    const pct = Math.min(100, Math.round((prog.spent / prog.threshold) * 100));
    return `<span class="ws-lock-badge" title="${fmtCoins(prog.spent)} / ${fmtCoins(prog.threshold)} spent in ${prog.category}">🔒 ${pct}% (${fmtCoins(prog.remaining)} left)</span>`;
  }
  return '<span class="ws-lock-badge">🔒 Locked</span>';
}

function renderPlusUnlockCard(p) {
  const pct = p.threshold > 0 ? Math.min(100, Math.round((p.spent / p.threshold) * 100)) : 0;
  const done = pct >= 100;
  const labDoneHtml = p.hasLabRequirement
    ? `<div class="gate${p.labCompleted?' done':''}">🔬 Lab: ${p.labCompleted ? '✓ Done' : 'Not Completed'}</div>`
    : '';
  const spendHtml = `
    <div class="ws-plus-spend-bar-wrap">
      <div class="ws-plus-spend-bar">
        <div class="ws-plus-spend-bar-fill${done?' done':''}" style="width:${pct}%"></div>
      </div>
      <div class="ws-plus-spend-pct">${pct}%</div>
    </div>
    <div class="ws-plus-spend-detail">${fmtCoins(p.spent)} / ${fmtCoins(p.threshold)} — ${fmtCoins(p.remaining)} remaining</div>`;
  return `<div class="ws-plus-unlock-card${done?' ready':''}">
    <div class="item-name">${escHtml(p.itemName)}</div>
    <div class="item-cat"><span class="ws-cat-badge ${p.category}">${p.category.charAt(0)+p.category.slice(1).toLowerCase()}</span></div>
    ${labDoneHtml}
    ${spendHtml}
  </div>`;
}

// ── Unlock helpers ────────────────────────────────────────────────────────────

function wsPlusItemLocked(item) {
  if (item.currentLevel > 0) return false;
  // All lock info (lab gate + spend gate) is now in wsPlusProgress for every locked item
  const prog = wsPlusProgress.find(p => p.itemId === item.id);
  if (!prog) return false; // no gate — unlocked
  // Lab-only items: locked until lab done; threshold is 0 so remaining is always 0
  if (item.plusUnlockLabName && item.plusUnlockCumulativeSpend == null) return !prog.labCompleted;
  // Spend-gated items: locked until lab done AND spend met
  return !prog.labCompleted || prog.remaining > 0;
}

// ── Cost helpers ──────────────────────────────────────────────────────────────

const wsCostCache = {};

function wsDisc(cat) {
  if (!wsDiscounts) return 1;
  if (cat === 'ATTACK') return wsDiscounts.attackCostMult;
  if (cat === 'DEFENSE') return wsDiscounts.defenseCostMult;
  return wsDiscounts.utilityCostMult;
}

function wsPlusDisc(cat) {
  if (!wsDiscounts) return 1;
  if (cat === 'ATTACK') return wsDiscounts.plusAttackCostMult;
  if (cat === 'DEFENSE') return wsDiscounts.plusDefenseCostMult;
  return wsDiscounts.plusUtilityCostMult;
}

function wsCoinSpent(item, disc = 1.0) {
  const costs = wsCostCache[item.id];
  if (!costs) return 0;
  return costs.filter(c => c.level <= item.currentLevel).reduce((s, c) => s + c.baseCost * disc, 0);
}

function wsNextCost(item, disc) {
  const next = item.currentLevel + 1;
  if (next > item.maxLevel) return null;
  const costs = wsCostCache[item.id];
  if (!costs) return null;
  const entry = costs.find(c => c.level === next);
  return entry ? entry.baseCost * disc : null;
}

function wsCostToTarget(item, disc, targetLevel) {
  const costs = wsCostCache[item.id];
  if (!costs || targetLevel <= item.currentLevel) return 0;
  return costs
    .filter(c => c.level > item.currentLevel && c.level <= targetLevel)
    .reduce((s, c) => s + c.baseCost * disc, 0);
}

async function wsSetTarget(id, rawVal) {
  const val = rawVal === '' ? null : Math.max(0, +rawVal);

  // Optimistic update so the cost column refreshes immediately
  const item = wsData.find(i => i.id === id);
  if (item) item.targetLevel = val;

  if (val !== null && !wsCostCache[id]) {
    try {
      const res = await fetch(`${API}/workshop/${id}/costs`);
      wsCostCache[id] = await res.json();
    } catch(_) {}
  }

  renderWorkshopBody();

  fetch(`${API}/workshop/${id}/target-level`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({targetLevel: val})
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function saveWsScroll() { sessionStorage.setItem('ws-scroll', document.getElementById('mainContent').scrollTop); }
function restoreWsScroll() {
  const top = parseInt(sessionStorage.getItem('ws-scroll') || '0', 10);
  requestAnimationFrame(() => document.getElementById('mainContent').scrollTop = top);
}

async function wsUpdateLevel(id, level) {
  saveWsScroll();
  const item = wsData.find(i => i.id === id);
  if (!item) return;
  item.currentLevel = Math.min(Math.max(level, 0), item.maxLevel);

  // Load costs for this item if not cached (needed for spend tracking)
  if (!wsCostCache[id]) {
    const res = await fetch(`${API}/workshop/${id}/costs`);
    wsCostCache[id] = await res.json();
  }

  await fetch(`${API}/workshop/${id}/level`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({level})
  });

  // Refresh plus progress (spend totals changed)
  const progRes = await fetch(`${API}/workshop/plus/unlock-progress`);
  wsPlusProgress = await progRes.json();

  buildWorkshopPage();
  restoreWsScroll();
}

async function wsPurchaseGroup(groupId) {
  saveWsScroll();
  await fetch(`${API}/workshop/unlock-groups/${groupId}/purchase`, {method:'POST'});
  // Mark all items in this group as purchased in local data
  wsData.filter(i => i.unlockGroupId === groupId).forEach(i => i.unlockGroupPurchased = true);
  buildWorkshopPage();
  restoreWsScroll();
}

// ── Tab / filter controls ─────────────────────────────────────────────────────

function wsSetTab(tab) { wsTab = tab; wsCatFilter = 'All'; buildWorkshopPage(); }
function wsSetCat(cat) {
  wsCatFilter = cat;
  document.querySelectorAll('.ws-cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  renderWorkshopBody();
}
function wsToggleHideMaxed() {
  wsHideMaxed = !wsHideMaxed;
  const btn = document.querySelector('.ws-hide-maxed-btn');
  if (btn) btn.classList.toggle('active', wsHideMaxed);
  renderWorkshopBody();
}

// Pre-fetch costs for all items on first load so target-cost column populates immediately
async function wsPrefetchAllCosts() {
  if (!wsData) return;
  await Promise.all(wsData.map(async item => {
    if (wsCostCache[item.id]) return;
    try {
      const res = await fetch(`${API}/workshop/${item.id}/costs`);
      wsCostCache[item.id] = await res.json();
    } catch(_) {}
  }));
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function fmtCardVal(value, unit) {
  if (unit === 'MULTIPLIER')       return value.toFixed(2) + 'x';
  if (unit === 'PERCENT')          return value.toFixed(1) + '%';
  if (unit === 'ADDITIVE_PERCENT') return '+' + value.toFixed(1) + '%';
  if (unit === 'SECONDS')          return value + 's';
  if (unit === 'MINUTES')          return value + 'm';
  if (unit === 'COUNT')            return Math.round(value).toString();
  return value.toString();
}

function cardLevelVal(card) {
  const vals = [card.level1, card.level2, card.level3, card.level4, card.level5, card.level6, card.level7];
  return fmtCardVal(vals[card.starLevel - 1], card.valueUnit);
}

function cardMasteryVal(card) {
  if (card.masteryLevel === 0) return '—';
  const vals = [card.masteryLevel0, card.masteryLevel1, card.masteryLevel2, card.masteryLevel3, card.masteryLevel4,
                card.masteryLevel5, card.masteryLevel6, card.masteryLevel7, card.masteryLevel8, card.masteryLevel9];
  return fmtCardVal(vals[card.masteryLevel], card.masteryValueUnit);
}

// ── Main load ─────────────────────────────────────────────────────────────────

async function renderCardsView() {
  document.getElementById('mainContent').innerHTML =
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading cards…</div>';
  try {
    const [cRes, sRes, pRes] = await Promise.all([
      fetch(`${API}/cards`),
      fetch(`${API}/cards/slots`),
      fetch(`${API}/cards/presets`)
    ]);
    cardsData    = await cRes.json();
    cardsSlots   = await sRes.json();
    cardsPresets = await pRes.json();
    cardsAssignments = {};
    await Promise.all(cardsPresets.map(async p => {
      const r = await fetch(`${API}/cards/presets/${p.id}/assignments`);
      cardsAssignments[p.id] = await r.json();
    }));
    if (!cardsActivePreset && cardsPresets.length > 0) cardsActivePreset = cardsPresets[0].id;
    buildCardsPage();
  } catch(e) {
    document.getElementById('mainContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildCardsPage() {
  const owned  = cardsData.filter(c => c.copiesOwned > 0).length;
  const common = cardsData.filter(c => c.rarity === 'COMMON').length;
  const rare   = cardsData.filter(c => c.rarity === 'RARE').length;
  const epic   = cardsData.filter(c => c.rarity === 'EPIC').length;

  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:1rem">Cards</div>
    <div class="cards-summary-bar">
      <div class="cards-summary-chip"><div class="lbl">Total</div><div class="val">${cardsData.length}</div></div>
      <div class="cards-summary-chip"><div class="lbl">Owned</div><div class="val" style="color:var(--green)">${owned}</div></div>
      <div class="cards-summary-chip"><div class="lbl">Common</div><div class="val" style="color:var(--muted)">${common}</div></div>
      <div class="cards-summary-chip"><div class="lbl">Rare</div><div class="val" style="color:var(--accent)">${rare}</div></div>
      <div class="cards-summary-chip"><div class="lbl">Epic</div><div class="val" style="color:var(--accent2)">${epic}</div></div>
    </div>
    <div class="cards-controls">
      <button class="cards-tab-btn${cardsTab==='collection'?' active':''}" onclick="cardsSetTab('collection')">Collection</button>
      <button class="cards-tab-btn${cardsTab==='slots'?' active':''}" onclick="cardsSetTab('slots')">Slots</button>
      <button class="cards-tab-btn${cardsTab==='presets'?' active':''}" onclick="cardsSetTab('presets')">Presets</button>
    </div>
    <div id="cardsBody"></div>`;

  renderCardsBody();
}

function cardsSetTab(tab) {
  cardsTab = tab;
  document.querySelectorAll('.cards-tab-btn').forEach(b =>
    b.classList.toggle('active', b.textContent.toLowerCase() === tab));
  renderCardsBody();
}

function renderCardsBody() {
  if (cardsTab === 'collection') renderCardsCollection();
  else if (cardsTab === 'slots') renderCardsSlotsTab();
  else renderCardsPresets();
}

// ── Collection tab ────────────────────────────────────────────────────────────

function renderCardsCollection() {
  const rarityBtns = ['ALL','COMMON','RARE','EPIC'].map(r =>
    `<button class="cards-filter-btn${cardsRarityFilter===r?' active':''}" onclick="cardsSetRarity('${r}')">${r==='ALL'?'All':r.charAt(0)+r.slice(1).toLowerCase()}</button>`
  ).join('');
  const hideBtn = `<button class="cards-filter-btn${cardsHideUnowned?' active':''}" onclick="cardsToggleHideUnowned()">Owned Only</button>`;

  let filtered = [...cardsData];
  if (cardsRarityFilter !== 'ALL') filtered = filtered.filter(c => c.rarity === cardsRarityFilter);
  if (cardsHideUnowned) filtered = filtered.filter(c => c.copiesOwned > 0);
  if (cardsSearch) {
    const q = cardsSearch.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }

  const rows = filtered.map(c => {
    const unowned = c.copiesOwned === 0 ? ' unowned' : '';
    const milestoneHtml = c.milestoneUnlockTier != null
      ? `<div class="cards-milestone">🔒 T${c.milestoneUnlockTier} W${c.milestoneUnlockWave}</div>` : '';
    const starOpts = [1,2,3,4,5,6,7].map(s =>
      `<option value="${s}"${c.starLevel===s?' selected':''}>${s}★</option>`).join('');
    const masteryOpts = Array.from({length:10}, (_,i) => {
      const locked = i > c.masteryLabLevel;
      const sel = c.masteryLevel === i ? ' selected' : '';
      const dis = locked ? ' disabled' : '';
      const label = i === 0 ? 'Lv 0' : locked ? `Lv ${i} 🔒` : `Lv ${i}`;
      return `<option value="${i}"${sel}${dis}>${label}</option>`;
    }).join('');
    const masteryHint = c.masteryLabLevel === 0
      ? `<div class="cards-milestone" style="color:var(--red)">Lab not researched</div>`
      : c.masteryLabLevel < 9
        ? `<div class="cards-milestone">Lab Lv ${c.masteryLabLevel}</div>`
        : '';
    const ownedChecked = c.copiesOwned > 0 ? ' checked' : '';
    return `<tr class="${unowned}">
      <td style="text-align:center">
        <label class="owned-toggle" title="${c.copiesOwned > 0 ? 'Mark unowned' : 'Mark owned'}">
          <input type="checkbox"${ownedChecked} onchange="cardToggleOwned(${c.id},this.checked)">
        </label>
      </td>
      <td><span class="rarity-badge ${c.rarity}">${c.rarity.charAt(0)+c.rarity.slice(1).toLowerCase()}</span></td>
      <td style="font-weight:600;white-space:nowrap">${escHtml(c.name)}${milestoneHtml}</td>
      <td style="font-size:12px;color:var(--muted);max-width:220px">${escHtml(c.description)}</td>
      <td><select class="cards-inline-select" onchange="cardUpdateStar(${c.id},+this.value)">${starOpts}</select></td>
      <td><input class="cards-copies-input" type="number" min="0" value="${c.copiesOwned}" onchange="cardUpdateCopies(${c.id},+this.value)"></td>
      <td><select class="cards-inline-select" onchange="cardUpdateMastery(${c.id},+this.value)"${c.masteryLabLevel===0?' disabled title="Research the mastery lab first"':''}>${masteryOpts}</select>${masteryHint}</td>
      <td class="cards-val">${cardLevelVal(c)}</td>
      <td style="font-size:11px;color:var(--muted);font-family:var(--mono)">${cardMasteryVal(c)}</td>
    </tr>`;
  }).join('');

  document.getElementById('cardsBody').innerHTML = `
    <div class="cards-controls" style="margin-bottom:1rem">
      ${rarityBtns}
      ${hideBtn}
      <input class="cards-search" type="text" placeholder="Search cards…" value="${escHtml(cardsSearch)}"
        oninput="cardsSetSearch(this.value)">
    </div>
    <div class="table-section">
      <table class="cards-table">
        <thead><tr>
          <th style="width:36px;text-align:center">Own</th>
          <th style="width:70px">Rarity</th><th>Name</th><th>Effect</th>
          <th>Star</th><th>Copies</th><th>Mastery</th><th>Value</th><th>Mastery Val</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">No cards match the current filter.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function cardsSetRarity(r) { cardsRarityFilter = r; renderCardsCollection(); }
function cardsToggleHideUnowned() { cardsHideUnowned = !cardsHideUnowned; renderCardsCollection(); }
function cardsSetSearch(v) {
  cardsSearch = v;
  renderCardsCollection();
  const el = document.querySelector('.cards-search');
  if (el) { el.focus(); el.setSelectionRange(v.length, v.length); }
}

async function cardUpdateStar(id, val) {
  const card = cardsData.find(c => c.id === id);
  if (card) card.starLevel = val;
  await fetch(`${API}/cards/${id}/star-level`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({starLevel:val})
  });
  renderCardsCollection();
}

async function cardToggleOwned(id, owned) {
  const card = cardsData.find(c => c.id === id);
  const newCopies = owned ? Math.max(1, card ? card.copiesOwned : 1) : 0;
  if (card) card.copiesOwned = newCopies;
  await fetch(`${API}/cards/${id}/copies-owned`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({copiesOwned:newCopies})
  });
  renderCardsCollection();
}

async function cardUpdateCopies(id, val) {
  const card = cardsData.find(c => c.id === id);
  if (card) card.copiesOwned = val;
  await fetch(`${API}/cards/${id}/copies-owned`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({copiesOwned:val})
  });
}

async function cardUpdateMastery(id, val) {
  const card = cardsData.find(c => c.id === id);
  if (card && val > card.masteryLabLevel) return; // lab gate: reject silently, dropdown will re-render correctly
  if (card) card.masteryLevel = val;
  await fetch(`${API}/cards/${id}/mastery-level`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({masteryLevel:val})
  });
  renderCardsCollection();
}

// ── Slots tab ─────────────────────────────────────────────────────────────────

function renderCardsSlotsTab() {
  const gemSlots = cardsSlots.filter(s => s.slotNumber <= 22);
  const keySlots = cardsSlots.filter(s => s.slotNumber > 22);

  const gemOwned     = gemSlots.filter(s => s.owned).length;
  const gemsSpent    = gemSlots.filter(s => s.owned).reduce((sum, s) => sum + s.unlockCost, 0);
  const gemsNeeded   = gemSlots.filter(s => !s.owned).reduce((sum, s) => sum + s.unlockCost, 0);

  const keyOwned     = keySlots.filter(s => s.owned).length;
  const keysSpent    = keySlots.filter(s => s.owned).reduce((sum, s) => sum + s.unlockCost, 0);
  const keysNeeded   = keySlots.filter(s => !s.owned).reduce((sum, s) => sum + s.unlockCost, 0);

  document.getElementById('cardsBody').innerHTML = `
    <div class="cards-summary-bar" style="margin-bottom:1.25rem">
      <div class="cards-summary-chip">
        <div class="lbl">💎 Gem Slots</div>
        <div class="val">${gemOwned} / ${gemSlots.length}</div>
      </div>
      <div class="cards-summary-chip">
        <div class="lbl">💎 Gems Spent</div>
        <div class="val" style="color:var(--accent)">${gemsSpent.toLocaleString()}</div>
      </div>
      <div class="cards-summary-chip">
        <div class="lbl">💎 Gems to Go</div>
        <div class="val" style="color:var(--gold)">${gemsNeeded.toLocaleString()}</div>
      </div>
      <div class="cards-summary-chip">
        <div class="lbl">🔑 Key Slots</div>
        <div class="val">${keyOwned} / ${keySlots.length}</div>
      </div>
      <div class="cards-summary-chip">
        <div class="lbl">🔑 Keys Spent</div>
        <div class="val" style="color:var(--accent)">${keysSpent}</div>
      </div>
      <div class="cards-summary-chip">
        <div class="lbl">🔑 Keys to Go</div>
        <div class="val" style="color:var(--gold)">${keysNeeded}</div>
      </div>
    </div>
    <div class="cards-slot-section">
      <div class="cards-slot-section-title">💎 Gem Slots (1–22)</div>
      <div class="cards-slot-grid">${gemSlots.map(renderSlotOwnershipTile).join('')}</div>
    </div>
    <div class="cards-slot-section">
      <div class="cards-slot-section-title">🔑 Key Vault Slots (23–28)</div>
      <div class="cards-slot-grid">${keySlots.map(renderSlotOwnershipTile).join('')}</div>
    </div>`;
}

function renderSlotOwnershipTile(slot) {
  const costLabel = slot.unlockCost > 0
    ? `${slot.unlockCurrency === 'GEM' ? '💎' : '🔑'} ${slot.unlockCost.toLocaleString()}`
    : 'Free';
  const costColor = slot.unlockCost > 0 ? 'var(--muted)' : 'var(--green)';
  const statusColor = slot.owned ? 'var(--green)' : 'var(--muted)';
  const statusLabel = slot.owned ? '✓ Owned' : 'Locked';
  const disabled = slot.slotNumber === 1 ? ' disabled' : '';
  return `<div class="cards-slot${slot.owned ? ' filled' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <span class="cards-slot-num">Slot ${slot.slotNumber}</span>
      <span style="font-size:10px;color:${costColor}">${costLabel}</span>
    </div>
    <div style="flex:1;display:flex;align-items:center">
      <label style="display:flex;align-items:center;gap:6px;cursor:${slot.slotNumber===1?'default':'pointer'};font-size:12px;color:${statusColor}">
        <input type="checkbox"${slot.owned?' checked':''}${disabled} onchange="cardToggleSlotOwned(${slot.slotNumber},this.checked)">
        ${statusLabel}
      </label>
    </div>
  </div>`;
}

async function cardToggleSlotOwned(slotNumber, owned) {
  const slot = cardsSlots.find(s => s.slotNumber === slotNumber);
  if (slot) slot.owned = owned;
  await fetch(`${API}/cards/slots/${slotNumber}/owned`, {
    method: 'PUT', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({owned})
  });
  renderCardsSlotsTab();
}

// ── Presets tab ───────────────────────────────────────────────────────────────

function renderCardsPresets() {
  const presetTabs = cardsPresets.map(p =>
    `<button class="cards-preset-tab${cardsActivePreset===p.id?' active':''}" onclick="cardsSetPreset(${p.id})">${escHtml(p.name)}</button>`
  ).join('');
  const addBtn = cardsPresets.length < 5
    ? `<button class="cards-filter-btn" onclick="cardsAddPreset()">+ Add Preset</button>` : '';

  const preset = cardsPresets.find(p => p.id === cardsActivePreset);
  const body = preset ? renderPresetDetail(preset) : '<div style="color:var(--muted);padding:2rem">No preset selected.</div>';

  document.getElementById('cardsBody').innerHTML = `
    <div class="cards-preset-bar">${presetTabs}${addBtn}</div>
    <div id="cardsPresetDetail">${body}</div>`;
}

function cardsSetPreset(id) { cardsActivePreset = id; renderCardsPresets(); }

function renderPresetDetail(preset) {
  const assignments = cardsAssignments[preset.id] || [];
  const assignMap = {};
  assignments.forEach(a => { assignMap[a.slotNumber] = a; });

  const deleteBtn = preset.slot === 1 ? '' :
    `<button class="btn" style="border-color:rgba(242,107,107,.4);color:var(--red)" onclick="cardsDeletePreset(${preset.id})">Delete</button>`;

  const gemSlots = cardsSlots.filter(s => s.slotNumber <= 22);
  const keySlots = cardsSlots.filter(s => s.slotNumber > 22);

  return `
    <div class="cards-preset-header">
      <input class="cards-preset-name-input" id="presetNameInput_${preset.id}" type="text" value="${escHtml(preset.name)}">
      <button class="btn btn-primary" onclick="cardsSavePresetName(${preset.id})">Save Name</button>
      ${deleteBtn}
    </div>
    <div class="cards-slot-section">
      <div class="cards-slot-section-title">💎 Gem Slots (1–22)</div>
      <div class="cards-slot-grid">${gemSlots.map(s => renderCardSlotTile(preset.id, s, assignMap[s.slotNumber])).join('')}</div>
    </div>
    <div class="cards-slot-section">
      <div class="cards-slot-section-title">🔑 Key Vault Slots (23–28)</div>
      <div class="cards-slot-grid">${keySlots.map(s => renderCardSlotTile(preset.id, s, assignMap[s.slotNumber])).join('')}</div>
    </div>`;
}

function renderCardSlotTile(presetId, slot, assignment) {
  const num = slot.slotNumber;
  const costHint = slot.unlockCost > 0
    ? `<span style="font-size:9px;color:var(--muted)">${slot.unlockCurrency==='GEM'?'💎':'🔑'} ${slot.unlockCost}</span>` : '';

  // Unowned slot: show locked state, no assign button
  if (!slot.owned) {
    return `<div class="cards-slot" style="opacity:.5">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="cards-slot-num">Slot ${num}</span>${costHint}
      </div>
      <div style="font-size:11px;color:var(--muted);font-style:italic;flex:1;display:flex;align-items:center">🔒 Not unlocked</div>
    </div>`;
  }

  if (assignment) {
    const card = cardsData.find(c => c.id === assignment.cardId);
    const col = card ? (card.rarity==='EPIC'?'var(--accent2)':card.rarity==='RARE'?'var(--accent)':'var(--muted)') : 'var(--text)';
    return `<div class="cards-slot filled">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="cards-slot-num">Slot ${num}</span>${costHint}
      </div>
      <div class="cards-slot-card-name" style="color:${col}">${escHtml(assignment.cardName)}</div>
      <div class="cards-slot-actions">
        <button class="cards-slot-assign-btn" onclick="cardsOpenPicker(${presetId},${num})">Change</button>
        <button class="cards-slot-clear-btn" onclick="cardsUnassignSlot(${presetId},${num})">✕</button>
      </div>
    </div>`;
  }
  return `<div class="cards-slot">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="cards-slot-num">Slot ${num}</span>${costHint}
    </div>
    <div style="font-size:11px;color:var(--muted);font-style:italic;flex:1;display:flex;align-items:center">Empty</div>
    <div class="cards-slot-actions">
      <button class="cards-slot-assign-btn" onclick="cardsOpenPicker(${presetId},${num})">+ Assign</button>
    </div>
  </div>`;
}

async function cardsSavePresetName(presetId) {
  const input = document.getElementById(`presetNameInput_${presetId}`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  await fetch(`${API}/cards/presets/${presetId}/name`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})
  });
  const preset = cardsPresets.find(p => p.id === presetId);
  if (preset) preset.name = name;
  renderCardsPresets();
}

async function cardsDeletePreset(presetId) {
  if (!confirm('Delete this preset and all its assignments?')) return;
  await fetch(`${API}/cards/presets/${presetId}`, {method:'DELETE'});
  cardsPresets = cardsPresets.filter(p => p.id !== presetId);
  delete cardsAssignments[presetId];
  if (cardsActivePreset === presetId) cardsActivePreset = cardsPresets[0]?.id ?? null;
  renderCardsPresets();
}

async function cardsAddPreset() {
  const usedSlots = new Set(cardsPresets.map(p => p.slot));
  const nextSlot = [2,3,4,5].find(s => !usedSlots.has(s));
  if (!nextSlot) return;
  const name = `Preset ${nextSlot}`;
  const res = await fetch(`${API}/cards/presets`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({slot:nextSlot, name})
  });
  const newPreset = await res.json();
  cardsPresets.push(newPreset);
  cardsAssignments[newPreset.id] = [];
  cardsActivePreset = newPreset.id;
  renderCardsPresets();
}

// ── Card picker modal ─────────────────────────────────────────────────────────

function cardsOpenPicker(presetId, slotNumber) {
  cardsPendingSlot = {presetId, slotNumber};
  // Cards already in this preset (in other slots) are dimmed but not hidden
  const takenByOtherSlot = new Set(
    (cardsAssignments[presetId] || [])
      .filter(a => a.slotNumber !== slotNumber)
      .map(a => a.cardId)
  );

  const items = cardsData.map(c => {
    const vals = [c.level1, c.level2, c.level3, c.level4, c.level5, c.level6, c.level7];
    const val = fmtCardVal(vals[c.starLevel - 1], c.valueUnit);
    const dimmed = takenByOtherSlot.has(c.id) ? ' style="opacity:.35;pointer-events:none"' : '';
    return `<div class="cards-picker-item"${dimmed} onclick="cardsPickCard(${c.id})">
      <span class="rarity-badge ${c.rarity}" style="flex-shrink:0">${c.rarity.charAt(0)+c.rarity.slice(1).toLowerCase()}</span>
      <span class="cp-name">${escHtml(c.name)}</span>
      <span class="cp-val">${val}</span>
    </div>`;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="cardsPickerOverlay" onclick="if(event.target===this)cardsClosePicker()">
      <div class="modal" style="width:480px">
        <div class="modal-title">Assign Card — Slot ${slotNumber}</div>
        <input class="cards-picker-search" id="cardsPickerSearch" type="text" placeholder="Search cards…"
          oninput="cardsFilterPicker(this.value)">
        <div class="cards-picker-list" id="cardsPickerList">${items}</div>
        <div class="modal-actions">
          <button class="btn" onclick="cardsClosePicker()">Cancel</button>
        </div>
      </div>
    </div>`);
  document.getElementById('cardsPickerSearch').focus();
}

function cardsFilterPicker(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#cardsPickerList .cards-picker-item').forEach(el => {
    const name = el.querySelector('.cp-name')?.textContent.toLowerCase() || '';
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

function cardsClosePicker() {
  const el = document.getElementById('cardsPickerOverlay');
  if (el) el.remove();
  cardsPendingSlot = null;
}

async function cardsPickCard(cardId) {
  if (!cardsPendingSlot) return;
  const {presetId, slotNumber} = cardsPendingSlot;
  cardsClosePicker();
  await fetch(`${API}/cards/presets/${presetId}/assignments/${slotNumber}`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cardId})
  });
  const r = await fetch(`${API}/cards/presets/${presetId}/assignments`);
  cardsAssignments[presetId] = await r.json();
  renderCardsPresets();
}

async function cardsUnassignSlot(presetId, slotNumber) {
  await fetch(`${API}/cards/presets/${presetId}/assignments/${slotNumber}`, {method:'DELETE'});
  cardsAssignments[presetId] = (cardsAssignments[presetId] || []).filter(a => a.slotNumber !== slotNumber);
  renderCardsPresets();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Bots ─────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

let botsData = [];
let botsUnlockCosts = [];
let botsLevelValues = {};   // statId → [{level, value, medalsToNext}]
let botsTab = 'tracker';
let botsPresets = [];
let botsPresetUnlocks = {};     // presetId → [{botId, unlocked, botPlusUnlocked}]
let botsPresetStatLevels = {};  // presetId → [{botStatId, targetLevel}]
let botsActivePreset = null;

async function renderBotsView() {
  document.getElementById('mainContent').innerHTML =
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading bots…</div>';
  try {
    const [botsRes, costsRes, presetsRes, lvlRes] = await Promise.all([
      fetch(`${API}/bots`),
      fetch(`${API}/bots/unlock-costs`),
      fetch(`${API}/bots/presets`),
      fetch(`${API}/bots/level-values`)
    ]);
    botsData        = await botsRes.json();
    botsUnlockCosts = await costsRes.json();
    botsPresets     = await presetsRes.json();

    // Load all level values from single batch call
    const lvlData = await lvlRes.json();
    botsLevelValues = {};
    lvlData.forEach(e => { botsLevelValues[e.statId] = e.levels; });

    // Fetch preset details
    botsPresetUnlocks = {};
    botsPresetStatLevels = {};
    await Promise.all(botsPresets.map(async p => {
      const [uRes, lRes] = await Promise.all([
        fetch(`${API}/bots/presets/${p.id}/unlocks`),
        fetch(`${API}/bots/presets/${p.id}/stat-levels`)
      ]);
      botsPresetUnlocks[p.id]     = await uRes.json();
      botsPresetStatLevels[p.id]  = await lRes.json();
    }));

    if (!botsActivePreset && botsPresets.length > 0) botsActivePreset = botsPresets[0].id;
    buildBotsPage();
  } catch(e) {
    document.getElementById('mainContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildBotsPage() {
  const unlocked     = botsData.filter(b => b.unlocked).length;
  const botPlusCount = botsData.filter(b => b.botPlusUnlocked).length;
  const totalMedals  = botsComputeMedals(botsData.map(b => ({
    bot: b, statLevels: Object.fromEntries(b.stats.map(s => [s.statId, s.currentLevel]))
  })));

  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:1rem">Bots</div>
    <div class="bots-summary-bar">
      <div class="bots-summary-chip"><div class="lbl">Bots</div><div class="val">${botsData.length}</div></div>
      <div class="bots-summary-chip"><div class="lbl">Unlocked</div><div class="val" style="color:var(--green)">${unlocked}</div></div>
      <div class="bots-summary-chip"><div class="lbl">Bot+</div><div class="val" style="color:var(--accent2)">${botPlusCount}</div></div>
      <div class="bots-summary-chip"><div class="lbl">Medals Invested</div><div class="val" style="color:var(--gold)">${totalMedals.toLocaleString()}</div></div>
    </div>
    <div class="bots-tab-bar">
      <div class="bots-tab${botsTab==='tracker'?' active':''}" onclick="botsSetTab('tracker')">Tracker</div>
      <div class="bots-tab${botsTab==='presets'?' active':''}" onclick="botsSetTab('presets')">Presets</div>
    </div>
    <div id="botsBody"></div>`;

  renderBotsBody();
}

function botsSetTab(tab) {
  botsTab = tab;
  document.querySelectorAll('.bots-tab').forEach(el => el.classList.toggle('active', el.textContent.toLowerCase() === tab));
  renderBotsBody();
}

function renderBotsBody() {
  if (botsTab === 'tracker') renderBotsTracker();
  else renderBotsPresetsTab();
}

// ── Tracker ───────────────────────────────────────────────────────────────────

let botsHidden = new Set(JSON.parse(localStorage.getItem('bots-hidden') || '[]'));
let guardianHidden = new Set(JSON.parse(localStorage.getItem('guardian-hidden') || '[]'));
function botsToggleHidden(code) {
  if (botsHidden.has(code)) botsHidden.delete(code); else botsHidden.add(code);
  localStorage.setItem('bots-hidden', JSON.stringify([...botsHidden]));
  document.querySelectorAll('.bots-filter-pill').forEach(p => {
    p.classList.toggle('hidden-bot', botsHidden.has(p.dataset.code));
  });
  document.querySelectorAll('.bot-card-wrap').forEach(w => {
    w.style.display = botsHidden.has(w.dataset.code) ? 'none' : '';
  });
}

function renderBotsTracker() {
  const medalChips = `
    <div class="bots-medals-total">
      <div class="bots-medals-chip">
        <div class="lbl">Unlock Medals</div>
        <div class="val" id="bots-chip-unlock">${botsUnlockMedalsSpent().toLocaleString()}</div>
      </div>
      <div class="bots-medals-chip">
        <div class="lbl">Medals Invested</div>
        <div class="val" id="bots-chip-upgrade">${botsUpgradeMedalsSpent().toLocaleString()}</div>
      </div>
      <div class="bots-medals-chip">
        <div class="lbl">Medals to Planned Targets</div>
        <div class="val" style="color:var(--orange)" id="bots-chip-to-targets">${botsMedalsToTargets().toLocaleString()}</div>
      </div>
      <div class="bots-medals-chip">
        <div class="lbl">Medals to Max Everything</div>
        <div class="val" id="bots-chip-to-max">${botsMedalsToMax().toLocaleString()}</div>
      </div>
    </div>`;

  const filterPills = botsData.map(bot => {
    const hidden = botsHidden.has(bot.code);
    return `<span class="bots-filter-pill${hidden?' hidden-bot':''}" data-code="${bot.code}"
      onclick="botsToggleHidden('${bot.code}')">${escHtml(bot.name)}</span>`;
  }).join('');

  const cards = botsData.map(bot =>
    `<div class="bot-card-wrap" data-code="${bot.code}" style="${botsHidden.has(bot.code)?'display:none':''}">${botCardHtml(bot)}</div>`
  ).join('');

  document.getElementById('botsBody').innerHTML =
    `${medalChips}<div class="bots-filter-bar"><span class="bots-filter-lbl">Show:</span>${filterPills}</div><div class="bots-grid">${cards}</div>`;
}

function updateBotsMedalChips(){
  const u=document.getElementById('bots-chip-unlock');
  const g=document.getElementById('bots-chip-upgrade');
  const t=document.getElementById('bots-chip-to-targets');
  const m=document.getElementById('bots-chip-to-max');
  if(u)u.textContent=botsUnlockMedalsSpent().toLocaleString();
  if(g)g.textContent=botsUpgradeMedalsSpent().toLocaleString();
  if(t)t.textContent=botsMedalsToTargets().toLocaleString();
  if(m)m.textContent=botsMedalsToMax().toLocaleString();
}
function botSpinChange(statId,level,botId){
  const bot=botsData.find(b=>b.id===botId);
  const stat=bot?.stats.find(s=>s.statId===statId);
  if(!bot||!stat)return;
  stat.currentLevel=Math.min(Math.max(level,0),stat.maxLevel);
  const wrap=document.querySelector(`.bot-card-wrap[data-code="${bot.code}"]`);
  if(wrap)wrap.innerHTML=botCardHtml(bot);
  updateBotsMedalChips();
  fetch(`${API}/bots/stats/${statId}/level`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({level:stat.currentLevel})});
}

function botSpinTarget(statId,level,botId){
  const bot=botsData.find(b=>b.id===botId);
  const stat=bot?.stats.find(s=>s.statId===statId);
  if(!bot||!stat)return;
  stat.targetLevel=Math.min(Math.max(level,stat.currentLevel),stat.maxLevel);
  const wrap=document.querySelector(`.bot-card-wrap[data-code="${bot.code}"]`);
  if(wrap)wrap.innerHTML=botCardHtml(bot);
  fetch(`${API}/bots/stats/${statId}/target-level`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetLevel:stat.targetLevel})});
}

function botCardHtml(bot) {
  const unlockIdx  = botsData.filter(b => b.unlocked).sort((a,b)=>(a.unlockOrder||99)-(b.unlockOrder||99)).findIndex(b=>b.id===bot.id);
  const nextCostIdx = botsData.filter(b => b.unlocked).length;
  const unlockCost = bot.unlocked
    ? botsUnlockCosts[bot.unlockOrder - 1]
    : (nextCostIdx < botsUnlockCosts.length ? botsUnlockCosts[nextCostIdx] : null);

  const costLabel = unlockCost != null ? `${unlockCost.toLocaleString()} 🏅` : '';

  const rows = bot.stats.map(s => {
    const lvls     = botsLevelValues[s.statId] || [];
    const curLvl   = s.currentLevel;
    const tgtLvl   = s.targetLevel ?? '';
    const curEntry = lvls.find(e => e.level === curLvl);
    const nextEntry= lvls.find(e => e.level === curLvl + 1);
    const val      = curEntry ? fmtBotVal(curEntry.value, s.valueUnit) : '—';
    const locked   = s.isBotPlus && !bot.botPlusUnlocked;
    const atMax    = !locked && curLvl >= s.maxLevel;
    const rowClass = (s.isBotPlus ? ' bot-plus-row' : '') + (locked ? ' bot-row-locked' : atMax ? ' bot-row-maxed' : '');
    const valClass = `bot-val${s.isBotPlus?' plus':''}`;
    const label    = `${escHtml(s.label)}${s.isBotPlus?` <span style="font-size:10px;color:var(--accent2)">(Bot+)</span>`:''}`;
    const lvlCell  = atMax
      ? `<span class="bot-max-label">${s.maxLevel} ★</span>`
      : mkSpin(curLvl,0,s.maxLevel,locked,`botSpinChange(${s.statId},__V__,${bot.id})`);
    const tgtCell  = atMax
      ? `<span class="bot-max-label">—</span>`
      : mkSpin(tgtLvl===''?curLvl:tgtLvl,curLvl,s.maxLevel,locked,`botSpinTarget(${s.statId},__V__,${bot.id})`);
    const costToTarget = !atMax && tgtLvl !== '' && tgtLvl > curLvl
      ? lvls.filter(e => e.level >= curLvl && e.level < tgtLvl && e.medalsToNext != null)
             .reduce((sum,e)=>sum+e.medalsToNext,0)
      : null;
    const costCell = atMax
      ? `<span class="bot-max-label">—</span>`
      : costToTarget != null
        ? `${costToTarget.toLocaleString()} 🏅`
        : (curEntry?.medalsToNext != null ? `${curEntry.medalsToNext.toLocaleString()} 🏅` : '—');
    const nextPreview = (!locked && !atMax && nextEntry)
      ? `<tr class="bot-next-row${s.isBotPlus?' bot-plus-row':''}"><td></td>
           <td colspan="4"><span class="bot-next-preview">${val} → ${fmtBotVal(nextEntry.value, s.valueUnit)}</span></td></tr>`
      : '';
    return `<tr class="${rowClass}">
      <td>${label}</td>
      <td class="bot-lvl-cell">${lvlCell}</td>
      <td class="${valClass}">${val}</td>
      <td class="bot-lvl-cell">${tgtCell}</td>
      <td class="bot-cost">${costCell}</td>
    </tr>${nextPreview}`;
  }).join('');

  const checkedU  = bot.unlocked ? ' checked' : '';
  const checkedBP = bot.botPlusUnlocked ? ' checked' : '';

  return `<div class="bot-card${bot.unlocked?' unlocked':''}">
    <div class="bot-card-header">
      <div class="bot-card-name">${escHtml(bot.name)}</div>
      ${costLabel ? `<div class="bot-unlock-cost">${costLabel}</div>` : ''}
      <div class="bot-toggle-wrap">
        <label class="bot-toggle">
          <input type="checkbox"${checkedU} onchange="botToggleUnlocked(${bot.id},this.checked)">
          <span>Unlocked</span>
        </label>
        <label class="bot-toggle bot-plus-toggle">
          <input type="checkbox"${checkedBP}${!bot.unlocked?' disabled':''} onchange="botToggleBotPlus(${bot.id},this.checked)">
          <span class="bot-plus-label">${escHtml(bot.botPlusAbilityName)} (Bot+)</span>
        </label>
      </div>
    </div>
    <table class="bot-stats-table">
      <thead><tr>
        <th>Stat</th>
        <th class="r" style="width:62px">Level</th>
        <th class="r" style="width:72px">Value</th>
        <th class="r" style="width:62px">Target</th>
        <th class="r" style="width:88px">Cost</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function fmtBotVal(value, unit) {
  switch(unit) {
    case 'PERCENT':    return (value * 100).toFixed(0) + '%';
    case 'MULTIPLIER': return 'x' + value.toFixed(2);
    case 'SECONDS':    return value.toFixed(1) + 's';
    case 'METERS':     return value.toFixed(0) + 'm';
    case 'COUNT':      return value.toFixed(0);
    default:           return String(value);
  }
}

function botsUnlockMedalsSpent() {
  return botsData
    .filter(b => b.unlocked && b.unlockOrder != null)
    .reduce((sum, b) => sum + (botsUnlockCosts[b.unlockOrder - 1] || 0), 0);
}

function botsUpgradeMedalsSpent() {
  return botsData.flatMap(b => b.stats).reduce((sum, s) => {
    const lvls = botsLevelValues[s.statId] || [];
    return sum + lvls.filter(e => e.level < s.currentLevel && e.medalsToNext != null)
                     .reduce((a, e) => a + e.medalsToNext, 0);
  }, 0);
}

function botsMedalsToTargets() {
  return botsData.flatMap(b => b.stats).reduce((sum, s) => {
    const tgt = s.targetLevel;
    if (tgt == null || tgt <= s.currentLevel) return sum;
    const lvls = botsLevelValues[s.statId] || [];
    return sum + lvls.filter(e => e.level >= s.currentLevel && e.level < tgt && e.medalsToNext != null)
                     .reduce((a, e) => a + e.medalsToNext, 0);
  }, 0);
}

function botsMedalsToMax() {
  return botsData.flatMap(b => b.stats).reduce((sum, s) => {
    const lvls = botsLevelValues[s.statId] || [];
    return sum + lvls.filter(e => e.level >= s.currentLevel && e.medalsToNext != null)
                     .reduce((a, e) => a + e.medalsToNext, 0);
  }, 0);
}

function botsComputeMedals(entries) {
  // entries: [{bot, statLevels}] where statLevels = {statId: level}
  let total = 0;
  entries.forEach(({bot, statLevels}) => {
    if (bot.unlocked && bot.unlockOrder != null) total += botsUnlockCosts[bot.unlockOrder - 1] || 0;
    bot.stats.forEach(s => {
      const lvl  = statLevels[s.statId] ?? 0;
      const lvls = botsLevelValues[s.statId] || [];
      total += lvls.filter(e => e.level < lvl && e.medalsToNext != null)
                   .reduce((a, e) => a + e.medalsToNext, 0);
    });
  });
  return total;
}

async function botToggleUnlocked(botId, unlocked) {
  let unlockOrder = null;
  if (unlocked) {
    const alreadyUnlocked = botsData.filter(b => b.unlocked && b.id !== botId).length;
    unlockOrder = alreadyUnlocked + 1;
  }
  await fetch(`${API}/bots/${botId}/unlocked`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({unlocked, unlockOrder})
  });
  const bot = botsData.find(b => b.id === botId);
  if (bot) { bot.unlocked = unlocked; bot.unlockOrder = unlockOrder; }
  buildBotsPage();
}

async function botToggleBotPlus(botId, botPlusUnlocked) {
  await fetch(`${API}/bots/${botId}/bot-plus-unlocked`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({botPlusUnlocked})
  });
  const bot = botsData.find(b => b.id === botId);
  if (bot) bot.botPlusUnlocked = botPlusUnlocked;
  buildBotsPage();
}

async function botSetStatLevel(statId, level, botId) {
  await fetch(`${API}/bots/stats/${statId}/level`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({level})
  });
  const bot = botsData.find(b => b.id === botId);
  if (bot) { const s = bot.stats.find(s => s.statId === statId); if (s) s.currentLevel = level; }
  buildBotsPage();
}

// ── Presets ───────────────────────────────────────────────────────────────────

function renderBotsPresetsTab() {
  const tabBtns = botsPresets.map(p =>
    `<button class="bots-preset-tab${botsActivePreset===p.id?' active':''}" onclick="botsSetActivePreset(${p.id})">${escHtml(p.name)}</button>`
  ).join('');
  const addBtn = botsPresets.length < 5
    ? `<button class="bots-preset-tab" onclick="botsAddPreset()">+ New Preset</button>` : '';

  const preset = botsPresets.find(p => p.id === botsActivePreset);
  let bodyHtml = '';
  if (preset) {
    const unlocks    = botsPresetUnlocks[preset.id]    || [];
    const statLevels = botsPresetStatLevels[preset.id] || [];

    // Compute cost for this preset
    const presetEntries = botsData.map(bot => {
      const unlockEntry = unlocks.find(u => u.botId === bot.id) || {unlocked:false, botPlusUnlocked:false};
      const levelMap = {};
      bot.stats.forEach(s => {
        const e = statLevels.find(l => l.botStatId === s.statId);
        levelMap[s.statId] = e ? e.targetLevel : 0;
      });
      // Temporarily assign unlock order for cost calc (1-indexed by order in botsData)
      const presetUnlockedBots = botsData
        .filter(b => (unlocks.find(u => u.botId === b.id) || {}).unlocked)
        .map((b, i) => ({...b, unlockOrder: i + 1}));
      const fakeBot = {...bot, unlocked: unlockEntry.unlocked,
        unlockOrder: presetUnlockedBots.findIndex(b => b.id === bot.id) + 1 || null};
      return {bot: fakeBot, statLevels: levelMap};
    });
    const presetMedals = botsComputeMedals(presetEntries);

    const medalBar = `<div class="bots-preset-medals">
      <div class="bots-preset-medal-chip"><div class="lbl">Total Medals</div><div class="val">${presetMedals.toLocaleString()}</div></div>
    </div>`;

    const cards = botsData.map(bot => {
      const unlockEntry = unlocks.find(u => u.botId === bot.id) || {unlocked:false, botPlusUnlocked:false};
      const botPlus = unlockEntry.botPlusUnlocked;
      const rows = bot.stats.map(s => {
        const entry    = statLevels.find(l => l.botStatId === s.statId);
        const curLvl   = entry ? entry.targetLevel : 0;
        const lvls     = botsLevelValues[s.statId] || [];
        const curEntry = lvls.find(e => e.level === curLvl);
        const nextEntry= lvls.find(e => e.level === curLvl + 1);
        const val      = curEntry ? fmtBotVal(curEntry.value, s.valueUnit) : '—';
        const locked   = s.isBotPlus && !botPlus;
        const atMax    = !locked && curLvl >= s.maxLevel;
        const rowClass = (s.isBotPlus?' bot-plus-row':'') + (locked?' bot-row-locked':(atMax?' bots-preset-row-maxed':''));
        const label    = `${escHtml(s.label)}${s.isBotPlus?` <span style="font-size:10px;color:var(--accent2)">(Bot+)</span>`:''}`;
        const lvlCell  = atMax
          ? `<span class="bots-preset-max-label">${s.maxLevel} ★</span>`
          : mkSpin(curLvl,0,s.maxLevel,locked,`botsPresetSetStatLevel(${preset.id},${s.statId},__V__)`);
        const nextPreview = (!locked && !atMax && nextEntry)
          ? `<tr class="bots-preset-next-row${s.isBotPlus?' bot-plus-row':''}"><td></td>
               <td colspan="2"><span class="bots-preset-next-preview">${val} → ${fmtBotVal(nextEntry.value, s.valueUnit)}</span></td></tr>`
          : '';
        return `<tr class="${rowClass}">
          <td>${label}</td>
          <td style="text-align:right">${lvlCell}</td>
          <td class="bots-preset-val${s.isBotPlus?' plus':''}">${val}</td>
        </tr>${nextPreview}`;
      }).join('');

      return `<div class="bots-preset-card">
        <div class="bots-preset-card-header">
          <div class="bots-preset-bot-name">${escHtml(bot.name)}</div>
          <div class="bots-preset-toggles">
            <label class="bots-preset-toggle">
              <input type="checkbox"${unlockEntry.unlocked?' checked':''}
                onchange="botsPresetToggleUnlock(${preset.id},${bot.id},this.checked,'unlock')">
              <span>Unlocked</span>
            </label>
            <label class="bots-preset-toggle">
              <input type="checkbox"${botPlus?' checked':''}${!unlockEntry.unlocked?' disabled':''}
                style="accent-color:var(--accent2)"
                onchange="botsPresetToggleUnlock(${preset.id},${bot.id},this.checked,'botplus')">
              <span class="bot-plus-label">Bot+</span>
            </label>
          </div>
        </div>
        <table class="bots-preset-stats">
          <thead><tr>
            <th>Stat</th>
            <th class="r" style="width:62px">Target</th>
            <th class="r" style="width:72px">Value</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    const deleteBtn = botsPresets.length > 1
      ? `<button class="btn" style="color:var(--red);border-color:var(--red)" onclick="botsDeletePreset(${preset.id})">Delete</button>` : '';

    bodyHtml = `
      <div class="bots-preset-header">
        <input class="bots-preset-name-input" value="${escHtml(preset.name)}"
          onblur="botsRenamePreset(${preset.id},this.value)" onkeydown="if(event.key==='Enter')this.blur()">
        ${deleteBtn}
      </div>
      ${medalBar}
      <div class="bots-preset-grid">${cards}</div>`;
  }

  document.getElementById('botsBody').innerHTML = `
    <div class="bots-preset-bar">${tabBtns}${addBtn}</div>
    ${bodyHtml}`;
}

function botsSetActivePreset(id) { botsActivePreset = id; renderBotsPresetsTab(); }

async function botsAddPreset() {
  const nextSlot = Math.max(0, ...botsPresets.map(p => p.slot)) + 1;
  const name = `Preset ${nextSlot}`;
  const res = await fetch(`${API}/bots/presets`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({slot: nextSlot, name})
  });
  const id = await res.json();
  botsPresets.push({id, slot: nextSlot, name});
  botsPresetUnlocks[id]    = [];
  botsPresetStatLevels[id] = [];
  botsActivePreset = id;
  renderBotsPresetsTab();
}

async function botsDeletePreset(presetId) {
  await fetch(`${API}/bots/presets/${presetId}`, {method:'DELETE'});
  botsPresets = botsPresets.filter(p => p.id !== presetId);
  delete botsPresetUnlocks[presetId];
  delete botsPresetStatLevels[presetId];
  if (botsActivePreset === presetId) botsActivePreset = botsPresets[0]?.id || null;
  renderBotsPresetsTab();
}

async function botsRenamePreset(presetId, name) {
  const preset = botsPresets.find(p => p.id === presetId);
  if (!preset || preset.name === name) return;
  await fetch(`${API}/bots/presets`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({slot: preset.slot, name})
  });
  preset.name = name;
  renderBotsPresetsTab();
}

async function botsPresetToggleUnlock(presetId, botId, checked, field) {
  const unlocks = botsPresetUnlocks[presetId] || [];
  let entry = unlocks.find(u => u.botId === botId);
  if (!entry) { entry = {botId, unlocked: false, botPlusUnlocked: false}; unlocks.push(entry); botsPresetUnlocks[presetId] = unlocks; }
  if (field === 'unlock')  { entry.unlocked = checked; if (!checked) entry.botPlusUnlocked = false; }
  if (field === 'botplus') entry.botPlusUnlocked = checked;
  await fetch(`${API}/bots/presets/${presetId}/unlocks`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({unlocks})
  });
  renderBotsPresetsTab();
}

async function botsPresetSetStatLevel(presetId, botStatId, targetLevel) {
  const levels = botsPresetStatLevels[presetId] || [];
  const entry  = levels.find(l => l.botStatId === botStatId);
  if (entry) entry.targetLevel = targetLevel;
  else levels.push({botStatId, targetLevel});
  botsPresetStatLevels[presetId] = levels;
  await fetch(`${API}/bots/presets/${presetId}/stat-levels`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({levels})
  });
  renderBotsPresetsTab();
}

// ── Guardian ──────────────────────────────────────────────────────────────────

let guardianUnlocked    = false;
let guardianSlots       = [];
let guardianChips       = [];
let guardianLevelValues = {};   // statId → [{level, value, bitsToNext}]
let guardianTab         = 'tracker';
let guardianPresets     = [];
let guardianPresetChips      = {};   // presetId → [{chipId, active}]
let guardianPresetStatLevels = {};   // presetId → [{chipStatId, targetLevel}]
let guardianActivePreset     = null;

async function renderGuardianView() {
  document.getElementById('mainContent').innerHTML =
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading guardian…</div>';
  try {
    const [gRes, presetsRes, lvlRes] = await Promise.all([
      fetch(`${API}/guardian`),
      fetch(`${API}/guardian/presets`),
      fetch(`${API}/guardian/level-values`)
    ]);
    const g         = await gRes.json();
    guardianUnlocked = g.unlocked;
    guardianSlots    = g.slots;
    guardianChips    = g.chips;
    guardianPresets  = await presetsRes.json();

    const lvlData = await lvlRes.json();
    guardianLevelValues = {};
    lvlData.forEach(e => { guardianLevelValues[e.statId] = e.levels; });

    guardianPresetChips      = {};
    guardianPresetStatLevels = {};
    await Promise.all(guardianPresets.map(async p => {
      const [cRes, lRes] = await Promise.all([
        fetch(`${API}/guardian/presets/${p.id}/chips`),
        fetch(`${API}/guardian/presets/${p.id}/stat-levels`)
      ]);
      guardianPresetChips[p.id]      = await cRes.json();
      guardianPresetStatLevels[p.id] = await lRes.json();
    }));

    if (!guardianActivePreset && guardianPresets.length > 0)
      guardianActivePreset = guardianPresets[0].id;
    buildGuardianPage();
  } catch(e) {
    document.getElementById('mainContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildGuardianPage() {
  const acquired    = guardianChips.filter(c => c.acquired).length;
  const slotsUnlocked = guardianSlots.filter(s => s.unlocked).length;
  const bitsSpent   = guardianBitsSpent();

  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:1rem">Guardian</div>
    <div class="guardian-summary-bar">
      <div class="guardian-summary-chip"><div class="lbl">Guardian</div><div class="val" style="color:${guardianUnlocked?'var(--green)':'var(--muted)'}">${guardianUnlocked?'Unlocked':'Locked'}</div></div>
      <div class="guardian-summary-chip"><div class="lbl">Chips</div><div class="val">${acquired} / ${guardianChips.length}</div></div>
      <div class="guardian-summary-chip"><div class="lbl">Slots Unlocked</div><div class="val">${slotsUnlocked} / ${guardianSlots.length}</div></div>
      <div class="guardian-summary-chip"><div class="lbl">Bits Invested</div><div class="val" id="guardian-chip-invested" style="color:var(--accent)">${bitsSpent.toLocaleString()}</div></div>
      <div class="guardian-summary-chip"><div class="lbl">Bits to Planned Targets</div><div class="val" id="guardian-chip-to-targets" style="color:var(--orange)"></div></div>
      <div class="guardian-summary-chip"><div class="lbl">Bits to Max Everything</div><div class="val" id="guardian-chip-to-max"></div></div>
    </div>
    <div class="guardian-tab-bar">
      <div class="guardian-tab${guardianTab==='tracker'?' active':''}" onclick="guardianSetTab('tracker')">Tracker</div>
      <div class="guardian-tab${guardianTab==='presets'?' active':''}" onclick="guardianSetTab('presets')">Presets</div>
    </div>
    <div id="guardianBody"></div>`;

  renderGuardianBody();
  updateGuardianBitsChips();
}

function guardianSetTab(tab) {
  guardianTab = tab;
  document.querySelectorAll('.guardian-tab').forEach(el =>
    el.classList.toggle('active', el.textContent.toLowerCase() === tab));
  renderGuardianBody();
}

function renderGuardianBody() {
  if (guardianTab === 'tracker') renderGuardianTracker();
  else renderGuardianPresetsTab();
}

// ── Tracker ───────────────────────────────────────────────────────────────────

function renderGuardianTracker() {
  const unlockToggle = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem;">
      <label style="font-size:13px;font-weight:600">Guardian Unlocked (200 bits)</label>
      <input type="checkbox" ${guardianUnlocked?'checked':''} onchange="guardianToggleUnlocked(this.checked)">
    </div>`;

  const slotsHtml = `
    <div class="guardian-slots-section">
      <div class="section-title">Chip Slots</div>
      <div class="guardian-slots-row">
        ${guardianSlots.map(s => {
          const costLabel = s.unlockCostTokens != null ? `${s.unlockCostTokens} tokens` : 'Cost TBD';
          return `<div class="guardian-slot-pill">
            <input type="checkbox" ${s.unlocked?'checked':''} onchange="guardianToggleSlot(${s.slotNumber},this.checked)">
            <span>Slot ${s.slotNumber}</span>
            <span style="color:var(--muted);font-size:11px">${costLabel}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  const filterPills = guardianChips.map(chip => {
    const hidden = guardianHidden.has(chip.code);
    return `<span class="guardian-filter-pill${hidden?' hidden-chip':''}" data-code="${chip.code}"
      onclick="guardianToggleHidden('${chip.code}')">${escHtml(chip.name)}</span>`;
  }).join('');

  const cards = guardianChips.map(chip =>
    `<div class="guardian-chip-wrap" data-code="${chip.code}" style="${guardianHidden.has(chip.code)?'display:none':''}">${guardianChipCardHtml(chip)}</div>`
  ).join('');

  const addBtn = `<div style="margin-bottom:1rem">
    <button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="guardianOpenAddChip()">+ Add Chip</button>
  </div>`;
  document.getElementById('guardianBody').innerHTML =
    `${unlockToggle}${slotsHtml}${addBtn}<div class="guardian-filter-bar"><span class="guardian-filter-lbl">Show:</span>${filterPills}</div><div class="guardian-chips-grid">${cards}</div>`;
}

function guardianChipBitsSpent(chip) {
  let total = 0;
  for (const s of chip.stats) {
    const lvls = guardianLevelValues[s.statId] || [];
    for (let lv = 0; lv < s.currentLevel; lv++) {
      const entry = lvls.find(e => e.level === lv);
      if (entry?.bitsToNext) total += entry.bitsToNext;
    }
  }
  return total;
}

function guardianChipCardHtml(chip) {
  const sourceLabel = chip.source === 'BASE' ? 'Base chip' :
    `Guild Shop${chip.unlockSeason ? ` S${chip.unlockSeason}` : ''} — ${chip.unlockCostTokens} tokens`;
  const bitsSpent = guardianChipBitsSpent(chip);

  const rows = chip.stats.map(s => {
    const lvls     = guardianLevelValues[s.statId] || [];
    const atMax    = s.currentLevel >= s.maxLevel;
    const tgtLvl   = s.targetLevel ?? '';
    const curEntry = lvls.find(e => e.level === s.currentLevel);
    const val      = curEntry ? fmtGuardianVal(curEntry.value, s.valueUnit) : '—';

    const lvlCell = atMax
      ? `<span class="guardian-max-label">${s.maxLevel} ★</span>`
      : mkSpin(s.currentLevel, 0, s.maxLevel, false, `guardianSetStatLevel(${s.statId},__V__,${chip.id})`);

    const tgtCell = atMax
      ? `<span class="guardian-max-label">—</span>`
      : mkSpin(tgtLvl === '' ? s.currentLevel : tgtLvl, s.currentLevel, s.maxLevel, false, `guardianSetStatTargetLevel(${s.statId},__V__,${chip.id})`);

    let costCell;
    if (atMax) {
      costCell = `<span style="color:#f5c842;font-weight:600">★ Max</span>`;
    } else if (tgtLvl !== '' && tgtLvl > s.currentLevel) {
      const costToTarget = lvls.filter(e => e.level >= s.currentLevel && e.level < tgtLvl && e.bitsToNext != null)
                               .reduce((a, e) => a + e.bitsToNext, 0);
      costCell = `<span style="color:var(--orange);font-size:11px">${costToTarget.toLocaleString()} bits</span>`;
    } else if (curEntry?.bitsToNext != null) {
      costCell = `<span style="color:var(--muted);font-size:11px">${curEntry.bitsToNext.toLocaleString()} bits</span>`;
    } else {
      costCell = `<span style="color:var(--muted);font-size:11px">—</span>`;
    }

    return `<tr${atMax?' class="guardian-row-maxed"':''}>
      <td>${escHtml(s.label)}</td>
      <td class="guardian-chip-val">${val}</td>
      <td style="text-align:right">${lvlCell}</td>
      <td style="text-align:right">${tgtCell}</td>
      <td style="text-align:right">${costCell}</td>
    </tr>`;
  }).join('');

  return `<div class="guardian-chip-card" data-chip-id="${chip.id}">
    <div class="guardian-chip-card-header">
      <div>
        <div class="guardian-chip-name">${escHtml(chip.name)}</div>
        <div class="guardian-chip-source">${sourceLabel}</div>
        ${bitsSpent > 0 ? `<div style="font-size:11px;color:var(--accent);margin-top:2px;font-family:var(--mono)">${bitsSpent.toLocaleString()} bits invested</div>` : ''}
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${chip.acquired?'checked':''} onchange="guardianToggleChip(${chip.id},this.checked)">
        Acquired
      </label>
    </div>
    <table class="guardian-chip-stats">
      <thead><tr><th>Stat</th><th class="r">Value</th><th class="r">Level</th><th class="r">Target</th><th class="r">Cost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function fmtGuardianVal(value, unit) {
  if (unit === 'PERCENT')     return (value * 100).toFixed(1) + '%';
  if (unit === 'SECONDS')     return value + 's';
  if (unit === 'MULTIPLIER')  return 'x' + value.toFixed(2).replace(/\.?0+$/, '') ;
  if (unit === 'COUNT')       return value.toString();
  return value.toString();
}

function guardianBitsSpent() {
  let total = 0;
  for (const chip of guardianChips) {
    for (const s of chip.stats) {
      const lvls = guardianLevelValues[s.statId] || [];
      for (let lv = 0; lv < s.currentLevel; lv++) {
        const entry = lvls.find(e => e.level === lv);
        if (entry?.bitsToNext) total += entry.bitsToNext;
      }
    }
  }
  return total;
}

function guardianToggleHidden(code) {
  if (guardianHidden.has(code)) guardianHidden.delete(code); else guardianHidden.add(code);
  localStorage.setItem('guardian-hidden', JSON.stringify([...guardianHidden]));
  document.querySelectorAll('.guardian-filter-pill').forEach(p => {
    p.classList.toggle('hidden-chip', guardianHidden.has(p.dataset.code));
  });
  document.querySelectorAll('.guardian-chip-wrap').forEach(w => {
    w.style.display = guardianHidden.has(w.dataset.code) ? 'none' : '';
  });
}

function guardianBitsToTargets() {
  return guardianChips.flatMap(c => c.stats).reduce((sum, s) => {
    const tgt = s.targetLevel;
    if (tgt == null || tgt <= s.currentLevel) return sum;
    const lvls = guardianLevelValues[s.statId] || [];
    return sum + lvls.filter(e => e.level >= s.currentLevel && e.level < tgt && e.bitsToNext != null)
                     .reduce((a, e) => a + e.bitsToNext, 0);
  }, 0);
}

function guardianBitsToMax() {
  return guardianChips.flatMap(c => c.stats).reduce((sum, s) => {
    const lvls = guardianLevelValues[s.statId] || [];
    return sum + lvls.filter(e => e.level >= s.currentLevel && e.bitsToNext != null)
                     .reduce((a, e) => a + e.bitsToNext, 0);
  }, 0);
}

function updateGuardianBitsChips() {
  const i = document.getElementById('guardian-chip-invested');
  const t = document.getElementById('guardian-chip-to-targets');
  const m = document.getElementById('guardian-chip-to-max');
  if (i) i.textContent = guardianBitsSpent().toLocaleString();
  if (t) t.textContent = guardianBitsToTargets().toLocaleString();
  if (m) m.textContent = guardianBitsToMax().toLocaleString();
}

async function guardianToggleUnlocked(unlocked) {
  guardianUnlocked = unlocked;
  await fetch(`${API}/guardian/unlocked`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({unlocked})
  });
  buildGuardianPage();
}

async function guardianToggleSlot(slotNumber, unlocked) {
  const slot = guardianSlots.find(s => s.slotNumber === slotNumber);
  if (slot) slot.unlocked = unlocked;
  await fetch(`${API}/guardian/slots/${slotNumber}/unlocked`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({unlocked})
  });
  buildGuardianPage();
}

async function guardianToggleChip(chipId, acquired) {
  const chip = guardianChips.find(c => c.id === chipId);
  if (chip) chip.acquired = acquired;
  await fetch(`${API}/guardian/chips/${chipId}/acquired`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({acquired})
  });
  buildGuardianPage();
}

async function guardianSetStatLevel(statId, level, chipId) {
  const chip = guardianChips.find(c => c.id === chipId);
  const stat = chip?.stats.find(s => s.statId === statId);
  if (!chip || !stat) return;
  stat.currentLevel = Math.min(Math.max(level, 0), stat.maxLevel);
  const wrap = document.querySelector(`.guardian-chip-wrap[data-code="${chip.code}"]`);
  if (wrap) wrap.innerHTML = guardianChipCardHtml(chip);
  updateGuardianBitsChips();
  await fetch(`${API}/guardian/stats/${statId}/level`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({level: stat.currentLevel})
  });
}

async function guardianSetStatTargetLevel(statId, level, chipId) {
  const chip = guardianChips.find(c => c.id === chipId);
  const stat = chip?.stats.find(s => s.statId === statId);
  if (!chip || !stat) return;
  stat.targetLevel = Math.min(Math.max(level, stat.currentLevel), stat.maxLevel);
  const wrap = document.querySelector(`.guardian-chip-wrap[data-code="${chip.code}"]`);
  if (wrap) wrap.innerHTML = guardianChipCardHtml(chip);
  updateGuardianBitsChips();
  fetch(`${API}/guardian/stats/${statId}/target-level`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({targetLevel: stat.targetLevel})
  });
}

// ── Presets ───────────────────────────────────────────────────────────────────

function renderGuardianPresetsTab() {
  const preset = guardianPresets.find(p => p.id === guardianActivePreset);

  const presetBar = `
    <div class="guardian-preset-bar">
      ${guardianPresets.map(p => `
        <button class="guardian-preset-tab${p.id===guardianActivePreset?' active':''}"
          onclick="guardianSetActivePreset(${p.id})">${escHtml(p.name)||'Preset '+p.slot}</button>`).join('')}
      ${guardianPresets.length < 5
        ? `<button class="guardian-preset-tab" onclick="guardianAddPreset()">+ Add</button>` : ''}
    </div>`;

  if (!preset) {
    document.getElementById('guardianBody').innerHTML = presetBar +
      '<div class="empty-state" style="padding:3rem"><p>No presets yet.</p></div>';
    return;
  }

  const presetChips  = guardianPresetChips[preset.id]      || [];
  const presetLevels = guardianPresetStatLevels[preset.id] || [];

  const bitsTotal = guardianPresets.length ? (() => {
    let t = 0;
    for (const chip of guardianChips) {
      for (const s of chip.stats) {
        const lvls = guardianLevelValues[s.statId] || [];
        const tgt  = (presetLevels.find(l => l.chipStatId === s.statId)?.targetLevel) || 0;
        const cur  = s.currentLevel;
        for (let lv = cur; lv < tgt; lv++) {
          const e = lvls.find(e => e.level === lv);
          if (e?.bitsToNext) t += e.bitsToNext;
        }
      }
    }
    return t;
  })() : 0;

  const header = `
    <div class="guardian-preset-header">
      <input class="guardian-preset-name-input" value="${escHtml(preset.name)}"
        onchange="guardianRenamePreset(${preset.id},this.value)" placeholder="Preset name">
      <button class="btn" style="font-size:12px;padding:5px 12px;color:var(--red,#f87171);border-color:var(--red,#f87171)" onclick="guardianDeletePreset(${preset.id})">Delete</button>
    </div>
    <div class="guardian-preset-bits">
      <div class="guardian-preset-bits-chip">
        <div class="lbl">Bits to Goal</div>
        <div class="val">${bitsTotal.toLocaleString()}</div>
      </div>
    </div>`;

  const cards = guardianChips.map(chip => {
    const chipEntry = presetChips.find(c => c.chipId === chip.id);
    const chipAcq   = chipEntry?.active ?? false;

    const rows = chip.stats.map(s => {
      const lvls  = guardianLevelValues[s.statId] || [];
      const tgtLv = (presetLevels.find(l => l.chipStatId === s.statId)?.targetLevel) ?? s.currentLevel;
      const entry = lvls.find(e => e.level === tgtLv);
      const val   = entry ? fmtGuardianVal(entry.value, s.valueUnit) : '—';
      const opts  = Array.from({length: s.maxLevel + 1}, (_,i) =>
        `<option value="${i}"${i===tgtLv?' selected':''}>${i}</option>`).join('');
      return `<tr>
        <td>${escHtml(s.label)}</td>
        <td class="guardian-preset-val">${val}</td>
        <td><select class="guardian-preset-lvl-select"
          onchange="guardianPresetSetStatLevel(${preset.id},${s.statId},+this.value)">${opts}</select></td>
      </tr>`;
    }).join('');

    return `<div class="guardian-preset-card">
      <div class="guardian-preset-card-header">
        <div class="guardian-preset-chip-name">${escHtml(chip.name)}</div>
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer">
          <input type="checkbox" ${chipAcq?'checked':''}
            onchange="guardianPresetToggleActive(${preset.id},${chip.id},this.checked)">
          In Preset
        </label>
      </div>
      <table class="guardian-preset-stats">
        <thead><tr><th>Stat</th><th class="r">Value</th><th class="r">Target</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  document.getElementById('guardianBody').innerHTML =
    `${presetBar}${header}<div class="guardian-preset-grid">${cards}</div>`;
}

function guardianSetActivePreset(id) { guardianActivePreset = id; renderGuardianPresetsTab(); }

async function guardianAddPreset() {
  const slot = guardianPresets.length + 1;
  if (slot > 5) return;
  const id = await (await fetch(`${API}/guardian/presets`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({slot, name: `Preset ${slot}`})
  })).json();
  guardianPresets.push({id, slot, name: `Preset ${slot}`});
  guardianPresetChips[id]      = [];
  guardianPresetStatLevels[id] = [];
  guardianActivePreset = id;
  renderGuardianPresetsTab();
}

async function guardianDeletePreset(presetId) {
  await fetch(`${API}/guardian/presets/${presetId}`, {method:'DELETE'});
  guardianPresets = guardianPresets.filter(p => p.id !== presetId);
  delete guardianPresetChips[presetId];
  delete guardianPresetStatLevels[presetId];
  if (guardianActivePreset === presetId)
    guardianActivePreset = guardianPresets[0]?.id ?? null;
  renderGuardianPresetsTab();
}

async function guardianRenamePreset(presetId, name) {
  const preset = guardianPresets.find(p => p.id === presetId);
  if (preset) preset.name = name;
  await fetch(`${API}/guardian/presets`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({slot: preset.slot, name})
  });
}

async function guardianPresetToggleActive(presetId, chipId, active) {
  const chips = guardianPresetChips[presetId] || [];
  const entry = chips.find(c => c.chipId === chipId);
  if (entry) entry.active = active;
  else chips.push({chipId, active});
  guardianPresetChips[presetId] = chips;
  await fetch(`${API}/guardian/presets/${presetId}/chips`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chips})
  });
  renderGuardianPresetsTab();
}

async function guardianPresetSetStatLevel(presetId, chipStatId, targetLevel) {
  const levels = guardianPresetStatLevels[presetId] || [];
  const entry  = levels.find(l => l.chipStatId === chipStatId);
  if (entry) entry.targetLevel = targetLevel;
  else levels.push({chipStatId, targetLevel});
  guardianPresetStatLevels[presetId] = levels;
  await fetch(`${API}/guardian/presets/${presetId}/stat-levels`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({levels})
  });
  renderGuardianPresetsTab();
}

// ── Add Chip modal ─────────────────────────────────────────────────────────────

let gnStatCount = 0;

function guardianOpenAddChip() {
  gnStatCount = 0;
  document.getElementById('gnName').value    = '';
  document.getElementById('gnTokens').value  = '';
  document.getElementById('gnSeason').value  = '';
  document.getElementById('gnSource').value  = 'GUILD_SHOP';
  document.getElementById('gnStatBlocks').innerHTML = '';
  gnAddStat();
  document.getElementById('guardianAddChipModal').style.display = 'flex';
}

function guardianCloseAddChip() {
  document.getElementById('guardianAddChipModal').style.display = 'none';
}

function gnAddStat() {
  if (gnStatCount >= 3) return;
  const idx = gnStatCount++;
  const div = document.createElement('div');
  div.className = 'gn-stat-block';
  div.dataset.statIdx = idx;
  div.innerHTML = `
    <div class="gn-stat-block-header">
      <span class="gn-stat-title">Stat ${idx + 1}</span>
      <button class="gn-rm-row" title="Remove stat" onclick="gnRemoveStat(this)">✕</button>
    </div>
    <div class="gn-form-row cols3" style="margin-bottom:8px">
      <div class="form-group" style="margin:0">
        <label class="form-label">Label</label>
        <input class="form-input gn-stat-label" placeholder="e.g. Cooldown" oninput="gnAutoKey(this)">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Stat Key</label>
        <input class="form-input gn-stat-key" placeholder="e.g. cooldown">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Unit</label>
        <select class="gn-select gn-stat-unit">
          <option value="PERCENT">Percent</option>
          <option value="SECONDS">Seconds</option>
          <option value="COUNT">Count</option>
          <option value="MULTIPLIER">Multiplier</option>
        </select>
      </div>
    </div>
    <table class="gn-levels-table">
      <thead><tr>
        <th style="width:44px;text-align:center">Level</th>
        <th>Value</th>
        <th>Bits to Next</th>
        <th style="width:30px"></th>
      </tr></thead>
      <tbody></tbody>
    </table>
    <button class="gn-add-level-btn" onclick="gnAddRow(this)">+ Add Level</button>`;
  document.getElementById('gnStatBlocks').appendChild(div);
  gnAddRow(div.querySelector('.gn-add-level-btn'));
  document.getElementById('gnAddStatBtn').style.display = gnStatCount >= 3 ? 'none' : '';
}

function gnRemoveStat(btn) {
  btn.closest('.gn-stat-block').remove();
  gnStatCount--;
  document.getElementById('gnStatBlocks').querySelectorAll('.gn-stat-block').forEach((el, i) => {
    el.querySelector('.gn-stat-title').textContent = `Stat ${i + 1}`;
  });
  document.getElementById('gnAddStatBtn').style.display = gnStatCount >= 3 ? 'none' : '';
}

function gnAutoKey(labelInput) {
  const keyInput = labelInput.closest('.gn-form-row').querySelector('.gn-stat-key');
  keyInput.value = labelInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function gnAddRow(addBtn) {
  const tbody = addBtn.closest('.gn-stat-block').querySelector('tbody');
  const level = tbody.rows.length;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="lvl">${level}</td>
    <td><input type="number" class="gn-num-input gn-val" step="any" placeholder="0"></td>
    <td><input type="number" class="gn-num-input gn-bits" step="1" min="0" placeholder="—"></td>
    <td><button class="gn-rm-row" onclick="gnRemoveRow(this)">✕</button></td>`;
  tbody.appendChild(tr);
  gnRefreshLastRow(tbody);
}

function gnRemoveRow(btn) {
  const tbody = btn.closest('tbody');
  if (tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
  gnRenumberRows(tbody);
  gnRefreshLastRow(tbody);
}

function gnRenumberRows(tbody) {
  Array.from(tbody.rows).forEach((tr, i) => { tr.cells[0].textContent = i; });
}

function gnRefreshLastRow(tbody) {
  Array.from(tbody.rows).forEach((tr, i) => {
    const bitsInput = tr.querySelector('.gn-bits');
    const isLast = i === tbody.rows.length - 1;
    bitsInput.disabled = isLast;
    if (isLast) bitsInput.value = '';
  });
}

// ── Tournaments ───────────────────────────────────────────────────────────────

let tournamentConditions = [];
let tournaments          = [];
let tournamentTab        = 'history';
let tournamentFormOpen   = false;
let tournamentSearchResults    = null;
let tournamentSearchCondIds   = [];

async function renderTournamentView() {
  document.getElementById('mainContent').innerHTML =
    '<div class="loading-placeholder" style="padding:4rem;text-align:center">Loading tournaments…</div>';
  try {
    const [cRes, tRes] = await Promise.all([
      fetch(`${API}/tournaments/conditions`),
      fetch(`${API}/tournaments`)
    ]);
    tournamentConditions = await cRes.json();
    tournaments          = await tRes.json();
    tournamentSearchResults = null;
    buildTournamentPage();
  } catch(e) {
    document.getElementById('mainContent').innerHTML =
      `<div class="empty-state"><div class="icon">⚠️</div><h2>Failed to load</h2><p>${e.message}</p></div>`;
  }
}

function buildTournamentPage() {
  document.getElementById('mainContent').innerHTML = `
    <div class="report-title" style="margin-bottom:1rem">Tournament Battle Conditions</div>
    <div class="tourn-tab-bar">
      <div class="tourn-tab${tournamentTab==='history'?' active':''}" onclick="tournamentSetTab('history')">History</div>
      <div class="tourn-tab${tournamentTab==='search'?' active':''}" onclick="tournamentSetTab('search')">Search</div>
      <div class="tourn-tab${tournamentTab==='import'?' active':''}" onclick="tournamentSetTab('import')">Import</div>
    </div>
    <div id="tournamentBody"></div>`;
  renderTournamentBody();
}

function tournamentSetTab(tab) {
  tournamentTab = tab;
  tournamentFormOpen = false;
  document.querySelectorAll('.tourn-tab').forEach(el =>
    el.classList.toggle('active', el.textContent.toLowerCase() === tab));
  renderTournamentBody();
}

function renderTournamentBody() {
  if (tournamentTab === 'history') renderTournamentHistory();
  else if (tournamentTab === 'import') renderTournamentImport();
  else renderTournamentSearch();
}

function tournamentLeagueBadge(league) {
  return `<span class="tourn-league-badge ${league}">${league}</span>`;
}

function tournamentCondPills(conditions) {
  const sorted = [...conditions].sort((a, b) =>
    a.category === b.category ? 0 : a.category === 'HEAT' ? -1 : 1);
  return sorted.map(c =>
    `<span class="tourn-cond-pill ${c.category}" title="${c.category}">${c.name}</span>`
  ).join('');
}

function renderTournamentHistory() {
  const overheat = tournamentConditions.filter(c => c.category === 'OVERHEAT');
  const heat     = tournamentConditions.filter(c => c.category === 'HEAT');

  const formHtml = tournamentFormOpen ? `
    <div class="tourn-form-card">
      <div style="font-size:13px;font-weight:700;margin-bottom:1rem">Tournament Battle Conditions</div>
      <div class="tourn-form-row">
        <div class="tourn-field">
          <label>Date</label>
          <input id="tfDate" type="date" class="tourn-input" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="tourn-field">
          <label>League</label>
          <select id="tfLeague" class="tourn-input">
            <option value="SILVER">Silver</option>
            <option value="GOLD">Gold</option>
            <option value="PLATINUM" selected>Platinum</option>
            <option value="CHAMPION">Champion</option>
            <option value="LEGENDS">Legends</option>
          </select>
        </div>
      </div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Conditions</div>
      <div class="tourn-cond-groups">
        <div>
          <div class="tourn-cond-group-title">Overheat (always active)</div>
          <div class="tourn-cond-check-list">
            ${overheat.map(c => `
              <label class="tourn-cond-check">
                <input type="checkbox" value="${c.id}" checked disabled>
                <span style="color:var(--muted)">${c.name}</span>
              </label>`).join('')}
          </div>
        </div>
        <div>
          <div class="tourn-cond-group-title">Heat (random per tournament)</div>
          <div class="tourn-cond-check-list" id="tfHeatList">
            ${heat.map(c => `
              <label class="tourn-cond-check">
                <input type="checkbox" value="${c.id}" class="tf-heat-cb">
                <span>${c.name}${c.acronym ? ` <span style="color:var(--muted);font-size:11px">(${c.acronym})</span>` : ''}</span>
              </label>`).join('')}
          </div>
          <button class="gn-add-stat-btn" style="margin-top:10px;width:auto;padding:4px 12px"
            onclick="tournamentOpenAddCondition()">+ New Condition</button>
        </div>
      </div>
      <div class="tourn-form-actions">
        <button class="btn btn-primary" onclick="tournamentSave()">Save</button>
        <button class="btn" onclick="tournamentCloseForm()">Cancel</button>
      </div>
    </div>` : '';

  const rows = tournaments.length === 0
    ? `<div style="color:var(--muted);font-size:13px;padding:2rem 0;text-align:center">No tournaments logged yet.</div>`
    : tournaments.map(t => `
        <div class="tourn-history-row">
          <div class="tourn-history-date">${t.date}</div>
          <div>${tournamentLeagueBadge(t.league)}</div>
          <div class="tourn-history-pills">${tournamentCondPills(t.conditions)}</div>
          <button class="btn" style="font-size:11px;padding:3px 10px;color:var(--red);border-color:rgba(242,107,107,.3)"
            onclick="tournamentDelete(${t.id})">Delete</button>
        </div>`).join('');

  document.getElementById('tournamentBody').innerHTML = `
    ${formHtml}
    ${!tournamentFormOpen ? `<div style="margin-bottom:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
      <button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="tournamentOpenForm()">+ Add Tournament Battle Conditions</button>
      <button class="btn" style="font-size:12px;padding:5px 14px" onclick="tournamentOpenS3Modal()">Fetch Battle Conditions</button>
    </div>` : ''}
    <div>${rows}</div>`;
}

function tournamentOpenForm() {
  tournamentFormOpen = true;
  renderTournamentHistory();
}

function tournamentCloseForm() {
  tournamentFormOpen = false;
  renderTournamentHistory();
}

function tournamentOpenS3Modal() {
  document.getElementById('ts3Date').value = mostRecentTournamentDate();
  document.getElementById('ts3Status').textContent = '';
  document.getElementById('ts3LoadBtn').disabled = false;
  document.getElementById('tournamentS3Modal').style.display = 'flex';
}

function tournamentCloseS3Modal() {
  document.getElementById('tournamentS3Modal').style.display = 'none';
}

async function tournamentLoadFromS3() {
  const date   = document.getElementById('ts3Date').value;
  const status = document.getElementById('ts3Status');
  const btn    = document.getElementById('ts3LoadBtn');

  if (!date) { status.textContent = 'Select a date.'; return; }
  const d = new Date(date + 'T00:00:00Z');
  if (d.getUTCDay() !== 3 && d.getUTCDay() !== 6) {
    status.style.color = 'var(--red)';
    status.textContent = 'Must be a Wednesday or Saturday.';
    return;
  }

  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = 'Checking for Battle Conditions…';

  try {
    const res = await fetch(`${API}/tournaments/fetch-from-s3?date=${encodeURIComponent(date)}`);
    if (res.status === 404) {
      status.style.color = 'var(--red)';
      status.innerHTML = `No data found for ${date}. Visit <a href="https://thetower.lol/bcs" target="_blank" style="color:var(--accent)">thetower.lol/bcs</a> to download the battle conditions, then use the <strong>Import</strong> tab.`;
      btn.disabled = false;
      return;
    }
    if (!res.ok) throw new Error(await httpErrorMessage(res));
    tournamentCloseS3Modal();
    await renderTournamentView();
  } catch(e) {
    status.style.color = 'var(--red)';
    status.textContent = 'Failed: ' + e.message;
    btn.disabled = false;
  }
}

async function tournamentSave() {
  const date   = document.getElementById('tfDate').value;
  const league = document.getElementById('tfLeague').value;
  if (!date) { alert('Date is required.'); return; }

  const overheatIds = tournamentConditions
    .filter(c => c.category === 'OVERHEAT').map(c => c.id);
  const heatIds = [...document.querySelectorAll('.tf-heat-cb:checked')]
    .map(cb => parseInt(cb.value));
  const conditionIds = [...overheatIds, ...heatIds];

  const res = await fetch(`${API}/tournaments`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ date, league, conditionIds })
  });
  if (!res.ok) { alert('Failed to save tournament.'); return; }
  tournamentFormOpen = false;
  await renderTournamentView();
}

async function tournamentDelete(id) {
  if (!confirm('Delete this tournament entry?')) return;
  await fetch(`${API}/tournaments/${id}`, { method: 'DELETE' });
  await renderTournamentView();
}

function renderTournamentSearch() {
  const heat = tournamentConditions.filter(c => c.category === 'HEAT');

  const grid = heat.map(c => `
    <label class="tourn-search-cond-check">
      <input type="checkbox" value="${c.id}" class="ts-cond-cb">
      <span>${c.name}${c.acronym ? ` <span style="color:var(--muted);font-size:11px">(${c.acronym})</span>` : ''}</span>
    </label>`).join('');

  const searchedConds = tournamentConditions.filter(c => tournamentSearchCondIds.includes(c.id));
  const resultsHtml = tournamentSearchResults === null ? '' :
    tournamentSearchResults.length === 0
      ? `<div style="color:var(--muted);font-size:13px;padding:1rem 0">No tournaments matched all selected conditions.</div>`
      : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
           <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">${tournamentSearchResults.length} result${tournamentSearchResults.length!==1?'s':''}</span>
           <span style="color:var(--muted);font-size:11px">—</span>
           ${tournamentCondPills(searchedConds)}
         </div>` +
        tournamentSearchResults.map(t => `
          <div class="tourn-search-result">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="font-size:13px;font-weight:600">${t.date}</span>
              ${tournamentLeagueBadge(t.league)}
            </div>
            <div>${tournamentCondPills(t.conditions)}</div>
          </div>`).join('');

  document.getElementById('tournamentBody').innerHTML = `
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">
      Select conditions to find tournaments where all were active
    </div>
    <div class="tourn-search-cond-grid">${grid}</div>
    <button class="btn btn-primary" style="font-size:12px;padding:5px 14px;margin-bottom:1.25rem"
      onclick="tournamentRunSearch()">Search</button>
    ${resultsHtml}`;
}

async function tournamentRunSearch() {
  const conditionIds = [...document.querySelectorAll('.ts-cond-cb:checked')]
    .map(cb => parseInt(cb.value));
  if (!conditionIds.length) { alert('Select at least one condition.'); return; }
  tournamentSearchCondIds = conditionIds;
  const res = await fetch(`${API}/tournaments/search`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ conditionIds })
  });
  tournamentSearchResults = await res.json();
  renderTournamentSearch();
  // Restore checked state after re-render
  tournamentSearchCondIds.forEach(id => {
    const cb = document.querySelector(`.ts-cond-cb[value="${id}"]`);
    if (cb) cb.checked = true;
  });
}

function tournamentOpenAddCondition() {
  const name    = prompt('Condition name:');
  if (!name) return;
  const acronym = prompt('Acronym (leave blank if unknown):') || null;
  const cat     = 'HEAT';
  fetch(`${API}/tournaments/conditions`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name, acronym: acronym || null, category: cat })
  }).then(r => { if (!r.ok) { alert('Failed to add condition.'); return; } renderTournamentView(); });
}

async function httpErrorMessage(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); return j.message || j.error || text; } catch { return text; }
}

function mostRecentTournamentDate() {
  const d = new Date();
  // Tournaments run Wednesday (UTC day 3) and Saturday (UTC day 6).
  // daysBack indexed by UTC day 0=Sun…6=Sat: go back to nearest past Wed or Sat.
  const daysBack = [1, 2, 3, 0, 1, 2, 0][d.getUTCDay()];
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function renderTournamentImport() {
  document.getElementById('tournamentBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.5rem;max-width:520px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:1rem">Import from CSV</div>
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div>
            <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Tournament Date</label>
            <input id="tcsvDate" type="date" class="tourn-input" value="${mostRecentTournamentDate()}" style="width:180px">
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Wednesdays and Saturdays only</div>
          </div>
          <div>
            <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">CSV File</label>
            <input id="tcsvFile" type="file" accept=".csv" style="font-size:12px;color:var(--text)">
          </div>
          <div style="display:flex;align-items:center;gap:1rem;margin-top:4px">
            <button class="btn btn-primary" id="tcsvImportBtn" style="font-size:12px;padding:5px 14px"
              onclick="tournamentImportCsv()">Import CSV</button>
            <span id="tcsvStatus" style="font-size:13px;color:var(--muted)"></span>
          </div>
        </div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:1rem">Sync from S3</div>
        <div style="display:flex;align-items:center;gap:1rem">
          <button class="btn" id="tcsvSyncBtn" style="font-size:12px;padding:5px 14px"
            onclick="tournamentSync()">Sync from S3</button>
          <span id="tcsvSyncStatus" style="font-size:13px;color:var(--muted)"></span>
        </div>
      </div>
    </div>`;
}

async function tournamentImportCsv() {
  const dateEl = document.getElementById('tcsvDate');
  const fileEl = document.getElementById('tcsvFile');
  const btn    = document.getElementById('tcsvImportBtn');
  const status = document.getElementById('tcsvStatus');

  const date = dateEl ? dateEl.value : '';
  if (!date) { if (status) { status.textContent = 'Select a date.'; } return; }

  const d = new Date(date + 'T00:00:00Z');
  if (d.getUTCDay() !== 3 && d.getUTCDay() !== 6) {
    status.style.color = 'var(--red)';
    status.textContent = 'Must be a Wednesday or Saturday.';
    return;
  }
  if (!fileEl || !fileEl.files.length) {
    status.textContent = 'Choose a CSV file.';
    return;
  }

  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = 'Importing…';

  try {
    const fd = new FormData();
    fd.append('date', date);
    fd.append('file', fileEl.files[0]);
    const res = await fetch(`${API}/tournaments/import/csv`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await httpErrorMessage(res));
    const result = await res.json();
    // Refresh data and stay on import tab
    tournamentTab = 'import';
    await renderTournamentView();
    const s = document.getElementById('tcsvStatus');
    if (s) {
      s.style.color = 'var(--green,#4ade80)';
      s.textContent = result.summary || `Imported ${result.date}`;
    }
  } catch(e) {
    if (btn) btn.disabled = false;
    if (status) { status.style.color = 'var(--red)'; status.textContent = 'Import failed: ' + e.message; }
  }
}

async function tournamentSync() {
  const btn    = document.getElementById('tcsvSyncBtn');
  const status = document.getElementById('tcsvSyncStatus');
  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = 'Syncing…';

  try {
    const res = await fetch(`${API}/tournaments/sync`, { method: 'POST' });
    if (!res.ok) throw new Error(await httpErrorMessage(res));
    const results = await res.json();
    const count = results.length;
    if (count > 0) {
      tournamentTab = 'import';
      await renderTournamentView();
      const s = document.getElementById('tcsvSyncStatus');
      if (s) { s.style.color = 'var(--green,#4ade80)'; s.textContent = `Synced ${count} file${count!==1?'s':''}.`; }
    } else {
      status.style.color = 'var(--green,#4ade80)';
      status.textContent = 'Nothing new.';
      btn.disabled = false;
    }
  } catch(e) {
    btn.disabled = false;
    status.style.color = 'var(--red)';
    status.textContent = 'Sync failed: ' + e.message;
  }
}

async function guardianSubmitNewChip() {
  const name   = document.getElementById('gnName').value.trim();
  const source = document.getElementById('gnSource').value;
  const tokens = document.getElementById('gnTokens').value;
  const season = document.getElementById('gnSeason').value;

  if (!name) { alert('Chip name is required.'); return; }

  const statBlocks = document.getElementById('gnStatBlocks').querySelectorAll('.gn-stat-block');
  if (!statBlocks.length) { alert('At least one stat is required.'); return; }

  const stats = [];
  for (let i = 0; i < statBlocks.length; i++) {
    const block = statBlocks[i];
    const label   = block.querySelector('.gn-stat-label').value.trim();
    const statKey = block.querySelector('.gn-stat-key').value.trim();
    const unit    = block.querySelector('.gn-stat-unit').value;
    if (!label || !statKey) { alert(`Stat ${i + 1}: label and key are required.`); return; }

    const rows = block.querySelectorAll('tbody tr');
    if (rows.length < 2) { alert(`Stat ${i + 1}: at least 2 levels (level 0 and max) are required.`); return; }

    const levels = [];
    for (let r = 0; r < rows.length; r++) {
      const valStr  = rows[r].querySelector('.gn-val').value;
      const bitsStr = rows[r].querySelector('.gn-bits').value;
      if (valStr === '') { alert(`Stat ${i + 1}, level ${r}: value is required.`); return; }
      const isLast = r === rows.length - 1;
      levels.push({ value: parseFloat(valStr), bitsToNext: isLast ? null : (bitsStr ? parseInt(bitsStr) : null) });
    }
    stats.push({ statKey, label, valueUnit: unit, sortOrder: i + 1, levels });
  }

  const body = {
    name, source,
    unlockCostTokens: tokens ? parseInt(tokens) : null,
    unlockSeason:     season ? parseInt(season) : null,
    stats
  };

  const res = await fetch(`${API}/guardian/chips`, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  if (!res.ok) { alert('Failed to save chip.'); return; }

  guardianCloseAddChip();
  await renderGuardianView();
}

// ── Lab Planner ──────────────────────────────────────────────────────────────

const LP_SPEEDS = [
  {label:'1× (no cells)', value:1.0},
  {label:'1.5×', value:1.5},
  {label:'2×', value:2.0},
  {label:'3×', value:3.0},
  {label:'4×', value:4.0},
  {label:'5×', value:5.0},
  {label:'6×', value:6.0},
  {label:'7×', value:7.0},
  {label:'8×', value:8.0},
];

let lpSlots = [];
let lpLabList = []; // [{id, name, maxLevel, currentLevel}] — excludes maxed labs

async function renderLabPlannerView() {
  document.getElementById('mainContent').innerHTML =
    `<div class="report-title" style="margin-bottom:1.5rem">Lab Planner</div>
     <div id="lp-dashboard" class="lp-dashboard"></div>
     <div id="lp-slots" class="lp-slots"></div>`;

  // Always reload so currentLevel reflects latest state
  const labs = await fetch(`${API}/labs`).then(r => r.json());
  lpLabList = labs
    .filter(l => l.currentLevel < l.maxLevel)
    .map(l => ({id: l.id, name: l.name, maxLevel: l.maxLevel, currentLevel: l.currentLevel}))
    .sort((a,b) => a.name.localeCompare(b.name));

  await lpRefresh();
}

async function lpRefresh() {
  lpSlots = await fetch(`${API}/lab-slots`).then(r => r.json());
  lpRenderDashboard();
  lpRenderSlots();
}

function lpRenderDashboard() {
  const totalCpd = lpSlots.reduce((s, sl) => s + (sl.coinsPerDay || 0), 0);
  let html = `<div class="lp-dash-card" style="border-color:rgba(245,200,66,0.35)">
    <div class="label">Total Coins / Day</div>
    <div class="value">${fmtRaw(totalCpd)}</div>
  </div>`;
  for (const sl of lpSlots) {
    const cpd = sl.coinsPerDay;
    html += `<div class="lp-dash-card">
      <div class="label">Slot ${sl.slotNumber} · Coins / Day</div>
      <div class="value" style="color:${cpd ? 'var(--gold)' : 'var(--muted)'}">${cpd ? fmtRaw(cpd) : '—'}</div>
    </div>`;
  }
  document.getElementById('lp-dashboard').innerHTML = html;
}

function lpRenderSlots() {
  const wrap = document.getElementById('lp-slots');
  if (!wrap) return;
  wrap.innerHTML = lpSlots.map(sl => lpSlotCard(sl)).join('');
}

function lpSlotCard(sl) {
  const speedOpts = LP_SPEEDS.map(s =>
    `<option value="${s.value}" ${Math.abs(sl.cellSpeedMult - s.value) < 0.01 ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  const planRows = sl.plans.length
    ? sl.plans.map((p, idx) => {
      const currentDuration = sl.plans[0]?.durationSeconds ?? 0;
      const upNextCpd = idx === 1 && currentDuration > 0
        ? `<div style="font-size:10px;color:var(--gold);margin-top:2px;font-family:var(--mono)">${fmtRaw(p.coinsTotalResearch / (currentDuration / 86400))}/day</div>`
        : '';
      return `
      <tr class="${idx === 0 ? 'lp-current-row' : ''}">
        <td>${escHtml(p.labName)}${upNextCpd}</td>
        <td>${p.startLevel}</td>
        <td>${mkSpin(p.targetLevel, p.startLevel+1, lpLabList.find(l=>l.id===p.labId)?.maxLevel??p.targetLevel, false, `lpUpdateTarget(${sl.slotNumber},${p.id},${p.labId},${p.startLevel},__V__)`)}</td>
        <td>${fmtRaw(p.coinsAtStartLevel)}</td>
        <td>${fmtRaw(p.coinsTotalResearch)}</td>
        <td>${fmtDuration(p.durationSeconds)}</td>
        <td>
          <div class="lp-action-cell">
            ${idx > 0 ? `<button class="lp-btn" onclick="lpMove(${sl.slotNumber},${p.id},'up')">↑</button>` : ''}
            ${idx < sl.plans.length-1 ? `<button class="lp-btn" onclick="lpMove(${sl.slotNumber},${p.id},'down')">↓</button>` : ''}
            <button class="lp-btn danger" onclick="lpDelete(${sl.slotNumber},${p.id})">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="7" class="lp-empty">No labs planned — add one below.</td></tr>`;

  const labOptions = lpLabList.map(l =>
    `<option value="${l.id}" data-max="${l.maxLevel}" data-cur="${l.currentLevel}">${escHtml(l.name)}</option>`
  ).join('');

  const firstLab = lpLabList[0];
  const initMax = firstLab ? firstLab.maxLevel : '';
  const initCur = firstLab ? firstLab.currentLevel : 0;
  const initEnd = firstLab ? Math.min(initCur + 2, initMax) : '';

  return `<div class="lp-card">
    <div class="lp-card-header">
      <div class="lp-card-header-row">
        <span class="lp-slot-label">Slot ${sl.slotNumber}</span>
        <select class="lp-speed-select" onchange="lpSetSpeed(${sl.slotNumber},+this.value)">${speedOpts}</select>
      </div>
      <div class="lp-totals">
        <span>Total Cost: <b>${fmtRaw(sl.totalCoins)}</b></span>
        <span>Total Time: <b>${fmtDuration(sl.totalDurationSeconds)}</b></span>
      </div>
    </div>
    <table class="lp-table">
      <thead><tr>
        <th>Lab</th><th>From</th><th>To</th><th>Cost @ From</th><th>Research Cost</th><th>Duration</th><th></th>
      </tr></thead>
      <tbody>${planRows}</tbody>
    </table>
    <div class="lp-add-row">
      <div style="display:flex;flex-direction:column;gap:3px;flex:1;max-width:200px">
        <input type="text" id="lp-filter-${sl.slotNumber}" placeholder="Filter labs…"
          oninput="lpFilterLabs(${sl.slotNumber})"
          style="background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;padding:3px 7px;font-family:var(--font)">
        <select id="lp-lab-${sl.slotNumber}" onchange="lpLabSelected(${sl.slotNumber})">${labOptions}</select>
      </div>
      <div class="spin-wrap">
        <button class="spin-btn" tabindex="-1" onclick="lpSpinDec('lp-start-${sl.slotNumber}')">−</button>
        <input type="text" inputmode="numeric" class="spin-val" id="lp-start-${sl.slotNumber}"
          data-min="0" data-max="${initMax ? initMax - 1 : 0}" value="${initCur}"
          onblur="lpSpinClamp(this)" onkeydown="if(event.key==='Enter')this.blur()">
        <button class="spin-btn" tabindex="-1" onclick="lpSpinInc('lp-start-${sl.slotNumber}')">+</button>
      </div>
      <div class="spin-wrap">
        <button class="spin-btn" tabindex="-1" onclick="lpSpinDec('lp-end-${sl.slotNumber}')">−</button>
        <input type="text" inputmode="numeric" class="spin-val" id="lp-end-${sl.slotNumber}"
          data-min="${initCur + 1}" data-max="${initMax}" value="${initEnd}"
          onblur="lpSpinClamp(this)" onkeydown="if(event.key==='Enter')this.blur()">
        <button class="spin-btn" tabindex="-1" onclick="lpSpinInc('lp-end-${sl.slotNumber}')">+</button>
      </div>
      <button class="lp-btn primary" onclick="lpAdd(${sl.slotNumber})">+ Add</button>
    </div>
  </div>`;
}

function lpSpinDec(id) {
  const el = document.getElementById(id);
  const min = +el.dataset.min, max = +el.dataset.max;
  el.value = Math.max(min, (parseInt(el.value) || 0) - 1);
}
function lpSpinInc(id) {
  const el = document.getElementById(id);
  const min = +el.dataset.min, max = +el.dataset.max;
  el.value = Math.min(max, (parseInt(el.value) || 0) + 1);
}
function lpSpinClamp(el) {
  const min = +el.dataset.min, max = +el.dataset.max;
  el.value = Math.min(Math.max(parseInt(el.value) || 0, min), max);
}

function lpFilterLabs(slotNumber) {
  const filter = document.getElementById(`lp-filter-${slotNumber}`).value.toLowerCase();
  const sel = document.getElementById(`lp-lab-${slotNumber}`);
  Array.from(sel.options).forEach(opt => {
    opt.hidden = filter.length > 0 && !opt.text.toLowerCase().includes(filter);
  });
  // If current selection is hidden, move to first visible
  if (sel.selectedOptions[0]?.hidden) {
    const first = Array.from(sel.options).find(o => !o.hidden);
    if (first) { sel.value = first.value; lpLabSelected(slotNumber); }
  }
}

function lpLabSelected(slotNumber) {
  const sel = document.getElementById(`lp-lab-${slotNumber}`);
  const opt = sel.selectedOptions[0];
  if (!opt) return;
  const maxLevel = +opt.dataset.max;
  const curLevel = +opt.dataset.cur;
  const startEl = document.getElementById(`lp-start-${slotNumber}`);
  const endEl   = document.getElementById(`lp-end-${slotNumber}`);
  startEl.dataset.max = maxLevel - 1;
  startEl.value = curLevel;
  endEl.dataset.min = curLevel + 1;
  endEl.dataset.max = maxLevel;
  endEl.value = Math.min(curLevel + 2, maxLevel);
}

async function lpSetSpeed(slotNumber, mult) {
  await fetch(`${API}/lab-slots/${slotNumber}/speed`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({cellSpeedMult: mult})
  });
  await lpRefresh();
}

async function lpAdd(slotNumber) {
  const labSel = document.getElementById(`lp-lab-${slotNumber}`);
  const startEl = document.getElementById(`lp-start-${slotNumber}`);
  const endEl = document.getElementById(`lp-end-${slotNumber}`);
  const labId = +labSel.value;
  const startLevel = startEl.value !== '' ? +startEl.value : null;
  const targetLevel = endEl.value !== '' ? +endEl.value : null;
  if (startLevel === null || targetLevel === null || targetLevel <= startLevel) {
    alert('Please enter valid From and To levels (To must be greater than From).');
    return;
  }
  await fetch(`${API}/lab-slots/${slotNumber}/plans`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({labId, startLevel, targetLevel})
  });
  await lpRefresh();
}

async function lpUpdateTarget(slotNumber, planId, labId, startLevel, targetLevel) {
  if (!targetLevel || targetLevel <= startLevel) return;
  await fetch(`${API}/lab-slots/${slotNumber}/plans/${planId}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({labId, startLevel, targetLevel})
  });
  await lpRefresh();
}

async function lpDelete(slotNumber, planId) {
  await fetch(`${API}/lab-slots/${slotNumber}/plans/${planId}`, {method:'DELETE'});
  await lpRefresh();
}

async function lpMove(slotNumber, planId, direction) {
  await fetch(`${API}/lab-slots/${slotNumber}/plans/${planId}/move`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({direction})
  });
  await lpRefresh();
}

function renderAdminView() {
  document.getElementById('mainContent').innerHTML = `
    <div style="padding:2rem;max-width:600px">
      <h2 style="font-size:16px;font-weight:600;margin-bottom:1.5rem">Admin</h2>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:1rem">Database</div>
        <div style="display:flex;align-items:center;gap:1rem">
          <button class="btn btn-primary" id="backupBtn" onclick="backupDatabase()" style="flex-shrink:0">Backup Database</button>
          <span id="backupStatus" style="font-size:13px;color:var(--muted);line-height:1.5;min-width:0;word-break:break-word"></span>
        </div>
        <!-- Restore (centralized mode only; hidden until /backup/list succeeds) -->
        <div id="restoreSection" style="display:none;margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--border)">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:0.75rem">Restore from cloud backup</div>
          <div id="restoreList" style="font-size:13px;color:var(--muted)">Loading…</div>
          <div id="restoreStatus" style="font-size:13px;color:var(--muted);margin-top:0.75rem"></div>
        </div>
      </div>
      <div id="contentCard" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;margin-top:1rem">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:1rem">Content</div>
        <div style="display:flex;align-items:center;gap:1rem">
          <button class="btn btn-primary" id="checkContentBtn" onclick="checkContentUpdates()" style="flex-shrink:0">Check for Updates</button>
          <span id="contentStatus" style="font-size:13px;color:var(--muted);line-height:1.5;min-width:0;word-break:break-word"></span>
        </div>
        <div id="contentVersion" style="font-size:11px;color:var(--muted);margin-top:0.75rem"></div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;margin-top:1rem">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:1rem">Setup</div>
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <div style="display:flex;align-items:center;gap:1rem">
            <button class="btn btn-primary" onclick="showQrModal()">Show Tasker QR Code</button>
          </div>
          <div style="display:flex;align-items:center;gap:1rem">
            <button class="btn btn-primary" onclick="showMcpSetupModal()">Setup Claude MCP Server</button>
            <span id="mcpAdminStatus" style="font-size:13px;color:var(--muted)"></span>
          </div>
          <div style="display:flex;align-items:center;gap:1rem">
            <button class="btn btn-primary" onclick="showSkillExportModal()">Export Skills for Claude Desktop</button>
            <span id="skillExportStatus" style="font-size:13px;color:var(--muted)"></span>
          </div>
        </div>
      </div>
    </div>
    <!-- QR Code Modal -->
    <div id="qrModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;
         align-items:center;justify-content:center;" onclick="if(event.target===this)closeQrModal()">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
           padding:2rem;max-width:360px;width:90%;text-align:center">
        <div style="font-size:14px;font-weight:600;margin-bottom:1.25rem">Tasker Battle Report QR Code</div>
        <img src="/taskerBattleReportQrCode.png" alt="Tasker Battle Report QR Code"
             style="width:100%;height:auto;border-radius:var(--radius-md)">
        <button class="btn btn-secondary" style="margin-top:1.25rem;width:100%" onclick="closeQrModal()">Close</button>
      </div>
    </div>
    <!-- Claude MCP Setup Modal -->
    <div id="mcpModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;
         align-items:center;justify-content:center;" onclick="if(event.target===this)closeMcpModal()">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
           padding:2rem;max-width:420px;width:90%;">
        <div style="font-size:14px;font-weight:600;margin-bottom:0.5rem">Setup Claude MCP Server</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:1.25rem">
          Registers this app as an MCP server in your Claude Code config by running
          <span style="font-family:var(--mono);color:var(--accent)">claude mcp add tower-analyzer</span>.
          Claude Code must already be installed.
        </div>
        <div id="mcpModalResult" style="display:none;font-size:13px;margin-bottom:1rem;border-radius:8px;padding:10px 14px;"></div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
          <button class="btn" onclick="closeMcpModal()">Close</button>
          <button id="mcpModalBtn" class="btn btn-primary" onclick="runMcpSetup('mcpModalBtn','mcpModalResult','mcpAdminStatus')">Register</button>
        </div>
      </div>
    </div>
    <!-- Export Skills for Claude Desktop Modal -->
    <div id="skillExportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;
         align-items:center;justify-content:center;" onclick="if(event.target===this)closeSkillExportModal()">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
           padding:2rem;max-width:460px;width:90%;">
        <div style="font-size:14px;font-weight:600;margin-bottom:0.5rem">Export Skills for Claude Desktop</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:1.25rem">
          The Claude Code MCP setup already installs these skills automatically. The Claude
          <strong>Desktop app</strong> and <strong>claude.ai</strong> don't read that folder — they
          load skills uploaded through their own UI. This saves one <span style="font-family:var(--mono);
          color:var(--accent)">.zip</span> per skill that you upload manually in Claude under
          <strong>Customize → Skills → Create skill</strong> (requires code execution enabled).
        </div>
        <div id="skillExportResult" style="display:none;font-size:13px;margin-bottom:1rem;border-radius:8px;padding:10px 14px;line-height:1.6;"></div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
          <button class="btn" onclick="closeSkillExportModal()">Close</button>
          <button id="skillExportBtn" class="btn btn-primary" onclick="runSkillExport()">Export</button>
        </div>
      </div>
    </div>`;
  loadBackups();
  loadContentStatus();
}

function showQrModal() {
  const modal = document.getElementById('qrModal');
  modal.style.display = 'flex';
}

function closeQrModal() {
  document.getElementById('qrModal').style.display = 'none';
}

async function backupDatabase() {
  const btn = document.getElementById('backupBtn');
  const status = document.getElementById('backupStatus');
  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = 'Uploading…';
  try {
    const res = await fetch(`${API}/backup/database`, {method:'POST'});
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    status.style.color = 'var(--green,#4ade80)';
    const where = data.target === 'drive' ? 'Google Drive' : 'cloud storage';
    const name = data.fileName || (data.key ? data.key.split('/').pop() : '');
    status.textContent = `✓ Backed up to ${where}${name ? ' as ' + name : ''}`;
    if (data.target === 's3') loadBackups();
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = `✗ ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// Restore panel — centralized mode only. In legacy mode /backup/list returns 409
// (no S3 backup service), so the section stays hidden.
async function loadBackups() {
  const section = document.getElementById('restoreSection');
  const list = document.getElementById('restoreList');
  if (!section || !list) return;
  try {
    const res = await fetch(`${API}/backup/list`);
    if (!res.ok) { section.style.display = 'none'; return; }
    const backups = await res.json();
    section.style.display = '';
    if (!backups.length) {
      list.innerHTML = `<div style="font-size:13px;color:var(--muted)">No cloud backups yet.</div>`;
      return;
    }
    list.innerHTML = backups.map(b => {
      const when  = new Date(b.lastModified).toLocaleString();
      const size  = fmtBytes(b.size);
      const badge = b.latest
        ? `<span style="flex-shrink:0;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--green,#4ade80);border:1px solid var(--green,#4ade80);border-radius:6px;padding:1px 6px;white-space:nowrap">latest</span>`
        : '';
      const key   = b.key.replace(/'/g, "\\'");
      const fname = b.fileName.replace(/'/g, "\\'");
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            <span style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.fileName}</span>
            ${badge}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${when} · ${size}</div>
        </div>
        <button class="btn btn-secondary" style="font-size:12px;padding:5px 12px;flex-shrink:0" onclick="restoreBackup('${key}','${fname}')">Restore</button>
      </div>`;
    }).join('');
  } catch (e) {
    section.style.display = 'none';
  }
}

async function restoreBackup(key, fileName) {
  if (!confirm(`Restore "${fileName}"?\n\nYour current database will be replaced the next time you restart the app.`)) return;
  const status = document.getElementById('restoreStatus');
  status.style.color = 'var(--muted)';
  status.textContent = 'Staging restore…';
  try {
    const res = await fetch(`${API}/backup/restore`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({key})
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    status.style.color = 'var(--green,#4ade80)';
    status.textContent = `✓ ${data.message || 'Restore staged — restart the app to apply.'}`;
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = `✗ ${e.message}`;
  }
}

function fmtBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

// Content patches (centralized mode only). Hidden when /content/status returns 409
// (legacy Drive mode, no S3 mailbox) — same gating pattern as the restore panel above.
async function loadContentStatus() {
  const card = document.getElementById('contentCard');
  const version = document.getElementById('contentVersion');
  if (!card || !version) return;
  try {
    const res = await fetch(`${API}/content/status`);
    if (!res.ok) { card.style.display = 'none'; return; }
    const data = await res.json();
    card.style.display = '';
    version.textContent = `Content version: ${data.appliedVersion}`;
  } catch (e) {
    card.style.display = 'none';
  }
}

async function checkContentUpdates() {
  const btn = document.getElementById('checkContentBtn');
  const status = document.getElementById('contentStatus');
  btn.disabled = true;
  status.style.color = 'var(--muted)';
  status.textContent = 'Checking…';
  try {
    const res = await fetch(`${API}/content/check-updates`, {method: 'POST'});
    if (!res.ok) {
      let message = 'Failed to check for content updates.';
      try {
        const body = await res.json();
        if (body && body.message) message = body.message;
      } catch (parseErr) { /* non-JSON error body, use the generic fallback */ }
      throw new Error(message);
    }
    const data = await res.json();
    status.style.color = 'var(--green,#4ade80)';
    if (data.upToDate) {
      status.textContent = '✓ Already up to date';
    } else {
      const parts = [];
      if (data.labsAdded) parts.push(`${data.labsAdded} lab${data.labsAdded === 1 ? '' : 's'} added`);
      if (data.labsUpdated) parts.push(`${data.labsUpdated} lab${data.labsUpdated === 1 ? '' : 's'} updated`);
      if (data.workshopItemsAdded) parts.push(`${data.workshopItemsAdded} workshop item${data.workshopItemsAdded === 1 ? '' : 's'} added`);
      if (data.workshopItemsUpdated) parts.push(`${data.workshopItemsUpdated} workshop item${data.workshopItemsUpdated === 1 ? '' : 's'} updated`);
      status.textContent = `✓ Applied v${data.appliedVersion}: ${parts.join(', ') || 'no changes'}`;
    }
    document.getElementById('contentVersion').textContent = `Content version: ${data.appliedVersion}`;
  } catch (e) {
    status.style.color = 'var(--red)';
    status.textContent = `✗ ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ── Setup wizard ──────────────────────────────────────────────────────────────

function showSetupWizard(step) {
  document.getElementById('setupWizard').style.display = 'flex';
  goToWizardStep(1);
}

function goToWizardStep(n) {
  document.getElementById('wizardStep1').style.display = n === 1 ? '' : 'none';
  document.getElementById('wizardStep2').style.display = n === 2 ? '' : 'none';

  const dot1 = document.getElementById('wizDot1');
  const dot2 = document.getElementById('wizDot2');
  const lbl2 = document.getElementById('wizLabel2');

  const active  = s => { s.style.background = 'var(--accent)';   s.style.color = '#fff';        s.style.border = 'none'; };
  const done    = s => { s.style.background = 'var(--green)';    s.style.color = '#fff';        s.style.border = 'none'; s.textContent = '✓'; };
  const pending = (s, num) => { s.style.background = 'var(--surface2)'; s.style.color = 'var(--muted)'; s.style.border = '1px solid var(--border2)'; s.textContent = num; };

  if (n === 1) {
    active(dot1);  dot1.textContent = '1';
    pending(dot2, '2');  lbl2.style.color = 'var(--muted)';
    document.getElementById('wizInd1').querySelector('span').style.color = 'var(--accent)';
  } else {
    done(dot1);
    active(dot2);  dot2.textContent = '2';  lbl2.style.color = 'var(--accent)';
    document.getElementById('wizInd1').querySelector('span').style.color = 'var(--green)';
  }
}

async function submitConfig() {
  const errEl = document.getElementById('configError');
  const btn   = document.getElementById('configBtn');

  const playerId         = document.getElementById('playerId').value.trim();
  const apiGatewayRegion = document.querySelector('input[name="apiGatewayRegion"]:checked')?.value;

  errEl.style.display = 'none';

  if (!playerId) {
    errEl.textContent = 'Player ID is required.';
    errEl.style.display = '';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const res  = await fetch(`${API}/setup/config`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({playerId, apiGatewayRegion})
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'An error occurred.';
      errEl.style.display = '';
      btn.disabled = false;
      btn.textContent = 'Continue →';
    } else {
      goToWizardStep(2);
    }
  } catch (e) {
    errEl.textContent = 'Could not reach the server.';
    errEl.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Continue →';
  }
}

function showMcpSetupModal() {
  document.getElementById('mcpModalResult').style.display = 'none';
  const btn = document.getElementById('mcpModalBtn');
  btn.disabled = false;
  btn.textContent = 'Register';
  document.getElementById('mcpModal').style.display = 'flex';
}

function closeMcpModal() {
  document.getElementById('mcpModal').style.display = 'none';
}

function showSkillExportModal() {
  document.getElementById('skillExportResult').style.display = 'none';
  const btn = document.getElementById('skillExportBtn');
  btn.disabled = false;
  btn.textContent = 'Export';
  document.getElementById('skillExportModal').style.display = 'flex';
}

function closeSkillExportModal() {
  document.getElementById('skillExportModal').style.display = 'none';
}

async function runSkillExport() {
  const btn    = document.getElementById('skillExportBtn');
  const result = document.getElementById('skillExportResult');

  btn.disabled = true;
  btn.textContent = 'Exporting…';
  result.style.display = 'none';

  try {
    const res  = await fetch(`${API}/setup/skill-packages`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'ok') {
      const list = (data.packages || []).map(p => `<li style="font-family:var(--mono)">${p}</li>`).join('');
      result.style.cssText += ';display:block;color:var(--green);background:rgba(80,200,120,0.1);border:1px solid rgba(80,200,120,0.25);';
      result.innerHTML =
        `✓ Exported ${(data.packages || []).length} skill package(s) to:` +
        `<div style="font-family:var(--mono);color:var(--accent);word-break:break-all;margin:6px 0">${data.directory}</div>` +
        `<ul style="margin:6px 0 6px 18px;padding:0">${list}</ul>` +
        `Upload each in Claude under <strong>Customize → Skills → Create skill</strong>. ` +
        `You can delete these zips once they're uploaded.`;
      btn.textContent = 'Done';
      document.getElementById('skillExportStatus').textContent = '✓ Exported';
    } else {
      result.style.cssText += ';display:block;color:var(--red);background:rgba(242,107,107,0.1);border:1px solid rgba(242,107,107,0.25);';
      result.textContent = data.message || 'An error occurred.';
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  } catch (e) {
    result.style.cssText += ';display:block;color:var(--red);background:rgba(242,107,107,0.1);border:1px solid rgba(242,107,107,0.25);';
    result.textContent = 'Could not reach the server.';
    btn.disabled = false;
    btn.textContent = 'Retry';
  }
}

async function runMcpSetup(btnId, resultId, statusId) {
  const btn    = document.getElementById(btnId);
  const result = document.getElementById(resultId);

  btn.disabled = true;
  btn.textContent = 'Registering…';
  result.style.display = 'none';

  try {
    const res  = await fetch(`${API}/setup/mcp`, { method: 'POST' });
    const data = await res.json();

    if (data.status === 'ok') {
      result.style.cssText += ';display:block;color:var(--green);background:rgba(80,200,120,0.1);border:1px solid rgba(80,200,120,0.25);';
      result.textContent = '✓ MCP server registered successfully. Restart Claude to pick it up.';
      btn.textContent = 'Done';
      if (statusId) document.getElementById(statusId).textContent = '✓ Registered';
    } else if (data.status === 'claude_not_found') {
      result.style.cssText += ';display:block;color:var(--gold);background:rgba(255,200,80,0.1);border:1px solid rgba(255,200,80,0.25);';
      result.textContent = 'Claude was not found. Is the Claude Desktop App or Claude Code installed?';
      btn.disabled = false;
      btn.textContent = 'Retry';
    } else if (data.status === 'not_found') {
      result.style.cssText += ';display:block;color:var(--muted);background:var(--surface);border:1px solid var(--border);';
      result.textContent = 'MCP server files were not found. This is expected when running outside the installed app.';
      btn.disabled = false;
      btn.textContent = 'Retry';
    } else {
      result.style.cssText += ';display:block;color:var(--red);background:rgba(242,107,107,0.1);border:1px solid rgba(242,107,107,0.25);';
      result.textContent = data.message || 'An error occurred.';
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  } catch (e) {
    result.style.cssText += ';display:block;color:var(--red);background:rgba(242,107,107,0.1);border:1px solid rgba(242,107,107,0.25);';
    result.textContent = 'Could not reach the server.';
    btn.disabled = false;
    btn.textContent = 'Retry';
  }
}

// Called from setup wizard step 3
function setupMcp() {
  runMcpSetup('mcpBtn', 'mcpResult', null).then(() => {
    const btn = document.getElementById('mcpBtn');
    if (btn.textContent === 'Done') setTimeout(finishSetup, 1800);
  });
}

function finishSetup() {
  document.getElementById('setupWizard').style.display = 'none';
  checkAuthAndInit();
}