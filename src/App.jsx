import { useEffect, useMemo, useState } from 'react';
import './App.css';
import ClaimFlowAssist from './ClaimFlowAssist';
import AuthScreen from './AuthScreen';
import VehicleEvidence from './VehicleEvidence';

// Demo accounts. The switcher is for testing, NOT authentication.
const profiles = [
  { id: 'thando', name: 'Thando Mokoena', initials: 'TM', email: 'thando@example.com', role: 'customer' },
  { id: 'sipho', name: 'Sipho Dlamini', initials: 'SD', email: 'sipho@example.com', role: 'customer' },
  { id: 'manager', name: 'Claims Manager', initials: 'CM', email: 'manager@example.com', role: 'manager' },
];
const stages = ['Claim submitted', 'Documents received', 'Under assessment', 'Final decision', 'Payment / closure'];
const seedClaims = [
  { id: 'CLM-1042', customerId: 'thando', type: 'Vehicle', title: 'Vehicle accident', amount: 24500, date: '2026-10-22', stage: 2, status: 'Under assessment', documents: ['ID document', 'Accident report'], required: ['ID document', 'Accident report', 'Photos of damage'], note: 'Our team is reviewing your information and documents.' },
  { id: 'CLM-1040', customerId: 'thando', type: 'Home', title: 'Storm damage', amount: 18700, date: '2026-10-15', stage: 1, status: 'Action required', documents: ['ID document'], required: ['ID document', 'Proof of address', 'Damage photos'], note: 'Please provide the outstanding documents to continue.' },
  { id: 'CLM-1035', customerId: 'thando', type: 'Life', title: 'Life cover enquiry', amount: 9800, date: '2026-10-02', stage: 5, status: 'Approved', documents: ['ID document'], required: ['ID document'], note: 'This claim has been approved and closed.' },
  { id: 'CLM-1037', customerId: 'sipho', type: 'Home', title: 'Home repairs', amount: 34000, date: '2026-10-10', stage: 1, status: 'Action required', documents: ['ID document'], required: ['ID document', 'Proof of address'], note: 'Please upload proof of address.' },
  { id: 'CLM-1039', customerId: 'sipho', type: 'Vehicle', title: 'Vehicle collision', amount: 42000, date: '2026-10-20', stage: 2, status: 'Under assessment', documents: ['ID document', 'Accident report'], required: ['ID document', 'Accident report'], note: 'An assessor is reviewing the claim.' },
];
const formatMoney = (n) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
const formatDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
const getProgress = (claim) => Math.round(Math.min(claim.stage, 5) / 5 * 100);
const defaultRequired = { Vehicle: ['ID document', 'Accident report', 'Photos of damage'], Home: ['ID document', 'Proof of address', 'Damage photos'], Life: ['ID document', 'Supporting documents'], Other: ['ID document', 'Supporting documents'] };

