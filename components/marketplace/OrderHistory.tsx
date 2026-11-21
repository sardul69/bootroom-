"use client";

import { useCallback, useEffect, useState } from "react";

type Message = { id: string; author_role: string; message: string; created_at: string };
type Order = {
  id: string; order_number: string; total_paise: number; status: string;
  fulfillment_status?: string; shipping_carrier?: string; tracking_number?: string;
  created_at: string; items: { id: string; product_name: string; selected_size: string; quantity: number; line_total_paise: number }[];
  messages: Message[];
};

export default function OrderHistory({ owner = false }: { owner?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const api = owner ? "/api/owner/marketplace/support" : "/api/marketplace/orders/history";
  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(api, { cache: "no-store", credentials: "same-origin" });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Unable to load orders.");
      setOrders(data.orders ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load orders."); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function send(orderId: string) {
    const message = (drafts[orderId] ?? "").trim();
    if (!message) return;
    setBusy(orderId); setError("");
    try {
      const r = await fetch(api, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, message })
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Message failed.");
      setDrafts(v => ({ ...v, [orderId]: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Message failed."); }
    finally { setBusy(""); }
  }

  const money = (n: number) => `₹${(Number(n || 0) / 100).toFixed(2)}`;
  const date = (s: string) => new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  return <main className="min-h-screen bg-[#080b09] px-4 py-10 text-[#f4f0e5]">
    <div className="mx-auto max-w-5xl">
      <p className="text-xs tracking-[.35em] text-[#c9a45b]">BOOTROOM / {owner ? "CUSTOMER SUPPORT" : "YOUR PURCHASES"}</p>
      <h1 className="mt-3 text-3xl font-semibold">{owner ? "Marketplace support" : "Your orders."}</h1>
      <p className="mt-2 text-sm text-white/55">{owner ? "Respond to customer questions linked to their orders." : "Track your purchases and contact BOOTROOM about an order."}</p>
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {!orders.length && !error && <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-6 text-white/60">{owner ? "No marketplace orders yet." : "No orders found for this account. Sign in using the same verified email address you entered at checkout."}</div>}
      <div className="mt-8 space-y-5">
        {orders.map(order => <article key={order.id} className="overflow-hidden rounded-2xl border border-[#b99858]/25 bg-[#111713]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <div><p className="text-xs tracking-widest text-[#c9a45b]">{order.order_number}</p><p className="mt-1 text-xs text-white/45">{date(order.created_at)}</p></div>
            <div className="text-right"><p className="font-semibold">{money(order.total_paise)}</p><p className="mt-1 text-xs text-emerald-300">{order.status} · {order.fulfillment_status ?? "Awaiting fulfilment"}</p></div>
          </header>
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <section><h2 className="mb-3 text-xs tracking-widest text-[#c9a45b]">ORDER ITEMS</h2>
              {order.items?.map(item => <div key={item.id} className="flex justify-between gap-3 border-b border-white/5 py-2 text-sm"><span>{item.product_name} {item.selected_size && `· ${item.selected_size}`} × {item.quantity}</span><span>{money(item.line_total_paise)}</span></div>)}
              {order.shipping_carrier && <p className="mt-4 text-sm text-white/65">Courier: {order.shipping_carrier}</p>}
              {order.tracking_number && <p className="mt-1 break-all text-sm text-emerald-300">Tracking: {order.tracking_number}</p>}
            </section>
            <section><h2 className="mb-3 text-xs tracking-widest text-[#c9a45b]">ORDER SUPPORT</h2>
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {order.messages?.map(m => <div key={m.id} className={`rounded-xl p-3 text-sm ${m.author_role === (owner ? "CUSTOMER" : "STAFF") ? "bg-white/[.07]" : "bg-emerald-950/50"}`}>
                  <p className="mb-1 text-[10px] tracking-widest text-[#c9a45b]">{m.author_role === "STAFF" ? "BOOTROOM" : "CUSTOMER"} · {date(m.created_at)}</p>{m.message}
                </div>)}
                {!order.messages?.length && <p className="text-xs text-white/40">No messages yet.</p>}
              </div>
              <textarea value={drafts[order.id] ?? ""} onChange={e => setDrafts(v => ({ ...v, [order.id]: e.target.value }))} maxLength={2000} rows={3} placeholder={owner ? "Write a reply…" : "Ask BOOTROOM about this order…"} className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm outline-none focus:border-[#c9a45b]" />
              <button disabled={busy === order.id || !(drafts[order.id] ?? "").trim()} onClick={() => void send(order.id)} className="mt-2 rounded-lg bg-[#c9a45b] px-4 py-2 text-xs font-bold tracking-wider text-black disabled:opacity-40">{busy === order.id ? "SENDING…" : owner ? "SEND REPLY" : "SEND MESSAGE"}</button>
            </section>
          </div>
        </article>)}
      </div>
    </div>
  </main>;
}
