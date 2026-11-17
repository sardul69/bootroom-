"use client";

import { useEffect, useRef, useState } from "react";

const DURATION = 7600;

type Star = {
  x: number;
  y: number;
  z: number;
  size: number;
};

export default function HomeArrival() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) {
      setVisible(false);
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = 0;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let lastProgress = -1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = Array.from({ length: Math.min(240, Math.floor(width * height / 4800)) }, () => ({
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z: Math.random() * width + 1,
        size: Math.random() * 1.5 + 0.25,
      }));
    };

    const polygon = (points: [number, number][], fill: string | CanvasGradient | CanvasPattern) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const line = (points: [number, number][], color: string, thickness = 1) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.stroke();
    };

    const render = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / (reduced ? 1500 : DURATION));
      if (Math.abs(p - lastProgress) > 0.012) {
        lastProgress = p;
        setProgress(p);
      }

      const t = reduced ? 1 : p;
      const w = width;
      const h = height;
      const cx = w / 2;
      const horizon = h * (0.43 - Math.min(1, t * 1.7) * 0.12);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#02040b");
      bg.addColorStop(0.48, "#07151b");
      bg.addColorStop(1, "#020805");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Distant stars accelerate toward the camera during descent.
      const starAlpha = 1 - Math.max(0, (t - 0.34) * 2.2);
      if (starAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = starAlpha;
        for (const star of stars) {
          if (!reduced) star.z -= 1.8 + t * 15;
          if (star.z <= 1) {
            star.x = (Math.random() - 0.5) * w * 2;
            star.y = (Math.random() - 0.5) * h * 2;
            star.z = w;
          }
          const sx = cx + (star.x / star.z) * w * 0.65;
          const sy = h * 0.42 + (star.y / star.z) * h * 0.65;
          const r = Math.max(0.3, (1 - star.z / w) * star.size * 2);
          ctx.fillStyle = "#d8e9e9";
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Atmospheric limb.
      const atmosphere = ctx.createRadialGradient(cx, horizon, 2, cx, horizon, w * 0.62);
      atmosphere.addColorStop(0, `rgba(45, 178, 153, ${0.05 + t * 0.17})`);
      atmosphere.addColorStop(0.48, `rgba(17, 100, 103, ${0.07 + t * 0.15})`);
      atmosphere.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (t - 0.12) * 3.2));
      const glow = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, w * 0.5);
      glow.addColorStop(0, "rgba(111, 225, 190, .25)");
      glow.addColorStop(0.35, "rgba(28, 128, 108, .13)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Stadium bowl and floodlight arrays emerge from the darkness.
      const stadiumIn = Math.max(0, Math.min(1, (t - 0.32) * 3.8));
      if (stadiumIn > 0) {
        ctx.save();
        ctx.globalAlpha = stadiumIn;
        const leftX = w * 0.13;
        const rightX = w * 0.87;
        const lightY = h * 0.43;

        for (const side of [leftX, rightX]) {
          const beam = ctx.createLinearGradient(side, lightY, cx, h);
          beam.addColorStop(0, "rgba(211,239,225,.20)");
          beam.addColorStop(1, "rgba(36,176,113,0)");
          polygon([[side - w * .12, lightY], [side + w * .12, lightY], [cx + w * .26, h], [cx - w * .26, h]], beam);

          const lamp = ctx.createRadialGradient(side, lightY, 1, side, lightY, w * .11);
          lamp.addColorStop(0, "rgba(255,255,244,1)");
          lamp.addColorStop(.08, "rgba(223,255,239,.85)");
          lamp.addColorStop(1, "rgba(130,255,197,0)");
          ctx.fillStyle = lamp;
          ctx.fillRect(side - w * .12, lightY - w * .12, w * .24, w * .24);

          for (let i = -3; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(side + i * 7, lightY + Math.abs(i) * 1.4, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = "#f4fff5";
            ctx.fill();
          }
        }

        // Stadium roof silhouette.
        line([[0, h * .53], [w * .12, h * .45], [w * .28, h * .49], [cx, h * .44], [w * .72, h * .49], [w * .88, h * .45], [w, h * .53]], "rgba(145,190,164,.45)", 2);
        ctx.restore();
      }

      // Pitch rushes forward and resolves into a marked football field.
      const pitchIn = Math.max(0, Math.min(1, (t - 0.53) * 3.2));
      if (pitchIn > 0) {
        ctx.save();
        ctx.globalAlpha = pitchIn;
        const topY = h * (0.59 - pitchIn * 0.04);
        const bottomY = h * 1.14;
        const topW = w * 0.19;
        const bottomW = w * 0.78;

        const field = ctx.createLinearGradient(0, topY, 0, bottomY);
        field.addColorStop(0, "#163c2c");
        field.addColorStop(.5, "#0d3020");
        field.addColorStop(1, "#07190f");
        polygon([[cx - topW, topY], [cx + topW, topY], [cx + bottomW, bottomY], [cx - bottomW, bottomY]], field);

        // Mowing bands.
        for (let i = 0; i < 8; i++) {
          const y1 = topY + (bottomY - topY) * i / 8;
          const y2 = topY + (bottomY - topY) * (i + 1) / 8;
          const spread1 = topW + (bottomW - topW) * i / 8;
          const spread2 = topW + (bottomW - topW) * (i + 1) / 8;
          if (i % 2 === 0) {
            polygon([[cx-spread1,y1],[cx+spread1,y1],[cx+spread2,y2],[cx-spread2,y2]], "rgba(89,151,91,.10)");
          }
        }

        const white = "rgba(224,245,222,.62)";
        line([[cx-topW,topY],[cx+topW,topY],[cx+bottomW,bottomY],[cx-bottomW,bottomY],[cx-topW,topY]], white, 1.5);
        line([[cx,topY],[cx,bottomY]], white, 1);
        ctx.beginPath();
        ctx.ellipse(cx, topY + (bottomY-topY)*.51, w*.105, h*.105, 0, 0, Math.PI*2);
        ctx.strokeStyle = white;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Goal at the far end.
        const goalW = w * .075;
        const goalY = topY + h * .012;
        line([[cx-goalW,goalY+h*.035],[cx-goalW,goalY],[cx+goalW,goalY],[cx+goalW,goalY+h*.035]], "rgba(236,255,236,.72)", 2);
        ctx.restore();
      }

      // Cinematic vignette.
      const vignette = ctx.createRadialGradient(cx, h*.48, h*.12, cx, h*.48, Math.max(w,h)*.75);
      vignette.addColorStop(.35, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,.82)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0,0,w,h);

      if (p < 1) {
        frame = requestAnimationFrame(render);
      } else {
        window.setTimeout(() => setVisible(false), 500);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="br-arrival" role="status" aria-label="Entering BOOTROOM">
      <canvas ref={canvasRef} className="br-arrival-canvas" />
      <div className="br-arrival-vignette" />
      <div className="br-arrival-top">
        <span><i /> LIVE FROM THE CITY</span>
        <span>KOLKATA · INDIA</span>
      </div>
      <div className="br-arrival-center">
        <div className="br-arrival-crest">
          <img src="/brand/bootroom-logo.png" alt="" />
        </div>
        <div className="br-arrival-wordmark">BOOTROOM</div>
        <div className="br-arrival-tagline">THE CITY IS YOUR PITCH.</div>
        <div className="br-arrival-progress">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="br-arrival-caption">PREPARING THE PITCH</div>
      </div>
      <div className="br-arrival-bottom">
        <span>YOUR CITY. YOUR SQUAD. YOUR GAME.</span>
        <button type="button" onClick={() => setVisible(false)}>SKIP INTRO ↗</button>
      </div>
    </div>
  );
}
