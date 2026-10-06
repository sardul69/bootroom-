# BOOTROOM

Premium football turf booking and football community platform, Kolkata-first.

## What is included

- Premium BOOTROOM visual shell using the supplied logo with the subtitle removed.
- Next.js 16.3.8 + React 19.3.0 + TypeScript 7.0.2.
- Supabase SSR auth foundation.
- Google OAuth and phone OTP UI.
- Supabase/Postgres booking model with PostgreSQL exclusion constraint preventing overlapping active holds/bookings.
- Booking hold RPC.
- Razorpay order creation, signature verification and webhook verification/idempotency foundation.
- Turf discovery and turf detail pages.
- Owner onboarding launch page.
- No fabricated Kolkata venues, prices, ratings or availability.

## Important production blockers

This repository is not magically connected to your external accounts. Before public booking is enabled, create/configure:

1. Supabase project and run `supabase/migrations/0001_bootroom.sql`.
2. Google Cloud project and Maps JavaScript API/Routes API as required by the live map features.
3. Supabase Google provider.
4. Supabase phone auth with a supported SMS provider and Indian sender/template compliance as applicable.
5. Razorpay merchant account, test keys, then production keys and webhook.
6. Interakt account/templates/webhook.
7. Brevo sender/domain/API configuration.
8. Vercel project and production environment variables.
9. Verified real turf inventory.
10. Domain `bootroom.in` if acquired.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open http://localhost:3000.

## Supabase

Run the migration in the Supabase SQL editor or through the Supabase CLI. Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

After creating an owner, add the OWNER role through a trusted admin path. Do not use client-side role checks as authorization.

## Razorpay

The application uses Razorpay's documented Orders API through server-side HTTPS calls and verifies checkout signatures server-side. The webhook route verifies `X-Razorpay-Signature` and persists provider event IDs with a uniqueness constraint.

Configure webhook URL:

`https://YOUR_DOMAIN/api/webhooks/razorpay`

Use the webhook secret only on the server.

## Phone OTP

Supabase Auth requires a configured SMS provider for phone auth. Choose a provider supported by your Supabase plan/project and complete the provider's India-specific sender/template/compliance requirements.

## Maps

The current code uses a Google Maps directions fallback link. Add the interactive Maps JavaScript/Places/Routes components after creating the Google Cloud project and restricting the browser key by production origin.

## Going live

Do not publish until:

- a real venue has been verified and activated;
- a real turf has an accurate price and schedule;
- Razorpay test payments and webhook replay tests pass;
- concurrent booking tests pass;
- refund/reconciliation procedures are tested;
- notification providers are configured;
- privacy/terms/cancellation policy pages are approved;
- owner/admin accounts are configured.
