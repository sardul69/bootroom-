
"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_intensity;

varying vec2 v_uv;

#define PI 3.14159265359

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += noise(p) * amplitude;
    p *= 2.02;
    amplitude *= 0.5;
  }

  return value;
}

float beam(vec2 uv, vec2 origin, float angle, float width, float reach) {
  vec2 direction = vec2(cos(angle), sin(angle));
  vec2 delta = uv - origin;

  float along = dot(delta, direction);
  float across = abs(dot(delta, vec2(-direction.y, direction.x)));

  float taper = 1.0 - smoothstep(reach * 0.72, reach, along);
  float spread = width + max(along, 0.0) * 0.18;

  return exp(-pow(across / max(spread, 0.001), 2.0) * 2.0)
    * smoothstep(0.0, 0.08, along)
    * taper;
}

void main() {
  vec2 uv = v_uv;
  vec2 aspectUV = (uv - 0.5) * vec2(
    u_resolution.x / u_resolution.y,
    1.0
  );

  float time = u_time;

  vec3 color = vec3(0.008, 0.018, 0.012);

  float horizon = smoothstep(0.82, 0.18, uv.y);

  vec2 field = uv * vec2(4.0, 3.0);
  float atmosphere = fbm(field + vec2(time * 0.018, -time * 0.012));

  vec3 emerald = vec3(0.025, 0.24, 0.105);
  vec3 gold = vec3(0.36, 0.23, 0.095);

  float upperGlow = exp(-length(aspectUV - vec2(0.2, 0.25)) * 2.4);
  float sideGlow = exp(-length(aspectUV - vec2(-0.75, 0.05)) * 2.2);

  color += emerald * upperGlow * 0.22;
  color += emerald * sideGlow * 0.12;

  float sweep = beam(
    uv,
    vec2(0.92, 0.95),
    -2.35 + sin(time * 0.12) * 0.08,
    0.035,
    1.25
  );

  float sweep2 = beam(
    uv,
    vec2(0.06, 0.92),
    -0.72 + sin(time * 0.09 + 1.5) * 0.06,
    0.025,
    1.1
  );

  color += vec3(0.28, 0.72, 0.42) * sweep * 0.19;
  color += vec3(0.56, 0.39, 0.18) * sweep2 * 0.09;

  float fieldNoise = fbm(uv * 8.0 + vec2(time * 0.008, time * 0.005));

  color += emerald * fieldNoise * horizon * 0.11;

  vec2 pointerDelta = uv - (u_pointer * 0.5 + 0.5);
  float pointerLight = exp(-length(pointerDelta) * 3.8);

  color += emerald * pointerLight * 0.13 * u_intensity;

  float vignette = smoothstep(1.05, 0.22, length(aspectUV * vec2(0.78, 1.0)));

  color *= vignette;

  float grain = hash(uv * u_resolution + time) - 0.5;
  color += grain * 0.012;

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type);

  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

  if (!vertex || !fragment) return null;

  const program = gl.createProgram();

  if (!program) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

