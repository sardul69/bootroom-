
"use client";

import { useEffect } from "react";

export default function HomeMotion() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>(".br-home");
    if (!page) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const progress = document.createElement("div");
    progress.className = "br-scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    page.prepend(progress);

    const revealSelectors = [
      ".br-section-heading",
      ".br-game-card",
      ".br-how-heading",
      ".br-step",
      ".br-empty",
      ".br-footer-inner",
      ".br-market-door",
      ".br-host",
    ];

    const revealElements = page.querySelectorAll<HTMLElement>(
      revealSelectors.join(",")
    );

    let observer: IntersectionObserver | null = null;

    if (!reducedMotion && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add("br-is-visible");
            observer?.unobserve(entry.target);
          });
        },
        {
          threshold: 0.12,
          rootMargin: "0px 0px -45px 0px",
        }
      );

      revealElements.forEach((element) => {
        element.classList.add("br-reveal");
        observer?.observe(element);
      });
    } else {
      revealElements.forEach((element) => {
        element.classList.add("br-is-visible");
      });
    }

    const hero = page.querySelector<HTMLElement>(".br-hero");
    const heroImage =
      page.querySelector<HTMLElement>(".br-hero-image");

    let ticking = false;

    const updateScroll = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;

      const percentage =
        scrollable > 0
          ? Math.min(1, Math.max(0, window.scrollY / scrollable))
          : 0;

      progress.style.transform = `scaleX(${percentage})`;

      if (hero && heroImage && !reducedMotion) {
        const rect = hero.getBoundingClientRect();

        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          const offset = Math.max(
            -65,
            Math.min(65, -rect.top * 0.1)
          );

          heroImage.style.setProperty(
            "--br-parallax",
            `${offset}px`
          );
        }
      }

      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateScroll);
    };

    window.addEventListener("scroll", onScroll, {
      passive: true,
    });

    updateScroll();

    const onPointerMove = (event: PointerEvent) => {
      if (
        reducedMotion ||
        !hero ||
        event.pointerType === "touch"
      ) {
        return;
      }

      const bounds = hero.getBoundingClientRect();

      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;

      hero.style.setProperty("--br-pointer-x", `${x * 100}%`);
      hero.style.setProperty("--br-pointer-y", `${y * 100}%`);
    };

    hero?.addEventListener("pointermove", onPointerMove);

    const onPointerLeave = () => {
      hero?.style.setProperty("--br-pointer-x", "50%");
      hero?.style.setProperty("--br-pointer-y", "50%");
    };

    hero?.addEventListener("pointerleave", onPointerLeave);

    return () => {
      observer?.disconnect();

      window.removeEventListener("scroll", onScroll);

      hero?.removeEventListener("pointermove", onPointerMove);
      hero?.removeEventListener("pointerleave", onPointerLeave);

      progress.remove();
    };
  }, []);

  return null;
}
