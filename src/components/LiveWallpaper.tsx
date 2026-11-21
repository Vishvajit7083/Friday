import { useEffect, useRef } from 'react';
import type { WallpaperSettings } from '../core/types';

interface LiveWallpaperProps {
  settings: WallpaperSettings;
  themeAccent: 'cyan' | 'cobalt' | 'violet';
}

const ACCENT_RGB: Record<'cyan' | 'cobalt' | 'violet', [number, number, number]> = {
  cyan: [34, 211, 238],
  cobalt: [59, 130, 246],
  violet: [129, 140, 248],
};

export function LiveWallpaper({ settings, themeAccent }: LiveWallpaperProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (settings.mode !== 'neural-particles' && settings.mode !== 'aurora-grid') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastDraw = 0;
    const minIntervalMs = settings.performanceMode ? 66 : 33;

    const resize = () => {
      const dpr = settings.performanceMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const particleCount = settings.performanceMode ? 28 : 56;
    const particles = Array.from({ length: particleCount }, (_, i) => ({
      x: ((i * 197) % 1000) / 1000 * window.innerWidth,
      y: ((i * 313) % 1000) / 1000 * window.innerHeight,
      vx: (((i % 7) - 3) * 0.14) || 0.12,
      vy: (((i % 5) - 2) * 0.12) || -0.1,
      r: 1.1 + (i % 3) * 0.6,
    }));

    const [ar, ag, ab] = ACCENT_RGB[themeAccent];

    const draw = (now: number) => {
      animId = requestAnimationFrame(draw);
      if (now - lastDraw < minIntervalMs) return;
      lastDraw = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Subtle atmospheric gradient base
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.08)`);
      grad.addColorStop(0.55, 'rgba(11, 18, 36, 0.25)');
      grad.addColorStop(1, 'rgba(5, 8, 17, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      if (settings.mode === 'aurora-grid') {
        const t = now * 0.00045;
        ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.11)`;
        ctx.lineWidth = 1;
        const step = settings.performanceMode ? 80 : 56;
        for (let y = h * 0.45; y < h; y += step) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 40) {
            const wave = Math.sin(x * 0.005 + t + y * 0.01) * 14;
            if (x === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
          }
          ctx.stroke();
        }
      }

      // Drift particles & sparse connections
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.55)`;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        if (!settings.performanceMode) {
          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 18000) {
              const alpha = (1 - distSq / 18000) * 0.12;
              ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha.toFixed(3)})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }
        }
      }
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [settings.mode, settings.performanceMode, themeAccent]);

  const filterStyle = {
    filter: `blur(${settings.blurPx}px) brightness(${settings.brightnessPercent}%)`,
    opacity: settings.opacityPercent / 100,
  };

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden bg-[#050811] pointer-events-none select-none"
      aria-hidden="true"
    >
      {(settings.mode === 'neural-particles' || settings.mode === 'aurora-grid') && (
        <canvas ref={canvasRef} className="w-full h-full block" style={filterStyle} />
      )}

      {settings.mode === 'aurora-command' && (
        <img
          src="/src/assets/images/aurora_command_backdrop_1795243541510.jpg"
          alt="Aurora holographic command bridge backdrop"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-all duration-300"
          style={filterStyle}
        />
      )}

      {settings.mode === 'neural-horizon' && (
        <img
          src="/src/assets/images/wallpaper_neural_horizon_1795242382408.jpg"
          alt="Neural horizon desktop backdrop"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-all duration-300"
          style={filterStyle}
        />
      )}

      {settings.mode === 'orbital-grid' && (
        <img
          src="/src/assets/images/wallpaper_orbital_grid_1795242381677.jpg"
          alt="Orbital grid desktop backdrop"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-all duration-300"
          style={filterStyle}
        />
      )}

      {settings.mode === 'custom-video' && settings.customVideoUrl && (
        <video
          src={settings.customVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          style={filterStyle}
        />
      )}

      {/* Contrast scrim keeping the AI core and dashboard typography crisp */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#040814]/55 via-[#040814]/28 to-[#040814]/78" />
    </div>
  );
}
