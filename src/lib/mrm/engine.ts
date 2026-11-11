// MRM Security Engine: the quantitative core.
//
// Everything here is deterministic (seeded PRNG) and runs unchanged in the browser and on
// the server, so the UI, the REST API and the audit binder always agree to the last digit.
//
// The sandbox portfolio is SYNTHETIC. It stands in for the outputs of an IntelliDecision.ai
// scorecard: applicants are simulated, a Weight-of-Evidence logistic scorecard is actually
// fitted on them, and every statistic shown in the portal is computed from that fit.

// ---------------------------------------------------------------- PRNG

export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => {
    const r = Math.sqrt(-2 * Math.log(Math.max(u(), 1e-12)));
    return r * Math.cos(2 * Math.PI * u());
  };
  const poisson = (lambda: number) => {
    const L = Math.exp(-Math.min(lambda, 30));
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= u();
    } while (p > L);
    return k - 1;
  };
  return { u, n, poisson };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// ---------------------------------------------------------------- features & groups

export type FeatureKey =
  | 'repayment_history_12m'
  | 'debt_to_income_ratio'
  | 'revolving_utilization'
  | 'length_of_credit_history'
  | 'num_derogatory_repayments'
  | 'recent_credit_inquiries_6m'
  | 'annual_income'
  | 'geo_risk_index';

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  short: string;
  kind: 'cont' | 'count';
  /** Adverse action statement used when this feature is a principal reason for denial. */
  reason: string;
  fmt: (v: number) => string;
}

const pct0 = (v: number) => `${(v * 100).toFixed(0)}%`;
export const FEATURES: FeatureDef[] = [
  { key: 'repayment_history_12m', label: 'On-time repayment, last 12 months', short: 'Repayment history', kind: 'cont', reason: 'Delinquent past or present credit obligations', fmt: (v) => `${v.toFixed(0)}%` },
  { key: 'debt_to_income_ratio', label: 'Debt-to-income ratio', short: 'Debt-to-income', kind: 'cont', reason: 'Excessive obligations in relation to income', fmt: pct0 },
  { key: 'revolving_utilization', label: 'Revolving credit utilization', short: 'Utilization', kind: 'cont', reason: 'Proportion of revolving balances to credit limits is too high', fmt: pct0 },
  { key: 'length_of_credit_history', label: 'Length of credit history (years)', short: 'Credit history length', kind: 'cont', reason: 'Length of credit history is insufficient', fmt: (v) => `${v.toFixed(1)}y` },
  { key: 'num_derogatory_repayments', label: 'Derogatory repayment events', short: 'Derogatories', kind: 'count', reason: 'Derogatory public record or collection filed', fmt: (v) => v.toFixed(0) },
  { key: 'recent_credit_inquiries_6m', label: 'Credit inquiries, last 6 months', short: 'Recent inquiries', kind: 'count', reason: 'Too many recent inquiries for credit', fmt: (v) => v.toFixed(0) },
  { key: 'annual_income', label: 'Stated annual income (USD)', short: 'Income', kind: 'cont', reason: 'Income insufficient for amount of credit requested', fmt: (v) => `$${(v / 1000).toFixed(0)}k` },
  { key: 'geo_risk_index', label: 'ZIP-level historical loss index', short: 'Geo risk index', kind: 'cont', reason: 'Credit performance in the area of residence', fmt: (v) => v.toFixed(0) },
];
export const featureDef = (k: FeatureKey) => FEATURES.find((f) => f.key === k)!;
const ALL_KEYS = FEATURES.map((f) => f.key);

export type GroupKey = 'age_over_62' | 'gender_female' | 'minority_tract';
export interface GroupDef {
  key: GroupKey;
  label: string;
  protectedLabel: string;
  controlLabel: string;
  basis: string;
}
export const GROUPS: GroupDef[] = [
  { key: 'age_over_62', label: 'Age', protectedLabel: 'Age 62 and over', controlLabel: 'Under 62', basis: 'ECOA / Reg B prohibited basis: age' },
  { key: 'gender_female', label: 'Sex', protectedLabel: 'Female', controlLabel: 'Male', basis: 'ECOA / Reg B prohibited basis: sex' },
  { key: 'minority_tract', label: 'Race / ethnicity proxy', protectedLabel: 'Majority-minority census tract', controlLabel: 'Other tracts', basis: 'ECOA / Reg B prohibited basis: race, national origin (geography proxy)' },
];

// ---------------------------------------------------------------- model specs

