import { useEffect, useRef } from 'react';

/*
 * The agent network (prototype v9): dots are buyers, sellers and their agents; lines join
 * neighbours, green packets travel them like payments, and the cursor acts as a hub.
 * It stays quiet behind the centred headline.
 */
interface Node { x: number; y: number; vx: number; vy: number; g: boolean }
interface Packet { a: Node; b: Node; s: number }

function cssColor(value: string) {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

export function AgentNetwork({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const ACC = cssColor('var(--color-accent)');
    const INK = cssColor('var(--n-ink-2)');
    let W = 0, H = 0, N: Node[] = [], pk: Packet[] = [];
    const R = 150, mouse = { x: -9999, y: -9999 };
    let raf = 0, visible = true;

    const size = () => {
      const r = c.getBoundingClientRect();
      W = r.width; H = r.height; c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = Math.min(119, (W * H / 11100) | 0);
      N = Array.from({ length: k }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, g: Math.random() < 0.12 }));
      pk = [];
    };
    const onM = (e: PointerEvent) => { const r = c.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const onL = () => { mouse.x = mouse.y = -9999; };
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; });
    /** Dims everything near the headline so the text stays readable. */
    const quiet = (px: number, py: number) => 0.35 + 0.65 * Math.min(1, Math.hypot((px - W / 2) / (W * 0.32), (py - H * 0.4) / (H * 0.3)));
    const line = (ax: number, ay: number, bx: number, by: number, col: string, a: number) => { x.globalAlpha = a; x.strokeStyle = col; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); };

    const frame = () => {
      if (!reduce) raf = requestAnimationFrame(frame);
      if (!visible && !reduce) return;
      x.clearRect(0, 0, W, H); x.lineWidth = 1;
      for (const p of N) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        if (d < 220 && d > 40) { p.x += dx / d * 0.25; p.y += dy / d * 0.25; }
      }
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        const a = N[i], b = N[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > R) continue;
        line(a.x, a.y, b.x, b.y, INK, (1 - d / R) * 0.24 * quiet((a.x + b.x) / 2, (a.y + b.y) / 2));
        if (!reduce && Math.random() < 0.001 && pk.length < 32) pk.push({ a, b, s: 0 });
      }
      if (mouse.x > -999) for (const p of N) { const d = Math.hypot(p.x - mouse.x, p.y - mouse.y); if (d < 200) line(mouse.x, mouse.y, p.x, p.y, ACC, (1 - d / 200) * 0.55); }
      for (const p of N) { x.globalAlpha = p.g ? 0.9 : 0.5 * quiet(p.x, p.y); x.fillStyle = p.g ? ACC : INK; x.beginPath(); x.arc(p.x, p.y, p.g ? 2.6 : 1.6, 0, 6.283); x.fill(); }
      pk = pk.filter((k) => (k.s += 0.012) < 1);
      for (const k of pk) {
        const px = k.a.x + (k.b.x - k.a.x) * k.s, py = k.a.y + (k.b.y - k.a.y) * k.s;
        x.globalAlpha = 0.25; x.fillStyle = ACC; x.beginPath(); x.arc(px, py, 6, 0, 6.283); x.fill();
        x.globalAlpha = 0.95; x.beginPath(); x.arc(px, py, 2.2, 0, 6.283); x.fill();
      }
      x.globalAlpha = 1;
    };

    size();
    addEventListener('resize', size);
    addEventListener('pointermove', onM);
    document.addEventListener('pointerleave', onL);
    io.observe(c);
    if (reduce) frame(); else raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      removeEventListener('pointermove', onM);
      document.removeEventListener('pointerleave', onL);
      io.disconnect();
    };
  }, [reduce]);

  return <canvas id="field" ref={ref} aria-hidden="true" />;
}
