import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import BookingPanel from '@/components/booking-panel';

export default async function TurfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: turf } = await supabase.from('turfs').select('*,venues(*)').eq('id', id).eq('active', true).single();
  if (!turf) notFound();
  return <main className="page"><div className="container">
    <div className="label">{turf.venues?.locality} · Kolkata</div><h1 className="display">{turf.venues?.name}<br/><span className="gold">{turf.name}</span></h1>
    <div className="detailGrid"><div><div className="card"><div className="cardImage" style={{height:320}}/><div className="cardBody"><div className="meta"><span className="tag">{turf.format}</span><span className="tag">{turf.surface}</span>{turf.indoor && <span className="tag">Indoor</span>}{turf.floodlights && <span className="tag">Floodlights</span>}</div><p className="muted">{turf.description || 'Venue information will appear here once verified by the owner.'}</p></div></div><div className="panel" style={{marginTop:18}}><div className="label">Location</div><h3>{turf.venues?.address}</h3><a className="btn" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(turf.venues?.address || '')}`}>GET DIRECTIONS</a></div></div><BookingPanel turfId={turf.id} hourlyPrice={Number(turf.starting_price || 0)} /></div>
  </div></main>
}
