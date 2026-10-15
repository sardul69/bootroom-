
import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

let browserClient: SupabaseBrowserClient | undefined;

/**
 * Creates one Supabase browser client per browser runtime.
 *
 * Security principles:
 * - Uses only the public publishable key.
 * - Never uses a service-role or secret key in browser code.
 * - Reuses the existing Supabase auth session.
 * - Fails closed when required configuration is missing.
 * - Keeps client creation centralized.
 *
 * IMPORTANT:
 * Authorization must be enforced by Supabase RLS and database
 * permissions. This client is not an authorization boundary.
 */
export function createClient(): SupabaseBrowserClient {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase browser configuration is missing. Check your environment variables."
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.hostname !== "localhost" &&
    parsedUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error("Supabase must use HTTPS outside local development.");
  }

  browserClient = createBrowserClient(url, publishableKey);

  return browserClient;
}
