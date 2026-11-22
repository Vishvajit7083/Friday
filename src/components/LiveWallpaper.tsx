import { useEffect, useRef } from 'react';
import type { WallpaperSettings } from '../core/types';

interface LiveWallpaperProps {
  settings: WallpaperSettings;
  themeAccent: 'cyan' | 'cobalt' | 'violet';
}

const ACCENT_RGB: Record<'cyan' | 'cobalt' | 'violet', [number, number, number]> = {
  cyan: [168, 85, 247],
  cobalt: [139, 92, 246],
  violet: [192, 38, 211],
};

const SCENIC_REFERENCE_BG =
  '/assets/aistudio/84c1ad2559af615680c0e19c8f989902b38330afefe6ca91e39bc544d869f8e2_09d5f6e8.png';

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
      x: (((i * 197) % 1000) / 1000) * window.innerWidth,
      y: (((i * 313) % 1000) / 1000) * window.innerHeight,
      vx: ((i % 7) - 3) * 0.14 || 0.12,
      vy: ((i % 5) - 2) * 0.12 || -0.1,
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

      const grad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        40,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.75
      );
      grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.1)`);
      grad.addColorStop(0.55, 'rgba(18, 6, 36, 0.35)');
      grad.addColorStop(1, 'rgba(5, 2, 12, 0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      if (settings.mode === 'aurora-grid') {
        const t = now * 0.00045;
        ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.14)`;
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

      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.6)`;
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
              const alpha = (1 - distSq / 18000) * 0.14;
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

  const filterStyle: React.CSSProperties = {
    filter: `blur(${settings.blurPx}px) brightness(${settings.brightnessPercent}%)`,
    opacity: settings.opacityPercent / 100,
  };

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden bg-[#05020c] pointer-events-none select-none"
      aria-hidden="true"
    >
      {(settings.mode === 'neural-particles' || settings.mode === 'aurora-grid') && (
        <canvas ref={canvasRef} className="w-full h-full block" style={filterStyle} />
      )}

      {settings.mode === 'aurora-command' && (
        <div
          className="relative w-full h-full md:scale-[1.11] md:translate-x-[74px] origin-center transition-transform duration-300"
          data-testid="aurora-landscape-backdrop"
        >
          <img
            src={SCENIC_REFERENCE_BG}
            alt="Starry aurora mountains, pine forest, reflective lake, and illuminated reactor deck"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
            style={filterStyle}
          />
          {/* Localized neon-purple energy tint transforming only the circular reactor platform & center beam pad */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 30% 19% at 50% 63.5%, rgba(192, 38, 211, 0.96) 0%, rgba(147, 51, 234, 0.85) 55%, rgba(88, 28, 135, 0) 100%)',
              mixBlendMode: 'color',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 18% 10% at 50% 62.5%, rgba(245, 208, 254, 0.55) 0%, rgba(217, 70, 239, 0.32) 55%, rgba(0, 0, 0, 0) 100%)',
              mixBlendMode: 'screen',
            }}
          />
        </div>
      )}

      {settings.mode === 'neural-horizon' && (
        <img
          src="/src/assets/images/wallpaper_neural_horizon_1795242382408.jpg"
          alt="Neural horizon desktop backdrop"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-all duration-300"
          style={{ ...filterStyle, filter: `${filterStyle.filter} hue-rotate(88deg) saturate(1.4)` }}
        />
      )}

      {settings.mode === 'orbital-grid' && (
        <img
          src="/src/assets/images/wallpaper_orbital_grid_1795242381677.jpg"
          alt="Orbital grid desktop backdrop"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-all duration-300"
          style={{ ...filterStyle, filter: `${filterStyle.filter} hue-rotate(88deg) saturate(1.4)` }}
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

      {/* Subtle purple-black edge scrim preserving photo detail while keeping side HUD panels legible */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 68% 72% at 56% 48%, rgba(5, 2, 12, 0.04) 0%, rgba(7, 2, 18, 0.34) 72%, rgba(5, 2, 12, 0.62) 100%)',
        }}
      />
    </div>
  );
}
