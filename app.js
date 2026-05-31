'use strict';

// ─── FIREBASE ────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBPb7b1yVZN3VegZT3VbQk7887eT_l2owA",
  authDomain: "form-filling-59c4f.firebaseapp.com",
  projectId: "form-filling-59c4f",
  storageBucket: "form-filling-59c4f.firebasestorage.app",
  messagingSenderId: "593592570493",
  appId: "1:593592570493:web:82b37a90707c23c6fa1714"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const TRIP_DOC    = db.collection('trips').doc('wayanad-main');
const MEMBERS_COL = TRIP_DOC.collection('members');   // ← each member = 1 doc

// ─── STATE ───────────────────────────────────────────────
let state = { tripName: 'Wayanad Trip', totalCost: 0, numMembers: 15, members: [] };
let pieChartInstance = null, barChartInstance = null;
let currentFilter = 'all', searchQuery = '';
let memberModalInstance = null;

// ─── INIT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLocal();
  memberModalInstance = new bootstrap.Modal(document.getElementById('memberModal'));
  bindEvents();
  render();
  listenFirestore();
});

// ─── FIRESTORE REAL-TIME LISTENERS ───────────────────────
function listenFirestore() {
  setSyncStatus('connecting');

  // 1) Trip config doc
  TRIP_DOC.onSnapshot(snap => {
    if (snap.exists) {
      const d = snap.data();
      state.tripName   = d.tripName   ?? state.tripName;
      state.totalCost  = d.totalCost  ?? state.totalCost;
      state.numMembers = d.numMembers ?? state.numMembers;
      render();
    }
    setSyncStatus('synced');
  }, err => { console.error(err); setSyncStatus('offline'); });

  // 2) Members subcollection — fires on ANY add/edit/delete in Firebase Console too
  MEMBERS_COL.onSnapshot(snap => {
    state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveLocal();
    render();
    setSyncStatus('synced');
  }, err => { console.error(err); setSyncStatus('offline'); });
}

// ─── SYNC STATUS ─────────────────────────────────────────
function setSyncStatus(s) {
  const pill = document.getElementById('syncStatus');
  const lbl  = document.getElementById('syncLabel');
  if (!pill || !lbl) return;
  pill.className = 'sync-pill sync-' + s;
  lbl.textContent = { connecting:'Connecting…', synced:'Synced', offline:'Offline', saving:'Saving…' }[s] || s;
}

// ─── LOCAL STORAGE ───────────────────────────────────────
function saveLocal() { try { localStorage.setItem('wayanad_state', JSON.stringify(state)); } catch(e){} }
function loadLocal()  { try { const r = localStorage.getItem('wayanad_state'); if(r) state = JSON.parse(r); } catch(e){} }

