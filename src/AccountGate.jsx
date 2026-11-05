import React,{useEffect,useState} from 'react';
import { ArrowRight,LockSimple } from '@phosphor-icons/react';
import { useAuth } from './AuthContext';
import { Alert,B } from './ui';
import './account.css';
const errors={canceled:'Google sign-in was canceled. Try again whenever you are ready.',expired:'This sign-in attempt expired. Please start again.',failed:'We could not complete Google sign-in. Please try again.',unavailable:'Sign-in is temporarily unavailable. All free tools are still available.'};
export default function AccountGate({children,returnTo='/account',cloud=false}) {
 const auth=useAuth(),[notice,setNotice]=useState(''),[destination,setDestination]=useState(returnTo);
 useEffect(()=>{
  function updateDestination(){
  const query=new URLSearchParams(location.search);setNotice(errors[query.get('error')]||'');
  setDestination(returnTo);
  if(returnTo==='/account/billing'&&['single','pack5'].includes(query.get('plan')))setDestination(returnTo+'?plan='+query.get('plan'));
  if(location.pathname==='/account'&&location.hash==='#cloud-processing'){setDestination('/cloud');if(auth.user)location.replace('/cloud');}
  }
  updateDestination();window.addEventListener('hashchange',updateDestination);
  return()=>window.removeEventListener('hashchange',updateDestination);
 },[returnTo,auth.user]);
 if(auth.user)return children;
 return <main className="auth-page"><header className="auth-heading"><span className="auth-eyebrow">YOUR POSTERTILER</span><h1>{cloud?'Sign in for Cloud PDF':'Sign in to PosterTiler'}</h1><p>{cloud?'Create a cloud poster and keep track of its progress.':'Your credits, cloud tasks and downloads, together.'}</p></header><section className="auth-card" aria-label="Account sign-in" aria-busy={auth.status==='loading'}>
 {notice&&<Alert>{notice}</Alert>}
 {auth.status==='loading'?<div className="auth-loading" role="status"><span className="auth-loading-mark"/>Checking your sign-in…</div>:auth.status==='error'?<><Alert tone="error">We could not check your sign-in.</Alert><B secondary onClick={auth.refresh}>Try again</B></>:<><div className="auth-welcome"><img src="/assets/brand/postertiler-mark.png" alt="" width="48" height="48"/><h2>Welcome to PosterTiler</h2><p>Continue with Google.<br/>We request your basic profile and email.</p></div>{auth.available?<a className="google-signin" href={'/api/auth/google?return_to='+encodeURIComponent(destination)}><img src="/assets/brand/google-g.svg" width="18" height="18" alt=""/>Continue with Google</a>:<Alert>Sign-in is temporarily unavailable. You can still use all free tools.</Alert>}<p className="auth-legal">Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Use</a>.</p></>}
 <noscript>Enable JavaScript to sign in. Free tools remain available without an account.</noscript></section><aside className="auth-note"><LockSimple size={21}/><div><h2>Your free posters stay local</h2><p>Signing in does not upload your images. A cloud upload needs your separate consent.</p><a href="/tools">Browse the free tools<ArrowRight size={15}/></a></div></aside></main>;
}
