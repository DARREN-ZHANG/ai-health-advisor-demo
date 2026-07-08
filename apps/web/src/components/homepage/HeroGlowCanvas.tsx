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

    const stars = Array.from({ length: 110 }, (_, index) => {
      const seed = (index * 9301 + 49297) % 233280;
      const seedB = (index * 19333 + 731) % 104729;
      return {
        x: seed / 233280,
        y: (seedB / 104729) * 0.72,
        size: 0.55 + ((index * 37) % 100) / 100,
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

      const starGap = Math.max(16, ring.radius * 0.12);
      const starFieldBottom = Math.min(height, ring.cy + ring.radius + starGap);
      const starFieldRatio = starFieldBottom / height;
      const gradientTop = Math.max(0, ring.cy - ring.radius * 0.08);
      const gradientHeight = Math.max(1, starFieldBottom - gradientTop);

      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#111118';
      ctx.fillRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#020205');
      bg.addColorStop(Math.min(0.86, starFieldRatio * 0.72), '#07060d');
      bg.addColorStop(1, '#111118');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, starFieldBottom);

      const pulse = media.matches ? 0 : Math.sin(frame * 0.018) * 0.5 + 0.5;
      const horizon = ctx.createRadialGradient(
        ring.cx,
        ring.cy + ring.radius * 0.42,
        ring.radius * 0.2,
        ring.cx,
        ring.cy + ring.radius * 0.42,
        ring.radius * 2.2,
      );
      horizon.addColorStop(0, colorWithAlpha(primeColor, 0.44 + pulse * 0.1));
      horizon.addColorStop(0.38, colorWithAlpha(primeColor, 0.24));
      horizon.addColorStop(1, 'rgba(17,17,24,0)');
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, gradientTop, width, gradientHeight);
      ctx.clip();
      ctx.fillStyle = horizon;
      ctx.fillRect(0, gradientTop, width, gradientHeight);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, starFieldBottom);
      ctx.quadraticCurveTo(
        ring.cx,
        starFieldBottom + ring.radius * 0.34,
        width,
        starFieldBottom,
      );
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = '#111118';
      ctx.shadowBlur = 30;
      ctx.shadowColor = colorWithAlpha(primeColor, 0.45);
      ctx.fill();
      ctx.restore();

      for (const star of stars) {
        const alpha = 0.28 + Math.sin(frame * 0.035 + star.phase) * 0.18;
        ctx.fillStyle = `rgba(255,255,255,${media.matches ? 0.36 : alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * starFieldBottom, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      const rotation = media.matches ? -0.4 : frame * 0.006;

      for (let pass = 0; pass < 3; pass += 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = pass === 0 ? 3.4 : pass === 1 ? 7 : 17;
        ctx.shadowBlur = pass === 0 ? 10 : pass === 1 ? 20 : 34;
        ctx.globalAlpha = pass === 0 ? 1 : pass === 1 ? 0.5 : 0.22;
        for (let i = 0; i < stops.length; i += 1) {
          const start = rotation + i * (Math.PI / 2);
          const end = start + Math.PI / 2 + 0.16;
          ctx.strokeStyle = stops[i]!;
          ctx.shadowColor = stops[i]!;
          ctx.beginPath();
          ctx.arc(ring.cx, ring.cy, ring.radius, start, end);
          ctx.stroke();
        }
        ctx.restore();
      }

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