// ─── SAVE TRIP CONFIG TO FIRESTORE ───────────────────────
function saveTripConfig() {
  setSyncStatus('saving');
  TRIP_DOC.set({
    tripName:   state.tripName,
    totalCost:  state.totalCost,
    numMembers: state.numMembers,
    updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  .then(() => setSyncStatus('synced'))
  .catch(e => { console.error(e); setSyncStatus('offline'); });
}

// ─── SAVE / DELETE MEMBER IN SUBCOLLECTION ───────────────
function saveMemberDoc(m) {
  setSyncStatus('saving');
  return MEMBERS_COL.doc(m.id).set({
    name:     m.name,
    paid:     m.paid,
    avatar:   m.avatar || '',
    settled:  m.settled || false,
    selected: m.selected || false
  })
  .then(() => setSyncStatus('synced'))
  .catch(e => { console.error(e); setSyncStatus('offline'); });
}

function deleteMemberDoc(id) {
  setSyncStatus('saving');
  return MEMBERS_COL.doc(id).delete()
  .then(() => setSyncStatus('synced'))
  .catch(e => { console.error(e); setSyncStatus('offline'); });
}

function updateMemberField(id, fields) {
  setSyncStatus('saving');
  MEMBERS_COL.doc(id).update(fields)
  .then(() => setSyncStatus('synced'))
  .catch(e => { console.error(e); setSyncStatus('offline'); });
}

// ─── HELPERS ─────────────────────────────────────────────
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function inrFormat(n) {
  const num = Math.abs(parseFloat(n) || 0);
  const [i, d] = num.toFixed(2).split('.');
  if (i.length <= 3) return i + '.' + d;
  let res = i.slice(-3), rest = i.slice(0, i.length - 3);
  while (rest.length > 2) { res = rest.slice(-2) + ',' + res; rest = rest.slice(0, rest.length - 2); }
  return rest + ',' + res + '.' + d;
}
function fmt(n)    { const v = parseFloat(n)||0; return (v<0?'-\u20B9':'\u20B9') + inrFormat(Math.abs(v)); }
function fmtPdf(n) { const v = parseFloat(n)||0; return (v<0?'-Rs.':'Rs.') + inrFormat(Math.abs(v)); }
function pdfDate() { const d=new Date(),p=x=>String(x).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }

function calcShare()      { return (parseFloat(state.totalCost)||0) / (parseInt(state.numMembers)||1); }
function getBalance(m)    { return (parseFloat(m.paid)||0) - calcShare(); }
function totalPaid()      { return state.members.reduce((s,m)=>s+(parseFloat(m.paid)||0),0); }
function settledCount()   { return state.members.filter(m=>m.settled).length; }
function escHtml(s)       { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isDarkMode()     { return document.documentElement.dataset.theme === 'dark'; }

// ─── BIND EVENTS ─────────────────────────────────────────
function bindEvents() {
  document.getElementById('tripName').addEventListener('input', e => { state.tripName = e.target.value; saveTripConfig(); render(); });
  document.getElementById('totalCost').addEventListener('input', e => { state.totalCost = parseFloat(e.target.value)||0; saveTripConfig(); render(); });
  document.getElementById('numMembers').addEventListener('input', e => { state.numMembers = parseInt(e.target.value)||1; saveTripConfig(); render(); });

  document.getElementById('addMemberBtn').addEventListener('click', openAddModal);
  document.getElementById('saveMemberBtn').addEventListener('click', saveMember);
  document.getElementById('searchInput').addEventListener('input', e => { searchQuery = e.target.value.toLowerCase(); renderTable(); });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTable();
    });
  });

  document.getElementById('selectAll').addEventListener('change', e => {
    state.members.forEach(m => { m.selected = e.target.checked; updateMemberField(m.id, { selected: m.selected }); });
  });

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('downloadPdfBtn').addEventListener('click', downloadPDF);
  document.getElementById('downloadExcelBtn').addEventListener('click', downloadExcel);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
  document.getElementById('importJsonBtn').addEventListener('click', importJSON);
}

// ─── RENDER ──────────────────────────────────────────────
function render() {
  const share = calcShare(), paid = totalPaid();
  document.getElementById('tripName').value = state.tripName;
  document.getElementById('totalCost').value = state.totalCost;
  document.getElementById('numMembers').value = state.numMembers;
  document.getElementById('costPerPerson').textContent = fmt(share);
  document.getElementById('totalCollected').textContent = fmt(paid);
  document.getElementById('remainingAmt').textContent = fmt((state.totalCost||0) - paid);
  document.getElementById('statMembers').textContent = state.members.length;
  document.getElementById('statExpense').textContent = fmt(state.totalCost);
  document.getElementById('statPerPerson').textContent = fmt(share);
  document.getElementById('statPaid').textContent = fmt(paid);
  const tot = state.members.length, set = settledCount();
  const pct = tot > 0 ? Math.round((set/tot)*100) : 0;
  document.getElementById('settleProgress').style.width = pct + '%';
  document.getElementById('settledCount').textContent = `${set} / ${tot} Settled`;
  renderTable(); renderReport(); renderCharts();
}

