import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder } from '@/lib/payments/razorpay';

export async function POST(req: Request){
 const authClient=await createClient(); const {data:{user}}=await authClient.auth.getUser(); if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 const supabase=createAdminClient();
 const {bookingId}=await req.json(); if(!bookingId)return NextResponse.json({error:'bookingId required'},{status:400});
 const {data:booking,error}=await supabase.from('bookings').select('id,user_id,total_amount,status').eq('id',bookingId).single();
 if(error||!booking||booking.user_id!==user.id)return NextResponse.json({error:'Booking not found'},{status:404});
 if(!['HELD','PAYMENT_PENDING'].includes(booking.status))return NextResponse.json({error:'Booking is not payable'},{status:409});
 const order=await createRazorpayOrder({amount:Math.round(Number(booking.total_amount)*100),receipt:booking.id,notes:{booking_id:booking.id,user_id:user.id}});
 await supabase.from('payments').upsert({booking_id:booking.id,user_id:user.id,provider:'razorpay',provider_order_id:order.id,amount:booking.total_amount,status:'CREATED'},{onConflict:'booking_id'});
 await supabase.from('bookings').update({status:'PAYMENT_PENDING'}).eq('id',booking.id);
 return NextResponse.json({keyId:process.env.RAZORPAY_KEY_ID,order});
}
