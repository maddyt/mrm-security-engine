'use client';

import { GROUPS, featureDef, type Alternative, type Drift, type Fairness, type Model } from '@/lib/mrm/engine';
import { dirCurve } from '@/lib/mrm/engine';
import type { ExtractionResult, PerturbationResult } from '@/lib/mrm/threats';
import { HBars, Legend, Plot, Rule, TipRow, pal, path } from './charts';

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const f2 = (v: number) => v.toFixed(2);
const f3 = (v: number) => v.toFixed(3);
const thin = <T,>(a: T[], n: number) => (a.length <= n ? a : a.filter((_, i) => i % Math.ceil(a.length / n) === 0 || i === a.length - 1));

export function RocChart({ model, light, height }: { model: Model; light?: boolean; height?: number }) {
  const p = pal(light);
  const roc = thin(model.perf.test.rocCurve, 120);
  return (
    <div>
      <Legend light={light} items={[{ label: `Scorecard (AUC ${f3(model.perf.test.auc)})`, color: p.series[0] }, { label: 'Random (AUC 0.500)', color: p.context, dash: true }]} />
      <Plot label="ROC curve" light={light} height={height} x={[0, 1]} y={[0, 1]} xFmt={pct} yFmt={pct} xLabel="Goods wrongly flagged (false positive rate)" yLabel="Bads caught" hover={{ xs: roc.map((r) => r.fpr), body: (i) => (<><TipRow label="False positive rate" value={pct(roc[i].fpr, 1)} /><TipRow color={p.series[0]} label="Bads caught" value={pct(roc[i].tpr, 1)} /></>) }}>
        {(s) => (
          <>
            <line x1={s.sx(0)} y1={s.sy(0)} x2={s.sx(1)} y2={s.sy(1)} stroke={p.context} strokeDasharray="5 4" />
            <path d={`${path(roc.map((r) => ({ x: r.fpr, y: r.tpr })), s)}L${s.sx(1)},${s.sy(0)}L${s.sx(0)},${s.sy(0)}Z`} fill={p.series[0]} opacity={0.1} />
            <path d={path(roc.map((r) => ({ x: r.fpr, y: r.tpr })), s)} fill="none" stroke={p.series[0]} strokeWidth={2} />
          </>
        )}
      </Plot>
    </div>
  );
}

export function KsChart({ model, light, height }: { model: Model; light?: boolean; height?: number }) {
  const p = pal(light);
  const t = model.perf.test;
  const c = t.ksCurve;
  const at = c.find((q) => q.score === t.ksScore) ?? c[0];
  return (
    <div>
      <Legend light={light} items={[{ label: 'Cumulative bads', color: p.series[1] }, { label: 'Cumulative goods', color: p.series[0] }]} />
      <Plot label="KS chart" light={light} height={height} x={[c[0].score, c[c.length - 1].score]} y={[0, 1]} yFmt={pct} xLabel="Score" yLabel="Cumulative share" hover={{ xs: c.map((q) => q.score), body: (i) => (<><div className="mb-1 font-semibold">Score ≤ {c[i].score}</div><TipRow color={p.series[1]} label="Bads" value={pct(c[i].cumBad, 1)} /><TipRow color={p.series[0]} label="Goods" value={pct(c[i].cumGood, 1)} /><TipRow label="Gap" value={f3(c[i].cumBad - c[i].cumGood)} /></>) }}>
        {(s) => (
          <>
            <path d={path(c.map((q) => ({ x: q.score, y: q.cumBad })), s)} fill="none" stroke={p.series[1]} strokeWidth={2} />
            <path d={path(c.map((q) => ({ x: q.score, y: q.cumGood })), s)} fill="none" stroke={p.series[0]} strokeWidth={2} />
            <line x1={s.sx(at.score)} x2={s.sx(at.score)} y1={s.sy(at.cumBad)} y2={s.sy(at.cumGood)} stroke={p.text} strokeWidth={2} />
            <text x={s.sx(at.score) + 8} y={(s.sy(at.cumBad) + s.sy(at.cumGood)) / 2} dy="0.32em" fontSize={11.5} fontWeight={600} fill={p.text} paintOrder="stroke" stroke={p.surface} strokeWidth={3}>
              KS {f3(t.ks)} at {t.ksScore}
            </text>
          </>
        )}
      </Plot>
    </div>
  );
}

