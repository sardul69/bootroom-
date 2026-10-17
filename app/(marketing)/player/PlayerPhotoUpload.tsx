
"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 500 * 1024;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1200;
const BUCKET = "player-photos";

type Props = {
  userId: string;
  currentPhoto: string | null;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This image could not be opened. Try another photo."));
    };

    image.src = objectUrl;
  });
}

async function canvasToWebP(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The image could not be converted to WebP."));
      },
      "image/webp",
      quality
    );
  });
}

async function processPortrait(file: File): Promise<Blob> {
  const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!supportedTypes.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP image.");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Please choose an image smaller than 20 MB.");
  }

  const image = await loadImage(file);

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("This image appears to be empty or invalid.");
  }

  let scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );

  for (let attempt = 0; attempt < 10; attempt++) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    // Make a fresh canvas for every attempt. Resizing a canvas resets its state.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Your browser could not process this image.");
    }

    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    const data = pixels.data;

    // Muted warm monochrome. Keep the image rectangular; no fake
    // background removal or subject segmentation is performed.
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];

      const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
      const muted = gray * 0.88 + 18;

      data[i] = Math.min(255, muted * 1.04);
      data[i + 1] = Math.min(255, muted * 1.0);
      data[i + 2] = Math.min(255, muted * 0.91);
    }

    context.putImageData(pixels, 0, 0);

    // Gently soften only the outer edge of the portrait.
    const edge = Math.max(2, Math.round(Math.min(width, height) * 0.025));
    const feather = context.createImageData(width, height);

    feather.data.set(context.getImageData(0, 0, width, height).data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.min(x, y, width - 1 - x, height - 1 - y);

        if (distance < edge) {
          const alpha = Math.max(0, Math.min(1, distance / edge));
          feather.data[(y * width + x) * 4 + 3] = Math.round(
            feather.data[(y * width + x) * 4 + 3] * alpha
          );
        }
      }
    }

    context.putImageData(feather, 0, 0);

    for (const quality of [0.86, 0.75, 0.64, 0.52, 0.4]) {
      const blob = await canvasToWebP(canvas, quality);

      if (blob.size <= MAX_BYTES) {
        return blob;
      }
    }

    scale *= 0.78;
  }

  throw new Error(
    "This photo could not be compressed below 500 KB. Try a smaller image."
  );
}

export default function PlayerPhotoUpload({
  userId,
  currentPhoto,
  onUploaded,
  onRemoved,
}: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  async function upload(file?: File) {
    if (!file) return;

    setBusy(true);
    setMessage("");
    setMessageIsError(false);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user || user.id !== userId) {
        throw new Error("Please sign in to your own Turfzy account first.");
      }

      const webp = await processPortrait(file);
      const path = `${user.id}/profile.webp`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, webp, {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "3600",
        });

      if (uploadError) {
        if (/mime type|content.?type|not supported/i.test(uploadError.message)) {
          throw new Error(
            "Supabase rejected WebP. Check that the player-photos bucket allows image/webp."
          );
        }

        throw uploadError;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (profileError) throw profileError;

      onUploaded(publicUrl);
      setMessage("Player portrait uploaded successfully.");
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "The photo could not be uploaded. Please try again."
      );
      setMessageIsError(true);
    } finally {
      setBusy(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function removePhoto() {
    if (!currentPhoto) return;

    setBusy(true);
    setMessage("");
    setMessageIsError(false);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user || user.id !== userId) {
        throw new Error("Please sign in to your own Turfzy account first.");
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (profileError) throw profileError;

      onRemoved();

      // Remove the stored object only after the profile update succeeds.
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([`${user.id}/profile.webp`]);

      if (removeError) {
        setMessage(
          "Portrait removed from your profile. The stored file could not be deleted; check storage permissions."
        );
        setMessageIsError(true);
        return;
      }

      setMessage("Player portrait removed.");
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "The photo could not be removed."
      );
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tz-portrait-editor">
      <div className="tz-portrait-preview">
        {currentPhoto ? (
          <img src={currentPhoto} alt="Your uploaded player portrait" />
        ) : (
          <span>NO PHOTO</span>
        )}
      </div>

      <div className="tz-portrait-content">
        <h3>PLAYER PORTRAIT</h3>

        <p>
          Optional. JPEG, PNG and WebP are accepted. Your image is converted
          to warm monochrome WebP and compressed to 500 KB or less.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          disabled={busy}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
          }}
        />

        <button
          type="button"
          className="tz-outline-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy
            ? "PROCESSING PHOTO…"
            : currentPhoto
              ? "CHANGE PHOTO"
              : "CHOOSE PHOTO"}
        </button>

        {currentPhoto && (
          <button
            type="button"
            className="tz-outline-button"
            disabled={busy}
            onClick={() => void removePhoto()}
          >
            REMOVE PHOTO
          </button>
        )}

        {message && (
          <p role={messageIsError ? "alert" : "status"}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
