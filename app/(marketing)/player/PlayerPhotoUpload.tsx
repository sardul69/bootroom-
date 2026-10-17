
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 500 * 1024;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1200;
const BUCKET = "player-photos";

const supabase = createClient();

type UploadProps = {
  userId: string;
  currentPhoto: string | null;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened. Try another photo."));
    };

    image.src = url;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

async function processPortrait(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Choose a photo smaller than 20 MB.");
  }

  const image = await loadImage(file);

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("The image has invalid dimensions.");
  }

  const scale = Math.min(
    1,
    MAX_DIMENSION /
      Math.max(image.naturalWidth, image.naturalHeight)
  );

  let width = Math.max(1, Math.round(image.naturalWidth * scale));
  let height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    throw new Error("Image processing is unavailable in this browser.");
  }

  // Retain the original aspect ratio; never stretch the player.
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  // Muted, warm monochrome treatment for the antique gold card.
  const pixels = ctx.getImageData(0, 0, width, height);
  const data = pixels.data;

  for (let i = 0; i < data.length; i += 4) {
    const luminance =
      0.299 * data[i] +
      0.587 * data[i + 1] +
      0.114 * data[i + 2];

    // Slightly warm highlights, subdued saturation and controlled contrast.
    const tone = Math.max(
      0,
      Math.min(255, (luminance - 128) * 0.92 + 128)
    );

    data[i] = Math.min(255, tone * 1.035 + 5);
    data[i + 1] = Math.min(255, tone * 0.99 + 2);
    data[i + 2] = Math.max(0, tone * 0.88);
  }

  ctx.putImageData(pixels, 0, 0);

  // Softly feather the edges. Keep the centre fully opaque.
  const feather = Math.max(
    8,
    Math.round(Math.min(width, height) * 0.045)
  );

  const output = ctx.getImageData(0, 0, width, height);
  const outputData = output.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.min(
        x,
        y,
        width - 1 - x,
        height - 1 - y
      );

      if (distance < feather) {
        const t = Math.max(0, Math.min(1, distance / feather));
        const smooth = t * t * (3 - 2 * t);
        const alphaIndex = (y * width + x) * 4 + 3;

        outputData[alphaIndex] = Math.round(
          outputData[alphaIndex] * smooth
        );
      }
    }
  }

  ctx.putImageData(output, 0, 0);

  // Try progressively smaller quality settings first.
  for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34, 0.26]) {
    const blob = await canvasBlob(canvas, quality);

    if (blob && blob.size <= MAX_BYTES) {
      return blob;
    }
  }

  // If necessary, reduce dimensions proportionally while preserving the finish.
  for (let attempt = 0; attempt < 5; attempt++) {
    width = Math.max(1, Math.round(width * 0.8));
    height = Math.max(1, Math.round(height * 0.8));

    const smaller = document.createElement("canvas");
    smaller.width = width;
    smaller.height = height;

    const smallerCtx = smaller.getContext("2d");

    if (!smallerCtx) {
      throw new Error("Could not resize the image.");
    }

    smallerCtx.drawImage(canvas, 0, 0, width, height);

    for (const quality of [0.6, 0.45, 0.3, 0.2]) {
      const blob = await canvasBlob(smaller, quality);

      if (blob && blob.size <= MAX_BYTES) {
        return blob;
      }
    }

    // Use this smaller image for the next compression attempt.
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(smaller, 0, 0, width, height);
  }

  throw new Error(
    "This photo could not be compressed below 500 KB. Please choose another."
  );
}

export default function PlayerPhotoUpload({
  userId,
  currentPhoto,
  onUploaded,
  onRemoved,
}: UploadProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function verifyUser() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;

    if (!user || user.id !== userId) {
      throw new Error("Please sign in again before changing your portrait.");
    }

    return user;
  }

  async function upload(file?: File) {
    if (!file || busy) return;

    setBusy(true);
    setMessage("");

    try {
      const user = await verifyUser();
      const blob = await processPortrait(file);
      const path = `${user.id}/profile.webp`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, {
          contentType: "image/webp",
          upsert: true,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", user.id);

      if (profileError) {
        throw new Error(
          "The image uploaded, but the profile could not be updated. Please retry."
        );
      }

      onUploaded(`${data.publicUrl}?v=${Date.now()}`);

      setMessage(
        `Portrait saved · ${Math.ceil(blob.size / 1024)} KB`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Upload failed. Please retry."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (busy || !currentPhoto) return;

    setBusy(true);
    setMessage("");

    try {
      const user = await verifyUser();

      // Clear the profile first, so the player can use the default card.
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) throw error;

      onRemoved();

      // Best-effort cleanup; a failed cleanup must not undo photo removal.
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([`${user.id}/profile.webp`]);

      setMessage(
        storageError
          ? "Photo removed from your profile. Temporary storage cleanup may be needed."
          : "Photo removed. Your default card portrait is restored."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not remove the photo."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tz-portrait-editor">
      <div className="tz-portrait-editor__preview">
        {currentPhoto ? (
          <img
            src={currentPhoto}
            alt="Processed player portrait"
          />
        ) : (
          <span>NO PHOTO</span>
        )}
      </div>

      <div className="tz-portrait-editor__content">
        <h3>PLAYER PORTRAIT</h3>

        <p>
          Optional. Your photo is proportionally resized, given a warm
          monochrome finish, softly feathered and compressed to 500 KB or less.
        </p>

        <button
          type="button"
          className="tz-portrait-editor__button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy
            ? "PROCESSING…"
            : currentPhoto
              ? "CHANGE PHOTO"
              : "CHOOSE PHOTO"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void upload(file);
          }}
        />

        {currentPhoto && (
          <button
            type="button"
            className="tz-portrait-editor__secondary"
            disabled={busy}
            onClick={() => void removePhoto()}
          >
            {busy ? "PLEASE WAIT…" : "KEEP DEFAULT — REMOVE PHOTO"}
          </button>
        )}

        {message && (
          <p
            role="status"
            aria-live="polite"
            className="tz-portrait-editor__message"
          >
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