export function ShapBars({ model, light }: { model: Model; light?: boolean }) {
  return <HBars light={light} rows={model.shap.map((x) => ({ label: featureDef(x.key).short, value: x.meanAbs, note: `${pct(x.share)} of total` }))} fmt={(v) => `${v.toFixed(1)} pts`} />;
}

/** Bullet chart: each group's DIR on a common 0.5–1.2 scale with the 0.80 line. */
export function DirBullets({ fair, light }: { fair: Fairness; light?: boolean }) {
  const p = pal(light);
  const lo = 0.5;
  const hi = 1.2;
  const pos = (v: number) => `${(((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100).toFixed(2)}%`;
  return (
    <div className="space-y-4">
      {fair.groups.map((g) => {
        const color = g.status === 'ADVERSE_IMPACT_FLAG' ? p.fail : g.status === 'WATCH' ? p.warn : p.pass;
        return (
          <div key={g.group.key}>
            <div className={`mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] ${light ? 'text-slate-600' : 'text-sub'}`}>
              <span>
                <span className={`font-semibold ${light ? 'text-slate-900' : 'text-ink'}`}>{g.group.protectedLabel}</span> vs {g.group.controlLabel.toLowerCase()}
              </span>
              <span className="num">
                {pct(g.protectedApproval, 1)} ÷ {pct(g.controlApproval, 1)} = <span className={`font-semibold ${light ? 'text-slate-900' : 'text-ink'}`}>{f3(g.dir)}</span>
              </span>
            </div>
            <div className="relative h-5">
              <div className="absolute inset-y-[7px] left-0 right-0 rounded-full" style={{ background: p.grid }} />
              <div className="absolute inset-y-[7px] left-0 rounded-l-full" style={{ width: pos(0.8), background: p.fail, opacity: 0.22 }} />
              <div className="absolute -inset-y-0.5 w-0.5" style={{ left: pos(0.8), background: p.fail }} />
              <div className="absolute -inset-y-0.5 w-px" style={{ left: pos(1), background: p.axis }} />
              <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-300" style={{ left: pos(g.dir), background: color, boxShadow: `0 0 0 2px ${p.surface}` }} />
            </div>
          </div>
        );
      })}
      <div className={`relative h-4 text-[10.5px] ${light ? 'text-slate-500' : 'text-mute'}`}>
        <span className="num absolute -translate-x-1/2" style={{ left: pos(0.8), color: p.fail }}>
          0.80 threshold
        </span>
        <span className="num absolute -translate-x-1/2" style={{ left: pos(1) }}>
          1.00 parity
        </span>
        <span className="num absolute left-0">0.50</span>
        <span className="num absolute right-0">1.20</span>
      </div>
    </div>
  );
}

export function DirCurveChart({ model, cutoff }: { model: Model; cutoff: number }) {
  const p = pal();
  const c = dirCurve(model);
  const lo = Math.min(0.5, ...c.flatMap((q) => Object.values(q.dir))) - 0.02;
  const hi = Math.max(1.15, ...c.flatMap((q) => Object.values(q.dir))) + 0.02;
  return (
    <div>
      <Legend items={GROUPS.map((g, i) => ({ label: g.protectedLabel, color: p.series[i] }))} />
      <Plot label="Disparate impact ratio by cut-off" x={[c[0].cutoff, c[c.length - 1].cutoff]} y={[lo, hi]} yFmt={f2} xLabel="Score cut-off" yLabel="Disparate impact ratio" hover={{ xs: c.map((q) => q.cutoff), body: (i) => (<><div className="mb-1 font-semibold">Cut-off {c[i].cutoff} · {pct(c[i].approval)} approved</div>{GROUPS.map((g, k) => <TipRow key={g.key} color={p.series[k]} label={g.protectedLabel} value={f3(c[i].dir[g.key])} />)}</>) }}>
        {(s) => (
          <>
            <rect x={0} y={s.sy(0.8)} width={s.w} height={Math.max(0, s.h - s.sy(0.8))} fill={p.fail} opacity={0.07} />
            <Rule s={s} axis="y" at={0.8} color={p.fail} text="0.80 four-fifths threshold" side="start" />
            <Rule s={s} axis="y" at={1} color={p.context} dash="2 4" />
            {GROUPS.map((g, i) => (
              <path key={g.key} d={path(c.map((q) => ({ x: q.cutoff, y: q.dir[g.key] })), s)} fill="none" stroke={p.series[i]} strokeWidth={2} />
            ))}
            <Rule s={s} axis="x" at={cutoff} color={p.text} dash="0" text={`Cut-off ${cutoff}`} />
          </>
        )}
      </Plot>
    </div>
  );
}

