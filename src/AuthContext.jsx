import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, available: false });
  const [signingOut, setSigningOut] = useState(false);
  const pending = useRef(null), epoch = useRef(0), channel = useRef(null), alive = useRef(true), lastCheck = useRef(0);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current.promise;
    const version = epoch.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    setState(current => ({ ...current, status: current.status === 'ready' ? 'ready' : 'loading' }));
    const promise = (async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (typeof result.available !== 'boolean' || !(result.user === null || (typeof result.user?.id === 'string' && typeof result.user?.email === 'string'))) throw new Error();
        if (alive.current && version === epoch.current) setState({ status: 'ready', user: result.user, available: result.available });
      } catch {
        if (alive.current && version === epoch.current) setState(current => ({ ...current, status: 'error' }));
      } finally {
        clearTimeout(timer); lastCheck.current = Date.now();
        if (pending.current?.controller === controller) pending.current = null;
      }
    })();
    pending.current = { promise, controller };
    return promise;
  }, []);
  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Sign-out failed');
      epoch.current += 1; pending.current?.controller.abort(); pending.current = null;
      if (alive.current) setState(current => ({ ...current, status: 'ready', user: null }));
      channel.current?.postMessage({ type: 'session-changed' });
    } finally { if (alive.current) setSigningOut(false); }
  }, []);
  useEffect(() => {
    alive.current = true; refresh();
    const onFocus = () => { if (Date.now() - lastCheck.current > 10000) refresh(); };
    window.addEventListener('focus', onFocus);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('postertiler-auth-v1');
      channel.current.onmessage = event => { if (event.data?.type === 'session-changed') refresh(); };
    }
    return () => { alive.current = false; window.removeEventListener('focus', onFocus); channel.current?.close(); channel.current = null; };
  }, [refresh]);
  return <AuthContext.Provider value={{ ...state, signingOut, refresh, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider required');
  return value;
}
