import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, LockSimple } from '@phosphor-icons/react';
import { Alert, B } from './ui';
import { useAuth } from './AuthContext';
import './account.css';
import BillingTestPanel from './BillingTestPanel';

const messages = {
  canceled: 'Google sign-in was canceled. You can try again whenever you are ready.',
  expired: 'This sign-in attempt expired or could not be verified. Please start again.',
  failed: 'We could not complete Google sign-in. Please try again.',
  unavailable: 'Sign-in is temporarily unavailable. You can still use every free tool.',
};
export default function Account() {
  const state = useAuth();
  const [notice, setNotice] = useState('');
  const { signingOut, refresh } = state;
  useEffect(() => {
    setNotice(messages[new URLSearchParams(location.search).get('error')] || '');
  }, []);
  async function signOut() {
    setNotice('');
    try {
      await state.signOut();
      history.replaceState(null, '', '/account');
      setNotice('You are signed out on this browser.');
    } catch { setNotice('We could not sign you out. Please try again.'); }
  }
  const initials = (state.user?.name || state.user?.email || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <main className="auth-page">
    <header className="auth-heading"><span className="auth-eyebrow">YOUR POSTERTILER</span><h1>{state.user ? 'Your account' : 'Sign in to PosterTiler'}</h1><p>{state.user ? 'You’re signed in. Your next poster starts here.' : 'A simple sign-in. Your files stay on your device.'}</p></header>
    <section className="auth-card" aria-label="Account sign-in" aria-busy={state.status === 'loading' || signingOut}>
      {notice && <Alert>{notice}</Alert>}
      {state.status === 'loading' ? <div className="auth-loading" role="status"><span className="auth-loading-mark" aria-hidden="true"/>Checking your sign-in…</div> : state.status === 'error' ? <>
        <Alert tone="error">We could not check your sign-in. Please try again.</Alert><B secondary onClick={() => refresh()}>Try again</B>
      </> : state.user ? <>
        <div className="auth-profile"><div className="auth-avatar" aria-hidden="true">{initials}</div><div className="auth-identity"><span className="auth-label">GOOGLE ACCOUNT</span><h2>{state.user.name || 'Welcome to PosterTiler'}</h2><p className="auth-email">{state.user.email}</p></div></div>
        <div className="auth-session"><span className="auth-status"><CheckCircle size={17} weight="fill" aria-hidden="true"/>Signed in</span><p>You stay signed in for up to 7 days on this browser.</p></div>
        <div className="auth-actions"><a className="button" href="/#poster-editor">Make a poster<ArrowRight size={18} aria-hidden="true"/></a><B secondary disabled={signingOut} onClick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</B></div>
      </> : <>
        <div className="auth-welcome"><img src="/assets/brand/postertiler-mark.png" alt="" width="48" height="48"/><h2>Welcome to PosterTiler</h2><p>Continue with your Google account.<br/>We only request your basic profile and email.</p></div>
        {state.available ? <a className="google-signin" href="/api/auth/google"><GoogleMark/>Continue with Google</a> : <Alert>Sign-in is temporarily unavailable. The free tools are ready to use.</Alert>}
        <p className="auth-legal">Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Use</a>.</p>
      </>}
      <noscript><p>Enable JavaScript to view your account. All free tools remain available without signing in.</p></noscript>
    </section>
    {state.user && <BillingTestPanel key={state.user.id}/>}
    <aside className="auth-note"><LockSimple size={21} aria-hidden="true"/><div><h2>Your files stay with you</h2><p>Signing in does not upload your images or PDFs. All six free tools work without an account or analytics permission.</p><a href="/tools">Browse the free tools<ArrowRight size={15} aria-hidden="true"/></a></div></aside>
  </main>;
}
function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.87 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}