export function ScoreHist({ model, cutoff }: { model: Model; cutoff: number }) {
  const p = pal();
  const h = model.hist;
  const n = h.good.length;
  const top = Math.max(...h.good.map((g, i) => g + h.bad[i]));
  const mid = (i: number) => h.lo + (i + 0.5) * h.step;
  return (
    <div>
      <Legend items={[{ label: 'Repaid (good)', color: p.series[0], dot: true }, { label: 'Defaulted (bad)', color: p.series[1], dot: true }]} />
      <Plot label="Score distribution" height={220} x={[h.lo, h.lo + n * h.step]} y={[0, top * 1.05]} xLabel="Score" yLabel="Applications" hover={{ xs: h.good.map((_, i) => mid(i)), body: (i) => (<><div className="mb-1 font-semibold">Score {h.lo + i * h.step}–{h.lo + (i + 1) * h.step - 1}</div><TipRow color={p.series[0]} label="Good" value={h.good[i].toLocaleString()} /><TipRow color={p.series[1]} label="Bad" value={h.bad[i].toLocaleString()} /><TipRow label="Bad rate" value={pct(h.bad[i] / Math.max(1, h.good[i] + h.bad[i]), 1)} /></>) }}>
        {(s) => {
          const bw = s.w / n;
          return (
            <>
              <rect x={0} y={0} width={Math.max(0, s.sx(cutoff))} height={s.h} fill={p.context} opacity={0.1} />
              {h.good.map((g, i) => {
                const x = s.sx(h.lo + i * h.step) + 1;
                const yb = s.sy(h.bad[i]);
                const yg = s.sy(h.bad[i] + g);
                return (
                  <g key={i}>
                    <rect x={x} y={yb} width={Math.max(1, bw - 2)} height={Math.max(0, s.h - yb)} fill={p.series[1]} />
                    <rect x={x} y={yg} width={Math.max(1, bw - 2)} height={Math.max(0, yb - yg - 1.5)} fill={p.series[0]} rx={2} />
                  </g>
                );
              })}
              <Rule s={s} axis="x" at={cutoff} color={p.text} dash="0" text={`Cut-off ${cutoff}: decline below`} />
            </>
          );
        }}
      </Plot>
    </div>
  );
}

