'use client';

import { useEffect, useMemo, useState } from 'react';
import { HBars, pal } from '@/components/mrm/charts';
import { MonthlyPsi, PsiBars } from '@/components/mrm/figures';
import { Finding, Kpi, PageHead, Panel, Slider, btnGhost } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { PROD_N, drift, featureDef, type PsiBand, type Rag } from '@/lib/mrm/engine';

const rag: Record<PsiBand, Rag> = { stable: 'pass', moderate: 'warn', significant: 'fail' };
const word: Record<PsiBand, string> = { stable: 'Stable', moderate: 'Moderate drift', significant: 'Significant drift' };
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function DriftPage() {
  const { model } = useMrm();
  const [sev, setSev] = useState(model.spec.drift);
  useEffect(() => setSev(model.spec.drift), [model]);
  const d = useMemo(() => drift(model, sev), [model, sev]);
  const p = pal();
  const live = sev === model.spec.drift;
  return (
    <div>
      <PageHead title="Drift & population stability" lead={`${PROD_N.toLocaleString()} production scoring applications compared with the development baseline. Drift does not mean the model is wrong; it means the people it scores have changed and the model must be re-checked.`} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Score PSI" help="psi" value={d.psi.toFixed(3)} rag={rag[d.band]} sub={word[d.band]} />
        <Kpi label="Characteristics drifting" help="csi" value={`${d.csi.filter((c) => c.band !== 'stable').length} of ${d.csi.length}`} sub={`Highest: ${featureDef(d.csi[0].key).short} ${d.csi[0].csi.toFixed(3)}`} />
        <Kpi label="Mean score" value={d.meanScore.toFixed(0)} sub={`Development ${d.devMeanScore.toFixed(0)} (${d.meanScore - d.devMeanScore >= 0 ? '+' : ''}${(d.meanScore - d.devMeanScore).toFixed(1)})`} />
        <Kpi label="Approval rate at cut-off" value={pct(d.approvalRate)} sub={`Development ${pct(d.devApprovalRate)}`} />
      </div>

      <Panel className="mt-5" title="Stress the population" subtitle="Simulate a souring applicant pool: weaker credit quality, higher utilization, more inquiries. Every figure on the page recomputes." right={<button type="button" className={btnGhost} disabled={live} onClick={() => setSev(model.spec.drift)}>Reset to observed</button>}>
        <Slider label="Drift severity" value={sev} min={0} max={1.6} step={0.05} onChange={setSev} fmt={(v) => `${v.toFixed(2)}×${v === model.spec.drift ? ' (observed)' : ''}`} hint="0 = production looks exactly like development. 1 = a full credit-cycle downturn in the applicant mix." />
      </Panel>

      <div className="mt-5">
        <Finding rag={rag[d.band]} title={d.band === 'stable' ? 'Stable distribution: no action required' : d.band === 'moderate' ? 'Moderate drift: automated monitoring warning' : 'Significant drift: mandatory recalibration alert'}>
          Score PSI is {d.psi.toFixed(3)}. {d.band === 'stable' ? 'Below 0.10, the production population matches development.' : d.band === 'moderate' ? 'Between 0.10 and 0.25, a warning goes to the model owner and Model Risk, and the model is re-tested at the next cycle.' : 'Above 0.25, a recalibration alert is raised to ModelCompass.ai and the model should not be relied on without compensating controls.'} {!live && 'This is a what-if scenario, not the observed production state.'}
        </Finding>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Score distribution" help="psi" subtitle="Each band holds 10% of development applications by construction. Production bars that differ are the drift.">
          <PsiBars drift={d} />
        </Panel>
        <Panel title="Monthly PSI" help="psi" subtitle="Twelve monthly cohorts against the same baseline. The shift builds through the year.">
          <MonthlyPsi drift={d} />
        </Panel>
      </div>

      <Panel className="mt-5" title="Characteristic Stability Index" help="csi" subtitle="Which inputs moved. Same thresholds as PSI.">
        <HBars labelWidth={190} rows={d.csi.map((c) => ({ label: featureDef(c.key).short, value: c.csi, color: c.band === 'significant' ? p.fail : c.band === 'moderate' ? p.warn : p.series[0], note: word[c.band] }))} fmt={(v) => v.toFixed(3)} max={Math.max(0.3, d.csi[0].csi * 1.1)} marks={[{ at: 0.1, color: p.warn, label: '0.10 monitor' }, { at: 0.25, color: p.fail, label: '0.25 recalibrate' }]} />
      </Panel>
    </div>
  );
}