export default function HomeCinematic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;

    if (!canvas || !hero) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });

    if (!gl) return;

    const program = createProgram(gl);

    if (!program) return;

    const positionLocation = gl.getAttribLocation(
      program,
      "a_position"
    );

    const resolutionLocation = gl.getUniformLocation(
      program,
      "u_resolution"
    );

    const timeLocation = gl.getUniformLocation(
      program,
      "u_time"
    );

    const pointerLocation = gl.getUniformLocation(
      program,
      "u_pointer"
    );

    const intensityLocation = gl.getUniformLocation(
      program,
      "u_intensity"
    );

    const buffer = gl.createBuffer();

    if (!buffer) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);

    gl.enableVertexAttribArray(positionLocation);

    gl.vertexAttribPointer(
      positionLocation,
      2,
      gl.FLOAT,
      false,
      0,
      0
    );

    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let startTime = 0;
    let isVisible = true;

    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;

    let intensity = 0;
    let targetIntensity = 0;

    const resize = () => {
      const rect = hero.getBoundingClientRect();

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        window.innerWidth < 700 ? 1.25 : 1.75
      );

      width = rect.width;
      height = rect.height;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    };

    const pointerMove = (event: PointerEvent) => {
      const rect = hero.getBoundingClientRect();

      targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      targetY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      targetIntensity = 1;
    };

    const pointerLeave = () => {
      targetX = 0;
      targetY = 0;
      targetIntensity = 0;
    };

    const render = (timestamp: number) => {
      if (!startTime) startTime = timestamp;

      pointerX += (targetX - pointerX) * 0.045;
      pointerY += (targetY - pointerY) * 0.045;
      intensity += (targetIntensity - intensity) * 0.035;

      const elapsed = reducedMotion
        ? 0
        : (timestamp - startTime) / 1000;

      gl.useProgram(program);

      gl.uniform1f(timeLocation, elapsed);
      gl.uniform2f(pointerLocation, pointerX, pointerY);
      gl.uniform1f(intensityLocation, intensity);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!reducedMotion && isVisible) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hero);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;

      if (isVisible && !reducedMotion) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = window.requestAnimationFrame(render);
      } else {
        window.cancelAnimationFrame(animationFrame);
      }
    });

    visibilityObserver.observe(hero);

    hero.addEventListener("pointermove", pointerMove, {
      passive: true,
    });

    hero.addEventListener("pointerleave", pointerLeave, {
      passive: true,
    });

    if (reducedMotion) {
      render(0);
    } else {
      animationFrame = window.requestAnimationFrame(render);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);

      resizeObserver.disconnect();
      visibilityObserver.disconnect();

      hero.removeEventListener("pointermove", pointerMove);
      hero.removeEventListener("pointerleave", pointerLeave);

      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <section
      ref={heroRef}
      className="br-hero br-cinematic"
    >
      <div className="br-cinematic-image" aria-hidden="true" />
      <video
        className="br-cinematic-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/arrival/cinematic-arrival.mp4" type="video/mp4" />
      </video>

      <div className="br-cinematic-overlay" />

      <canvas
        ref={canvasRef}
        className="br-cinematic-webgl"
        aria-hidden="true"
      />

      <div className="br-cinematic-grain" aria-hidden="true" />

      <div className="br-cinematic-lines" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="br-cinematic-topline">
        <span>
          <i />
          THE FOOTBALL NETWORK
        </span>

        <span>KOLKATA · INDIA</span>
      </div>

      <div className="br-cinematic-content">
        <div className="br-cinematic-overline">
          <span>01</span>
          <span className="br-cinematic-rule" />
          <span>YOUR CITY. YOUR GAME.</span>
        </div>

        <h1 className="br-cinematic-heading">
          <span className="br-heading-line">
            <span>THE CITY</span>
          </span>

          <span className="br-heading-line">
            <span>IS YOUR</span>
          </span>

          <span className="br-heading-line br-heading-green">
            <span>PITCH.</span>
          </span>
        </h1>

        <div className="br-cinematic-bottom">
          <div className="br-cinematic-copy">
            <span className="br-cinematic-copy-index">
              FIND YOUR PLACE IN THE GAME
            </span>

            <p>
              Discover football games. Build your squad.
              Step onto the pitch with people who play for
              the same reason you do.
            </p>
          </div>

          <div className="br-cinematic-actions">
            <Link
              href="/matches"
              className="br-cinematic-primary"
            >
              <span>FIND YOUR GAME</span>
              <span className="br-action-arrow">↗</span>
            </Link>

            <Link
              href="/turfs"
              className="br-cinematic-secondary"
            >
              EXPLORE TURFS
              <span>↗</span>
            </Link>

            <Link
              href="/marketplace"
              className="br-cinematic-market"
            >
              <span className="br-market-symbol">✳</span>
              MARKETPLACE
              <span>↗</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="br-cinematic-right">
        <span>BUILT FOR THE GAME</span>
        <span className="br-cinematic-vertical-line" />
        <span>EST. KOLKATA</span>
      </div>

      <div className="br-cinematic-bottomline">
        <span>NO SIDELINES.</span>
        <span>NO SHORTCUTS.</span>
        <span>JUST FOOTBALL.</span>
      </div>

      <div className="br-cinematic-scroll">
        <span>SCROLL TO EXPLORE</span>
        <i />
      </div>
    </section>
  );
}
