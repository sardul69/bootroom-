import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpayWebhook } from '@/lib/payments/razorpay';

export async function POST(req: Request){
 const raw=await req.text(); const signature=req.headers.get('x-razorpay-signature')||''; if(!verifyRazorpayWebhook(raw,signature))return NextResponse.json({error:'Invalid signature'},{status:400});
 const event=req.headers.get('x-razorpay-event-id')||crypto.randomUUID(); const payload=JSON.parse(raw); const admin=createAdminClient();
 const {error:insertError}=await admin.from('payment_events').insert({provider:'razorpay',provider_event_id:event,event_type:payload.event,payload}); if(insertError && !insertError.message.toLowerCase().includes('duplicate'))return NextResponse.json({error:'Could not persist event'},{status:500});
 const paymentEntity=payload?.payload?.payment?.entity; const orderId=paymentEntity?.order_id; if(orderId){const {data:payment}=await admin.from('payments').select('booking_id').eq('provider_order_id',orderId).single(); if(payment){if(payload.event==='payment.captured')await admin.rpc('finalize_paid_booking',{p_booking_id:payment.booking_id,p_provider_payment_id:paymentEntity.id,p_signature:null}); if(payload.event==='payment.failed')await admin.from('payments').update({status:'FAILED',provider_payment_id:paymentEntity.id}).eq('booking_id',payment.booking_id);}}
 return NextResponse.json({ok:true});
}
