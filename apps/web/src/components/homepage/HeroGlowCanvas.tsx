'use client';

import { useEffect, useRef } from 'react';
import { HEALTH_STATE_METADATA, type HealthVisualState } from '@/lib/valo-theme';

interface HeroGlowCanvasProps {
  state: HealthVisualState;
}

interface RingGeometry {
  cx: number;
  cy: number;
  radius: number;
}

const RING_STOPS: Record<HealthVisualState, readonly string[]> = {
  'prime-readiness': [
    'var(--valo-active)',
    'var(--valo-accent-cool)',
    'var(--valo-prime)',
    'var(--valo-accent-warm)',
  ],
  'active-recovery': [
    'var(--valo-active)',
    'var(--valo-accent-cool)',
    'var(--valo-prime)',
    'var(--valo-active)',
  ],
  'metabolic-sluggish': [
    'var(--valo-sluggish)',
    'var(--valo-accent-warm)',
    'var(--valo-prime)',
    'var(--valo-sluggish)',
  ],
  'glycogen-depleted': [
    'var(--valo-depleted)',
    'var(--valo-sluggish)',
    'var(--valo-prime)',
    'var(--valo-depleted)',
  ],
};

export function HeroGlowCanvas({ state }: HeroGlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (navigator.userAgent.includes('jsdom')) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const resolve = (value: string) =>
      value.startsWith('var(')
        ? css.getPropertyValue(value.slice(4, -1)).trim()
        : value;
    const primeColor = resolve(HEALTH_STATE_METADATA[state].cssVar);
    const stops = RING_STOPS[state].map(resolve);

    const stars = Array.from({ length: 180 }, (_, index) => {
      const seed = (index * 9301 + 49297) % 233280;
      const seedB = (index * 19333 + 731) % 104729;
      return {
        x: seed / 233280,
        y: seedB / 104729,
        size: 0.42 + ((index * 37) % 100) / 128,
        phase: (index * 0.61) % (Math.PI * 2),
      };
    });

    let frame = 0;
    let raf = 0;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const getRingGeometry = (): RingGeometry | null => {
      const ring = canvas.parentElement?.querySelector<HTMLElement>('[data-valo-ring="true"]');
      if (!ring) return null;

      const canvasRect = canvas.getBoundingClientRect();
      const ringRect = ring.getBoundingClientRect();
      return {
        cx: ringRect.left - canvasRect.left + ringRect.width / 2,
        cy: ringRect.top - canvasRect.top + ringRect.height / 2,
        radius: Math.min(ringRect.width, ringRect.height) / 2,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;

      const ring = getRingGeometry();
      if (!ring) return;

      const curveEdgeY = Math.min(height, ring.cy + ring.radius * 0.66);
      const curveControlY = Math.min(height + ring.radius * 0.14, ring.cy + ring.radius * 1.52);
      const starFieldBottom = Math.min(height, (curveEdgeY + curveControlY) / 2);

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#020205';
      ctx.fillRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#020205');
      bg.addColorStop(0.56, '#030407');
      bg.addColorStop(1, '#111118');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, starFieldBottom);

      const pulse = media.matches ? 0 : Math.sin(frame * 0.018) * 0.5 + 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, Math.max(0, ring.cy - ring.radius * 0.82), width, starFieldBottom);
      ctx.clip();
      fillEllipticalGlow(ctx, {
        cx: ring.cx,
        cy: ring.cy + ring.radius * 0.82,
        rx: Math.max(width * 0.72, ring.radius * 2.55),
        ry: ring.radius * 1.34,
        stops: [
          [0, colorWithAlpha(primeColor, 0.52 + pulse * 0.06)],
          [0.42, colorWithAlpha(primeColor, 0.34)],
          [0.72, colorWithAlpha(primeColor, 0.14)],
          [1, 'rgba(17,17,24,0)'],
        ],
      });
      fillEllipticalGlow(ctx, {
        cx: ring.cx,
        cy: ring.cy + ring.radius * 0.36,
        rx: ring.radius * 1.24,
        ry: ring.radius * 1.08,
        stops: [
          [0, 'rgba(3,6,9,0.74)'],
          [0.7, 'rgba(3,6,9,0.46)'],
          [1, 'rgba(3,6,9,0)'],
        ],
      });
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.radius - 5, 0, Math.PI * 2);
      ctx.clip();

      const innerHorizonLeft = ring.cx - ring.radius * 1.05;
      const innerHorizonRight = ring.cx + ring.radius * 1.05;
      const innerHorizonEdgeY = ring.cy + ring.radius * 0.45;
      const innerHorizonControlY = ring.cy + ring.radius * 0.82;

      ctx.beginPath();
      ctx.moveTo(innerHorizonLeft, innerHorizonEdgeY);
      ctx.quadraticCurveTo(
        ring.cx,
        innerHorizonControlY,
        innerHorizonRight,
        innerHorizonEdgeY,
      );
      ctx.lineTo(innerHorizonRight, ring.cy + ring.radius * 1.18);
      ctx.lineTo(innerHorizonLeft, ring.cy + ring.radius * 1.18);
      ctx.closePath();
      const innerGlow = ctx.createLinearGradient(
        0,
        innerHorizonEdgeY,
        0,
        ring.cy + ring.radius,
      );
      innerGlow.addColorStop(0, colorWithAlpha(primeColor, 0.08));
      innerGlow.addColorStop(0.5, colorWithAlpha(primeColor, 0.24));
      innerGlow.addColorStop(1, colorWithAlpha(primeColor, 0.38));
      ctx.fillStyle = innerGlow;
      ctx.shadowBlur = 18;
      ctx.shadowColor = colorWithAlpha(primeColor, 0.3);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(innerHorizonLeft, ring.cy - ring.radius);
      ctx.lineTo(innerHorizonLeft, innerHorizonEdgeY);
      ctx.quadraticCurveTo(
        ring.cx,
        innerHorizonControlY,
        innerHorizonRight,
        innerHorizonEdgeY,
      );
      ctx.lineTo(innerHorizonRight, ring.cy - ring.radius);
      ctx.closePath();
      const innerSky = ctx.createLinearGradient(
        0,
        ring.cy - ring.radius,
        0,
        innerHorizonControlY,
      );
      innerSky.addColorStop(0, 'rgba(2,2,5,0.82)');
      innerSky.addColorStop(0.74, 'rgba(2,2,5,0.58)');
      innerSky.addColorStop(1, 'rgba(2,2,5,0.16)');
      ctx.fillStyle = innerSky;
      ctx.fill();
      ctx.restore();

      for (const star of stars) {
        const alpha = 0.22 + Math.sin(frame * 0.035 + star.phase) * 0.16;
        ctx.fillStyle = `rgba(255,255,255,${media.matches ? 0.36 : alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * starFieldBottom, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, curveEdgeY);
      ctx.quadraticCurveTo(
        ring.cx,
        curveControlY,
        width,
        curveEdgeY,
      );
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      const foreground = ctx.createLinearGradient(0, curveEdgeY, width, height);
      foreground.addColorStop(0, '#13131e');
      foreground.addColorStop(0.72, '#151622');
      foreground.addColorStop(1, '#251f4d');
      ctx.fillStyle = foreground;
      ctx.shadowBlur = 26;
      ctx.shadowColor = colorWithAlpha(primeColor, 0.42);
      ctx.fill();
      ctx.restore();

      const rotation = media.matches ? -0.4 : frame * 0.006;
      const ringGradient = ctx.createConicGradient(rotation - Math.PI * 0.18, ring.cx, ring.cy);
      for (let i = 0; i <= stops.length; i += 1) {
        ringGradient.addColorStop(i / stops.length, stops[i % stops.length]!);
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = ringGradient;
      ctx.shadowColor = primeColor;
      ctx.shadowBlur = 32;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = ringGradient;
      ctx.shadowColor = '#ecffff';
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ecffff';
      ctx.shadowColor = '#ecffff';
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      frame += 1;
    };

    const tick = () => {
      draw();
      if (!media.matches) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    resize();
    tick();
    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw();
    });
    resizeObserver.observe(canvas);
    const ring = canvas.parentElement?.querySelector<HTMLElement>('[data-valo-ring="true"]');
    if (ring) resizeObserver.observe(ring);
    window.addEventListener('resize', resize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(raf);
    };
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-valo-hero-canvas={state}
      className="absolute inset-0 h-full w-full"
    />
  );
}

function fillEllipticalGlow(
  ctx: CanvasRenderingContext2D,
  {
    cx,
    cy,
    rx,
    ry,
    stops,
  }: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    stops: ReadonlyArray<readonly [number, string]>;
  },
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split('').map((c) => `${c}${c}`).join('')
      : hex.slice(0, 6);
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}
