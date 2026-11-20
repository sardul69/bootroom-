"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type OrderItem = Record<string, unknown>;

type MarketplaceOrder = {
  id: string;
  order_number?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_postal_code?: string;
  delivery_note?: string;
  subtotal_paise?: number;
  shipping_paise?: number;
  total_paise?: number;
  currency?: string;
  status?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  hold_expires_at?: string;
  created_at?: string;
  paid_at?: string;
  fulfillment_status?: string;
  shipping_carrier?: string;
  tracking_number?: string;
  shipped_at?: string;
  delivered_at?: string;
  items: OrderItem[];
};

const filters = [
  "ALL",
  "PENDING",
  "PAID",
  "RECONCILIATION_REQUIRED",
  "EXPIRED",
] as const;

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function date(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function itemName(item: OrderItem) {
  return String(
    item.product_name ??
    item.product_title ??
    item.title ??
    item.name ??
    "Marketplace item"
  );
}

function statusStyle(status?: string) {
  switch (status) {
    case "PAID":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "RECONCILIATION_REQUIRED":
      return "border-amber-400/30 bg-amber-400/10 text-amber-300";
    case "EXPIRED":
      return "border-white/10 bg-white/5 text-white/45";
    default:
      return "border-sky-400/25 bg-sky-400/10 text-sky-300";
  }
}

export default function OwnerMarketplaceOrders() {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [savingOrder, setSavingOrder] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ status: filter });

      if (search.trim()) params.set("q", search.trim());

      const response = await fetch(
        `/api/owner/marketplace/orders?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "Unable to load orders.");
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const handle = window.setTimeout(() => void loadOrders(), 250);
    return () => window.clearTimeout(handle);
  }, [loadOrders]);

  const updateFulfillment = async (
    order: MarketplaceOrder,
    nextStatus: "PROCESSING" | "SHIPPED" | "DELIVERED"
  ) => {
    setSavingOrder(order.id);
    setActionMessage("");
    setError("");

    try {
      const response = await fetch("/api/owner/marketplace/orders", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          nextStatus,
          carrier: carrier.trim(),
          trackingNumber: trackingNumber.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "Could not update fulfilment.");
      }

      setActionMessage(`${order.order_number || "Order"} updated to ${nextStatus}.`);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fulfilment update failed.");
    } finally {
      setSavingOrder(null);
    }
  };

  const stats = useMemo(() => {
    const paid = orders.filter((order) => order.status === "PAID").length;
    const pending = orders.filter((order) => order.status === "PENDING").length;
    const attention = orders.filter(
      (order) => order.status === "RECONCILIATION_REQUIRED"
    ).length;

    const revenue = orders
      .filter((order) => order.status === "PAID")
      .reduce((sum, order) => sum + Number(order.total_paise || 0), 0);

    return { paid, pending, attention, revenue };
  }, [orders]);

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-white/[0.09] bg-[#090d0c] text-white shadow-[0_25px_100px_rgba(0,0,0,.3)]">
      <div className="relative overflow-hidden border-b border-white/[0.08] px-5 py-6 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-28 h-64 w-64 rounded-full bg-emerald-500/[0.10] blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-400">
              BOOTROOM / COMMERCE
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Order command
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/45">
              Monitor marketplace payments, customer orders and inventory exceptions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold tracking-wide text-white/75 transition hover:border-emerald-400/40 hover:text-white disabled:opacity-40"
          >
            {loading ? "SYNCING…" : "↻  REFRESH"}
          </button>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Paid orders", value: stats.paid, color: "text-emerald-300" },
            { label: "Pending", value: stats.pending, color: "text-sky-300" },
            { label: "Needs attention", value: stats.attention, color: "text-amber-300" },
            { label: "Paid value", value: money(stats.revenue), color: "text-white" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.07] bg-black/25 p-4"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                {stat.label}
              </p>
              <p className={`mt-2 text-xl font-semibold tracking-tight ${stat.color}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order number, customer or email…"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/50"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[10px] font-semibold tracking-[0.12em] transition ${
                filter === value
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 text-white/45 hover:border-white/25 hover:text-white/75"
              }`}
            >
              {value.replaceAll("_", " ")}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {actionMessage && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-300">
            {actionMessage}
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center">
            <p className="text-sm font-medium text-white/70">No orders found</p>
            <p className="mt-1 text-xs text-white/35">
              Orders matching this search will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {orders.map((order, index) => {
                const isExpanded = expanded === order.id;

                return (
                  <motion.article
                    key={order.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.2) }}
                    className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : order.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left transition hover:bg-white/[0.025] sm:p-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold tracking-wide text-white">
                            {order.order_number || order.id.slice(0, 8)}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] ${statusStyle(order.status)}`}>
                            {(order.status || "UNKNOWN").replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm text-white/65">
                          {order.customer_name || "Customer"}
                        </p>
                        <p className="mt-1 text-[11px] text-white/30">
                          {date(order.created_at)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-semibold text-white">
                          {money(order.total_paise)}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-widest text-white/30">
                          {order.items?.length ?? 0} line items
                        </p>
                      </div>

                      <span className="ml-1 text-white/35">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="grid gap-5 border-t border-white/[0.07] p-4 sm:grid-cols-2 sm:p-5">
                            <div>
                              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                                Customer
                              </p>
                              <p className="text-sm text-white">{order.customer_name || "—"}</p>
                              <p className="mt-1 break-all text-xs text-white/50">{order.customer_email || "—"}</p>
                              <p className="mt-1 text-xs text-white/50">{order.customer_phone || "—"}</p>
                            </div>

                            <div>
                              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                                Delivery
                              </p>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/75">
                                {order.delivery_address || "—"}
                              </p>
                              <p className="mt-1 text-xs text-white/45">
                                {[order.delivery_city, order.delivery_state, order.delivery_postal_code]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                              {order.delivery_note && (
                                <p className="mt-2 text-xs text-white/40">
                                  Note: {order.delivery_note}
                                </p>
                              )}
                            </div>

                            <div className="sm:col-span-2">
                              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                                Order items
                              </p>

                              <div className="space-y-2">
                                {(order.items || []).map((item, itemIndex) => (
                                  <div
                                    key={String(item.id ?? itemIndex)}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-3"
                                  >
                                    <div>
                                      <p className="text-sm text-white/80">{itemName(item)}</p>
                                      <p className="mt-1 text-[11px] text-white/40">
                                        {item.selected_size || item.size
                                          ? `Size: ${String(item.selected_size ?? item.size)} · `
                                          : ""}
                                        Qty: {String(item.quantity ?? 1)}
                                      </p>
                                    </div>
                                    <p className="text-sm font-medium text-white/75">
                                      {money(item.line_total_paise ?? item.total_paise)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="sm:col-span-2">
                              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                                Payment record
                              </p>
                              <div className="grid gap-3 rounded-xl bg-black/25 p-3 sm:grid-cols-2">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                                    Razorpay order
                                  </p>
                                  <p className="mt-1 break-all text-xs text-white/65">
                                    {order.razorpay_order_id || "Not attached"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                                    Razorpay payment
                                  </p>
                                  <p className="mt-1 break-all text-xs text-white/65">
                                    {order.razorpay_payment_id || "Not captured"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                                    Created
                                  </p>
                                  <p className="mt-1 text-xs text-white/65">{date(order.created_at)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-white/30">
                                    Paid at
                                  </p>
                                  <p className="mt-1 text-xs text-white/65">{date(order.paid_at)}</p>
                                </div>
                              </div>
                            </div>

                            <div className="sm:col-span-2 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                                    Fulfilment
                                  </p>
                                  <p className="mt-1 text-sm text-white/75">
                                    {(order.fulfillment_status || "UNFULFILLED").replaceAll("_", " ")}
                                  </p>
                                </div>
                                {order.status !== "PAID" && (
                                  <span className="text-[11px] text-white/35">
                                    Payment must be confirmed before fulfilment.
                                  </span>
                                )}
                              </div>

                              {order.status === "PAID" && (
                                <div className="mt-4 space-y-3">
                                  {(order.fulfillment_status === "UNFULFILLED" ||
                                    !order.fulfillment_status) && (
                                    <button
                                      type="button"
                                      disabled={savingOrder === order.id}
                                      onClick={() => void updateFulfillment(order, "PROCESSING")}
                                      className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
                                    >
                                      {savingOrder === order.id ? "SAVING…" : "START PROCESSING"}
                                    </button>
                                  )}

                                  {order.fulfillment_status === "PROCESSING" && (
                                    <>
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <input
                                          value={carrier}
                                          onChange={(event) => setCarrier(event.target.value)}
                                          maxLength={100}
                                          placeholder="Courier / shipping partner"
                                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                                        />
                                        <input
                                          value={trackingNumber}
                                          onChange={(event) => setTrackingNumber(event.target.value)}
                                          maxLength={150}
                                          placeholder="Tracking number"
                                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        disabled={
                                          savingOrder === order.id ||
                                          !carrier.trim() ||
                                          !trackingNumber.trim()
                                        }
                                        onClick={() => void updateFulfillment(order, "SHIPPED")}
                                        className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20 disabled:opacity-40"
                                      >
                                        {savingOrder === order.id ? "SAVING…" : "MARK AS SHIPPED"}
                                      </button>
                                    </>
                                  )}

                                  {order.fulfillment_status === "SHIPPED" && (
                                    <div className="space-y-3">
                                      <div className="text-xs text-white/50">
                                        Courier: {order.shipping_carrier || "—"}
                                        <br />
                                        Tracking: {order.tracking_number || "—"}
                                      </div>
                                      <button
                                        type="button"
                                        disabled={savingOrder === order.id}
                                        onClick={() => void updateFulfillment(order, "DELIVERED")}
                                        className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
                                      >
                                        {savingOrder === order.id ? "SAVING…" : "MARK AS DELIVERED"}
                                      </button>
                                    </div>
                                  )}

                                  {order.fulfillment_status === "DELIVERED" && (
                                    <p className="text-xs font-medium text-emerald-300">
                                      Order delivered · {date(order.delivered_at)}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {order.status === "RECONCILIATION_REQUIRED" && (
                              <div className="sm:col-span-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
                                <p className="text-xs font-semibold text-amber-300">
                                  Manual reconciliation required
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-100/55">
                                  Do not ask the customer to pay again. Verify the Razorpay payment and inventory before resolving this order.
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
