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
    if (!video) return;

    video.currentTime = 0;
    video.play().catch(() => {
      // Keep the cinematic screen visible rather than silently skipping it.
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`br-arrival-screen ${ready ? "is-playing" : "is-loading"}`}
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
