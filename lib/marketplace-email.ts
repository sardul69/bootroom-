type MarketplaceEmail = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  orderNumber: string;
    idempotencyKey: string;
tracking?: string;
};

export async function sendMarketplaceEmail(email: MarketplaceEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from || !email.to) {
    console.warn("[marketplace-email] Missing configuration or recipient.");
    return { sent: false };
  }

  const html = `
    <div style="background:#080b09;padding:36px 16px;font-family:Arial,sans-serif;color:#f4f0e5">
      <div style="max-width:560px;margin:auto;border:1px solid #26372d;padding:32px">
        <p style="color:#c5a45c;letter-spacing:4px;font-size:12px">BOOTROOM</p>
        <h1 style="font-size:25px">${email.heading}</h1>
        <p style="color:#c5c9c4;line-height:1.7">${email.message}</p>
        <p style="margin-top:28px;color:#c5a45c">ORDER ${email.orderNumber}</p>
        ${email.tracking ? `<p style="color:#c5c9c4">Tracking: ${email.tracking}</p>` : ""}
        <hr style="border:0;border-top:1px solid #26372d;margin:28px 0">
        <p style="color:#858d86;font-size:11px;letter-spacing:2px">YOUR CITY. YOUR SQUAD. YOUR GAME.</p>
      </div>
    </div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[marketplace-email] Resend rejected email:", response.status);
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error("[marketplace-email] Delivery request failed:", error);
    return { sent: false };
  }
}