export function CalibrationChart({ model }: { model: Model }) {
  const p = pal();
  const c = model.calibration;
  const ln = (o: number) => Math.log(o);
  const ys = c.flatMap((q) => [ln(q.observedOdds), ln(q.expectedOdds)]);
  const ticks = [2, 5, 10, 20, 50, 100, 200, 500].filter((o) => ln(o) >= Math.min(...ys) - 0.3 && ln(o) <= Math.max(...ys) + 0.3);
  return (
    <div>
      <Legend items={[{ label: 'Expected by the score scale', color: p.context, dash: true }, { label: 'Observed on holdout', color: p.series[0], dot: true }]} />
      <Plot label="Calibration" height={240} x={[c[0].score - 10, c[c.length - 1].score + 10]} y={[Math.min(...ys) - 0.3, Math.max(...ys) + 0.3]} yTicks={ticks.map(ln)} yFmt={(v) => `${Math.round(Math.exp(v))}:1`} xLabel="Score band" yLabel="Good:bad odds (log scale)" hover={{ xs: c.map((q) => q.score), body: (i) => (<><div className="mb-1 font-semibold">Score {c[i].score - 10}–{c[i].score + 9}</div><TipRow label="Expected odds" value={`${c[i].expectedOdds.toFixed(1)}:1`} /><TipRow color={p.series[0]} label="Observed odds" value={`${c[i].observedOdds.toFixed(1)}:1`} /><TipRow label="Applications" value={c[i].n.toLocaleString()} /></>) }}>
        {(s) => (
          <>
            <path d={path(c.map((q) => ({ x: q.score, y: ln(q.expectedOdds) })), s)} fill="none" stroke={p.context} strokeWidth={2} strokeDasharray="5 4" />
            {c.map((q) => (
              <circle key={q.score} cx={s.sx(q.score)} cy={s.sy(ln(q.observedOdds))} r={5} fill={p.series[0]} stroke={p.surface} strokeWidth={2} />
            ))}
          </>
        )}
      </Plot>
    </div>
  );
}

