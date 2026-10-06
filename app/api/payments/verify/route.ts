import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpaySignature } from '@/lib/payments/razorpay';

export async function POST(req: Request){
 const authClient=await createClient(); const {data:{user}}=await authClient.auth.getUser(); if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 const supabase=createAdminClient();
 const body=await req.json(); const ok=verifyRazorpaySignature(body.razorpay_order_id,body.razorpay_payment_id,body.razorpay_signature); if(!ok)return NextResponse.json({error:'Invalid payment signature'},{status:400});
 const {data:payment}=await supabase.from('payments').select('*').eq('provider_order_id',body.razorpay_order_id).eq('user_id',user.id).single(); if(!payment)return NextResponse.json({error:'Payment record not found'},{status:404});
 await supabase.rpc('finalize_paid_booking',{p_booking_id:payment.booking_id,p_provider_payment_id:body.razorpay_payment_id,p_signature:body.razorpay_signature});
 return NextResponse.json({ok:true});
}
