'use client';

import { useState } from 'react';
import { CalibrationChart, KsChart, RocChart, ShapBars } from '@/components/mrm/figures';
import { Help, Kpi, PageHead, Panel, td, tdn, th, thn } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { featureDef, summarize } from '@/lib/mrm/engine';

const ivBand = (iv: number) => (iv >= 0.5 ? 'Very strong: review' : iv >= 0.3 ? 'Strong' : iv >= 0.1 ? 'Medium' : 'Weak');

export default function Performance() {
  const { model } = useMrm();
  const { card, perf, spec } = model;
  const sum = summarize(model);
  const [open, setOpen] = useState(card.features[0].key);
  const feats = [...card.features].sort((a, b) => b.iv - a.iv);
  const f = card.features.find((x) => x.key === open) ?? card.features[0];
  const maxBad = Math.max(...f.bins.map((b) => b.badRate));
  return (
    <div>
      <PageHead title="Performance & explainability" lead={`Does ${spec.name} ${spec.version} separate good payers from bad, does its score scale mean what it says, and what drives it. Development sample ${model.train.length.toLocaleString()}, holdout ${model.test.length.toLocaleString()}.`} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="KS, holdout" help="ks" value={perf.test.ks.toFixed(3)} rag={sum.performance} sub={`Development ${perf.train.ks.toFixed(3)} · gap ${Math.abs(sum.ksGap).toFixed(3)}`} />
        <Kpi label="Gini, holdout" help="gini" value={perf.test.gini.toFixed(3)} sub={`Development ${perf.train.gini.toFixed(3)}`} />
        <Kpi label="AUC-ROC, holdout" help="auc" value={perf.test.auc.toFixed(3)} sub={`Development ${perf.train.auc.toFixed(3)}`} />
        <Kpi label="Score scale" help="pdo" value={`${spec.baseScore} / ${spec.pdo}`} sub={`${spec.baseScore} points at ${spec.baseOdds}:1 odds, PDO ${spec.pdo}`} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Kolmogorov-Smirnov separation" help="ks" subtitle="The widest gap between the two curves is the KS statistic.">
          <KsChart model={model} />
        </Panel>
        <Panel title="ROC curve" help="auc" subtitle="Holdout sample. The further the curve bows from the diagonal, the better the ranking.">
          <RocChart model={model} />
        </Panel>
        <Panel title="Feature attribution" help="shap" subtitle="Mean absolute SHAP per characteristic, in score points. Exact for an additive scorecard.">
          <ShapBars model={model} />
        </Panel>
        <Panel title="Scale calibration" help="pdo" subtitle="Observed good:bad odds in each 20-point band against the odds the score scale promises.">
          <CalibrationChart model={model} />
        </Panel>
      </div>
      <Panel className="mt-5" title="Scorecard" subtitle="Select a characteristic to see its bins. Points are what an applicant in that bin receives." pad={false}>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="overflow-x-auto border-b border-line/60 lg:border-b-0 lg:border-r">
            <table className="w-full min-w-[380px]">
              <thead>
                <tr className="border-b border-line/60">
                  <th className={th}>Characteristic</th>
                  <th className={thn}>
                    <span className="inline-flex items-center gap-1.5">
                      IV <Help id="iv" />
                    </span>
                  </th>
                  <th className={th}>Strength</th>
                </tr>
              </thead>
              <tbody>
                {feats.map((x) => (
                  <tr key={x.key} onClick={() => setOpen(x.key)} className={`cursor-pointer border-b border-line/40 last:border-0 ${x.key === open ? 'bg-brand/[0.08]' : 'hover:bg-raised/40'}`}>
                    <td className={`${td} ${x.key === open ? 'font-medium text-ink' : ''}`}>
                      <button type="button" className="text-left" onClick={() => setOpen(x.key)}>
                        {featureDef(x.key).label}
                      </button>
                    </td>
                    <td className={tdn}>{x.iv.toFixed(3)}</td>
                    <td className={td}>{ivBand(x.iv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px]">
              <thead>
                <tr className="border-b border-line/60">
                  <th className={th}>{featureDef(f.key).short}</th>
                  <th className={thn}>Share</th>
                  <th className={th}>Bad rate</th>
                  <th className={thn}>
                    <span className="inline-flex items-center gap-1.5">
                      WoE <Help id="woe" />
                    </span>
                  </th>
                  <th className={thn}>Points</th>
                </tr>
              </thead>
              <tbody>
                {f.bins.map((b) => (
                  <tr key={b.label} className="border-b border-line/40 last:border-0">
                    <td className={`${td} num`}>{b.label}</td>
                    <td className={tdn}>{(b.share * 100).toFixed(1)}%</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-line/50">
                          <div className="h-2 rounded-full bg-[#DB2777]" style={{ width: `${((b.badRate / maxBad) * 100).toFixed(2)}%` }} />
                        </div>
                        <span className="num">{(b.badRate * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={tdn}>{b.woe >= 0 ? '+' : ''}{b.woe.toFixed(3)}</td>
                    <td className={`${tdn} font-semibold text-ink`}>{b.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
}
