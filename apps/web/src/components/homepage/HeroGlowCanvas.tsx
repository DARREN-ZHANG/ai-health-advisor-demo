'use client';

import { useEffect, useRef } from 'react';
import { HEALTH_STATE_METADATA, type HealthVisualState } from '@/lib/valo-theme';

interface HeroGlowCanvasProps {
  state: HealthVisualState;
  isLoading?: boolean;
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

export function HeroGlowCanvas({
  state,
  isLoading = false,
}: HeroGlowCanvasProps) {
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

    const random = createSeededRandom(0x7a10_51af);
    const stars = Array.from({ length: 180 }, () => {
      return {
        x: random(),
        y: random(),
        size: 0.48 + random() * 0.86,
        brightness: 0.78 + random() * 0.45,
        glow: random() < 0.14,
        phase: random() * Math.PI * 2,
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

      const curveEdgeY = Math.min(height, ring.cy + ring.radius * 1.04);
      const curveControlY = Math.min(height + ring.radius * 0.14, ring.cy + ring.radius * 1.72);
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

      for (const star of stars) {
        const twinkle = media.matches
          ? 0.92
          : 0.78 + Math.sin(frame * 0.035 + star.phase) * 0.22;
        const alpha = Math.min(
          0.82,
          star.brightness * twinkle * (star.glow ? 0.74 : 0.5),
        );
        ctx.save();
        if (star.glow) {
          ctx.shadowBlur = star.size * 6.4;
          ctx.shadowColor = 'rgba(210,235,255,0.78)';
        }
        ctx.fillStyle = `rgba(245,250,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * starFieldBottom, star.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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

      const rotationSpeed = isLoading ? 0.024 : 0.006;
      const rotation = media.matches ? -0.4 : frame * rotationSpeed;
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
  }, [isLoading, state]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-valo-hero-canvas={state}
      data-valo-loading={isLoading ? 'true' : undefined}
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

function createSeededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