// ─── TABLE ───────────────────────────────────────────────
function renderTable() {
  const share = calcShare();
  const tbody = document.getElementById('membersBody');
  const empty = document.getElementById('emptyState');
  let filtered = state.members.filter(m => {
    if (searchQuery && !m.name.toLowerCase().includes(searchQuery)) return false;
    const b = getBalance(m);
    if (currentFilter === 'pay'     && b >= 0)   return false;
    if (currentFilter === 'receive' && b <= 0)   return false;
    if (currentFilter === 'settled' && !m.settled) return false;
    return true;
  });
  if (state.members.length === 0) { empty.style.display = 'flex'; tbody.innerHTML = ''; return; }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(m => {
    const bal = getBalance(m);
    const balClass = bal>0?'badge-receive':bal<0?'badge-pay':'badge-even';
    const balLabel = bal>0?`+${fmt(bal)} Receive`:bal<0?`${fmt(bal)} Pay`:'Even';
    const statusLabel = m.settled
      ? '<span class="badge bg-success">Settled</span>'
      : (bal>0?'<span class="badge bg-info text-dark">To Receive</span>':'<span class="badge bg-danger">To Pay</span>');
    const avatarHtml = m.avatar
      ? `<div class="member-avatar"><img src="${escHtml(m.avatar)}" class="avatar-img" alt="${escHtml(m.name)}" onerror="this.parentElement.textContent='${m.name.charAt(0).toUpperCase()}'" /></div>`
      : `<div class="member-avatar d-flex align-items-center justify-content-center">${m.name.charAt(0).toUpperCase()}</div>`;
    return `<tr class="${m.settled?'row-settled':''}" data-id="${m.id}">
      <td><input type="checkbox" class="form-check-input member-check" data-id="${m.id}" ${m.selected?'checked':''}/></td>
      <td>${avatarHtml}</td>
      <td><strong>${escHtml(m.name)}</strong></td>
      <td>${fmt(m.paid)}</td>
      <td>${fmt(share)}</td>
      <td><span class="${balClass}">${balLabel}</span></td>
      <td>${statusLabel}</td>
      <td><div class="form-check form-switch d-flex justify-content-center">
        <input class="form-check-input settle-check" type="checkbox" data-id="${m.id}" ${m.settled?'checked':''}/>
      </div></td>
      <td><div class="d-flex gap-1">
        <button class="btn-action btn-edit" data-id="${m.id}"><i class="bi bi-pencil-fill"></i></button>
        <button class="btn-action btn-delete" data-id="${m.id}"><i class="bi bi-trash-fill"></i></button>
      </div></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.settle-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      const m  = state.members.find(x=>x.id===id);
      if (m) { m.settled = e.target.checked; updateMemberField(id, { settled: m.settled }); render(); }
    });
  });
  tbody.querySelectorAll('.member-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      const m  = state.members.find(x=>x.id===id);
      if (m) { m.selected = e.target.checked; updateMemberField(id, { selected: m.selected }); }
    });
  });
  tbody.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
  tbody.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => deleteMember(btn.dataset.id)));
}

// ─── MEMBER MODAL ────────────────────────────────────────
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add Member';
  document.getElementById('editMemberId').value = '';
  document.getElementById('memberName').value = '';
  document.getElementById('memberPaid').value = 0;
  document.getElementById('memberAvatar').value = '';
  memberModalInstance.show();
}
function openEditModal(id) {
  const m = state.members.find(x=>x.id===id); if(!m) return;
  document.getElementById('modalTitle').textContent = 'Edit Member';
  document.getElementById('editMemberId').value = m.id;
  document.getElementById('memberName').value = m.name;
  document.getElementById('memberPaid').value = m.paid;
  document.getElementById('memberAvatar').value = m.avatar||'';
  memberModalInstance.show();
}
function saveMember() {
  const name = document.getElementById('memberName').value.trim();
  if (!name) { alert('Please enter a member name.'); return; }
  const paid   = parseFloat(document.getElementById('memberPaid').value)||0;
  const avatar = document.getElementById('memberAvatar').value.trim();
  const editId = document.getElementById('editMemberId').value;
  const id     = editId || genId();
  const m      = { id, name, paid, avatar, settled: false, selected: false };
  if (editId) { const ex = state.members.find(x=>x.id===editId); if(ex){ m.settled=ex.settled; m.selected=ex.selected; } }
  saveMemberDoc(m);   // writes to Firestore → onSnapshot will update UI
  memberModalInstance.hide();
}
function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  deleteMemberDoc(id); // onSnapshot removes from state.members + re-renders
}

// ─── THEME ───────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const dark = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  document.querySelector('#themeToggle i').className = dark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
  renderCharts();
}

// ─── REPORT ──────────────────────────────────────────────
function renderReport() {
  const share = calcShare(), paid = totalPaid(), set = settledCount();
  const lines = [
    `🌿 ${state.tripName} — Expense Report`, '─'.repeat(44),
    `Total Members   : ${state.members.length}`,
    `Total Trip Cost : ${fmt(state.totalCost)}`,
    `Cost Per Person : ${fmt(share)}`,
    `Total Collected : ${fmt(paid)}`,
    `Remaining       : ${fmt((state.totalCost||0)-paid)}`,
    `Settled Members : ${set} / ${state.members.length}`, '─'.repeat(44)
  ];
  const toReceive = state.members.filter(m=>getBalance(m)>0);
  const toPay     = state.members.filter(m=>getBalance(m)<0);
  const even      = state.members.filter(m=>getBalance(m)===0);
  if (toReceive.length) { lines.push('\n💰 Members to RECEIVE:'); toReceive.forEach(m=>{ const b=getBalance(m); lines.push(`  ✅ ${m.name} paid ${fmt(m.paid)} → Should receive ${fmt(b)}${m.settled?' [SETTLED]':''}`); }); }
  if (toPay.length)     { lines.push('\n❌ Members to PAY:'); toPay.forEach(m=>{ const b=getBalance(m); lines.push(`  ⚠️  ${m.name} paid ${fmt(m.paid)} → Should pay ${fmt(Math.abs(b))}${m.settled?' [SETTLED]':''}`); }); }
  if (even.length)      { lines.push('\n⚖️  Even:'); even.forEach(m=>lines.push(`  ✔ ${m.name} — No balance`)); }
  lines.push('\n─'.repeat(44), `Generated: ${pdfDate()}`);
  document.getElementById('reportText').textContent = lines.join('\n');
}

// ─── CHARTS ──────────────────────────────────────────────
function chartColors() { return ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6','#f97316','#a78bfa','#22c55e','#06b6d4','#e879f9','#fb923c','#34d399']; }
function renderCharts() {
  const tc = isDarkMode()?'#a0aec0':'#4a5568', gc = isDarkMode()?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)';
  const pc = document.getElementById('pieChart');
  const pd = state.members.map(m=>parseFloat(m.paid)||0);
  if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance=null; }
  if (pd.some(v=>v>0)) {
    pieChartInstance = new Chart(pc, { type:'doughnut', data:{ labels:state.members.map(m=>m.name), datasets:[{data:pd,backgroundColor:chartColors(),borderWidth:2,borderColor:isDarkMode()?'#1a1a2e':'#fff'}]},
      options:{ responsive:true,maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{color:tc,padding:12,font:{size:12,family:'Inter'}}}, tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${fmt(ctx.parsed)} (${((ctx.parsed/pd.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`}} }, cutout:'60%'}});
  } else { const ctx=pc.getContext('2d'); ctx.clearRect(0,0,pc.width,pc.height); ctx.fillStyle=tc; ctx.font='14px Inter'; ctx.textAlign='center'; ctx.fillText('No payment data yet',pc.width/2,pc.height/2); }
  const bc = document.getElementById('barChart');
  const bd = state.members.map(m=>parseFloat(getBalance(m).toFixed(2)));
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance=null; }
  barChartInstance = new Chart(bc, { type:'bar', data:{ labels:state.members.map(m=>m.name), datasets:[{label:'Balance',data:bd,backgroundColor:bd.map(v=>v>=0?'rgba(34,197,94,0.75)':'rgba(239,68,68,0.75)'),borderRadius:6,borderSkipped:false}]},
    options:{ responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` Balance: ${fmt(ctx.parsed.y)}`}}},
      scales:{ x:{ticks:{color:tc,font:{size:11,family:'Inter'}},grid:{color:gc}}, y:{ticks:{color:tc,font:{size:11,family:'Inter'},callback:v=>fmt(v)},grid:{color:gc}}}}});
}