export interface ModelSpec {
  id: string;
  name: string;
  product: string;
  modelType: string;
  tier: 1 | 2 | 3;
  owner: string;
  version: string;
  seed: number;
  /** How strongly the ZIP-level index tracks majority-minority tracts (0 = not at all). */
  proxy: number;
  /** Latent credit-quality gap for the proxy group that is real, not proxy-driven. */
  zGap: number;
  /** Default production drift severity (0 = none, 1 = the spec's full shift). */
  drift: number;
  /** Target approval rate that sets the default cut-off. */
  approval: number;
  baseScore: number;
  pdo: number;
  baseOdds: number;
  lastValidated: string;
}

export const MODELS: ModelSpec[] = [
  { id: 'mdl_credit_scorecard_v4', name: 'Unsecured Personal Loan Scorecard', product: 'Unsecured personal loans', modelType: 'WoE_Logistic_Scorecard', tier: 1, owner: 'Retail Credit Risk', version: 'v4.0', seed: 4107, proxy: 1, zGap: 0.1, drift: 0.62, approval: 0.6, baseScore: 600, pdo: 20, baseOdds: 30, lastValidated: '2025-11-18' },
  { id: 'mdl_card_origination_v2', name: 'Credit Card Origination Scorecard', product: 'Consumer credit cards', modelType: 'WoE_Logistic_Scorecard', tier: 1, owner: 'Cards Risk Strategy', version: 'v2.3', seed: 2203, proxy: 0.12, zGap: 0.05, drift: 0.15, approval: 0.66, baseScore: 600, pdo: 20, baseOdds: 30, lastValidated: '2026-05-06' },
  { id: 'mdl_auto_loan_v3', name: 'Indirect Auto Loan Scorecard', product: 'Indirect auto lending', modelType: 'WoE_Logistic_Scorecard', tier: 2, owner: 'Auto Finance Analytics', version: 'v3.1', seed: 3301, proxy: 0.3, zGap: 0.08, drift: 0.95, approval: 0.63, baseScore: 600, pdo: 20, baseOdds: 30, lastValidated: '2025-08-29' },
];
export const modelSpec = (id: string) => MODELS.find((m) => m.id === id);

// ---------------------------------------------------------------- synthetic applicants

export interface Sample {
  n: number;
  X: Record<FeatureKey, Float64Array>;
  bad: Uint8Array;
  G: Record<GroupKey, Uint8Array>;
}

/** Simulate n credit applications. `shift` (0..2) moves the population the way a souring book does. */
export function generate(spec: ModelSpec, n: number, seed: number, shift = 0): Sample {
  const r = rng(seed);
  const X = Object.fromEntries(ALL_KEYS.map((k) => [k, new Float64Array(n)])) as Sample['X'];
  const G = { age_over_62: new Uint8Array(n), gender_female: new Uint8Array(n), minority_tract: new Uint8Array(n) };
  const bad = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const age = r.u() < 0.16 ? 1 : 0;
    const fem = r.u() < 0.5 ? 1 : 0;
    const min = r.u() < 0.28 ? 1 : 0;
    G.age_over_62[i] = age;
    G.gender_female[i] = fem;
    G.minority_tract[i] = min;
    // z: latent creditworthiness. g: local economy factor (a genuine, non-demographic risk driver).
    const z = r.n() - spec.zGap * min - 0.45 * shift;
    const g = r.n();
    X.repayment_history_12m[i] = clamp(100 - Math.exp(1.5 - 0.6 * z + 0.95 * r.n()), 40, 100);
    const income = Math.exp(11.0 + 0.2 * z + 0.42 * r.n() - 0.34 * age - 0.07 * fem - 0.06 * min + 0.05 * shift);
    X.annual_income[i] = income;
    X.debt_to_income_ratio[i] = clamp(0.33 - 0.08 * z + 0.09 * r.n() + 0.03 * shift, 0.02, 0.95);
    X.revolving_utilization[i] = clamp(0.42 - 0.18 * z + 0.17 * r.n() + 0.07 * shift, 0, 1.3);
    X.length_of_credit_history[i] = clamp(9 + 2 * z + 4.5 * r.n() + 5 * age - 1.2 * shift, 0.5, 45);
    X.num_derogatory_repayments[i] = r.poisson(Math.exp(-1.25 - 0.95 * z));
    X.recent_credit_inquiries_6m[i] = r.poisson(Math.exp(0.15 - 0.5 * z + 0.3 * shift));
    X.geo_risk_index[i] = clamp(40 + 9 * g + 24 * spec.proxy * min - 2 * z + 5 * r.n(), 0, 100);
    bad[i] = r.u() < sigmoid(-2.6 - 1.45 * z + 0.3 * g) ? 1 : 0;
  }
  return { n, X, bad, G };
}

