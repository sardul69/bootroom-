import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
async function saveProfile(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();
  if (!fullName || fullName.length > 80) {
    redirect("/profile/edit?error=name");
  }
  if (avatarUrl) {
    try {
      const url = new URL(avatarUrl);
      if (url.protocol !== "https:") {
        redirect("/profile/edit?error=avatar");
      }
    } catch {
      redirect("/profile/edit?error=avatar");
    }
  }
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        avatar_url: avatarUrl || null,
      },
      { onConflict: "id" }
    );
  if (error) redirect("/profile/edit?error=save");
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  redirect("/profile?updated=1");
}
export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const params = await searchParams;
  const name =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "";
  const errorMessages: Record<string, string> = {
    name: "Enter a name of up to 80 characters.",
    avatar: "Use a valid HTTPS image URL.",
    save: "We couldn't save your changes. Please try again.",
  };
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 18px 120px",
        color: "#f7f1ff",
        background:
          "radial-gradient(ellipse at 12% 0%, #492343 0%, transparent 42%), radial-gradient(ellipse at 100% 35%, #124e43 0%, transparent 38%), linear-gradient(145deg, #09080f, #17101f 55%, #07130f)",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link
          href="/profile"
          style={{
            color: "#c5f6dc",
            textDecoration: "none",
            fontSize: 13,
            letterSpacing: 2,
          }}
        >
          ← BACK TO PROFILE
        </Link>
        <p
          style={{
            color: "#c5a8e8",
            letterSpacing: 4,
            fontSize: 11,
            marginTop: 38,
          }}
        >
          TURFZY / YOUR IDENTITY
        </p>
        <h1
          style={{
            fontSize: "clamp(38px, 8vw, 62px)",
            lineHeight: 1,
            letterSpacing: -2,
            margin: "12px 0",
          }}
        >
          EDIT YOUR
          <br />
          PROFILE.
        </h1>
        <p style={{ color: "#bcb4c9", lineHeight: 1.7 }}>
          Your identity on and off the pitch.
        </p>
        <form
          action={saveProfile}
          style={{
            marginTop: 30,
            padding: "26px 22px",
            border: "1px solid rgba(211,185,239,.24)",
            borderRadius: 24,
            background: "rgba(255,255,255,.055)",
            boxShadow: "0 24px 80px rgba(0,0,0,.25)",
            backdropFilter: "blur(18px)",
          }}
        >
          {params.error && (
            <p
              role="alert"
              style={{
                color: "#ffb4c2",
                background: "rgba(255,80,120,.1)",
                padding: 12,
                borderRadius: 12,
              }}
            >
              {errorMessages[params.error] ??
                "Something went wrong. Please try again."}
            </p>
          )}
          <label
            htmlFor="full_name"
            style={{ display: "block", marginBottom: 9, fontSize: 13 }}
          >
            FULL NAME
          </label>
          <input
            id="full_name"
            name="full_name"
            defaultValue={name}
            required
            maxLength={80}
            autoComplete="name"
            placeholder="Your full name"
            style={fieldStyle}
          />
          <label
            htmlFor="email"
            style={{
              display: "block",
              margin: "22px 0 9px",
              fontSize: 13,
            }}
          >
            EMAIL ADDRESS
          </label>
          <input
            id="email"
            value={user.email ?? ""}
            readOnly
            aria-readonly="true"
            style={{ ...fieldStyle, opacity: 0.65 }}
          />
          <p style={{ color: "#bcb4c9", fontSize: 12, marginTop: 7 }}>
            Your sign-in email is read-only here.
          </p>
          <label
            htmlFor="avatar_url"
            style={{
              display: "block",
              margin: "22px 0 9px",
              fontSize: 13,
            }}
          >
            PROFILE PHOTO URL
          </label>
          <input
            id="avatar_url"
            name="avatar_url"
            type="url"
            defaultValue={profile?.avatar_url ?? ""}
            placeholder="https://example.com/your-photo.jpg"
            autoComplete="url"
            style={fieldStyle}
          />
          <p style={{ color: "#bcb4c9", fontSize: 12, marginTop: 7 }}>
            Optional. Paste a direct HTTPS image URL.
          </p>
          <button
            type="submit"
            style={{
              width: "100%",
              marginTop: 28,
              padding: "16px 20px",
              border: "1px solid rgba(255,255,255,.35)",
              borderRadius: 15,
              color: "#101016",
              fontWeight: 800,
              letterSpacing: 1.5,
              background:
                "linear-gradient(105deg, #e7c7ff, #a7ffe0 55%, #d8ffad)",
              cursor: "pointer",
            }}
          >
            SAVE CHANGES
          </button>
        </form>
      </div>
    </main>
  );
}
const fieldStyle = {
  boxSizing: "border-box" as const,
  width: "100%",
  padding: "15px 14px",
  color: "#f7f1ff",
  background: "rgba(5,5,12,.5)",
  border: "1px solid rgba(211,185,239,.24)",
  borderRadius: 12,
  outline: "none",
  fontSize: 15,
};