// ─── PDF ─────────────────────────────────────────────────
function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const share = calcShare(), paid = totalPaid();
  doc.setFillColor(99,102,241); doc.rect(0,0,210,28,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('Wayanad Trip Expense Report',105,12,{align:'center'});
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Generated: '+pdfDate(),105,22,{align:'center'});
  doc.setTextColor(0,0,0); doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.text('Trip Summary',14,38);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  [['Trip Name',state.tripName],['Total Cost',fmtPdf(state.totalCost)],['Members',String(state.members.length)],
   ['Cost Per Person',fmtPdf(share)],['Total Collected',fmtPdf(paid)],
   ['Remaining',fmtPdf((state.totalCost||0)-paid)],['Settled',settledCount()+' / '+state.members.length]]
  .forEach(([k,v],i)=>{ doc.setFont('helvetica','bold'); doc.text(k+':',14,48+i*7); doc.setFont('helvetica','normal'); doc.text(v,70,48+i*7); });
  doc.autoTable({ startY:100, head:[['Name','Paid','Share','Balance','Status','Settlement']],
    body:state.members.map(m=>{ const b=getBalance(m); return [m.name,fmtPdf(m.paid),fmtPdf(share),(b>=0?'+':'')+fmtPdf(b),b>0?'Receive':b<0?'Pay':'Even',m.settled?'Settled':'Pending']; }),
    styles:{font:'helvetica',fontSize:9,cellPadding:3},
    headStyles:{fillColor:[99,102,241],textColor:255,fontStyle:'bold'},
    alternateRowStyles:{fillColor:[245,245,255]}, columnStyles:{3:{halign:'right'}} });
  doc.save(`${state.tripName.replace(/\s+/g,'_')}_Expense_Report.pdf`);
}

