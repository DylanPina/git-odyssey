import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  driftX: number;
  driftY: number;
  twinkleOffset: number;
  twinkleSpeed: number;
  color: string;
};

const STAR_COLORS = [
  "rgba(231, 238, 255, 1)",
  "rgba(194, 209, 231, 1)",
  "rgba(151, 170, 194, 1)",
];

function wrap(value: number, max: number) {
  if (max <= 0) {
    return 0;
  }

  return ((value % max) + max) % max;
}

function createStars(width: number, height: number, count: number): Star[] {
  return Array.from({ length: count }, () => {
    const depth = 0.35 + Math.random() * 0.85;

    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.35 + Math.random() * 1.15 * depth,
      opacity: 0.18 + Math.random() * 0.48,
      driftX: (Math.random() - 0.5) * depth * 2.2,
      driftY: (0.15 + Math.random() * 0.55) * depth,
      twinkleOffset: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.35 + Math.random() * 1.1,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  });
}

export function HomeSpaceBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedMotion = reducedMotionQuery.matches;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];

    const draw = (timeMs: number) => {
      if (width === 0 || height === 0) {
        return;
      }

      const time = timeMs / 1000;
      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        const x = reducedMotion ? star.x : wrap(star.x + time * star.driftX, width);
        const y = reducedMotion ? star.y : wrap(star.y + time * star.driftY, height);
        const pulse = reducedMotion
          ? 0
          : Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.18;
        const alpha = Math.min(1, Math.max(0.08, star.opacity + pulse));

        context.beginPath();
        context.fillStyle = star.color;
        context.globalAlpha = alpha;
        context.arc(x, y, star.radius, 0, Math.PI * 2);
        context.fill();

        if (star.radius > 1) {
          context.beginPath();
          context.globalAlpha = alpha * 0.12;
          context.arc(x, y, star.radius * 3, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.globalAlpha = 1;
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(bounds.width, 1);
      const nextHeight = Math.max(bounds.height, 1);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(nextWidth * dpr);
      canvas.height = Math.round(nextHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      width = nextWidth;
      height = nextHeight;

      const starCount = Math.max(60, Math.min(180, Math.round((width * height) / 12000)));
      stars = createStars(width, height, starCount);

      draw(0);
    };

    const animate = (timeMs: number) => {
      draw(timeMs);
      animationFrameId = window.requestAnimationFrame(animate);
    };

    resize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;

    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);

    if (!reducedMotion) {
      animationFrameId = window.requestAnimationFrame(animate);
    }

    return () => {
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();

      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="home-space-glow absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-90" />
      <div className="home-space-vignette absolute inset-0" />
      <div className="home-space-grain absolute inset-[-100%]" />
    </div>
  );
}
