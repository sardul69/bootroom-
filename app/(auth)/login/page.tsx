'use client';
import Image from 'next/image';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function Login(){
 const [phone,setPhone]=useState(''); const [status,setStatus]=useState('');
 async function google(){const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/auth/callback`}})}
 async function otp(){const supabase=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);const {error}=await supabase.auth.signInWithOtp({phone});setStatus(error?.message||'OTP sent. Complete verification in the next step.');}
 return <main className="loginWrap"><div className="loginCard"><Image src="/brand/bootroom-logo.png" alt="BOOTROOM" width={150} height={129}/><div className="label">ENTER THE GAME</div><h1 className="display">SIGN IN.</h1><button className="btn" style={{width:'100%'}} onClick={google}>CONTINUE WITH GOOGLE</button><div style={{textAlign:'center',padding:'18px 0',color:'var(--mist)'}}>OR</div><div className="field"><label>Indian mobile number</label><input placeholder="+91 9876543210" value={phone} onChange={e=>setPhone(e.target.value)}/></div><button className="btn green" style={{width:'100%'}} onClick={otp}>SEND OTP</button><p className="muted" style={{fontSize:12}}>{status}</p><div className="notice">Phone OTP requires a configured Supabase SMS provider (for example Twilio, MessageBird or Vonage) before production use.</div></div></main>
}
