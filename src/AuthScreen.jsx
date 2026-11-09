import { useState } from 'react';
import './AuthScreen.css';

const demoAccounts = [
  { id: 'thando', name: 'Thando Mokoena', email: 'thando@example.com', initials: 'TM', role: 'Customer' },
  { id: 'sipho', name: 'Sipho Dlamini', email: 'sipho@example.com', initials: 'SD', role: 'Customer' },
  { id: 'manager', name: 'Claims Manager', email: 'manager@example.com', initials: 'CM', role: 'Claims team' },
];

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.79 7.18l7.73 6C44.39 38.03 46.98 31.86 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.88 23.88 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}

export default function AuthScreen({ onEnter }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const account = demoAccounts.find(a => a.email.toLowerCase() === email.trim().toLowerCase());
    if (mode === 'login') {
      if (account) { onEnter(account.id); return; }
      setMessage('This prototype only supports the three demo accounts below. Choose a demo profile to continue.');
      setShowDemo(true);
      return;
    }
    setMessage(`Thanks${name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}! Account creation is a design preview. Choose a demo account below to explore ClaimFlow.`);
    setShowDemo(true);
  }
  function changeMode(next) { setMode(next); setMessage(''); setPassword(''); }
  return <div className="auth-page">
    <section className="auth-story" aria-label="Welcome to ClaimFlow">
      <div className="auth-story-content">
        <div className="auth-brand"><span className="auth-brand-symbol">✳</span><span>ClaimFlow<span className="auth-brand-dot">.</span></span></div>
        <div className="auth-story-copy"><div className="auth-eyebrow"><span /> INSURANCE, SIMPLIFIED</div><h1>Peace of mind,<br /><em>every step</em><br />of the way.</h1><p>A simpler way to manage your insurance claims. Stay informed, feel supported, and move forward with confidence.</p></div>
        <div className="auth-story-card"><span className="auth-story-card-icon">✓</span><div><strong>Always know what's next.</strong><small>Real-time claim visibility, clear milestones and helpful guidance — all in one place.</small></div><span className="auth-story-card-arrow">↗</span></div>
        <div className="auth-story-footer"><span>◉ &nbsp; Made for moments that matter</span><span>CLAIMFLOW / 2026</span></div>
      </div>
      <div className="auth-orb auth-orb-one"/><div className="auth-orb auth-orb-two"/><div className="auth-arc auth-arc-one"/><div className="auth-arc auth-arc-two"/>
    </section>
    <section className="auth-right"><div className="auth-mobile-brand">ClaimFlow<span>.</span></div><div className="auth-form-wrap">
      <div className="auth-tag"><span>✦</span> YOUR CLAIMS, MADE SIMPLE</div>
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p className="auth-subtitle">{mode === 'login' ? 'Sign in to stay connected to what matters.' : 'Your peace of mind starts with one simple step.'}</p>
      <div className="auth-tabs" role="tablist" aria-label="Account access"><button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Sign in</button><button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Create account</button></div>
      <button className="auth-google" type="button" onClick={() => setMessage('Google sign-in is a visual preview. Real Google OAuth requires a configured authentication provider. Use a demo account to explore the app.')}><GoogleMark/> Continue with Google</button>
      <div className="auth-divider"><span/>or continue with email<span/></div>
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && <label className="auth-label">Full name<input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" required /></label>}
        <label className="auth-label">Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        <label className="auth-label">Password<div className="auth-password"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Create a password (8+ characters)' : 'Enter your password'} minLength={mode === 'signup' ? 8 : 1} required/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
        <div className="auth-extras">{mode === 'login' ? <><span>🔒 &nbsp;Secure account access</span><button type="button" onClick={()=>setMessage('Password reset requires a real authentication service. For this demo, use a sample account below.')}>Forgot password?</button></> : <span>By continuing, you agree to our prototype terms and privacy notice.</span>}</div>
        <button className="auth-primary" type="submit">{mode === 'login' ? 'Sign in to ClaimFlow' : 'Create account'} <span>→</span></button>
      </form>
      {message && <div className="auth-message" role="status">{message}</div>}
      <div className="auth-demo"><div className="auth-demo-heading"><div><span className="auth-demo-dot"/><strong>Explore the live prototype</strong><small>No real account or password required</small></div><button type="button" onClick={()=>setShowDemo(v=>!v)} aria-expanded={showDemo}>{showDemo ? 'Hide accounts −' : 'Try demo →'}</button></div>
        {showDemo && <div className="auth-demo-users">{demoAccounts.map(a=><button type="button" key={a.id} onClick={()=>onEnter(a.id)}><span className="auth-demo-avatar">{a.initials}</span><span><strong>{a.name}</strong><small>{a.role}</small></span><span className="auth-demo-next">→</span></button>)}</div>}
      </div>
      <p className="auth-disclaimer">Prototype only · Google sign-in, email authentication and registration are not connected to a live identity service. Never enter a real password.</p>
    </div><div className="auth-right-footer">© 2026 ClaimFlow concept <span>Designed with care ✳</span></div></section>
  </div>;
}
