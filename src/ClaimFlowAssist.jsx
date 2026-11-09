import { useEffect, useRef, useState } from 'react';
import './ClaimFlowAssist.css';

// Rule-based, demo-only assistant. All claim information comes from the app's state.
const menu = [
  { label: 'Check claim status', action: 'claims' },
  { label: 'Missing documents', action: 'documents' },
  { label: 'Payment & decisions', action: 'payment' },
  { label: 'How to submit', action: 'submit' },
  { label: 'Contact support', action: 'support' },
];
const clean = (value) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const claimLabel = (c) => `${c.id} · ${c.type} · ${c.title}`;
const progress = (c) => Math.round(Math.min(5, Math.max(0, c.stage)) / 5 * 100);
const missing = (c) => c.required.filter((d) => !c.documents.includes(d));
const matches = (s, expressions) => expressions.some((expression) => new RegExp(expression, 'i').test(s));

function intentOf(text) {
  const s = clean(text);
  if (!s) return 'empty';
  if (matches(s, ['^(hi|hello|hey|howzit|sawubona|good morning|good afternoon|good evening)\\b', '^menu$', '^help$', '^start over$', '^restart$'])) return 'menu';
  if (matches(s, ['thank', 'cheers', 'appreciate'])) return 'thanks';
  if (matches(s, ['human', 'agent', 'person', 'call centre', 'call center', 'complain', 'escalat', 'speak to', 'contact', 'support', 'phone', 'email'])) return 'support';
  if (matches(s, ['submit', 'new claim', 'make a claim', 'file a claim', 'register a claim', 'report an accident', 'report damage'])) return 'submit';
  if (matches(s, ['document', 'upload', 'missing', 'outstanding', 'proof', 'photo', 'paperwork', 'what do i need', 'required'])) return 'documents';
  if (matches(s, ['money', 'paid', 'payment', 'payout', 'bank', 'cash', 'approve', 'reject', 'declin', 'decision', 'guarantee', 'how long', 'when will'])) return 'payment';
  if (matches(s, ['status', 'progress', 'track', 'update', 'where', 'what s happening', 'what is happening', 'waiting', 'delay', 'claim', 'assessment', 'assessor'])) return 'claims';
  return 'unknown';
}

function answerForClaim(claim, topic) {
  const outstanding = missing(claim);
  if (topic === 'documents') return {
    text: outstanding.length
      ? `${claim.id} (${claim.title}) needs: ${outstanding.join(', ')}. ${claim.documents.length} document(s) are currently marked received. Open the claim to mark outstanding documents as received in this demo; no real files are uploaded.`
      : `All listed required documents for ${claim.id} are marked received. This doesn't automatically mean the claim is approved.`,
    actions: [{ label: 'Open claim details', action: 'open', claimId: claim.id }, { label: 'Check status', action: 'claims', claimId: claim.id }],
  };
  if (topic === 'payment') return {
    text: `${claim.id} is currently marked “${claim.status}”. ${claim.note || ''} I can't promise approval, a payout amount or a payment date. A claim marked Approved isn't necessarily paid.`,
    actions: [{ label: 'Open claim details', action: 'open', claimId: claim.id }, { label: 'Contact support', action: 'support' }],
  };
  return {
    text: `${claim.id} (${claim.title}) is currently “${claim.status}” with ${progress(claim)}% of the five workflow milestones recorded as complete. ${claim.note || ''}${outstanding.length ? ` Outstanding: ${outstanding.join(', ')}.` : ''} The percentage is workflow progress, not the chance of approval or a time estimate.`,
    actions: [{ label: 'Open claim details', action: 'open', claimId: claim.id }, { label: 'Missing documents', action: 'documents', claimId: claim.id }],
  };
}

const welcome = (name) => ({ text: `Hi ${name}! 👋 I'm ClaimFlow Assist, your guided claims helper. I can check your demo claims, explain missing documents and help you find the next step. What would you like to do?`, actions: menu });

