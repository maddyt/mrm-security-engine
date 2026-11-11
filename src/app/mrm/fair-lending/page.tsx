'use client';

import { useEffect, useMemo, useState } from 'react';
import { HBars } from '@/components/mrm/charts';
import { DirBullets, DirCurveChart, LdaScatter, ScoreHist } from '@/components/mrm/figures';
import { Finding, Kpi, PageHead, Panel, RagPill, Slider, btnGhost, td, tdn, th, thn } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { GROUPS, alternatives, dirCurve, fairness, featureDef, recommendedAlternative, type GroupKey, type Rag } from '@/lib/mrm/engine';

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const rag = (dir: number): Rag => (dir < 0.8 ? 'fail' : dir < 0.9 ? 'warn' : 'pass');
const statusLabel = { COMPLIANT_PASS: 'Compliant: pass', WATCH: 'Pass: watch band', ADVERSE_IMPACT_FLAG: 'Adverse impact flag' };

export default function FairLending() {
  const { model } = useMrm();
  const curve = useMemo(() => dirCurve(model), [model]);
  const [cutoff, setCutoff] = useState(model.cutoff);
  useEffect(() => setCutoff(model.cutoff), [model]);
  const fair = useMemo(() => fairness(model, cutoff), [model, cutoff]);
  const alts = useMemo(() => alternatives(model), [model]);
  const rec = recommendedAlternative(alts);
  const [gk, setGk] = useState<GroupKey | null>(null);
  const focus = fair.groups.find((g) => g.group.key === gk) ?? fair.worst;
  const overall = rag(fair.minDir);
  const top = focus.drivers[0];

  return (
    <div>
      <PageHead title="Fair lending & disparate impact" lead="Approval rates across protected groups under ECOA / Regulation B, tested against the four-fifths rule. Protected attributes are used only to test outcomes; they are never model inputs." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Lowest DIR" help="dir" value={fair.minDir.toFixed(3)} rag={overall} sub={fair.worst.group.protectedLabel} />
        <Kpi label="Approval rate" value={pct(fair.approvalRate)} sub={`Cut-off ${cutoff} · ${fair.declined.toLocaleString()} declined`} />
        <Kpi label="Top gap driver" help="drivers" value={<span className="font-sans text-[17px]">{featureDef(top.key).short}</span>} sub={`${pct(top.share, 0)} of the ${focus.scoreGap.toFixed(1)}-point score gap`} />
        <Kpi label="Fairer alternative" help="lda" value={rec ? rec.minDir.toFixed(3) : 'None'} rag={rec ? rag(rec.minDir) : undefined} sub={rec ? `${rec.label}, KS ${rec.ksDelta >= 0 ? '+' : ''}${rec.ksDelta.toFixed(3)}` : 'No single-feature refit improves DIR within 0.02 KS'} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Panel title="Disparate impact ratio by group" help="dir" subtitle="Protected-group approval rate divided by the control group’s. Below 0.80 is flagged.">
          <DirBullets fair={fair} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr className="border-b border-line/60">
                  <th className={th}>Group</th>
                  <th className={thn}>Protected</th>
                  <th className={thn}>Control</th>
                  <th className={thn}>DIR</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {fair.groups.map((g) => (
                  <tr key={g.group.key} className="border-b border-line/40 last:border-0">
                    <td className={td}>{g.group.protectedLabel}</td>
                    <td className={tdn}>{pct(g.protectedApproval)}</td>
                    <td className={tdn}>{pct(g.controlApproval)}</td>
                    <td className={`${tdn} font-semibold text-ink`}>{g.dir.toFixed(3)}</td>
                    <td className={td}>
                      <RagPill size="sm" rag={rag(g.dir)} label={statusLabel[g.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 border-t border-line/60 pt-4">
            <div className="mb-2 text-[12px] font-medium text-sub">Ratio at every possible cut-off</div>
            <DirCurveChart model={model} cutoff={cutoff} />
          </div>
        </Panel>

        <Panel title="Move the cut-off" subtitle="Drag to see how the approve / decline line changes every ratio. The model itself is unchanged." right={<button type="button" className={btnGhost} onClick={() => setCutoff(model.cutoff)} disabled={cutoff === model.cutoff}>Reset to {model.cutoff}</button>}>
          <Slider label="Score cut-off" value={cutoff} min={curve[0].cutoff} max={curve[curve.length - 1].cutoff} step={1} onChange={setCutoff} fmt={(v) => `${v} · ${pct(fair.approvalRate, 0)} approved`} />
          <div className="mt-3">
            <ScoreHist model={model} cutoff={cutoff} />
          </div>
        </Panel>
      </div>

      <div className="mt-5">
        <Finding rag={overall} title={overall === 'fail' ? 'Potential adverse impact identified' : overall === 'warn' ? 'Four-fifths rule met, inside the watch band' : 'Four-fifths rule met for every tested basis'}>
          {overall === 'fail' ? (
            <>
              {fair.worst.group.protectedLabel} applicants are approved at {pct(fair.worst.protectedApproval)} against {pct(fair.worst.controlApproval)} for the control group: a ratio of {fair.worst.dir.toFixed(3)}, below 0.80. {featureDef(fair.worst.drivers[0].key).label} accounts for {pct(fair.worst.drivers[0].share, 0)} of the score gap.
              {rec && <> A refit {rec.label.toLowerCase()} restores the ratio to {rec.minDir.toFixed(3)} with a KS change of {rec.ksDelta >= 0 ? '+' : ''}{rec.ksDelta.toFixed(3)}.</>}
            </>
          ) : (
            <>The lowest ratio is {fair.minDir.toFixed(3)} for {fair.worst.group.protectedLabel.toLowerCase()} applicants at a cut-off of {cutoff}. The ratio is a screening measure; it does not by itself establish compliance.</>
          )}
        </Finding>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel
          title="What drives the gap"
          help="drivers"
          subtitle={`Mean score gap of ${focus.scoreGap.toFixed(1)} points, ${focus.group.controlLabel.toLowerCase()} minus ${focus.group.protectedLabel.toLowerCase()}, split by characteristic.`}
          right={
            <div className="flex rounded-lg border border-line bg-bg/40 p-0.5">
              {GROUPS.map((g) => (
                <button key={g.key} type="button" onClick={() => setGk(g.key)} className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium ${focus.group.key === g.key ? 'bg-raised text-ink ring-1 ring-line' : 'text-mute hover:text-sub'}`}>
                  {g.label}
                </button>
              ))}
            </div>
          }
        >
          <HBars rows={focus.drivers.map((d) => ({ label: featureDef(d.key).short, value: Math.max(0, d.gapPoints), note: d.gapPoints > 0 ? `${pct(d.share, 0)} of gap` : 'favourable', color: d.gapPoints > 0 && d.share >= 0.5 ? '#DB2777' : undefined, title: `${featureDef(d.key).label}: ${d.gapPoints.toFixed(2)} points` }))} fmt={(v) => `${v.toFixed(1)} pts`} />
          <p className="mt-3 text-[12px] leading-relaxed text-mute">A characteristic that explains most of the gap while adding little predictive power is a likely proxy. Bars at zero favour the protected group.</p>
        </Panel>

        <Panel title="Less discriminatory alternatives" help="lda" subtitle="The scorecard refitted without each characteristic in turn, at the same approval rate. Up and to the right is better.">
          <LdaScatter alts={alts} picked={rec} />
        </Panel>
      </div>

      <Panel className="mt-5" title="Principal adverse action reasons" help="adverse" subtitle={`For the ${fair.declined.toLocaleString()} applications declined at this cut-off. Regulation B §1002.9 requires the specific reasons to be given to the applicant.`}>
        <HBars labelWidth={300} rows={fair.reasons.filter((r) => r.count > 0).map((r) => ({ label: r.reason, value: r.share, note: `${r.count.toLocaleString()} declines`, title: `${featureDef(r.key).label}` }))} fmt={(v) => pct(v)} />
      </Panel>
    </div>
  );
}
