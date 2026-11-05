import React, { useCallback, useEffect, useState } from 'react';
import { Alert, B } from './ui';

const messages = {
  canceled: 'Google sign-in was canceled. You can try again whenever you are ready.',
  expired: 'This sign-in attempt expired or could not be verified. Please start again.',
  failed: 'We could not complete Google sign-in. Please try again.',
  unavailable: 'Sign-in is temporarily unavailable. You can still use every free tool.',
};
export default function Account() {
  const [state, setState] = useState({ status: 'loading', user: null, available: false });
  const [notice, setNotice] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const refresh = useCallback(async signal => {
    setState(current => ({ ...current, status: 'loading' }));
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: signal || AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (typeof result.available !== 'boolean' || !(result.user === null || (typeof result.user?.email === 'string' && typeof result.user?.id === 'string'))) throw new Error();
      setState({ status: 'ready', ...result });
    } catch { if (!signal?.aborted) setState(current => ({ ...current, status: 'error' })); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setState(current => current.status === 'loading' ? { ...current, status: 'error' } : current); }, 10000);
    setNotice(messages[new URLSearchParams(location.search).get('error')] || '');
    refresh(controller.signal).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [refresh]);
  async function signOut() {
    setSigningOut(true); setNotice('');
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      setState(current => ({ ...current, user: null }));
      history.replaceState(null, '', '/account');
      setNotice('You are signed out on this browser.');
    } catch { setNotice('We could not sign you out. Please try again.'); }
    finally { setSigningOut(false); }
  }
  return <main className="account-layout">
    <div className="page-intro"><small>YOUR POSTERTILER</small><h1>{state.user ? 'Your account' : 'Sign in to PosterTiler'}</h1><p>Keep your Google sign-in separate from your poster files.</p></div>
    <section className="account-card" aria-label="Account sign-in" aria-busy={state.status === 'loading' || signingOut}>
      {notice && <Alert>{notice}</Alert>}
      {state.status === 'loading' ? <p role="status">Checking your sign-in…</p> : state.status === 'error' ? <>
        <Alert tone="error">We could not check your sign-in. Please try again.</Alert><B secondary onClick={() => refresh()}>Try again</B>
      </> : state.user ? <>
        <small>SIGNED IN WITH GOOGLE</small><h2>{state.user.name || 'Welcome to PosterTiler'}</h2>
        <p className="account-email">{state.user.email}</p>
        <p>You stay signed in for up to 7 days, or until you sign out on this browser.</p>
        <div className="button-row"><a className="button" href="/tools">Explore the tools</a><B secondary disabled={signingOut} onClick={signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</B></div>
      </> : <>
        <h2>Welcome to PosterTiler</h2><p>Use your Google account to sign in. We request your basic profile and email address.</p>
        {state.available ? <a className="google-signin" href="/api/auth/google"><GoogleMark/>Continue with Google</a> : <Alert>Sign-in is temporarily unavailable. The free tools are ready to use.</Alert>}
        <p className="micro">Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Use</a>.</p>
      </>}
      <noscript><p>Enable JavaScript to view your account. All free tools remain available without signing in.</p></noscript>
    </section>
    <div className="account-note"><h2>Your files stay with you</h2><p>Signing in does not upload your images or PDFs. All six free tools work without an account or analytics permission.</p><a href="/tools">Browse the free tools</a></div>
  </main>;
}
function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.87 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}
