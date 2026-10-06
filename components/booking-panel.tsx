'use client';
import { useState } from 'react';

export default function BookingPanel({ turfId, hourlyPrice }: { turfId: string; hourlyPrice: number }) {
  const [date,setDate]=useState(''); const [start,setStart]=useState(''); const [end,setEnd]=useState(''); const [status,setStatus]=useState(''); const [bookingId,setBookingId]=useState('');
  const duration = start && end ? Math.max(0,(new Date(`1970-01-01T${end}:00`).getTime()-new Date(`1970-01-01T${start}:00`).getTime())/3600000) : 0;
  const estimatedTotal = Math.round(duration * hourlyPrice);
  async function hold(){
    setStatus('Securing slot…');
    const res=await fetch('/api/bookings/hold',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({turfId,date,start,end})});
    const json=await res.json();
    if(!res.ok){setStatus(json.error||'Unable to secure slot');return}
    setBookingId(json.booking.id); setStatus(`Slot held until ${new Date(json.booking.hold_expires_at).toLocaleTimeString('en-IN')}.`);
  }
  async function pay(){
    setStatus('Creating payment…');
    const res=await fetch('/api/payments/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId})});
    const json=await res.json(); if(!res.ok){setStatus(json.error||'Payment setup failed');return}
    const script=document.createElement('script'); script.src='https://checkout.razorpay.com/v1/checkout.js'; script.onload=()=>{
      const Razorpay=(window as any).Razorpay; const rzp=new Razorpay({key:json.keyId,amount:json.order.amount,currency:'INR',name:'BOOTROOM',description:'Football turf booking',order_id:json.order.id,handler:async(response:any)=>{const v=await fetch('/api/payments/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId,...response})});const j=await v.json();setStatus(v.ok?'Payment verified. Booking confirmed.':j.error||'Payment verification failed');}}); rzp.on('payment.failed',()=>setStatus('Payment failed. Your hold remains temporarily while you retry.')); rzp.open();}; document.body.appendChild(script);
  }
  return <aside className="panel summary"><div className="label">YOUR PITCH</div><h2 className="display">Choose a slot.</h2><div className="field"><label>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="field"><label>Start</label><input type="time" value={start} onChange={e=>setStart(e.target.value)}/></div><div className="field"><label>End</label><input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></div><div className="total"><span>Estimated total</span><span>₹{estimatedTotal || '—'}</span></div><button className="btn green" style={{width:'100%',marginTop:16}} disabled={!date||!start||!end||Boolean(bookingId)} onClick={hold}>HOLD SLOT</button>{bookingId&&<button className="btn primary" style={{width:'100%',marginTop:8}} onClick={pay}>PAY & CLAIM SLOT</button>}<p className="muted" style={{fontSize:12}}>{status}</p><div className="notice">Payment is never trusted from the browser alone. BOOTROOM verifies the Razorpay signature and webhook server-side.</div></aside>
}
