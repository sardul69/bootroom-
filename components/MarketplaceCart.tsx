"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Script from "next/script";
import {
  MarketplaceCartItem,
  marketplaceCartEventName,
  readMarketplaceCart,
  writeMarketplaceCart,
} from "@/lib/marketplace/cart";

type Customer = {
  name: string;
  email: string;
  phone: string;
};

type Delivery = {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  note: string;
};

const initialCustomer: Customer = { name: "", email: "", phone: "" };
const initialDelivery: Delivery = {
  address: "",
  city: "",
  state: "",
  postalCode: "",
  note: "",
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export default function MarketplaceCart() {
  const [cart, setCart] = useState<MarketplaceCartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [customer, setCustomer] = useState(initialCustomer);
  const [delivery, setDelivery] = useState(initialDelivery);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const refresh = () => setCart(readMarketplaceCart());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(marketplaceCartEventName(), refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(marketplaceCartEventName(), refresh);
    };
  }, []);

  const totalQuantity = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0),
    [cart]
  );

  function updateCart(next: MarketplaceCartItem[]) {
    setCart(next);
    writeMarketplaceCart(next);
  }

  function changeQuantity(index: number, delta: number) {
    const next = [...cart];
    const quantity = next[index].quantity + delta;
    if (quantity < 1) next.splice(index, 1);
    else if (quantity <= 10) next[index] = { ...next[index], quantity };
    updateCart(next);
  }

  async function startPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!cart.length) {
      setMessage("Your bag is empty.");
      return;
    }

    if (!scriptReady || !window.Razorpay) {
      setMessage("Secure checkout is still loading. Please try again.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/marketplace/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          delivery,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            size: item.size,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Unable to create your order.");
      }

      const razorpay = new window.Razorpay({
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: "BOOTROOM",
        description: `Marketplace order ${result.orderNumber}`,
        order_id: result.razorpayOrderId,
        prefill: result.customer,
        theme: { color: "#c9a45b" },
        modal: {
          ondismiss: () => setBusy(false),
          confirm_close: true,
        },
        handler: async (payment: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verification = await fetch("/api/marketplace/orders/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: result.orderId,
                razorpayOrderId: payment.razorpay_order_id,
                razorpayPaymentId: payment.razorpay_payment_id,
                razorpaySignature: payment.razorpay_signature,
              }),
            });

            const confirmed = await verification.json();

            if (!verification.ok || !confirmed.ok || !confirmed.orderConfirmed) {
              throw new Error(
                confirmed.error ||
                "Payment status is being checked. Do not pay again."
              );
            }

            writeMarketplaceCart([]);
            setCart([]);
            setSuccess(confirmed.orderNumber);
            setCheckout(false);
            setMessage("");
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Payment verification is pending. Do not pay again."
            );
          } finally {
            setBusy(false);
          }
        },
      });

      razorpay.on("payment.failed", (failure: unknown) => {
        const description =
          typeof failure === "object" && failure !== null &&
          "error" in failure &&
          typeof failure.error === "object" && failure.error !== null &&
          "description" in failure.error
            ? String(failure.error.description)
            : "Payment was not completed.";
        setMessage(description);
        setBusy(false);
      });

      razorpay.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setCheckout(false);
    setMessage("");
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => setMessage("Secure payment service could not be loaded.")}
      />

      <button
        type="button"
        className="br-cart-trigger"
        onClick={() => setOpen(true)}
        aria-label={`Open shopping bag, ${totalQuantity} items`}
      >
        <span className="br-cart-trigger-icon">BAG</span>
        <span>YOUR BAG</span>
        <motion.b key={totalQuantity} initial={{ scale: .65 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>{totalQuantity}</motion.b>
      </button>

      {<AnimatePresence>{open && (
        <motion.div className="br-cart-backdrop" onMouseDown={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }}>
          <motion.aside
            className="br-cart-panel"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Shopping bag"
            role="dialog"
            aria-modal="true"
            initial={{ x: 70, opacity: .7 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 70, opacity: .7 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <header className="br-cart-header">
              <div>
                <span className="br-cart-kicker">BOOTROOM / THE COLLECTION</span>
                <h2>{success ? "ORDER RECEIVED" : checkout ? "SECURE CHECKOUT" : "YOUR BAG"}</h2>
              </div>
              <button type="button" onClick={close} aria-label="Close bag">×</button>
            </header>

            {success ? (
              <section className="br-cart-success">
                <div className="br-success-mark">✓</div>
                <span>PAYMENT CONFIRMED</span>
                <h3>Your order is in.</h3>
                <p>Your BOOTROOM order reference:</p>
                <strong>{success}</strong>
                <p className="br-success-note">
                  Keep this reference for your records. Your order details have
                  been submitted securely.
                </p>
                <button type="button" onClick={close}>CONTINUE EXPLORING</button>
              </section>
            ) : !checkout ? (
              <>
                <div className="br-cart-body">
                  {!cart.length ? (
                    <div className="br-cart-empty">
                      <span>THE COLLECTION AWAITS</span>
                      <h3>Your bag is empty.</h3>
                      <p>Explore the official BOOTROOM collection.</p>
                    </div>
                  ) : cart.map((item, index) => (
                    <article className="br-cart-item" key={`${item.productId}-${item.size}`}>
                      <div className="br-cart-image">
                        <img src={item.imageUrl} alt={item.name} />
                      </div>
                      <div className="br-cart-item-info">
                        <span>OFFICIAL COLLECTION</span>
                        <h3>{item.name}</h3>
                        {item.size && <small>SIZE · {item.size}</small>}
                        <strong>{money(item.pricePaise)}</strong>
                        <div className="br-cart-quantity">
                          <button type="button" onClick={() => changeQuantity(index, -1)} aria-label="Decrease quantity">−</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => changeQuantity(index, 1)} aria-label="Increase quantity">+</button>
                          <button className="br-cart-remove" type="button" onClick={() => changeQuantity(index, -item.quantity)}>REMOVE</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <footer className="br-cart-footer">
                  <div className="br-cart-total">
                    <span>SUBTOTAL</span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <p>Shipping calculated at checkout. Prices are verified against the live catalogue.</p>
                  <button
                    type="button"
                    disabled={!cart.length}
                    onClick={() => { setCheckout(true); setMessage(""); }}
                  >
                    PROCEED TO CHECKOUT <span>→</span>
                  </button>
                  <button className="br-cart-continue" type="button" onClick={close}>CONTINUE SHOPPING</button>
                </footer>
              </>
            ) : (
              <form className="br-checkout-form" onSubmit={startPayment}>
                <button className="br-checkout-back" type="button" onClick={() => { setCheckout(false); setMessage(""); }}>
                  ← BACK TO BAG
                </button>

                <section>
                  <span className="br-cart-kicker">01 / CUSTOMER DETAILS</span>
                  <label>FULL NAME<input required maxLength={100} autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></label>
                  <label>EMAIL ADDRESS<input required type="email" maxLength={254} autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></label>
                  <label>PHONE NUMBER<input required type="tel" maxLength={20} autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></label>
                </section>

                <section>
                  <span className="br-cart-kicker">02 / DELIVERY ADDRESS</span>
                  <label>ADDRESS<input required maxLength={500} autoComplete="street-address" value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} /></label>
                  <div className="br-checkout-grid">
                    <label>CITY<input required maxLength={100} autoComplete="address-level2" value={delivery.city} onChange={(e) => setDelivery({ ...delivery, city: e.target.value })} /></label>
                    <label>STATE<input required maxLength={100} autoComplete="address-level1" value={delivery.state} onChange={(e) => setDelivery({ ...delivery, state: e.target.value })} /></label>
                  </div>
                  <label>PIN CODE<input required maxLength={20} autoComplete="postal-code" value={delivery.postalCode} onChange={(e) => setDelivery({ ...delivery, postalCode: e.target.value })} /></label>
                  <label>DELIVERY INSTRUCTIONS <small>OPTIONAL</small><textarea maxLength={500} rows={3} value={delivery.note} onChange={(e) => setDelivery({ ...delivery, note: e.target.value })} /></label>
                </section>

                <div className="br-checkout-summary">
                  <span>ORDER SUBTOTAL</span><strong>{money(subtotal)}</strong>
                  <small>Shipping currently free. Final amount is confirmed by the server.</small>
                </div>

                {message && <p className="br-cart-error" role="alert">{message}</p>}

                <button className="br-pay-button" type="submit" disabled={busy || !scriptReady || !cart.length}>
                  {busy ? "PREPARING SECURE PAYMENT…" : !scriptReady ? "LOADING SECURE CHECKOUT…" : "PAY SECURELY WITH RAZORPAY"}
                </button>
                <p className="br-checkout-security">SECURE PAYMENT · RAZORPAY · INR</p>
              </form>
            )}
          </motion.aside>
        </motion.div>
      )}</AnimatePresence>}

      <style jsx global>{`
        .br-cart-trigger {
          position: fixed; z-index: 70; right: 20px; bottom: 22px;
          display:flex; align-items:center; gap:11px; min-height:52px;
          padding:0 17px; border:1px solid #c9a45b; background:#0b0d0b;
          color:#e9dfca; font-size:9px; font-weight:900; letter-spacing:1.5px;
          cursor:pointer; box-shadow:0 12px 35px #0009;
        }
        .br-cart-trigger-icon { color:#c9a45b; }
        .br-cart-trigger { transition: transform .25s ease, box-shadow .25s ease, background .25s ease; }
        .br-cart-trigger:hover { transform: translateY(-3px); box-shadow:0 16px 42px #000c, 0 0 24px #c9a45b22; background:#15150f; }
        .br-cart-trigger b {
          display:grid; place-items:center; width:22px; height:22px;
          border-radius:50%; background:#c9a45b; color:#090907; font-size:10px;
        }
        .br-cart-backdrop {
          position:fixed; inset:0; z-index:100; display:flex;
          justify-content:flex-end; background:#000b; backdrop-filter:blur(7px);
        }
        .br-cart-panel {
          width:min(100%,510px); height:100%; display:flex; flex-direction:column;
          overflow-y:auto; background:#0b0d0b; color:#f0eadc;
          border-left:1px solid #8f7542; box-shadow:-25px 0 80px #0009;
          animation:brPanelIn .28s ease-out;
        }
        @keyframes brPanelIn { from { transform:translateX(35px); opacity:.5 } to { transform:translateX(0); opacity:1 } }
        .br-cart-header {
          position:sticky; top:0; z-index:2; display:flex; align-items:center;
          justify-content:space-between; padding:24px 25px;
          background:#0b0d0bf2; border-bottom:1px solid #3a3325;
        }
        .br-cart-kicker { color:#c9a45b; font-size:8px; font-weight:900; letter-spacing:2px; }
        .br-cart-header h2 { margin:9px 0 0; font:500 27px Georgia,serif; letter-spacing:1px; }
        .br-cart-header > button {
          width:38px; height:38px; border:1px solid #55472e; background:transparent;
          color:#d9c9a5; font-size:25px; cursor:pointer;
        }
        .br-cart-body { flex:1; padding:12px 25px; }
        .br-cart-item { display:grid; grid-template-columns:104px 1fr; gap:17px; padding:20px 0; border-bottom:1px solid #302b22; }
        .br-cart-image { aspect-ratio:4/5; overflow:hidden; background:#171713; }
        .br-cart-image img { width:100%; height:100%; object-fit:cover; transition:transform .65s cubic-bezier(.2,.75,.25,1); }
        .br-cart-item:hover .br-cart-image img { transform:scale(1.06); }
        .br-cart-item-info > span { color:#a58b59; font-size:7px; letter-spacing:1.5px; }
        .br-cart-item-info h3 { margin:7px 0; font:500 18px Georgia,serif; }
        .br-cart-item-info small { display:block; margin:5px 0; color:#a79d89; font-size:9px; }
        .br-cart-item-info > strong { display:block; margin:9px 0; color:#d6bd89; font-size:14px; }
        .br-cart-quantity { display:flex; align-items:center; gap:12px; }
        .br-cart-quantity button:not(.br-cart-remove) { width:27px; height:27px; border:1px solid #615238; background:transparent; color:#e7d8b8; cursor:pointer; }
        .br-cart-quantity span { font-size:11px; }
        .br-cart-remove { margin-left:auto; border:0; background:transparent; color:#a48e64; font-size:8px; letter-spacing:1px; cursor:pointer; }
        .br-cart-footer { position:sticky; bottom:0; padding:22px 25px; border-top:1px solid #403724; background:#10120ff5; }
        .br-cart-total { display:flex; justify-content:space-between; align-items:center; }
        .br-cart-total span { color:#bda36f; font-size:9px; letter-spacing:1.5px; }
        .br-cart-total strong { font:500 25px Georgia,serif; }
        .br-cart-footer > p { color:#8e887a; font-size:10px; line-height:1.6; }
        .br-cart-footer > button:first-of-type,.br-pay-button,.br-cart-success > button {
          width:100%; min-height:53px; border:1px solid #d2b779;
          background:linear-gradient(110deg,#b28c4d,#e0c98e,#b28c4d);
          color:#11100c; font-size:9px; font-weight:950; letter-spacing:1.5px; cursor:pointer;
        }
        .br-cart-footer > button:disabled,.br-pay-button:disabled { opacity:.45; cursor:not-allowed; }
        .br-cart-footer > button span { float:right; font-size:16px; }
        .br-cart-continue { display:block; margin:15px auto 0; border:0; background:none; color:#a99a7a; font-size:8px; letter-spacing:1.5px; cursor:pointer; }
        .br-cart-empty { padding:100px 10px; text-align:center; }
        .br-cart-empty span,.br-cart-success > span { color:#c9a45b; font-size:9px; letter-spacing:2px; }
        .br-cart-empty h3,.br-cart-success h3 { font:500 29px Georgia,serif; }
        .br-cart-empty p,.br-cart-success p { color:#a59e90; font-size:11px; line-height:1.7; }
        .br-checkout-form { padding:20px 25px 35px; }
        .br-checkout-back { margin-bottom:25px; border:0; background:none; color:#c9a45b; font-size:8px; letter-spacing:1.5px; cursor:pointer; }
        .br-checkout-form section { display:grid; gap:13px; margin-bottom:27px; }
        .br-checkout-form section > .br-cart-kicker { margin-bottom:3px; }
        .br-checkout-form label { display:grid; gap:7px; color:#bda36f; font-size:8px; font-weight:850; letter-spacing:1.3px; }
        .br-checkout-form label small { display:inline; color:#7f796d; }
        .br-checkout-form input,.br-checkout-form textarea {
          width:100%; min-height:44px; box-sizing:border-box; padding:11px 12px;
          border:1px solid #403a2e; border-radius:0; outline:none;
          background:#11130f; color:#f1eadb; font:12px Arial,sans-serif;
        }
        .br-checkout-form input:focus,.br-checkout-form textarea:focus { border-color:#c9a45b; }
        .br-checkout-form textarea { resize:vertical; }
        .br-checkout-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .br-checkout-summary { display:grid; grid-template-columns:1fr auto; gap:9px; padding:17px; margin-bottom:17px; border:1px solid #3b3324; }
        .br-checkout-summary span { color:#bda36f; font-size:9px; letter-spacing:1px; }
        .br-checkout-summary strong { font-size:18px; }
        .br-checkout-summary small { grid-column:1/-1; color:#8f887a; font-size:9px; line-height:1.5; }
        .br-cart-error { padding:12px; border:1px solid #8d493e; color:#efb2a6; font-size:11px; line-height:1.6; }
        .br-checkout-security { text-align:center; color:#8d846f; font-size:8px; letter-spacing:1.5px; }
        .br-cart-success { margin:auto; padding:35px; text-align:center; }
        .br-success-mark { display:grid; place-items:center; width:65px; height:65px; margin:0 auto 25px; border:1px solid #c9a45b; border-radius:50%; color:#d9bd7c; font-size:29px; }
        .br-cart-success > strong { display:block; margin:18px 0; padding:15px; border:1px solid #51432a; color:#dfc58e; letter-spacing:1px; }
        .br-cart-success .br-success-note { margin:20px 0 28px; }
        @media(max-width:600px) {
          .br-cart-trigger { right:12px; bottom:13px; min-height:47px; padding:0 13px; }
          .br-cart-header { padding:19px; }
          .br-cart-body { padding:8px 18px; }
          .br-cart-footer { padding:18px; }
          .br-checkout-form { padding:18px 19px 30px; }
        }
        @media(prefers-reduced-motion:reduce) {
          .br-cart-panel { animation:none; }
          .br-cart-trigger, .br-cart-image img { transition:none; }
        }
      `}</style>
    </>
  );
}