// ---------------------------------------------------------------- WoE scorecard

export interface Bin {
  lo: number; // inclusive lower edge (-Infinity for the first bin)
  hi: number; // exclusive upper edge (+Infinity for the last bin)
  label: string;
  n: number;
  share: number;
  badRate: number;
  woe: number;
  points: number;
}
export interface CardFeature {
  key: FeatureKey;
  edges: number[]; // interior cut points
  bins: Bin[];
  iv: number;
  beta: number;
}
export interface Card {
  features: CardFeature[];
  intercept: number;
  factor: number;
  offset: number;
  minScore: number;
  maxScore: number;
}

function quantileEdges(v: Float64Array, idx: Int32Array, k: number): number[] {
  const s = Array.from(idx, (i) => v[i]).sort((a, b) => a - b);
  const edges: number[] = [];
  for (let q = 1; q < k; q++) {
    const e = s[Math.floor((q / k) * s.length)];
    if (!edges.length || e > edges[edges.length - 1]) edges.push(e);
  }
  return edges;
}

export function binOf(edges: number[], x: number): number {
  let b = 0;
  while (b < edges.length && x >= edges[b]) b++;
  return b;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r2 = c + 1; r2 < n; r2++) if (Math.abs(M[r2][c]) > Math.abs(M[p][c])) p = r2;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r2 = 0; r2 < n; r2++) {
      if (r2 === c) continue;
      const f = M[r2][c];
      if (f) for (let j = c; j <= n; j++) M[r2][j] -= f * M[c][j];
    }
  }
  return M.map((row) => row[n]);
}