export function LdaScatter({ alts, picked }: { alts: Alternative[]; picked: Alternative | null }) {
  const p = pal();
  const xs = alts.map((a) => a.minDir);
  const ys = alts.map((a) => a.ks);
  const x: [number, number] = [Math.min(0.7, ...xs) - 0.03, Math.max(1, ...xs) + 0.02];
  const y: [number, number] = [Math.min(...ys) - 0.015, Math.max(...ys) + 0.015];
  const order = alts.map((a, i) => ({ a, i })).sort((q, r) => q.a.minDir - r.a.minDir);
  return (
    <div>
      <Legend items={[{ label: 'Champion', color: p.text, dot: true }, { label: 'Recommended alternative', color: p.pass, dot: true }, { label: 'Other single-feature removals', color: p.context, dot: true }]} />
      <Plot label="Less discriminatory alternatives" height={280} x={x} y={y} xFmt={f2} yFmt={f2} xLabel="Lowest disparate impact ratio across groups (higher is fairer)" yLabel="Holdout KS (higher is stronger)" hover={{ xs: order.map((q) => q.a.minDir), body: (i) => (<><div className="mb-1 font-semibold">{order[i].a.label}</div><TipRow label="Lowest DIR" value={f3(order[i].a.minDir)} /><TipRow label="Holdout KS" value={f3(order[i].a.ks)} /><TipRow label="Δ KS" value={`${order[i].a.ksDelta >= 0 ? '+' : ''}${f3(order[i].a.ksDelta)}`} /></>) }}>
        {(s) => (
          <>
            <rect x={0} y={0} width={Math.max(0, s.sx(0.8))} height={s.h} fill={p.fail} opacity={0.07} />
            <Rule s={s} axis="x" at={0.8} color={p.fail} text="0.80" />
            {alts.map((a) => {
              const isC = !a.dropped;
              const isP = picked?.dropped === a.dropped && !isC;
              return (
                <g key={a.label}>
                  <circle cx={s.sx(a.minDir)} cy={s.sy(a.ks)} r={isC || isP ? 7 : 5} fill={isC ? p.text : isP ? p.pass : p.context} stroke={p.surface} strokeWidth={2} />
                  {(isC || isP) && (
                    <text x={s.sx(a.minDir) + (s.sx(a.minDir) > s.w * 0.6 ? -11 : 11)} y={s.sy(a.ks) - 10} textAnchor={s.sx(a.minDir) > s.w * 0.6 ? 'end' : 'start'} fontSize={11} fontWeight={600} fill={p.text} paintOrder="stroke" stroke={p.surface} strokeWidth={3}>
                      {isC ? 'Champion' : a.label}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        )}
      </Plot>
    </div>
  );
}

export function PsiBars({ drift, light, height = 240 }: { drift: Drift; light?: boolean; height?: number }) {
  const p = pal(light);
  const n = drift.expected.length;
  const top = Math.max(...drift.expected, ...drift.actual) * 1.12;
  return (
    <div>
      <Legend light={light} items={[{ label: 'Development baseline', color: p.context, dot: true }, { label: 'Production', color: p.series[0], dot: true }]} />
      <Plot label="Score distribution baseline vs production" light={light} height={height} x={[0, n]} y={[0, top]} xTicks={drift.binLabels.map((_, i) => i + 0.5)} xFmt={(v) => (n > 8 && v % 2 > 1 ? '' : drift.binLabels[Math.floor(v)])} yFmt={pct} xLabel="Score band (development deciles)" yLabel="Share of applications" hover={{ xs: drift.binLabels.map((_, i) => i + 0.5), body: (i) => (<><div className="mb-1 font-semibold">Score {drift.binLabels[i]}</div><TipRow color={p.context} label="Baseline" value={pct(drift.expected[i], 1)} /><TipRow color={p.series[0]} label="Production" value={pct(drift.actual[i], 1)} /><TipRow label="PSI contribution" value={((drift.actual[i] - drift.expected[i]) * Math.log(Math.max(drift.actual[i], 1e-4) / Math.max(drift.expected[i], 1e-4))).toFixed(4)} /></>) }}>
        {(s) => {
          const bw = s.w / n;
          const w = Math.max(3, bw * 0.34);
          return (
            <>
              {drift.expected.map((e, i) => (
                <g key={i}>
                  <rect x={i * bw + bw / 2 - w - 1} y={s.sy(e)} width={w} height={s.h - s.sy(e)} fill={p.context} rx={2} />
                  <rect x={i * bw + bw / 2 + 1} y={s.sy(drift.actual[i])} width={w} height={s.h - s.sy(drift.actual[i])} fill={p.series[0]} rx={2} />
                </g>
              ))}
            </>
          );
        }}
      </Plot>
    </div>
  );
}

export function MonthlyPsi({ drift, light, height = 240 }: { drift: Drift; light?: boolean; height?: number }) {
  const p = pal(light);
  const m = drift.monthly;
  const top = Math.max(0.32, ...m.map((q) => q.psi)) * 1.1;
  const color = (b: string) => (b === 'significant' ? p.fail : b === 'moderate' ? p.warn : p.series[0]);
  return (
    <Plot label="Monthly PSI" light={light} height={height} x={[-0.4, m.length - 0.6]} y={[0, top]} xTicks={m.map((_, i) => i)} xFmt={(v) => m[v]?.month ?? ''} yFmt={f2} yLabel="Score PSI" hover={{ xs: m.map((_, i) => i), body: (i) => (<><div className="mb-1 font-semibold">{m[i].month}</div><TipRow color={color(m[i].band)} label="PSI" value={f3(m[i].psi)} /><div className="mt-0.5">{m[i].band === 'stable' ? 'Stable' : m[i].band === 'moderate' ? 'Moderate drift: warning' : 'Significant drift: recalibrate'}</div></>) }}>
      {(s) => (
        <>
          <rect x={0} y={Math.max(0, s.sy(0.25))} width={s.w} height={Math.max(0, s.sy(0.1) - Math.max(0, s.sy(0.25)))} fill={p.warn} opacity={0.08} />
          <rect x={0} y={0} width={s.w} height={Math.max(0, s.sy(0.25))} fill={p.fail} opacity={0.08} />
          <Rule s={s} axis="y" at={0.1} color={p.warn} text="0.10 monitor" side="start" />
          <Rule s={s} axis="y" at={0.25} color={p.fail} text="0.25 recalibrate" side="start" />
          <path d={path(m.map((q, i) => ({ x: i, y: q.psi })), s)} fill="none" stroke={p.series[0]} strokeWidth={2} />
          {m.map((q, i) => (
            <circle key={q.month} cx={s.sx(i)} cy={s.sy(q.psi)} r={4.5} fill={color(q.band)} stroke={p.surface} strokeWidth={2} />
          ))}
        </>
      )}
    </Plot>
  );
}

export function PerturbationChart({ r, light, height = 250 }: { r: PerturbationResult; light?: boolean; height?: number }) {
  const p = pal(light);
  const top = Math.max(0.1, ...r.rows.map((q) => q.flipRate)) * 1.1;
  const series = [
    { key: 'flipRate' as const, label: 'No guardrails', color: p.series[1] },
    { key: 'afterMahalanobis' as const, label: 'Mahalanobis screen only', color: p.series[3] },
    { key: 'afterBoth' as const, label: 'Mahalanobis + income verification', color: p.series[2] },
  ];
  return (
    <div>
      <Legend light={light} items={series} />
      <Plot label="Income padding attack" light={light} height={height} x={[0, 0.5]} y={[0, top]} xFmt={pct} yFmt={pct} xLabel="Stated income inflated by" yLabel="Declines that slip through" hover={{ xs: r.rows.map((q) => q.pad), body: (i) => (<><div className="mb-1 font-semibold">Income padded {pct(r.rows[i].pad)}</div>{series.map((k) => <TipRow key={k.key} color={k.color} label={k.label} value={pct(r.rows[i][k.key], 1)} />)}</>) }}>
        {(s) => (
          <>
            <Rule s={s} axis="x" at={r.tolerance} color={p.context} text={`${pct(r.tolerance)} verification tolerance`} />
            {series.map((k) => (
              <g key={k.key}>
                <path d={path(r.rows.map((q) => ({ x: q.pad, y: q[k.key] })), s)} fill="none" stroke={k.color} strokeWidth={2} />
                {r.rows.map((q) => (
                  <circle key={q.pad} cx={s.sx(q.pad)} cy={s.sy(q[k.key])} r={3} fill={k.color} stroke={p.surface} strokeWidth={1.5} />
                ))}
              </g>
            ))}
          </>
        )}
      </Plot>
    </div>
  );
}

export function ExtractionChart({ r, light, height = 250 }: { r: ExtractionResult; light?: boolean; height?: number }) {
  const p = pal(light);
  return (
    <div>
      <Legend light={light} items={[{ label: 'Open endpoint (exact scores)', color: p.series[1] }, { label: `Guarded (${r.band}-point bands + noise)`, color: p.series[2] }]} />
      <Plot label="Model extraction attack" light={light} height={height} xLog x={[r.rows[0].queries, r.rows[r.rows.length - 1].queries]} y={[0, 1]} xTicks={[10, 25, 100, 1000, 5000]} xFmt={(v) => v.toLocaleString()} yFmt={f2} xLabel="Scoring queries by the attacker (log scale)" yLabel="Surrogate fidelity (R²)" hover={{ xs: r.rows.map((q) => q.queries), body: (i) => (<><div className="mb-1 font-semibold">{r.rows[i].queries.toLocaleString()} queries</div><TipRow color={p.series[1]} label="Open" value={f3(r.rows[i].open)} /><TipRow color={p.series[2]} label="Guarded" value={f3(r.rows[i].guarded)} /></>) }}>
        {(s) => (
          <>
            <rect x={s.sx(r.rateLimit)} y={0} width={s.w - s.sx(r.rateLimit)} height={s.h} fill={p.context} opacity={0.1} />
            <Rule s={s} axis="x" at={r.rateLimit} color={p.text} text={`Query budget: ${r.rateLimit} per client per day`} />
            <path d={path(r.rows.map((q) => ({ x: q.queries, y: q.open })), s)} fill="none" stroke={p.series[1]} strokeWidth={2} />
            <path d={path(r.rows.map((q) => ({ x: q.queries, y: q.guarded })), s)} fill="none" stroke={p.series[2]} strokeWidth={2} />
            {r.rows.map((q) => (
              <g key={q.queries}>
                <circle cx={s.sx(q.queries)} cy={s.sy(q.open)} r={3} fill={p.series[1]} stroke={p.surface} strokeWidth={1.5} />
                <circle cx={s.sx(q.queries)} cy={s.sy(q.guarded)} r={3} fill={p.series[2]} stroke={p.surface} strokeWidth={1.5} />
              </g>
            ))}
          </>
        )}
      </Plot>
    </div>
  );
}