// ─── EXCEL ───────────────────────────────────────────────
function downloadExcel() {
  const share = calcShare();
  const rows = state.members.map(m=>{ const b=getBalance(m); return { Name:m.name,'Amount Paid':parseFloat(m.paid)||0,'Share':parseFloat(share.toFixed(2)),'Balance':parseFloat(b.toFixed(2)),Status:b>0?'To Receive':b<0?'To Pay':'Even',Settlement:m.settled?'Settled':'Pending' }; });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows); ws['!cols']=[{wch:20},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12}];
  const ws2 = XLSX.utils.aoa_to_sheet([['Trip Name',state.tripName],['Total Cost',state.totalCost],['Members',state.members.length],['Cost Per Person',parseFloat(share.toFixed(2))],['Total Collected',parseFloat(totalPaid().toFixed(2))],['Remaining',parseFloat(((state.totalCost||0)-totalPaid()).toFixed(2))],['Settled',settledCount()+' / '+state.members.length]]);
  ws2['!cols']=[{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb,ws2,'Summary'); XLSX.utils.book_append_sheet(wb,ws,'Members');
  XLSX.writeFile(wb,`${state.tripName.replace(/\s+/g,'_')}_Members.xlsx`);
}

// ─── JSON ────────────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download=`${state.tripName.replace(/\s+/g,'_')}_data.json`; a.click(); URL.revokeObjectURL(url);
}
function importJSON() {
  const file = document.getElementById('importJsonFile').files[0];
  if (!file) { alert('Please select a JSON file.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && Array.isArray(parsed.members)) {
        // Write trip config
        state.tripName = parsed.tripName || state.tripName;
        state.totalCost = parsed.totalCost || state.totalCost;
        state.numMembers = parsed.numMembers || state.numMembers;
        saveTripConfig();
        // Write each member to subcollection
        parsed.members.forEach(m => { if(!m.id) m.id=genId(); saveMemberDoc(m); });
        bootstrap.Modal.getInstance(document.getElementById('importExportModal')).hide();
        alert('Import started — data will appear shortly.');
      } else { alert('Invalid JSON format.'); }
    } catch(err) { alert('Failed to parse JSON: ' + err.message); }
  };
  reader.readAsText(file);
}
