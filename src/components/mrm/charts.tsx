'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useWidth } from '@/components/charts/useWidth';
import { niceTicks } from '@/components/charts/theme';

// Small SVG chart kit for the MRM portal. Colours are explicit (not CSS variables) so the
// print binder renders identically on paper. Series colours were checked for colour-blind
// separation on both surfaces; status colours are reserved for pass / warn / fail.

export interface Palette {
  light: boolean;
  series: [string, string, string, string];
  context: string;
  grid: string;
  axis: string;
  text: string;
  sub: string;
  mute: string;
  surface: string;
  pass: string;
  warn: string;
  fail: string;
}
export const DARK_P: Palette = { light: false, series: ['#3B82F6', '#DB2777', '#0891B2', '#8B5CF6'], context: '#64748B', grid: 'rgba(148,163,184,0.13)', axis: 'rgba(148,163,184,0.4)', text: '#E6EAF0', sub: '#A3ADBD', mute: '#7B8798', surface: '#0D121A', pass: '#22C55E', warn: '#F59E0B', fail: '#EF4444' };
export const LIGHT_P: Palette = { light: true, series: ['#2563EB', '#DB2777', '#0891B2', '#7C3AED'], context: '#94A3B8', grid: 'rgba(15,23,42,0.09)', axis: 'rgba(15,23,42,0.4)', text: '#0B1220', sub: '#3F4A5A', mute: '#6B7689', surface: '#FFFFFF', pass: '#15803D', warn: '#B45309', fail: '#B91C1C' };
export const pal = (light?: boolean) => (light ? LIGHT_P : DARK_P);

export interface Scales {
  sx: (v: number) => number;
  sy: (v: number) => number;
  w: number;
  h: number;
  p: Palette;
}

export function path(pts: { x: number; y: number }[], s: Scales): string {
  return pts.map((q, i) => `${i ? 'L' : 'M'}${s.sx(q.x).toFixed(1)},${s.sy(q.y).toFixed(1)}`).join('');
}

interface PlotProps {
  x: [number, number];
  y: [number, number];
  height?: number;
  xTicks?: number[];
  yTicks?: number[];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  xLog?: boolean;
  light?: boolean;
  /** x positions the crosshair snaps to, with the tooltip body for each. */
  hover?: { xs: number[]; body: (i: number) => ReactNode };
  children: (s: Scales) => ReactNode;
  label: string;
}

