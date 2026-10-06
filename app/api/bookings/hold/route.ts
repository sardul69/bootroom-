import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({error:'Sign in required'},{status:401});
 const body=await req.json(); if(!body.turfId||!body.date||!body.start||!body.end)return NextResponse.json({error:'Missing booking fields'},{status:400});
 const start=new Date(`${body.date}T${body.start}:00+05:30`); const end=new Date(`${body.date}T${body.end}:00+05:30`); if(!(end>start))return NextResponse.json({error:'End time must be after start time'},{status:400});
 const {data,error}=await supabase.rpc('create_booking_hold',{p_turf_id:body.turfId,p_user_id:user.id,p_start:start.toISOString(),p_end:end.toISOString()});
 if(error)return NextResponse.json({error:error.message},{status:409});
 return NextResponse.json({booking:data});
}