function App() {
  // localStorage persists the demo after refresh. Production will use a backend.
  const [claims, setClaims] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem('claimflow-claims-v2')); return Array.isArray(saved) ? saved : seedClaims; }
    catch { return seedClaims; }
  });
  const [profileId, setProfileId] = useState('thando');
  // Session-only demo entry. This is NOT real authentication or access control.
  const [demoSignedIn, setDemoSignedIn] = useState(() => sessionStorage.getItem('claimflow-demo-session') === 'yes');
  const [profileOpen, setProfileOpen] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState({ type: 'Vehicle', title: '', amount: '', description: '' });
  const [notice, setNotice] = useState('');
  useEffect(() => { localStorage.setItem('claimflow-claims-v2', JSON.stringify(claims)); }, [claims]);
  const profile = profiles.find((p) => p.id === profileId);
  const manager = profile.role === 'manager';
  const visibleClaims = useMemo(() => manager ? claims : claims.filter((c) => c.customerId === profileId), [claims, manager, profileId]);
  const selected = claims.find((c) => c.id === selectedId);
  const filtered = visibleClaims.filter((c) => {
    const category = filter === 'All' || (filter === 'In progress' && !['Approved', 'Rejected', 'Action required'].includes(c.status)) || (filter === 'Action required' && c.status === 'Action required') || c.status === filter;
    return category && [c.id, c.type, c.title, profiles.find(p => p.id === c.customerId)?.name || ''].join(' ').toLowerCase().includes(search.toLowerCase());
  });
  const counts = { total: visibleClaims.length, progress: visibleClaims.filter(c => !['Approved', 'Rejected', 'Action required'].includes(c.status)).length, approved: visibleClaims.filter(c => c.status === 'Approved').length, attention: visibleClaims.filter(c => c.status === 'Action required').length };

  function enterDemo(id) { setProfileId(id); sessionStorage.setItem('claimflow-demo-session', 'yes'); setDemoSignedIn(true); navigate('dashboard'); }
  function signOut() { sessionStorage.removeItem('claimflow-demo-session'); setDemoSignedIn(false); setProfileOpen(false); navigate('dashboard'); }
  function navigate(next) { setPage(next); setSelectedId(null); setNotice(''); setFilter('All'); setSearch(''); }
  function switchProfile(id) { setProfileId(id); setProfileOpen(false); navigate('dashboard'); }
  function openClaim(id) { setSelectedId(id); setPage('detail'); }
  function updateClaim(id, patch) { setClaims(old => old.map(c => c.id === id ? { ...c, ...patch } : c)); }
  function uploadDemoDocument(claim, doc) {
    if (claim.type === 'Vehicle' && doc === 'Photos of damage') return;
    // Demo-only: mark a document received; no actual file is uploaded or stored.
    const docs = [...new Set([...claim.documents, doc])];
    const allReceived = claim.required.every(item => docs.includes(item));
    updateClaim(claim.id, { documents: docs, stage: allReceived && claim.stage < 2 ? 2 : claim.stage, status: allReceived && claim.status === 'Action required' ? 'Under assessment' : claim.status, note: allReceived ? 'All required documents have been received.' : claim.note });
    setNotice(`${doc} marked as received (demo only).`);
  }
  function updateVehicleEvidence(id, available) {
    setClaims(old => old.map(claim => {
      if (claim.id !== id) return claim;
      const documents = claim.documents.filter(doc => doc !== 'Photos of damage');
      if (available) documents.push('Photos of damage');
      const evidenceStatus = available ? 'pending' : null;
      if (claim.evidenceStatus === evidenceStatus && claim.documents.includes('Photos of damage') === available) return claim;
      const allReceived = claim.required.every(doc => documents.includes(doc));
      return { ...claim, documents, evidenceStatus,
        stage: available && allReceived && claim.stage < 2 ? 2 : claim.stage,
        status: available && allReceived && claim.status === 'Action required' ? 'Under assessment' : claim.status,
        note: available ? 'Live vehicle evidence is saved in this browser. AI verification is pending; nothing has been sent to an insurer.' : claim.evidenceStatus ? 'Local vehicle evidence was removed. Capture a new set when it is safe.' : claim.note };
    }));
  }
  function createClaim() {
    if (!draft.title.trim() || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) <= 0) { setNotice('Please enter a claim description and a valid amount.'); setStep(2); return; }
    const nextNumber = Math.max(1042, ...claims.map(c => Number(c.id.replace('CLM-', '')) || 0)) + 1;
    const newClaim = { id: `CLM-${nextNumber}`, customerId: profileId, type: draft.type, title: draft.title.trim(), amount: Number(draft.amount), date: new Date().toLocaleDateString('en-CA'), stage: 1, status: 'Pending', documents: [], required: defaultRequired[draft.type], note: 'Your claim has been submitted. Supporting documents are still required.', description: draft.description };
    setClaims(old => [newClaim, ...old]); setDraft({ type: 'Vehicle', title: '', amount: '', description: '' }); setStep(1); setNotice(`Claim ${newClaim.id} submitted successfully.`); openClaim(newClaim.id);
  }
  function managerUpdate(claim, status) {
    const stage = status === 'Approved' || status === 'Rejected' ? 4 : status === 'Closed' ? 5 : status === 'Under assessment' ? 2 : status === 'Decision pending' ? 3 : status === 'Action required' ? 1 : claim.stage;
    updateClaim(claim.id, { status, stage, note: status === 'Action required' ? 'Additional documents are required to continue.' : status === 'Approved' ? 'A positive decision has been made. Closure is pending.' : status === 'Rejected' ? 'A decision has been made. Contact support for more information.' : status === 'Closed' ? 'This claim has been closed.' : 'Your claim status has been updated.' });
    setNotice(`Updated ${claim.id} to ${status}.`);
  }

  if (!demoSignedIn) return <AuthScreen onEnter={enterDemo} />;

  return <div className="site">
    <header className="topnav">
      <button className="wordmark" onClick={() => navigate('dashboard')}>
  <img src="/claimflow.svg" width="30" height="30" alt="" style={{ verticalAlign: 'middle', marginRight: 8 }} />
  ClaimFlow<span>.</span>
      </button>
      <nav aria-label="Main navigation">
        <button className={page === 'dashboard' ? 'selected' : ''} onClick={() => navigate('dashboard')}>Dashboard</button>
        {!manager && <button className={page === 'submit' ? 'selected' : ''} onClick={() => { navigate('submit'); setStep(1); }}>Submit a Claim</button>}
        <button className={page === 'claims' || page === 'detail' ? 'selected' : ''} onClick={() => navigate('claims')}>{manager ? 'Manage Claims' : 'My Claims'}</button>
        <button className={page === 'support' ? 'selected' : ''} onClick={() => navigate('support')}>Support</button>
      </nav>
      <div className="top-right"><span className="bell" aria-label="Notifications">♧</span><div className="profile-holder">
        <button className="profile-button" onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}><span className="avatar">{profile.initials}</span><span className="profile-text"><strong>{profile.name}</strong><small>{manager ? 'Claim Operations' : 'Customer Portal'}</small></span><span>⌄</span></button>
        {profileOpen && <div className="profile-menu">{profiles.map(p => <button key={p.id} onClick={() => switchProfile(p.id)}><span className="avatar small">{p.initials}</span><span><strong>{p.name}</strong><small>{p.role === 'manager' ? 'Manager view' : p.email}</small></span>{p.id === profileId && <b>✓</b>}</button>)}<p>Demo profiles · Not real sign-in</p><button className="auth-signout" onClick={signOut}>↪ &nbsp; Sign out of demo</button></div>}
      </div></div>
    </header>
    <main className="container">
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      {page === 'dashboard' && <>
        <section className={`hero ${manager ? 'manager-hero' : ''}`}><div><p className="hero-kicker">{manager ? 'CLAIMS OPERATIONS' : 'YOUR INSURANCE, SIMPLIFIED'}</p><h1>{manager ? 'Claims overview' : `Good morning, ${profile.name.split(' ')[0]} 👋`}</h1><p>{manager ? 'Keep every claim moving with a clear view of what needs attention.' : 'Track your claims, submit new ones and manage your documents.'}</p></div>{!manager && <button className="purple-btn" onClick={() => navigate('submit')}>＋ &nbsp; Submit a New Claim</button>}</section>
        <div className="metric-grid">
          <Metric icon="▤" number={counts.total} label="Total Claims" sub="All time" tone="blue" />
          <Metric icon="◷" number={counts.progress} label="In Progress" sub="Active claims" tone="blue" />
          <Metric icon="✓" number={counts.approved} label="Approved" sub="Completed" tone="green" />
          <Metric icon="!" number={counts.attention} label="Action Required" sub="Needs your attention" tone="red" />
        </div>
        <ClaimsTable claims={filtered} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} openClaim={openClaim} manager={manager} title={manager ? 'All customer claims' : 'Your Claims'} />
      </>}
      {page === 'claims' && <><div className="page-title"><div><h1>{manager ? 'Manage claims' : 'My claims'}</h1><p>{manager ? 'Review and update customer submissions.' : 'See where every claim stands.'}</p></div>{!manager && <button className="purple-btn" onClick={() => navigate('submit')}>＋ New claim</button>}</div><ClaimsTable claims={filtered} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} openClaim={openClaim} manager={manager} title="Claims" /></>}
      {page === 'detail' && selected && (manager || selected.customerId === profileId) && <>
        <button className="back" onClick={() => navigate('claims')}>← Back to {manager ? 'all claims' : 'my claims'}</button>
        <div className="detail-heading panel"><div className="claim-icon">{selected.type === 'Vehicle' ? '🚙' : selected.type === 'Home' ? '⌂' : '♡'}</div><div><span className="overline">{selected.type} claim</span><h1>{selected.id}</h1><p>Submitted on {formatDate(selected.date)} · {selected.title}</p></div><div className="detail-actions"><Status status={selected.status}/>{selected.type === 'Vehicle' && <button className="outline-btn" onClick={() => document.getElementById('vehicle-evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{manager ? 'View live evidence' : selected.evidenceStatus === 'pending' ? 'Review live evidence' : 'Capture vehicle evidence'}</button>}<button className="outline-btn" onClick={() => navigate('support')}>Contact Support</button></div></div>
        <div className="panel timeline-panel"><div className="timeline-head"><h2>Claim progress</h2><strong>{getProgress(selected)}% <small>of milestones complete</small></strong></div><div className="progress-track"><span style={{width: `${getProgress(selected)}%`}} /></div><div className="timeline">{stages.map((s,i) => <div className="milestone" key={s}><span className={`step-dot ${i < selected.stage ? 'done' : i === selected.stage ? 'current' : ''}`}>{i < selected.stage ? '✓' : i+1}</span><strong>{s}</strong><small>{i < selected.stage ? 'Completed' : i === selected.stage ? 'Current stage' : 'Not started'}</small></div>)}</div><p className="timeline-caption">Progress shows completed workflow milestones, not the probability of approval or an estimated completion date.</p></div>
        <div className="detail-grid"><section className="panel detail-card"><h2>Current step details</h2><div className="current-step"><span className="round-icon">◇</span><div><h3>{selected.status}</h3><p>{selected.note}</p></div></div><div className="info-banner">ⓘ &nbsp; We'll show new updates here when the claim status changes. No completion date is currently available.</div><h3>Claim information</h3><div className="key-value"><span>Claim amount</span><strong>{formatMoney(selected.amount)}</strong></div><div className="key-value"><span>Claim type</span><strong>{selected.type}</strong></div>{manager && <><div className="key-value"><span>Customer</span><strong>{profiles.find(p=>p.id===selected.customerId)?.name}</strong></div><label className="field">Update status<select value={selected.status} onChange={e=>managerUpdate(selected,e.target.value)}>{['Pending','Action required','Under assessment','Decision pending','Approved','Rejected','Closed'].map(s=><option key={s}>{s}</option>)}</select></label></>}</section>
        <section className="panel detail-card"><h2>Documents</h2><p className="doc-summary">{selected.documents.filter(d=>selected.required.includes(d)).length} of {selected.required.length} required documents received</p><div className="document-list">{selected.required.map(doc=><div className="document" key={doc}><span className={`doc-icon ${selected.documents.includes(doc) ? 'received' : 'missing'}`}>{selected.documents.includes(doc) ? '✓' : '▧'}</span><div><strong>{doc}</strong><small>{selected.type === 'Vehicle' && doc === 'Photos of damage' ? (selected.evidenceStatus === 'pending' ? 'Saved locally · verification pending' : 'Use live capture below') : selected.documents.includes(doc) ? 'Received' : 'Pending'}</small></div>{!selected.documents.includes(doc) && !manager && !(selected.type === 'Vehicle' && doc === 'Photos of damage') && <button className="mini-purple" onClick={()=>uploadDemoDocument(selected,doc)}>Mark received</button>}</div>)}</div><p className="small-print">{selected.type === 'Vehicle' ? 'Vehicle photos use live capture below. Other documents use the demo “Mark received” action. Evidence stays in this browser.' : 'Demo only: “Mark received” simulates a document update. No real files are uploaded.'}</p></section></div>
        {selected.type === 'Vehicle' && <VehicleEvidence key={`${selected.customerId}:${selected.id}:${profileId}`} claimId={selected.id} customerId={selected.customerId} readOnly={manager} onEvidenceChange={available => updateVehicleEvidence(selected.id, available)} />}
      </>}
      {page === 'submit' && !manager && <div className="panel wizard"><div className="wizard-sidebar"><h2>Submit a New Claim</h2>{['Claim type','Claim details','Documents','Review & submit'].map((label,i)=><div className={`wizard-step ${step===i+1?'active':''}`} key={label}><span>{i+1}</span><div><strong>{label}</strong><small>{['Select the type of claim','Tell us what happened','See required documents','Confirm and submit'][i]}</small></div></div>)}</div><div className="wizard-body">{step===1 && <><h2>What would you like to claim for?</h2><p>Select the type of claim you want to submit.</p><div className="type-grid">{[['Vehicle','🚙','Accident, theft or damage'],['Home','⌂','Home or contents damage'],['Life','♡','Life cover claims'],['Other','•••','Another claim type']].map(([type,icon,desc])=><button key={type} className={`type-card ${draft.type===type?'chosen':''}`} onClick={()=>setDraft({...draft,type})}><span>{icon}</span><strong>{type}</strong><small>{desc}</small></button>)}</div></>}
        {step===2 && <><h2>Tell us about your claim</h2><p>Provide the basic details. Use fictional information in this demo.</p><label className="field">Short description<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="e.g. Vehicle damaged in parking lot" /></label><label className="field">Estimated amount (ZAR)<input type="number" min="1" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})} placeholder="e.g. 15000" /></label><label className="field">Additional information<textarea rows="4" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="What happened?" /></label></>}
        {step===3 && <><h2>Supporting documents</h2><p>These documents will be requested for your {draft.type.toLowerCase()} claim.</p><div className="document-list">{defaultRequired[draft.type].map(d=><div className="document" key={d}><span className="doc-icon missing">▧</span><div><strong>{d}</strong><small>{draft.type === 'Vehicle' && d === 'Photos of damage' ? 'Capture with your camera after submitting · includes paired selfies and location' : 'Can be marked received after submitting'}</small></div></div>)}</div><p className="small-print">{draft.type === 'Vehicle' ? 'After submitting, open live capture on your claim to photograph the vehicle and take paired selfies. Camera and location permissions are required. If it is unsafe or you cannot capture, submit now and return later or contact support.' : 'Real file upload is not connected yet.'}</p></>}
        {step===4 && <><h2>Review your claim</h2><p>Check your information before submitting.</p><div className="review-box"><div className="key-value"><span>Claim type</span><strong>{draft.type}</strong></div><div className="key-value"><span>Description</span><strong>{draft.title || 'Not provided'}</strong></div><div className="key-value"><span>Estimated amount</span><strong>{formatMoney(Number(draft.amount) || 0)}</strong></div></div><p className="small-print">This creates a local demo claim only. No insurer receives it.</p></>}
        <div className="wizard-actions">{step>1 && <button className="outline-btn" onClick={()=>setStep(s=>s-1)}>← Back</button>}<button className="purple-btn" onClick={()=>step===4?createClaim():setStep(s=>s+1)}>{step===4?(draft.type === 'Vehicle' ? 'Submit & capture →' : 'Submit claim →'):'Next step →'}</button></div></div></div>}
      {page === 'support' && <div className="panel support-panel"><span className="round-icon">◉</span><h1>How can we help?</h1><p>This is a demo support page. In a production system, customers could send secure messages, request assistance and receive updates on their claims.</p><button className="purple-btn" onClick={()=>navigate('claims')}>View my claims →</button></div>}
      {!manager && !(page === 'detail' && selected?.type === 'Vehicle') && <ClaimFlowAssist key={profile.id} profile={profile} claims={visibleClaims} openClaim={openClaim} navigate={navigate} />}
      <footer>ClaimFlow prototype · Fictional demo data · Demo access · Claims and captured evidence stay in this browser</footer>
    </main>
  </div>;
}