export default function ClaimFlowAssist({ profile, claims, openClaim, navigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => [{ role: 'bot', ...welcome(profile.name.split(' ')[0]) }]);
  const [input, setInput] = useState('');
  const [topic, setTopic] = useState('claims');
  const [awaitingClaim, setAwaitingClaim] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // App keys this component by profile, clearing chat when the demo account changes.
  useEffect(() => { if (isOpen) bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [messages, isOpen]);
  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  function reply(result) { setMessages((old) => [...old, { role: 'bot', ...result }]); }
  function chooseClaim(nextTopic, claimId) {
    setTopic(nextTopic);
    if (claimId) {
      const claim = claims.find((c) => c.id === claimId);
      if (!claim) { reply({ text: 'That claim is not available in your current profile. Please select one of your claims.', actions: menu }); return; }
      setAwaitingClaim(false);
      reply(answerForClaim(claim, nextTopic));
      return;
    }
    if (!claims.length) { setAwaitingClaim(false); reply({ text: 'There are no claims for this demo customer yet. You can submit a new one.', actions: [{ label: 'Submit a claim', action: 'submit' }, ...menu.slice(3)] }); return; }
    if (claims.length === 1) { chooseClaim(nextTopic, claims[0].id); return; }
    setAwaitingClaim(true);
    reply({ text: 'Which claim would you like me to check?', actions: [...claims.map((c) => ({ label: claimLabel(c), action: nextTopic, claimId: c.id })), { label: 'Main menu', action: 'menu' }] });
  }
  function handleAction(action, claimId) {
    if (action === 'menu') { setAwaitingClaim(false); reply(welcome(profile.name.split(' ')[0])); return; }
    if (action === 'open') { setIsOpen(false); openClaim(claimId); return; }
    if (action === 'submit') { setIsOpen(false); navigate('submit'); reply({ text: 'I opened the claim submission form. Choose a claim type to get started.', actions: menu }); return; }
    if (action === 'support') { setAwaitingClaim(false); reply({ text: 'For help beyond this prototype, use the Support page. This demo does not connect to a live agent or send messages to Hollard.', actions: [{ label: 'Open support page', action: 'support-page' }, { label: 'Main menu', action: 'menu' }] }); return; }
    if (action === 'support-page') { setIsOpen(false); navigate('support'); return; }
    chooseClaim(action, claimId);
  }
  function send(event) {
    event.preventDefault();
    const value = input.trim().slice(0, 350);
    if (!value) return;
    setMessages((old) => [...old, { role: 'user', text: value }]);
    setInput('');
    const normalized = clean(value);
    const directClaim = claims.find((c) => normalized.includes(clean(c.id)) || (normalized.length >= 6 && normalized.includes(clean(c.title))));
    const intent = intentOf(value);
    if (intent === 'menu') { handleAction('menu'); return; }
    if (intent === 'thanks') { reply({ text: "You're welcome! What else can I help you with?", actions: menu }); return; }
    if (intent === 'support' || intent === 'submit') { handleAction(intent); return; }
    if (directClaim) { chooseClaim(['documents', 'payment'].includes(intent) ? intent : 'claims', directClaim.id); return; }
    if (['claims', 'documents', 'payment'].includes(intent)) { chooseClaim(intent); return; }
    if (awaitingClaim) {
      const number = normalized.match(/\b(?:clm[- ]?)?(\d{4,})\b/);
      const byNumber = number && claims.find((c) => c.id.endsWith(number[1]));
      const byType = claims.filter((c) => normalized.includes(clean(c.type)));
      if (byNumber || byType.length === 1) { chooseClaim(topic, byNumber || byType[0] ? (byNumber || byType[0]).id : null); return; }
      reply({ text: "I couldn't identify which claim you meant. Please choose a claim below, or type its reference number.", actions: [...claims.map((c) => ({ label: claimLabel(c), action: topic, claimId: c.id })), { label: 'Main menu', action: 'menu' }] });
      return;
    }
    reply({ text: "I'm not sure I understood that, and I don't want to guess about your insurance claim. I can help with these topics:", actions: menu });
  }

  return <div className="cfa-root">
    {isOpen && <section className="cfa-panel" aria-label="ClaimFlow Assist chat">
      <header className="cfa-header"><div className="cfa-bot-icon" aria-hidden="true">✦</div><div><strong>ClaimFlow Assist</strong><small>Guided claims support · Demo</small></div><button type="button" className="cfa-close" onClick={() => setIsOpen(false)} aria-label="Close chat">×</button></header>
      <div className="cfa-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((m, i) => <div key={i} className={`cfa-message ${m.role === 'user' ? 'cfa-user' : 'cfa-bot'}`}><div className="cfa-bubble">{m.text}</div>{m.actions && <div className="cfa-actions">{m.actions.map((a, j) => <button type="button" key={`${i}-${j}`} onClick={() => handleAction(a.action, a.claimId)}>{a.label}</button>)}</div>}</div>)}
        <div ref={bottomRef} />
      </div>
      <div className="cfa-footer"><form onSubmit={send}><input ref={inputRef} value={input} maxLength={350} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your claim..." aria-label="Message ClaimFlow Assist" /><button type="submit" disabled={!input.trim()} aria-label="Send message">➤</button></form><div className="cfa-footer-note"><span>Demo only · No live AI or agent</span><button type="button" onClick={() => handleAction('menu')}>↺ Main menu</button></div></div>
    </section>}
    <button type="button" className="cfa-launcher" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen} aria-label={isOpen ? 'Close ClaimFlow Assist' : 'Open ClaimFlow Assist'}>{isOpen ? '×' : '✦'}<span>{isOpen ? '' : 'Chat with us'}</span></button>
  </div>;
}
