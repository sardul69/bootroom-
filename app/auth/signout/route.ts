
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.redirect(
      new URL("/profile?signout=error", request.url),
      { status: 303 }
    );
  }

  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });

  response.cookies.set("owner_console_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