export function Plot({ x, y, height = 260, xTicks, yTicks, xFmt = String, yFmt = String, xLabel, yLabel, xLog, light, hover, children, label }: PlotProps) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hi, setHi] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const p = pal(light);
  const m = { l: yLabel ? 58 : 46, r: 16, t: 12, b: xLabel ? 44 : 28 };
  const w = Math.max(120, width - m.l - m.r);
  const h = height - m.t - m.b;
  const fx = (v: number) => (xLog ? Math.log10(v) : v);
  // Rounded to 0.01px so server-rendered and browser-rendered coordinates are identical.
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const sx = (v: number) => r2(((fx(v) - fx(x[0])) / (fx(x[1]) - fx(x[0]))) * w);
  const sy = (v: number) => r2(h - ((v - y[0]) / (y[1] - y[0])) * h);
  const s: Scales = { sx, sy, w, h, p };
  const xt = xTicks ?? niceTicks(x[0], x[1], width < 480 ? 4 : 7);
  const yt = yTicks ?? niceTicks(y[0], y[1], 5);
  const move = (e: React.PointerEvent) => {
    if (!hover || !svg.current) return;
    const px = e.clientX - svg.current.getBoundingClientRect().left - m.l;
    let best = 0;
    hover.xs.forEach((v, i) => {
      if (Math.abs(sx(v) - px) < Math.abs(sx(hover.xs[best]) - px)) best = i;
    });
    setHi(best);
  };
  const hx = hover && hi !== null ? sx(hover.xs[hi]) : null;
  return (
    <div ref={ref} className="relative w-full">
      <svg ref={svg} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => setHi(null)} className="block touch-pan-y select-none">
        <g transform={`translate(${m.l},${m.t})`}>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={0} x2={w} y1={sy(v)} y2={sy(v)} stroke={p.grid} />
              <text x={-8} y={sy(v)} dy="0.32em" textAnchor="end" fontSize={10.5} fill={p.mute} className="num">
                {yFmt(v)}
              </text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} x={sx(v)} y={h + 16} textAnchor="middle" fontSize={10.5} fill={p.mute} className="num">
              {xFmt(v)}
            </text>
          ))}
          <line x1={0} x2={w} y1={h} y2={h} stroke={p.axis} />
          {xLabel && (
            <text x={w / 2} y={h + 36} textAnchor="middle" fontSize={11} fill={p.sub}>
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text transform={`translate(${-m.l + 13},${h / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={p.sub}>
              {yLabel}
            </text>
          )}
          {children(s)}
          {hx !== null && <line x1={hx} x2={hx} y1={0} y2={h} stroke={p.axis} strokeDasharray="3 3" pointerEvents="none" />}
        </g>
      </svg>
      {hover && hi !== null && hx !== null && (
        <div
          className={`pointer-events-none absolute top-2 z-10 min-w-[150px] max-w-[240px] rounded-lg border px-3 py-2 text-[11.5px] shadow-xl ${light ? 'border-slate-200 bg-white text-slate-700' : 'border-line bg-raised text-sub'}`}
          style={hx + m.l > width / 2 ? { right: width - (hx + m.l) + 10 } : { left: hx + m.l + 10 }}
        >
          {hover.body(hi)}
        </div>
      )}
    </div>
  );
}

/** A labelled horizontal rule or vertical marker inside a Plot. */
export function Rule({ s, at, axis, color, text, dash = '5 4', side = 'end' }: { s: Scales; at: number; axis: 'x' | 'y'; color: string; text?: string; dash?: string; side?: 'start' | 'end' }) {
  if (axis === 'y') {
    const y = s.sy(at);
    if (y < -1 || y > s.h + 1) return null;
    return (
      <g pointerEvents="none">
        <line x1={0} x2={s.w} y1={y} y2={y} stroke={color} strokeWidth={1.25} strokeDasharray={dash} />
        {text && (
          <text x={side === 'end' ? s.w - 4 : 4} y={y - 5} textAnchor={side} fontSize={10.5} fontWeight={600} fill={color} paintOrder="stroke" stroke={s.p.surface} strokeWidth={3}>
            {text}
          </text>
        )}
      </g>
    );
  }
  const xx = s.sx(at);
  if (xx < -1 || xx > s.w + 1) return null;
  const right = xx < s.w * 0.72;
  return (
    <g pointerEvents="none">
      <line x1={xx} x2={xx} y1={0} y2={s.h} stroke={color} strokeWidth={1.25} strokeDasharray={dash} />
      {text && (
        <text x={xx + (right ? 6 : -6)} y={11} textAnchor={right ? 'start' : 'end'} fontSize={10.5} fontWeight={600} fill={color} paintOrder="stroke" stroke={s.p.surface} strokeWidth={3}>
          {text}
        </text>
      )}
    </g>
  );
}

export function Legend({ items, light }: { items: { label: string; color: string; dash?: boolean; dot?: boolean }[]; light?: boolean }) {
  return (
    <div className={`mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] ${light ? 'text-slate-600' : 'text-sub'}`}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dot ? (
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          ) : (
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.dash ? '4 3' : undefined} />
            </svg>
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}

/** Horizontal bars for ranked categories. Values are printed, so colour never carries the number alone. */
export function HBars({ rows, max, fmt, light, marks = [], labelWidth = 150 }: { rows: { label: string; value: number; color?: string; note?: string; title?: string }[]; max?: number; fmt: (v: number) => string; light?: boolean; marks?: { at: number; color: string; label: string }[]; labelWidth?: number }) {
  const p = pal(light);
  const top = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), ...marks.map((k) => k.at), 1e-9) * 1.08;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-[12px]" title={r.title ?? `${r.label}: ${fmt(r.value)}`}>
          <div className={`shrink-0 truncate ${light ? 'text-slate-700' : 'text-sub'}`} style={{ width: labelWidth, maxWidth: '42%' }}>
            {r.label}
          </div>
          <div className="relative h-[14px] min-w-0 flex-1">
            <div className="absolute inset-y-[5px] left-0 right-0 rounded-full" style={{ background: p.grid }} />
            <div className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-300" style={{ width: `${(Math.max(0, Math.min(1, r.value / top)) * 100).toFixed(2)}%`, background: r.color ?? p.series[0] }} />
            {marks.map((k) => (
              <div key={k.label} className="absolute -inset-y-1 w-px" style={{ left: `${((k.at / top) * 100).toFixed(2)}%`, background: k.color }} title={k.label} />
            ))}
          </div>
          <div className={`num w-[68px] shrink-0 text-right font-medium ${light ? 'text-slate-900' : 'text-ink'}`}>{fmt(r.value)}</div>
          {r.note !== undefined && <div className={`hidden w-[92px] shrink-0 text-[11px] sm:block ${light ? 'text-slate-500' : 'text-mute'}`}>{r.note}</div>}
        </div>
      ))}
      {marks.length > 0 && (
        <div className={`flex flex-wrap gap-x-4 pt-1 text-[11px] ${light ? 'text-slate-500' : 'text-mute'}`}>
          {marks.map((k) => (
            <span key={k.label} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-px" style={{ background: k.color }} />
              {k.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
