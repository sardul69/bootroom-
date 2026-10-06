import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function TurfsPage({ searchParams }: { searchParams: Promise<{ q?: string; format?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('turfs').select('id,name,format,surface,indoor,starting_price,venues!inner(name,locality)').eq('active', true).order('name');
  if (params.q) query = query.ilike('venues.locality', `%${params.q}%`);
  if (params.format) query = query.eq('format', params.format);
  const { data, error } = await query;
  const turfs = data ?? [];
  return <main className="page"><div className="container">
    <div className="label">Kolkata · verified inventory</div><h1 className="display">CLAIM THE PITCH.</h1><p className="muted">Only venues actually present in BOOTROOM's database appear here.</p>
    <form className="toolbar"><input name="q" placeholder="Locality" defaultValue={params.q}/><select name="format" defaultValue={params.format ?? ''}><option value="">All formats</option><option>5v5</option><option>6v6</option><option>7v7</option><option>8v8</option><option>11v11</option></select><button className="btn green">Filter</button></form>
    {error ? <div className="empty">Unable to load turf inventory. Check Supabase configuration.</div> : turfs.length === 0 ? <div className="empty"><strong>No verified turfs are live yet.</strong><br/>Owners can onboard venues from the owner console.</div> : <div className="cards">{turfs.map((t:any)=><Link className="card" href={`/turfs/${t.id}`} key={t.id}><div className="cardImage"/><div className="cardBody"><div className="label">{t.venues?.locality}</div><div className="cardTitle">{t.venues?.name} · {t.name}</div><div className="meta"><span className="tag">{t.format}</span><span className="tag">{t.surface}</span>{t.indoor && <span className="tag">Indoor</span>}</div><div className="priceRow"><div className="price">₹{t.starting_price ?? '—'} <small>/ hour</small></div><span className="btn">View</span></div></div></Link>)}</div>}
  </div></main>
}
