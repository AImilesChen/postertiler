import React,{useState} from 'react';
import { ArrowRight,CloudArrowUp,FilePdf,House,Receipt,SignOut,UserCircle } from '@phosphor-icons/react';
import { useAuth } from './AuthContext';
import { Alert,B } from './ui';
import { CreditSummary,EmptyTasks,PrivacyNote,SandboxNote,TaskCard,TaskHistory } from './AccountComponents';
import { useCloudAccount } from './account-data';
import BillingTestPanel from './BillingTestPanel';
import AccountGate from './AccountGate';
import './account-workspace.css';
const views={overview:['Overview','Your next poster starts here.'],tasks:['Cloud tasks','Follow progress, find downloads and manage your tasks.'],billing:['Credits & orders','One-time cloud credits and your payment history.'],settings:['Account settings','Your Google profile and this browser’s sign-in.']};
const accountLinks=[['overview','/account','Overview',House],['tasks','/account/tasks','Cloud tasks',FilePdf],['billing','/account/billing','Credits & orders',Receipt],['settings','/account/settings','Account settings',UserCircle]];
export default function AccountDashboard({view='overview'}) {return <AccountGate returnTo={accountLinks.find(([v])=>v===view)?.[1]||'/account'}><Dashboard view={view}/></AccountGate>;}
function Dashboard({view}) {
 const auth=useAuth(),[notice,setNotice]=useState('');
 const shortName=auth.user.name?.trim().split(/\s+/)[0]||'there';
 async function signOut(){setNotice('');try{await auth.signOut();}catch{setNotice('We could not sign you out. Please try again.');}}
 return <main className="account-workspace" data-clarity-mask="true"><aside className="account-sidebar"><a className="account-sidebar-title" href="/account">YOUR WORKSPACE</a><nav aria-label="Account navigation">{accountLinks.map(([v,path,label,Icon])=><a key={v} href={path} aria-current={v===view?'page':undefined}><Icon size={19}/>{label}</a>)}</nav><div className="sidebar-bottom"><a href="/cloud"><CloudArrowUp size={19}/>New cloud poster</a><button disabled={auth.signingOut} onClick={signOut}><SignOut size={19}/>{auth.signingOut?'Signing out…':'Sign out'}</button></div></aside>
 <div className="account-main"><header className="workspace-heading"><div><span className="account-eyebrow">YOUR POSTERTILER</span><h1>{view==='overview'?`Hello, ${shortName}.`:views[view][0]}</h1><p>{views[view][1]}</p></div>{view!=='settings'&&<a className="button" href="/cloud"><CloudArrowUp size={18}/>New cloud poster</a>}</header>
 <SandboxNote/>{notice&&<Alert tone="error">{notice}</Alert>}
 {view==='overview'?<Overview/>:view==='tasks'?<TaskHistory/>:view==='billing'?<BillingTestPanel/>:<section className="account-panel account-settings"><span className="account-eyebrow">GOOGLE ACCOUNT</span><div className="settings-profile"><div className="auth-avatar" aria-hidden="true">{shortName[0].toUpperCase()}</div><div><h2>{auth.user.name||'Your account'}</h2><p>{auth.user.email}</p></div></div><dl><div><dt>Sign-in provider</dt><dd>Google</dd></div><div><dt>Browser session</dt><dd>Up to 7 days, until you sign out</dd></div></dl><p>Your profile comes from Google. Signing out ends this browser’s session; other browsers have separate sessions.</p><div className="account-row-actions"><B secondary disabled={auth.signingOut} onClick={signOut}>Sign out on this browser</B><a href="/privacy">Privacy and data requests</a></div></section>}
 <PrivacyNote/></div></main>;
}
function Overview(){
 const cloud=useCloudAccount();
 return <><BillingTestPanel compact/>{cloud.loading?<div className="account-panel" role="status">Loading your workspace…</div>:cloud.error?<div className="account-panel"><Alert tone="error">We could not load cloud credits and tasks. Your free tools are available.</Alert><B secondary onClick={cloud.refresh}>Try again</B></div>:cloud.data&&<>
 <CreditSummary balance={cloud.data.balance}/><section className="account-panel recent-tasks"><div className="account-section-heading"><div><h2>Recent cloud tasks</h2><p>Your latest results, ready when you are.</p></div><a href="/account/tasks">View all tasks<ArrowRight size={16}/></a></div>{cloud.data.jobs.length?cloud.data.jobs.slice(0,3).map(job=><TaskCard key={job.id} job={job} onChange={cloud.refresh}/>):<EmptyTasks/>}</section></>}
 <div className="account-quick-links"><a href="/#poster-editor"><FilePdf size={24} weight="light"/><div><h2>Make a free poster</h2><p>Local PDF exports. No watermark.</p></div><ArrowRight size={18}/></a><a href="/pricing"><Receipt size={24} weight="light"/><div><h2>Find your next option</h2><p>Compare free and cloud processing.</p></div><ArrowRight size={18}/></a></div></>;
}
