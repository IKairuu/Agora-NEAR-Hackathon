import { useEffect, useRef } from 'react';

/*
 * The character field: raw job traffic on the left flows into the contract line
 * and leaves it on the right as resolved events (tests.passed, usdc.released...).
 */
const RAMP = ' .:-=+*#%@';
const CW = 9;
const CH = 18;
const EVENTS = ['job.posted', 'spec.locked', 'bid.held', 'escrow.funded', 'tests.passed', 'usdc.released', 'record.minted'];
const FRAGMENTS = ['{"type":"job.posted"}', '{"type":"bid","usdc":33}', '{"type":"delivery","sha":"e5f1d07"}', '{"type":"vote","ok":true}', '{"type":"bid","note":"pay me on telegram"}'];

interface Stream { row: number; sp: number; ph: number; w: number }
interface Token { row: number; col: number; txt: string; sp: number; done?: boolean }
interface Label { row: number; txt: string; life: number }

function cssColor(value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

export function CharacterField({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const ACC = cssColor('var(--color-accent)');
    const INK = cssColor('var(--n-ink-2)');
    const mono = getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace';

    let W = 0, H = 0, cols = 0, rows = 0, lineCol = 0;
    let streams: Stream[] = [];
    let tokens: Token[] = [];
    let labels: Label[] = [];

    const size = () => {
      const r = c.getBoundingClientRect();
      W = r.width; H = r.height;
      c.width = W * dpr; c.height = H * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CW); rows = Math.ceil(H / CH);
      lineCol = Math.round(cols * (W < 900 ? 0.7 : 0.6));
      streams = [];
      const n = Math.max(4, Math.round(rows / 7));
      for (let k = 0; k < n; k++) streams.push({ row: Math.round(((k + 0.6) * rows) / n), sp: 0.5 + Math.random() * 0.8, ph: Math.random() * 100, w: 1.4 + Math.random() * 1.6 });
      labels = streams.map((s, k) => ({ row: s.row, txt: EVENTS[k % EVENTS.length], life: 0 }));
      tokens = [];
      x.font = `500 13px ${mono}`;
      x.textBaseline = 'top';
    };
    size();
    addEventListener('resize', size);

    let visible = true;
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; });
    io.observe(c);

    // keep the headline side clean
    const textMask = (cx: number, cy: number) => {
      const fx = cx / cols, fy = cy / rows;
      const left = W < 900 ? 0 : 0.46;
      let m = Math.min(1, Math.max(0, (fx - left * 0.55) / (left * 0.6 + 0.0001)));
      if (W < 900) m = cx > lineCol * 0.8 ? 0.5 : 0.18;
      return m * (fy > 0.08 ? 1 : 0.4);
    };

    let t = 0, last = 0, raf = 0;
    const frame = (now: number) => {
      if (!reduce) raf = requestAnimationFrame(frame);
      if (!reduce && (!visible || now - last < 33)) return;
      last = now;
      t += reduce ? 40 : 0.033;
      x.clearRect(0, 0, W, H);

      for (let cy = 0; cy < rows; cy++) {
        let near = 0;
        for (const s of streams) {
          const d = Math.abs(cy - s.row) / s.w;
          if (d < 3) near = Math.max(near, Math.exp(-d * d) * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph)));
        }
        for (let cx = 0; cx < cols; cx++) {
          const right = cx > lineCol;
          let v: number;
          if (!right) {
            const flow = Math.sin(cx * 0.11 - t * 2.2 + cy * 0.35) * 0.5 + 0.5;
            const grain = Math.sin(cx * 1.7 + cy * 2.3 + t * 0.7) * 0.5 + 0.5;
            v = (near * (0.55 + 0.45 * flow) * (cx / lineCol) + grain * 0.06) * textMask(cx, cy);
          } else {
            v = near > 0.35
              ? ((cx + cy + Math.floor(t * 6)) % 3 === 0 ? 0.18 : 0.1) * (1 - (cx - lineCol) / (cols - lineCol)) + 0.04
              : (cx * 7 + cy * 13) % 23 === 0 ? 0.06 : 0;
          }
          if (v < 0.05) continue;
          const ch = right ? (v > 0.12 ? ':' : '.') : RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
          if (ch === ' ') continue;
          x.globalAlpha = Math.min(1, 0.28 + v * 1.1);
          x.fillStyle = v > 0.55 && !right ? ACC : INK;
          x.fillText(ch, cx * CW, cy * CH);
        }
      }

      // the contract line
      if (W >= 600) { x.globalAlpha = 0.55; x.fillStyle = ACC; x.fillRect(lineCol * CW + 4, CH * 2, 1, H - CH * 5); }

      // JSON fragments travelling along the streams
      if (!reduce && W >= 900 && Math.random() < 0.04 && tokens.length < 5) {
        const s = streams[Math.floor(Math.random() * streams.length)];
        tokens.push({ row: s.row, col: Math.round(lineCol * 0.42), txt: FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)], sp: 0.35 + Math.random() * 0.25 });
      }
      if (reduce && W >= 900 && !tokens.length) {
        tokens = [
          { row: streams[1].row, col: lineCol - 26, txt: FRAGMENTS[0], sp: 0 },
          { row: streams[3 % streams.length].row, col: lineCol - 30, txt: FRAGMENTS[2], sp: 0 },
        ];
      }
      for (const k of tokens) {
        k.col += k.sp;
        x.globalAlpha = 0.85 * textMask(Math.max(0, k.col), k.row);
        x.fillStyle = ACC;
        x.fillText(k.txt, k.col * CW, k.row * CH);
        if (k.col + k.txt.length >= lineCol && !k.done) {
          k.done = true;
          const lb = labels.find((l) => l.row === k.row);
          if (lb) { lb.life = 1; lb.txt = k.txt.includes('telegram') ? 'bid.held' : EVENTS[Math.floor(Math.random() * EVENTS.length)]; }
        }
      }
      tokens = tokens.filter((k) => k.col < lineCol + 2);

      for (const l of labels) {
        if (reduce) l.life = 1;
        if (l.life <= 0) continue;
        const lx = (lineCol + 4) * CW, ly = l.row * CH;
        x.globalAlpha = 0.5 * l.life; x.fillStyle = ACC;
        x.fillRect(lineCol * CW + 6, ly + CH / 2, CW * 3, 1);
        x.globalAlpha = Math.min(1, l.life * 1.2);
        x.fillStyle = l.txt === 'bid.held' ? ACC : INK;
        x.fillText(l.txt, lx, ly);
        if (!reduce) l.life -= 0.004;
      }
      x.globalAlpha = 1;
    };

    if (reduce) frame(0);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      io.disconnect();
    };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden="true" />;
}
