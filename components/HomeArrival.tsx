
"use client";

import { useEffect, useRef, useState } from "react";

export default function HomeArrival() {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const navigation = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;

    let show = false;

    try {
      const key = "bootroom-cinematic-arrival-seen";

      show =
        navigation?.type === "reload" ||
        !sessionStorage.getItem(key);

      if (show) sessionStorage.setItem(key, "1");
    } catch {
      show = true;
    }

    setVisible(show);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const video = videoRef.current;
    if (!video) {
      setVisible(false);
      return;
    }

    // Never leave visitors trapped behind the intro.
    const fallback = window.setTimeout(() => {
      setVisible(false);
    }, 12000);

    video.currentTime = 0;

    video.play().catch(() => {
      setVisible(false);
    });

    return () => window.clearTimeout(fallback);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`br-arrival-screen ${
        ready ? "is-playing" : "is-loading"
      }`}
      role="presentation"
    >
      <video
        ref={videoRef}
        className="br-arrival-video"
        src="/arrival/cinematic-arrival.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setReady(true)}
        onEnded={() => setVisible(false)}
        onError={() => setVisible(false)}
      />

      <div className="br-arrival-shade" />

      {!ready && (
        <div className="br-arrival-loading">
          <span className="br-arrival-pulse" />
          <p>ENTERING THE GAME</p>
        </div>
      )}
    </div>
  );
}