function Metric({ icon, number, label, sub, tone }) { return <div className="metric panel"><span className={`metric-icon ${tone}`}>{icon}</span><div><strong>{number}</strong><span>{label}</span><small>{sub}</small></div></div>; }
function Status({status}) { const tone = status === 'Approved' || status === 'Closed' ? 'green' : status === 'Action required' || status === 'Rejected' ? 'orange' : 'blue'; return <span className={`status ${tone}`}>◉ {status}</span>; }
function ClaimsTable({ claims, filter, setFilter, search, setSearch, openClaim, manager, title }) {
  return <section className="panel claims-panel"><div className="table-heading"><h2>{title}</h2><label className="search"><span>⌕</span><input placeholder="Search claims..." value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search claims" /></label></div><div className="filters">{['All','In progress','Action required','Approved','Rejected'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f} <span>({f==='All'?claims.length:claims.filter(c=>f==='In progress'?!['Approved','Rejected','Action required'].includes(c.status):c.status===f).length})</span></button>)}</div><div className="table-scroll"><table><thead><tr><th>REFERENCE</th>{manager && <th>CUSTOMER</th>}<th>CLAIM TYPE</th><th>DATE SUBMITTED</th><th>STATUS</th><th>PROGRESS</th><th>ACTIONS</th></tr></thead><tbody>{claims.map(c=><tr key={c.id}><td><strong>{c.id}</strong></td>{manager && <td>{profiles.find(p=>p.id===c.customerId)?.name}</td>}<td>{c.type}</td><td>{formatDate(c.date)}</td><td><Status status={c.status}/></td><td><div className="table-progress"><span>{getProgress(c)}%</span><div><i style={{width:`${getProgress(c)}%`,background:c.status==='Action required'?'#f6a03c':c.status==='Approved'?'#20ad7c':'#2677f6'}} /></div></div></td><td><button className="view-link" onClick={()=>openClaim(c.id)}>View →</button></td></tr>)}{claims.length===0 && <tr><td colSpan="7" className="empty">No claims found for this filter.</td></tr>}</tbody></table></div></section>;
}
export default App;

