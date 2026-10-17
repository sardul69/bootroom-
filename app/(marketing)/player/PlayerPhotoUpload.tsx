
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 500 * 1024;
const supabase = createClient();

export default function PlayerPhotoUpload({
  userId,
  currentPhoto,
  onUploaded,
}: {
  userId: string;
  currentPhoto: string | null;
  onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function processPhoto(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Choose a JPG, PNG or WebP image.");
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error("Choose an image smaller than 15 MB.");
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not read this image."));
        img.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        900 / Math.max(image.naturalWidth, image.naturalHeight)
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image processing is unavailable.");

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality)
        );
        if (blob && blob.size <= MAX_BYTES) return blob;
      }

      throw new Error(
        "This image could not fit under 500 KB. Please choose another photo."
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function upload(file?: File) {
    if (!file || busy) return;

    setBusy(true);
    setMessage("");

    try {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user || user.id !== userId) {
        throw new Error("Please sign in again to upload your photo.");
      }

      const blob = await processPhoto(file);
      const path = `${user.id}/profile.webp`;

      const { error: uploadError } = await supabase.storage
        .from("player-photos")
        .upload(path, blob, {
          contentType: "image/webp",
          upsert: true,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("player-photos")
        .getPublicUrl(path);

      const photoUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", user.id);

      if (profileError) throw profileError;

      onUploaded(photoUrl);
      setMessage(`Photo uploaded successfully (${Math.ceil(blob.size / 1024)} KB).`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Upload failed. Please retry."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: 16,
      margin: "16px 0",
      background: "#10100e",
      border: "1px solid #78643a",
      color: "#f1e7ce",
    }}>
      {currentPhoto ? (
        <img
          src={currentPhoto}
          alt="Player portrait"
          width={76}
          height={90}
          style={{ objectFit: "cover", border: "1px solid #dfc17e" }}
        />
      ) : (
        <div style={{
          width: 76,
          height: 90,
          display: "grid",
          placeItems: "center",
          border: "1px solid #78643a",
          color: "#dfc17e",
          fontSize: 11,
        }}>
          PLAYER
        </div>
      )}

      <div>
        <strong>PLAYER PORTRAIT</strong>
        <p style={{ color: "#aaa49a", fontSize: 12 }}>
          JPG, PNG or WebP · maximum 500 KB after compression
        </p>
        <label style={{
          display: "inline-block",
          padding: "10px 14px",
          border: "1px solid #dfc17e",
          cursor: busy ? "wait" : "pointer",
          fontSize: 12,
        }}>
          {busy ? "PROCESSING…" : "CHOOSE PHOTO"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              void upload(file);
            }}
          />
        </label>
        {message && <p role="status" style={{ fontSize: 12 }}>{message}</p>}
      </div>
    </section>
  );
}
