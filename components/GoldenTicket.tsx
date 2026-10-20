
"use client";

import React from "react";

type GoldenTicketProps = {
  bookingId: string;
  bookingDate?: string | null;
  matchTitle?: string | null;
  venue?: string | null;
  kickoff?: string | null;
  playerFee?: number | null;
  quantity?: number;
  status?: "CONFIRMED" | "PENDING";
};

function formatTicketId(id: string, date?: string | null) {
  // The database serial is authoritative. Never invent an ID here.
  if (/^TZ-\d{4}-\d{6,}$/.test(id)) return id;

  const serial = id.trim();
  if (!/^\d+$/.test(serial)) return id;

  const year = date && !Number.isNaN(Date.parse(date))
    ? new Date(date).getFullYear()
    : new Date().getFullYear();

  return `TZ-${year}-${serial.padStart(6, "0")}`;
}

function dateLabel(value?: string | null) {
  if (!value) return "MATCH ADMISSION";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();
}

export default function GoldenTicket({
  bookingId,
  bookingDate,
  matchTitle,
  venue,
  kickoff,
  playerFee,
  quantity = 1,
  status = "CONFIRMED",
}: GoldenTicketProps) {
  const ticketId = formatTicketId(bookingId, bookingDate);
  const confirmed = status === "CONFIRMED";

  return (
    <section className="gold-ticket-wrap">
      <article
        className="gold-ticket"
        aria-label={`Turfzy booking ticket ${ticketId}`}
      >
        <div className="gt-grain" aria-hidden="true" />
        <div className="gt-border">
          <header className="gt-header">
            <div className="gt-ball" aria-hidden="true">⚽</div>

            <div className="gt-brand">
              <div className="gt-crown">♛</div>
              <div className="gt-wordmark">TURFZY</div>
              <div className="gt-subbrand">FOOTBALL CLUB</div>
              <div className="gt-motto">PEOPLE · TURFS · REAL GAMES</div>
            </div>

            <div className="gt-side-note">
              MORE THAN<br />A GAME
              <span>✦ ✦ ✦</span>
            </div>
          </header>

          <div className="gt-rule">
            <span>✦</span>
          </div>

          <div className="gt-admission">
            <p>OFFICIAL MATCH BOOKING</p>
            <span>ADMIT ONE · PLAY TO BELONG</span>
          </div>

          <div className="gt-serial-panel">
            <div className="gt-serial-label">BOOKING SERIAL · KEEP THIS TICKET</div>
            <div className="gt-serial">{ticketId}</div>
            <div className="gt-serial-stars">★ &nbsp; ★ &nbsp; ★</div>
          </div>

          <div className={`gt-stamp ${confirmed ? "" : "gt-stamp-pending"}`}>
            {confirmed ? "VERIFIED" : "PENDING"}
            <small>{confirmed ? "ENTRY CONFIRMED" : "AWAITING CONFIRMATION"}</small>
          </div>

          <div className="gt-details">
            <div className="gt-detail gt-match">
              <span className="gt-label">MATCH</span>
              <strong>{matchTitle || "TURFZY MATCH DAY"}</strong>
              <span>{dateLabel(bookingDate)}</span>
              {kickoff && <span>{kickoff}</span>}
            </div>

            <div className="gt-detail gt-venue">
              <span className="gt-label">VENUE</span>
              <strong>{venue || "SEE MATCH DETAILS"}</strong>
            </div>

            <div className="gt-detail gt-entry">
              <span className="gt-label">ENTRY</span>
              <strong>{quantity} {quantity === 1 ? "PLAYER" : "PLAYERS"}</strong>
              {typeof playerFee === "number" && (
                <span>₹{playerFee.toLocaleString("en-IN")} / PLAYER</span>
              )}
            </div>
          </div>

          <footer className="gt-footer">
            <div className="gt-barcode" aria-hidden="true">
              {Array.from({ length: 48 }, (_, i) => (
                <i key={i} style={{
                  width: `${[1, 3, 2, 4, 1, 2][i % 6]}px`,
                  opacity: [0.75, 1, 0.55][i % 3],
                }} />
              ))}
            </div>
            <div className="gt-footer-copy">
              <span>OFFICIAL TURFZY ADMISSION</span>
              <strong>FOOTBALL NEVER DIES.</strong>
            </div>
          </footer>
        </div>
      </article>

      <div className="gt-actions">
        <p>
          {confirmed
            ? "Keep this ticket as your proof of booking."
            : "Your ticket becomes valid after payment is verified."}
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="gt-print"
        >
          PRINT / SAVE TICKET
        </button>
      </div>

      <style jsx>{`
        .gold-ticket-wrap {
          width: 100%;
          max-width: 900px;
          margin: 24px auto;
          color: #241609;
        }

        .gold-ticket {
          position: relative;
          overflow: hidden;
          padding: 12px;
          background:
            radial-gradient(ellipse at 15% 10%, #fff0bd 0%, transparent 35%),
            radial-gradient(ellipse at 88% 85%, #b8792c 0%, transparent 32%),
            linear-gradient(125deg, #c99a4d 0%, #f3d99b 22%, #d9b36b 52%, #f0d69a 76%, #a86e2e 100%);
          box-shadow: 0 18px 45px #0008, inset 0 0 30px #71421466;
          clip-path: polygon(
            0 2%, 2% 0, 15% 1%, 31% 0, 48% 1%, 69% 0, 85% 1%, 98% 0,
            100% 3%, 99% 22%, 100% 39%, 99% 60%, 100% 80%, 99% 98%,
            84% 100%, 68% 99%, 49% 100%, 32% 99%, 15% 100%, 1% 98%,
            0 80%, 1% 60%, 0 41%, 1% 20%
          );
        }

        .gt-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .27;
          background-image:
            repeating-linear-gradient(13deg, transparent 0 4px, #58371718 5px 6px),
            repeating-linear-gradient(91deg, transparent 0 13px, #fff3 14px 15px),
            radial-gradient(ellipse at 20% 40%, #51301544 0 1px, transparent 3px),
            radial-gradient(ellipse at 80% 25%, #51301555 0 1px, transparent 4px);
          background-size: auto, auto, 23px 29px, 31px 37px;
        }

        .gt-border {
          position: relative;
          min-width: 0;
          padding: clamp(15px, 3.5vw, 32px);
          border: 1px solid #593919;
          outline: 1px solid #593919;
          outline-offset: -7px;
          background: linear-gradient(145deg, #f2d79b55, #8f5b2522);
        }

        .gt-header {
          display: grid;
          grid-template-columns: minmax(44px, 1fr) 2.6fr minmax(50px, 1fr);
          align-items: center;
          gap: 8px;
          text-align: center;
        }

        .gt-ball {
          font-size: clamp(28px, 5vw, 52px);
          filter: sepia(1) contrast(1.2);
        }

        .gt-crown {
          font-size: 23px;
          line-height: 1;
        }

        .gt-wordmark {
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(32px, 7vw, 66px);
          font-weight: 1000;
          letter-spacing: .04em;
          line-height: .98;
          text-shadow: 1px 2px 0 #f4dba4, 2px 3px 0 #7b4b1f;
        }

        .gt-subbrand {
          font-family: Georgia, serif;
          font-size: clamp(10px, 2vw, 16px);
          letter-spacing: .28em;
          font-weight: 900;
          margin-top: 5px;
        }

        .gt-motto {
          font-family: Georgia, serif;
          font-size: 9px;
          letter-spacing: .2em;
          margin-top: 9px;
        }

        .gt-side-note {
          font: 900 clamp(8px, 1.5vw, 12px)/1.7 Georgia, serif;
          letter-spacing: .14em;
        }

        .gt-side-note span {
          display: block;
          margin-top: 7px;
          letter-spacing: .2em;
        }

        .gt-rule {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 20px 0 10px;
          color: #73461e;
        }

        .gt-rule::before, .gt-rule::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #6f431d;
        }

        .gt-admission {
          text-align: center;
          padding: 4px 0 15px;
        }

        .gt-admission p {
          margin: 0;
          font: 900 clamp(19px, 4.1vw, 37px)/1.2 Georgia, "Times New Roman", serif;
          letter-spacing: .055em;
          overflow-wrap: anywhere;
        }

        .gt-admission span {
          display: block;
          margin-top: 8px;
          font: 700 clamp(8px, 1.5vw, 12px) Georgia, serif;
          letter-spacing: .25em;
        }

        .gt-serial-panel {
          position: relative;
          text-align: center;
          padding: 17px 8px 13px;
          color: #edc778;
          background:
            radial-gradient(ellipse at 50% 0%, #50351d, transparent 80%),
            #21170f;
          border: 2px solid #68421d;
          box-shadow: inset 0 0 0 3px #d4a85b33, 0 5px 0 #6e461e44;
        }

        .gt-serial-label {
          font: 700 10px Georgia, serif;
          letter-spacing: .3em;
        }

        .gt-serial {
          margin: 6px 0 2px;
          font: 900 clamp(23px, 6.5vw, 58px)/1.15 Georgia, "Times New Roman", serif;
          letter-spacing: .04em;
          overflow-wrap: anywhere;
          text-shadow: 0 2px 0 #6c421c;
        }

        .gt-serial-stars {
          font-size: 10px;
          letter-spacing: .3em;
        }

        .gt-stamp {
          position: absolute;
          right: clamp(18px, 5vw, 55px);
          top: 48%;
          z-index: 2;
          transform: rotate(-13deg);
          border: 3px double #8e3020;
          border-radius: 50%;
          padding: 9px 12px;
          color: #8e3020;
          background: #f0d39a55;
          font: 1000 clamp(12px, 2.2vw, 20px) Georgia, serif;
          letter-spacing: .08em;
          text-align: center;
          opacity: .88;
          pointer-events: none;
        }

        .gt-stamp small {
          display: block;
          margin-top: 3px;
          font: 800 7px Georgia, serif;
          letter-spacing: .1em;
        }

        .gt-stamp-pending {
          color: #6b4617;
          border-color: #6b4617;
        }

        .gt-details {
          display: grid;
          grid-template-columns: 1.3fr 1.2fr .8fr;
          margin-top: 24px;
          border-top: 1px solid #805525;
          border-bottom: 1px solid #805525;
        }

        .gt-detail {
          min-width: 0;
          padding: 13px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: Georgia, serif;
          overflow-wrap: anywhere;
        }

        .gt-detail + .gt-detail {
          border-left: 1px solid #80552588;
        }

        .gt-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .18em;
        }

        .gt-detail strong {
          font-size: clamp(11px, 1.8vw, 15px);
          text-transform: uppercase;
        }

        .gt-detail span:not(.gt-label) {
          font-size: 11px;
        }

        .gt-footer {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 12px;
          padding-top: 16px;
        }

        .gt-barcode {
          display: flex;
          align-items: stretch;
          height: 35px;
          max-width: 48%;
          overflow: hidden;
          gap: 2px;
        }

        .gt-barcode i {
          display: block;
          flex: 0 0 auto;
          background: #342111;
        }

        .gt-footer-copy {
          display: flex;
          flex-direction: column;
          text-align: right;
          gap: 6px;
          font-family: Georgia, serif;
        }

        .gt-footer-copy span {
          font-size: 8px;
          letter-spacing: .12em;
        }

        .gt-footer-copy strong {
          font-size: clamp(11px, 2vw, 15px);
          letter-spacing: .12em;
        }

        .gt-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 2px;
          color: #b8b8b8;
          font-size: 13px;
        }

        .gt-actions p { margin: 0; }

        .gt-print {
          flex-shrink: 0;
          border: 1px solid #b88b43;
          border-radius: 3px;
          padding: 11px 14px;
          color: #f1d39b;
          background: #17130e;
          font-weight: 800;
          font-size: 11px;
          letter-spacing: .08em;
          cursor: pointer;
        }

        .gt-print:hover { background: #302115; }

        @media (max-width: 520px) {
          .gold-ticket { padding: 7px; }
          .gt-border { padding: 17px 12px; }
          .gt-header { grid-template-columns: 35px minmax(0, 1fr) 43px; gap: 4px; }
          .gt-ball { font-size: 25px; }
          .gt-motto { font-size: 7px; letter-spacing: .08em; }
          .gt-side-note { font-size: 7px; letter-spacing: .06em; }
          .gt-admission span { letter-spacing: .1em; }
          .gt-serial-label { font-size: 8px; letter-spacing: .12em; }
          .gt-stamp { right: 16px; top: 47%; padding: 6px; }
          .gt-stamp small { font-size: 6px; }
          .gt-details { grid-template-columns: 1fr 1fr; }
          .gt-entry { grid-column: 1 / -1; border-top: 1px solid #80552588; }
          .gt-details .gt-entry { border-left: 0; }
          .gt-detail { padding: 10px 7px; }
          .gt-footer-copy span { font-size: 7px; }
          .gt-actions { align-items: stretch; flex-direction: column; }
          .gt-print { width: 100%; }
        }

        @media print {
          :global(body) { background: white !important; }
          .gold-ticket-wrap { max-width: none; margin: 0; }
          .gold-ticket { box-shadow: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .gt-actions { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `}</style>
    </section>
  );
}
