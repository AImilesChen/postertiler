import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, List, SignOut, UserCircle, X, Sparkle } from '@phosphor-icons/react';
import { aiTaskUrl,AI_UPSCALER_URL,AI_GENERATOR_URL } from './ai-navigation';
import { useAuth } from './AuthContext';
import './nav.css';

const tools = [
  ['AI Image Generator',AI_GENERATOR_URL], ['AI Image Editor',aiTaskUrl('edit')],
  ['Image Dithering Tool','/tools/dithering-tool'],
  ['All Tools','/tools'], ['Poster Size Calculator','/tools/poster-size-calculator'],
  ['Image to PDF','/tools/image-to-pdf'], ['PDF Poster Printer','/tools/pdf-poster-printer'],
  ['Life Size Poster Maker','/tools/life-size-poster-maker'], ['Halftone Poster Maker','/tools/halftone-poster-maker'],
];
export default function Nav() {
  const auth = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false), [panel, setPanel] = useState(null), [error, setError] = useState('');
  const root = useRef(null), accountButton = useRef(null), menu = useRef(null), signIn = useRef(null), lastItem = useRef(false);
  const displayName = auth.user?.name?.trim().split(/\s+/)[0] || 'My account';
  const initial = (auth.user?.name || auth.user?.email || '').trim().slice(0, 1).toUpperCase();
  useEffect(() => {
    if (!panel) return;
    const outside = event => { if (!root.current?.contains(event.target)) setPanel(null); };
    document.addEventListener('pointerdown', outside);
    if (panel === 'account') {
      const items = menu.current?.querySelectorAll('[role="menuitem"]');
      (lastItem.current ? items?.[items.length-1] : items?.[0])?.focus(); lastItem.current = false;
    }
    return () => document.removeEventListener('pointerdown', outside);
  }, [panel]);
  useEffect(() => { if (!auth.user) setPanel(current => current === 'account' ? null : current); }, [auth.user]);
  function closeAccount() { setPanel(null); accountButton.current?.focus(); }
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeAccount(); return; }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')].filter(item => !item.disabled);
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }
  async function logout() {
    setError('');
    try {
      await auth.signOut(); setPanel(null);
      setTimeout(() => signIn.current?.focus(), 0);
    } catch { setError('Could not sign out. Please try again.'); }
  }
  return <header className="site-header"><div className="nav-inner" ref={root}>
    <a className="brand" href="/" aria-label="PosterTiler home"><img src="/assets/brand/postertiler-wordmark.png?v=1.1" alt="PosterTiler"/></a>
    <button className="mobile-menu icon-button" aria-expanded={mobileOpen} aria-controls="main-navigation" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} onClick={() => { setMobileOpen(!mobileOpen); setPanel(null); }}><span aria-hidden="true">{mobileOpen ? <X size={18}/> : <List size={18}/>}</span></button>
    <nav id="main-navigation" className={mobileOpen ? 'open' : ''} aria-label="Main navigation">
      <div className="nav-link-group"><a href="/#poster-editor">Make a Poster</a><a className="nav-ai-upscaler" href={AI_UPSCALER_URL}><Sparkle size={17} aria-hidden="true"/>AI Upscaler</a><a href="/gallery">Gallery</a>
        <div className="tools-menu" onKeyDown={event => { if (event.key === 'Escape') setPanel(null); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPanel(current => current === 'tools' ? null : current); }}>
          <button aria-expanded={panel === 'tools'} onClick={() => setPanel(panel === 'tools' ? null : 'tools')}>Tools</button>
          {panel === 'tools' && <div className="menu-popover">{tools.map(([label,path]) => <a key={path} href={path}>{label}</a>)}</div>}
        </div><a href="/cloud">Cloud PDF</a><a href="/pricing">Pricing</a><a href="/guides">Printing Guides</a>
      </div>
      <div className="nav-auth" data-clarity-mask="true">
        {!auth.user ? <a ref={signIn} className="nav-sign-in" href="/account"><UserCircle size={19} aria-hidden="true"/><span>Sign in</span></a> :
          <div className="nav-user-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPanel(current => current === 'account' ? null : current); }}>
            <button ref={accountButton} className="nav-user-trigger" aria-label={`Account menu for ${displayName}`} aria-expanded={panel === 'account'} aria-controls="account-menu" aria-haspopup="menu"
              onClick={() => { setError(''); setPanel(panel === 'account' ? null : 'account'); }}
              onKeyDown={event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); lastItem.current = event.key === 'ArrowUp'; setPanel('account'); } else if (event.key === 'Escape') closeAccount(); }}>
              <span className="nav-user-avatar" aria-hidden="true">{initial}</span><span className="nav-user-name">{displayName}</span><CaretDown size={14} aria-hidden="true"/>
            </button>
            {panel === 'account' && <div className="nav-user-popover">
              <div className="nav-user-summary"><span>Signed in with Google</span><strong>{auth.user.name || 'Your account'}</strong><p>{auth.user.email}</p></div>
              <div ref={menu} id="account-menu" role="menu" aria-label="Account menu" onKeyDown={keyboard}>
                <a role="menuitem" href="/account"><UserCircle size={18} aria-hidden="true"/>My account</a>
                <a role="menuitem" href="/account/tasks">Cloud tasks</a>
                <a role="menuitem" href="/account/billing">Credits & orders</a>
                <button role="menuitem" disabled={auth.signingOut} onClick={logout}><SignOut size={18} aria-hidden="true"/>{auth.signingOut ? 'Signing out…' : 'Sign out'}</button>
              </div>
              {error && <p role="alert" className="nav-auth-error">{error}</p>}
            </div>}
          </div>}
      </div>
    </nav>
  </div></header>;
}