/** Fit a WoE logistic scorecard on the rows in `idx` using the given features. */
export function fitCard(s: Sample, idx: Int32Array, keys: FeatureKey[], spec: Pick<ModelSpec, 'baseScore' | 'pdo' | 'baseOdds'>): Card {
  const m = idx.length;
  let B = 0;
  for (const i of idx) B += s.bad[i];
  const Gd = m - B;
  // 1. WoE binning
  const feats = keys.map((key) => {
    const def = featureDef(key);
    const v = s.X[key];
    const edges = def.kind === 'count' ? [1, 2, 3] : quantileEdges(v, idx, 6);
    const nb = edges.length + 1;
    const cnt = new Array(nb).fill(0);
    const bd = new Array(nb).fill(0);
    for (const i of idx) {
      const b = binOf(edges, v[i]);
      cnt[b]++;
      bd[b] += s.bad[i];
    }
    let iv = 0;
    const bins: Bin[] = cnt.map((c, b) => {
      const pb = (bd[b] + 0.5) / (B + 0.5 * nb);
      const pg = (c - bd[b] + 0.5) / (Gd + 0.5 * nb);
      const woe = Math.log(pg / pb);
      iv += (pg - pb) * woe;
      const lo = b === 0 ? -Infinity : edges[b - 1];
      const hi = b === nb - 1 ? Infinity : edges[b];
      const label = def.kind === 'count' ? (b === nb - 1 ? `${edges[b - 1]}+` : String(b)) : b === 0 ? `< ${def.fmt(hi)}` : b === nb - 1 ? `≥ ${def.fmt(lo)}` : `${def.fmt(lo)} – ${def.fmt(hi)}`;
      return { lo, hi, label, n: c, share: c / m, badRate: c ? bd[b] / c : 0, woe, points: 0 };
    });
    return { key, edges, bins, iv, beta: 0 };
  });
  // 2. Logistic regression of bad on WoE (Newton-Raphson)
  const p = feats.length + 1;
  const W = feats.map((f) => {
    const col = new Float64Array(m);
    const v = s.X[f.key];
    for (let j = 0; j < m; j++) col[j] = f.bins[binOf(f.edges, v[idx[j]])].woe;
    return col;
  });
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(B / Gd);
  const row = new Array(p).fill(1);
  for (let it = 0; it < 12; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    for (let j = 0; j < m; j++) {
      let eta = beta[0];
      for (let k = 1; k < p; k++) {
        row[k] = W[k - 1][j];
        eta += beta[k] * row[k];
      }
      const mu = sigmoid(eta);
      const w = mu * (1 - mu);
      const e = s.bad[idx[j]] - mu;
      for (let a = 0; a < p; a++) {
        g[a] += row[a] * e;
        for (let b = a; b < p; b++) H[a][b] += w * row[a] * row[b];
      }
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    for (let a = 0; a < p; a++) H[a][a] += 1e-6;
    const step = solve(H, g);
    beta = beta.map((b, k) => b + step[k]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  // 3. Scale to points: score = offset + factor * ln(odds of good)
  const factor = spec.pdo / Math.LN2;
  const offset = spec.baseScore - factor * Math.log(spec.baseOdds);
  const base = (offset - factor * beta[0]) / feats.length;
  let minScore = 0;
  let maxScore = 0;
  feats.forEach((f, k) => {
    f.beta = beta[k + 1];
    for (const b of f.bins) b.points = Math.round(base - factor * f.beta * b.woe);
    minScore += Math.min(...f.bins.map((b) => b.points));
    maxScore += Math.max(...f.bins.map((b) => b.points));
  });
  return { features: feats, intercept: beta[0], factor, offset, minScore, maxScore };
}

/** Points per feature for one applicant described by raw feature values. */
export function pointsFor(card: Card, x: (k: FeatureKey) => number): number[] {
  return card.features.map((f) => f.bins[binOf(f.edges, x(f.key))].points);
}

export interface Scored {
  score: Int16Array;
  /** pts[f][i]: points feature f contributes to applicant i. */
  pts: Int16Array[];
}
export function scoreSample(card: Card, s: Sample): Scored {
  const score = new Int16Array(s.n);
  const pts = card.features.map((f) => {
    const col = new Int16Array(s.n);
    const v = s.X[f.key];
    for (let i = 0; i < s.n; i++) {
      const pt = f.bins[binOf(f.edges, v[i])].points;
      col[i] = pt;
      score[i] += pt;
    }
    return col;
  });
  return { score, pts };
}

// ---------------------------------------------------------------- discrimination metrics

export interface Discrimination {
  ks: number;
  auc: number;
  gini: number;
  ksScore: number;
  n: number;
  badRate: number;
}
export interface Curves {
  rocCurve: { fpr: number; tpr: number }[];
  ksCurve: { score: number; cumBad: number; cumGood: number }[];
}

export function discrimination(score: ArrayLike<number>, bad: ArrayLike<number>, idx: Int32Array, withCurves = false): Discrimination & Partial<Curves> {
  const order = Array.from(idx).sort((a, b) => score[a] - score[b]);
  let B = 0;
  for (const i of order) B += bad[i];
  const Gd = order.length - B;
  let cb = 0;
  let cg = 0;
  let ks = 0;
  let ksScore = 0;
  let auc = 0;
  const roc: Curves['rocCurve'] = [{ fpr: 0, tpr: 0 }];
  const ksc: Curves['ksCurve'] = [];
  for (let j = 0; j < order.length; ) {
    // group ties so AUC and KS are evaluated between distinct score values
    let k = j;
    let tb = 0;
    let tg = 0;
    while (k < order.length && score[order[k]] === score[order[j]]) {
      if (bad[order[k]]) tb++;
      else tg++;
      k++;
    }
    auc += tg * (cb + tb / 2); // bads scored below (or tied with) each good
    cb += tb;
    cg += tg;
    const d = cb / B - cg / Gd;
    if (d > ks) {
      ks = d;
      ksScore = score[order[j]];
    }
    if (withCurves) {
      roc.push({ fpr: cg / Gd, tpr: cb / B });
      ksc.push({ score: score[order[j]], cumBad: cb / B, cumGood: cg / Gd });
    }
    j = k;
  }
  auc /= B * Gd;
  const out: Discrimination & Partial<Curves> = { ks, auc, gini: 2 * auc - 1, ksScore, n: order.length, badRate: B / order.length };
  if (withCurves) {
    out.rocCurve = roc;
    out.ksCurve = ksc;
  }
  return out;
}

// ---------------------------------------------------------------- stability

/** Population Stability Index between two sets of bin proportions (same bins). */
export function psi(expected: number[], actual: number[]): number {
  let v = 0;
  for (let k = 0; k < expected.length; k++) {
    const e = Math.max(expected[k], 1e-4);
    const a = Math.max(actual[k], 1e-4);
    v += (a - e) * Math.log(a / e);
  }
  return v;
}
export type PsiBand = 'stable' | 'moderate' | 'significant';
export const psiBand = (v: number): PsiBand => (v < 0.1 ? 'stable' : v <= 0.25 ? 'moderate' : 'significant');

function proportions(values: ArrayLike<number>, edges: number[], n: number, from = 0): number[] {
  const c = new Array(edges.length + 1).fill(0);
  for (let i = from; i < from + n; i++) c[binOf(edges, values[i])]++;
  return c.map((x) => x / n);
}

// ---------------------------------------------------------------- the fitted model

export interface Model {
  spec: ModelSpec;
  dev: Sample;
  train: Int32Array;
  test: Int32Array;
  card: Card;
  scored: Scored;
  perf: { train: Discrimination; test: Discrimination & Curves };
  cutoff: number;
  /** Mean |SHAP| per feature in score points (exact for an additive scorecard). */
  shap: { key: FeatureKey; meanAbs: number; share: number }[];
  scoreEdges: number[]; // decile edges of development scores, the PSI baseline bins
  calibration: { score: number; n: number; observedOdds: number; expectedOdds: number }[];
  hist: { lo: number; step: number; good: number[]; bad: number[] };
}

const DEV_N = 10_000;
export const PROD_N = 10_000;

function cutoffFor(score: ArrayLike<number>, n: number, approval: number): number {
  const s = Array.from({ length: n }, (_, i) => score[i]).sort((a, b) => b - a);
  return s[Math.min(n - 1, Math.floor(approval * n))];
}

function meanAbsShap(scored: Scored, card: Card, n: number) {
  const raw = card.features.map((f, k) => {
    const col = scored.pts[k];
    let mean = 0;
    for (let i = 0; i < n; i++) mean += col[i];
    mean /= n;
    let abs = 0;
    for (let i = 0; i < n; i++) abs += Math.abs(col[i] - mean);
    return { key: f.key, meanAbs: abs / n };
  });
  const tot = raw.reduce((a, b) => a + b.meanAbs, 0);
  return raw.map((x) => ({ ...x, share: x.meanAbs / tot })).sort((a, b) => b.meanAbs - a.meanAbs);
}

const cache = new Map<string, Model>();

export function buildModel(spec: ModelSpec): Model {
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const dev = generate(spec, DEV_N, spec.seed);
  const cut = Math.floor(DEV_N * 0.7);
  const train = Int32Array.from({ length: cut }, (_, i) => i);
  const test = Int32Array.from({ length: DEV_N - cut }, (_, i) => cut + i);
  const card = fitCard(dev, train, ALL_KEYS, spec);
  const scored = scoreSample(card, dev);
  const perfTrain = discrimination(scored.score, dev.bad, train);
  const perfTest = discrimination(scored.score, dev.bad, test, true) as Discrimination & Curves;
  const cutoff = cutoffFor(scored.score, DEV_N, spec.approval);
  // PSI baseline: decile edges of the development score distribution
  const sorted = Array.from(scored.score).sort((a, b) => a - b);
  const scoreEdges: number[] = [];
  for (let q = 1; q < 10; q++) {
    const e = sorted[Math.floor((q / 10) * DEV_N)];
    if (!scoreEdges.length || e > scoreEdges[scoreEdges.length - 1]) scoreEdges.push(e);
  }
  // Calibration: observed vs expected good:bad odds by 20-point score band (holdout)
  const bands = new Map<number, { n: number; bad: number }>();
  for (const i of test) {
    const b = Math.floor(scored.score[i] / 20) * 20;
    const e = bands.get(b) ?? { n: 0, bad: 0 };
    e.n++;
    e.bad += dev.bad[i];
    bands.set(b, e);
  }
  const calibration = [...bands.entries()]
    .filter(([, e]) => e.n >= 60 && e.bad >= 3 && e.bad < e.n)
    .sort((a, b) => a[0] - b[0])
    .map(([b, e]) => ({ score: b + 10, n: e.n, observedOdds: (e.n - e.bad) / e.bad, expectedOdds: Math.exp((b + 10 - card.offset) / card.factor) }));
  // Score histogram (all development rows), 10-point bins
  const lo = Math.floor(sorted[0] / 10) * 10;
  const nb = Math.floor((sorted[DEV_N - 1] - lo) / 10) + 1;
  const hist = { lo, step: 10, good: new Array(nb).fill(0), bad: new Array(nb).fill(0) };
  for (let i = 0; i < DEV_N; i++) (dev.bad[i] ? hist.bad : hist.good)[Math.floor((scored.score[i] - lo) / 10)]++;
  const model: Model = { spec, dev, train, test, card, scored, perf: { train: perfTrain, test: perfTest }, cutoff, shap: meanAbsShap(scored, card, DEV_N), scoreEdges, calibration, hist };
  cache.set(spec.id, model);
  return model;
}

// ---------------------------------------------------------------- fair lending

export type DirStatus = 'COMPLIANT_PASS' | 'WATCH' | 'ADVERSE_IMPACT_FLAG';
export const dirStatus = (dir: number): DirStatus => (dir < 0.8 ? 'ADVERSE_IMPACT_FLAG' : dir < 0.9 ? 'WATCH' : 'COMPLIANT_PASS');

export interface GroupResult {
  group: GroupDef;
  protectedN: number;
  controlN: number;
  protectedApproval: number;
  controlApproval: number;
  dir: number;
  status: DirStatus;
  /** Score-gap decomposition: how many points of the mean score gap each feature explains. */
  drivers: { key: FeatureKey; gapPoints: number; share: number }[];
  scoreGap: number;
}
export interface Fairness {
  cutoff: number;
  approvalRate: number;
  groups: GroupResult[];
  minDir: number;
  worst: GroupResult;
  reasons: { key: FeatureKey; reason: string; count: number; share: number }[];
  declined: number;
}

function groupResults(card: Card, scored: Scored, s: Sample, cutoff: number): GroupResult[] {
  return GROUPS.map((group) => {
    const flag = s.G[group.key];
    let pn = 0;
    let cn = 0;
    let pa = 0;
    let ca = 0;
    const pm = new Array(card.features.length).fill(0);
    const cm = new Array(card.features.length).fill(0);
    for (let i = 0; i < s.n; i++) {
      const ok = scored.score[i] >= cutoff ? 1 : 0;
      if (flag[i]) {
        pn++;
        pa += ok;
        for (let k = 0; k < pm.length; k++) pm[k] += scored.pts[k][i];
      } else {
        cn++;
        ca += ok;
        for (let k = 0; k < cm.length; k++) cm[k] += scored.pts[k][i];
      }
    }
    const gaps = card.features.map((f, k) => ({ key: f.key, gapPoints: cm[k] / cn - pm[k] / pn }));
    const adverse = gaps.reduce((a, g) => a + Math.max(0, g.gapPoints), 0) || 1;
    const drivers = gaps.map((g) => ({ ...g, share: Math.max(0, g.gapPoints) / adverse })).sort((a, b) => b.gapPoints - a.gapPoints);
    const dir = pa / pn / (ca / cn);
    return { group, protectedN: pn, controlN: cn, protectedApproval: pa / pn, controlApproval: ca / cn, dir, status: dirStatus(dir), drivers, scoreGap: gaps.reduce((a, g) => a + g.gapPoints, 0) };
  });
}

export function fairness(model: Model, cutoff = model.cutoff): Fairness {
  const { card, scored, dev } = model;
  const groups = groupResults(card, scored, dev, cutoff);
  // Adverse action: the principal reason is the feature that falls furthest below the average
  // points earned by approved applicants (the "points below neutral" method).
  const maxPts = card.features.map((_, k) => {
    let t = 0;
    let n = 0;
    for (let i = 0; i < dev.n; i++)
      if (scored.score[i] >= cutoff) {
        t += scored.pts[k][i];
        n++;
      }
    return n ? t / n : 0;
  });
  const counts = new Array(card.features.length).fill(0);
  let declined = 0;
  for (let i = 0; i < dev.n; i++) {
    if (scored.score[i] >= cutoff) continue;
    declined++;
    let top = 0;
    let worst = -1;
    for (let k = 0; k < maxPts.length; k++) {
      const short = maxPts[k] - scored.pts[k][i];
      if (short > worst) {
        worst = short;
        top = k;
      }
    }
    counts[top]++;
  }
  const reasons = card.features
    .map((f, k) => ({ key: f.key, reason: featureDef(f.key).reason, count: counts[k], share: declined ? counts[k] / declined : 0 }))
    .sort((a, b) => b.count - a.count);
  const worst = groups.reduce((a, b) => (b.dir < a.dir ? b : a));
  return { cutoff, approvalRate: 1 - declined / dev.n, groups, minDir: worst.dir, worst, reasons, declined };
}

export interface Alternative {
  dropped: FeatureKey | null;
  label: string;
  ks: number;
  auc: number;
  cutoff: number;
  minDir: number;
  dirs: Record<GroupKey, number>;
  ksDelta: number;
}

const ldaCache = new Map<string, Alternative[]>();
/** Less-discriminatory-alternative search: refit without each feature at the same approval rate. */
export function alternatives(model: Model): Alternative[] {
  const hit = ldaCache.get(model.spec.id);
  if (hit) return hit;
  const { dev, train, test, spec } = model;
  const run = (dropped: FeatureKey | null): Alternative => {
    const keys = ALL_KEYS.filter((k) => k !== dropped);
    const card = dropped ? fitCard(dev, train, keys, spec) : model.card;
    const scored = dropped ? scoreSample(card, dev) : model.scored;
    const d = discrimination(scored.score, dev.bad, test);
    const cutoff = dropped ? cutoffFor(scored.score, dev.n, spec.approval) : model.cutoff;
    const gr = groupResults(card, scored, dev, cutoff);
    const dirs = Object.fromEntries(gr.map((g) => [g.group.key, g.dir])) as Record<GroupKey, number>;
    return { dropped, label: dropped ? `Without ${featureDef(dropped).short.toLowerCase()}` : 'Champion (all features)', ks: d.ks, auc: d.auc, cutoff, minDir: Math.min(...gr.map((g) => g.dir)), dirs, ksDelta: 0 };
  };
  const champion = run(null);
  const out = [champion, ...ALL_KEYS.map((k) => run(k))].map((a) => ({ ...a, ksDelta: a.ks - champion.ks }));
  ldaCache.set(model.spec.id, out);
  return out;
}

/** The alternative with the best worst-group DIR that costs no more than `maxKsLoss` of KS. */
export function recommendedAlternative(alts: Alternative[], maxKsLoss = 0.02): Alternative | null {
  const champion = alts[0];
  const best = alts
    .slice(1)
    .filter((a) => a.ksDelta >= -maxKsLoss && a.minDir > champion.minDir + 0.01)
    .sort((a, b) => b.minDir - a.minDir)[0];
  return best ?? null;
}

// ---------------------------------------------------------------- drift

export interface Drift {
  severity: number;
  psi: number;
  band: PsiBand;
  expected: number[];
  actual: number[];
  binLabels: string[];
  csi: { key: FeatureKey; csi: number; band: PsiBand; expected: number[]; actual: number[]; labels: string[] }[];
  monthly: { month: string; psi: number; band: PsiBand }[];
  approvalRate: number;
  devApprovalRate: number;
  meanScore: number;
  devMeanScore: number;
}

const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
const driftCache = new Map<string, Drift>();

/** Compare 10,000 simulated production applications against the development baseline. */
export function drift(model: Model, severity = model.spec.drift): Drift {
  const key = `${model.spec.id}:${severity.toFixed(3)}`;
  const hit = driftCache.get(key);
  if (hit) return hit;
  const { spec, card, scored, dev, scoreEdges } = model;
  const prod = generate(spec, PROD_N, spec.seed + 7919, severity);
  const ps = scoreSample(card, prod);
  const expected = proportions(scored.score, scoreEdges, dev.n);
  const actual = proportions(ps.score, scoreEdges, prod.n);
  const binLabels = expected.map((_, b) => (b === 0 ? `< ${scoreEdges[0]}` : b === scoreEdges.length ? `≥ ${scoreEdges[b - 1]}` : `${scoreEdges[b - 1]}–${scoreEdges[b] - 1}`));
  const csi = card.features
    .map((f) => {
      const e = proportions(dev.X[f.key], f.edges, dev.n);
      const a = proportions(prod.X[f.key], f.edges, prod.n);
      const v = psi(e, a);
      return { key: f.key, csi: v, band: psiBand(v), expected: e, actual: a, labels: f.bins.map((b) => b.label) };
    })
    .sort((a, b) => b.csi - a.csi);
  // Twelve monthly cohorts: the shift builds up over the year to reach `severity` in the latest month.
  const per = 2500;
  const monthly = MONTHS.map((month, m) => {
    const cohort = generate(spec, per, spec.seed + 101 * (m + 1), severity * Math.pow(m / 11, 1.4));
    const v = psi(expected, proportions(scoreSample(card, cohort).score, scoreEdges, per));
    return { month, psi: v, band: psiBand(v) };
  });
  const mean = (a: ArrayLike<number>, n: number) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += a[i];
    return t / n;
  };
  const appr = (a: ArrayLike<number>, n: number) => {
    let t = 0;
    for (let i = 0; i < n; i++) if (a[i] >= model.cutoff) t++;
    return t / n;
  };
  const v = psi(expected, actual);
  const out: Drift = { severity, psi: v, band: psiBand(v), expected, actual, binLabels, csi, monthly, approvalRate: appr(ps.score, prod.n), devApprovalRate: appr(scored.score, dev.n), meanScore: mean(ps.score, prod.n), devMeanScore: mean(scored.score, dev.n) };
  if (driftCache.size > 64) driftCache.clear();
  driftCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- headline summary

export type Rag = 'pass' | 'warn' | 'fail';
export interface Summary {
  id: string;
  ks: number;
  gini: number;
  auc: number;
  ksGap: number;
  minDir: number;
  worstGroup: string;
  psi: number;
  performance: Rag;
  fairLending: Rag;
  stability: Rag;
  overall: Rag;
  findings: string[];
}

export function summarize(model: Model): Summary {
  const f = fairness(model);
  const d = drift(model);
  const { train, test } = model.perf;
  const ksGap = train.ks - test.ks;
  const performance: Rag = test.ks < 0.3 || test.auc < 0.7 ? 'fail' : ksGap > 0.07 ? 'warn' : 'pass';
  const fairLending: Rag = f.minDir < 0.8 ? 'fail' : f.minDir < 0.9 ? 'warn' : 'pass';
  const stability: Rag = d.band === 'significant' ? 'fail' : d.band === 'moderate' ? 'warn' : 'pass';
  const all = [performance, fairLending, stability];
  const overall: Rag = all.includes('fail') ? 'fail' : all.includes('warn') ? 'warn' : 'pass';
  const findings: string[] = [];
  if (fairLending === 'fail') findings.push(`Disparate impact ratio ${f.minDir.toFixed(3)} for ${f.worst.group.protectedLabel.toLowerCase()} is below the 0.80 four-fifths threshold.`);
  if (fairLending === 'warn') findings.push(`Disparate impact ratio ${f.minDir.toFixed(3)} for ${f.worst.group.protectedLabel.toLowerCase()} passes the four-fifths rule but sits in the 0.80–0.90 watch band.`);
  if (stability === 'fail') findings.push(`Score PSI ${d.psi.toFixed(3)} exceeds 0.25: significant population drift, recalibration required.`);
  if (stability === 'warn') findings.push(`Score PSI ${d.psi.toFixed(3)} is in the 0.10–0.25 band: moderate drift, monitoring warning raised.`);
  if (performance !== 'pass') findings.push(`Holdout KS ${test.ks.toFixed(3)} vs development ${train.ks.toFixed(3)}: review discrimination and overfit.`);
  if (!findings.length) findings.push('No threshold breaches. Model is within policy on performance, fair lending and stability.');
  return { id: model.spec.id, ks: test.ks, gini: test.gini, auc: test.auc, ksGap, minDir: f.minDir, worstGroup: f.worst.group.protectedLabel, psi: d.psi, performance, fairLending, stability, overall, findings };
}

// ---------------------------------------------------------------- DIR across cut-offs

export interface DirCurvePoint {
  cutoff: number;
  approval: number;
  dir: Record<GroupKey, number>;
}
const curveCache = new Map<string, DirCurvePoint[]>();
/** How each group's disparate impact ratio moves as the cut-off moves (approval 15%..92%). */
export function dirCurve(model: Model): DirCurvePoint[] {
  const hit = curveCache.get(model.spec.id);
  if (hit) return hit;
  const { scored, dev } = model;
  const lo = cutoffFor(scored.score, dev.n, 0.92);
  const hi = cutoffFor(scored.score, dev.n, 0.15);
  const out: DirCurvePoint[] = [];
  for (let c = lo; c <= hi; c += 2) {
    const a = { age_over_62: [0, 0, 0, 0], gender_female: [0, 0, 0, 0], minority_tract: [0, 0, 0, 0] } as Record<GroupKey, number[]>;
    let ok = 0;
    for (let i = 0; i < dev.n; i++) {
      const pass = scored.score[i] >= c ? 1 : 0;
      ok += pass;
      for (const g of GROUPS) {
        const t = a[g.key];
        if (dev.G[g.key][i]) {
          t[0]++;
          t[1] += pass;
        } else {
          t[2]++;
          t[3] += pass;
        }
      }
    }
    out.push({ cutoff: c, approval: ok / dev.n, dir: Object.fromEntries(GROUPS.map((g) => [g.key, a[g.key][1] / a[g.key][0] / (a[g.key][3] / a[g.key][2] || 1)])) as Record<GroupKey, number> });
  }
  curveCache.set(model.spec.id, out);
  return out;
}
