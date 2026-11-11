// The open REST contract (PRD 1.2) and the role model (PRD 3.4). Shared by the API routes,
// the gateway console and the docs, so the published schema is the one that is enforced.

import { z } from 'zod';
import { FEATURES, PROD_N, drift, dirStatus, fairness, psi, psiBand, type Model } from './engine.ts';

export const API_VERSION = 'v1.0';

const rate = z.number().min(0).max(1);

export const InputPayload = z.object({
  model_metadata: z.object({
    model_id: z.string().min(3).max(80).regex(/^[A-Za-z0-9_.-]+$/, 'letters, digits, _ . - only'),
    model_type: z.string().min(2).max(80),
    target_variable: z.string().min(1).max(80),
    base_score: z.number().min(0).max(2000),
    points_to_double_odds: z.number().positive().max(200),
  }),
  statistical_metrics: z.object({
    ks_statistic: rate,
    gini_coefficient: z.number().min(-1).max(1),
    auc_roc: rate,
  }),
  shap_importance_vector: z
    .array(z.object({ feature: z.string().min(1).max(80), shap_mean_abs: z.number().min(0) }))
    .min(1)
    .max(200),
  // Optional extension blocks. Aggregates only: the engine never receives applicant-level or protected data.
  approval_outcomes: z
    .array(z.object({ protected_attribute: z.string().min(1).max(80), protected_group_approval_rate: rate, control_group_approval_rate: rate.gt(0) }))
    .max(20)
    .optional(),
  score_distribution: z
    .object({ expected: z.array(rate).min(2).max(50), actual: z.array(rate).min(2).max(50) })
    .refine((d) => d.expected.length === d.actual.length, 'expected and actual must have the same number of bins')
    .optional(),
});
export type InputPayload = z.infer<typeof InputPayload>;

/** Accepts either the full envelope from the PRD or the bare input_payload. */
export const Envelope = z.union([
  z.object({ api_version: z.string().optional(), endpoint: z.string().optional(), auth_mechanism: z.string().optional(), input_payload: InputPayload }).transform((e) => e.input_payload),
  InputPayload,
]);

export interface Check {
  id: string;
  label: string;
  value: string;
  status: 'pass' | 'warn' | 'fail';
  note: string;
}

/** Threshold checks on an ingested payload. Runs on any payload that satisfies the contract. */
export function assess(p: InputPayload): Check[] {
  const m = p.statistical_metrics;
  const out: Check[] = [];
  out.push({ id: 'ks', label: 'KS statistic', value: m.ks_statistic.toFixed(3), status: m.ks_statistic >= 0.3 ? 'pass' : m.ks_statistic >= 0.2 ? 'warn' : 'fail', note: 'Policy floor 0.30 for application scorecards' });
  out.push({ id: 'auc', label: 'AUC-ROC', value: m.auc_roc.toFixed(3), status: m.auc_roc >= 0.7 ? 'pass' : m.auc_roc >= 0.65 ? 'warn' : 'fail', note: 'Policy floor 0.70' });
  const implied = 2 * m.auc_roc - 1;
  const gap = Math.abs(implied - m.gini_coefficient);
  out.push({ id: 'gini', label: 'Gini consistency', value: `${m.gini_coefficient.toFixed(3)} vs ${implied.toFixed(3)} implied`, status: gap <= 0.01 ? 'pass' : gap <= 0.03 ? 'warn' : 'fail', note: 'Gini must equal 2 × AUC − 1. A mismatch means the metrics were not computed on the same sample.' });
  const tot = p.shap_importance_vector.reduce((a, b) => a + b.shap_mean_abs, 0) || 1;
  const top = [...p.shap_importance_vector].sort((a, b) => b.shap_mean_abs - a.shap_mean_abs)[0];
  const share = top.shap_mean_abs / tot;
  out.push({ id: 'shap', label: 'Attribution concentration', value: `${top.feature} ${(share * 100).toFixed(0)}%`, status: share <= 0.5 ? 'pass' : share <= 0.7 ? 'warn' : 'fail', note: 'A single feature carrying most of the attribution is a conceptual-soundness finding.' });
  for (const o of p.approval_outcomes ?? []) {
    const dir = o.protected_group_approval_rate / o.control_group_approval_rate;
    const s = dirStatus(dir);
    out.push({ id: `dir:${o.protected_attribute}`, label: `Disparate impact: ${o.protected_attribute}`, value: dir.toFixed(3), status: s === 'COMPLIANT_PASS' ? 'pass' : s === 'WATCH' ? 'warn' : 'fail', note: 'Four-fifths rule: flag below 0.80, watch below 0.90' });
  }
  if (p.score_distribution) {
    const v = psi(p.score_distribution.expected, p.score_distribution.actual);
    const b = psiBand(v);
    out.push({ id: 'psi', label: 'Population Stability Index', value: v.toFixed(3), status: b === 'stable' ? 'pass' : b === 'moderate' ? 'warn' : 'fail', note: '< 0.10 stable, 0.10–0.25 monitor, > 0.25 recalibrate' });
  }
  return out;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Export a sandbox model in the contract format: what IntelliDecision.ai / ModelCompass.ai would send. */
export function payloadFor(model: Model): InputPayload {
  const f = fairness(model);
  const d = drift(model);
  return {
    model_metadata: { model_id: model.spec.id, model_type: model.spec.modelType, target_variable: 'default_90dpd', base_score: model.spec.baseScore, points_to_double_odds: model.spec.pdo },
    statistical_metrics: { ks_statistic: r3(model.perf.test.ks), gini_coefficient: r3(model.perf.test.gini), auc_roc: r3(model.perf.test.auc) },
    shap_importance_vector: model.shap.map((s) => ({ feature: s.key, shap_mean_abs: r3(s.meanAbs) })),
    approval_outcomes: f.groups.map((g) => ({ protected_attribute: g.group.key, protected_group_approval_rate: r3(g.protectedApproval), control_group_approval_rate: r3(g.controlApproval) })),
    score_distribution: { expected: d.expected.map(r4), actual: d.actual.map(r4) },
  };
}

/** The exact sample payload printed in the PRD, for the "paste any payload" path. */
export const PRD_SAMPLE = {
  api_version: 'v1.0',
  endpoint: '/api/v1/mrm/audit-binder/generate',
  auth_mechanism: 'mTLS_OAuth2_JWT',
  input_payload: {
    model_metadata: { model_id: 'mdl_external_scorecard_v1', model_type: 'XGBoost_Scorecard', target_variable: 'default_90dpd', base_score: 600, points_to_double_odds: 20 },
    statistical_metrics: { ks_statistic: 0.485, gini_coefficient: 0.642, auc_roc: 0.821 },
    shap_importance_vector: [
      { feature: 'repayment_history_12m', shap_mean_abs: 0.342 },
      { feature: 'debt_to_income_ratio', shap_mean_abs: 0.218 },
      { feature: 'revolving_utilization', shap_mean_abs: 0.154 },
    ],
    approval_outcomes: [{ protected_attribute: 'age_over_62', protected_group_approval_rate: 0.628, control_group_approval_rate: 0.742 }],
  },
};

// ---------------------------------------------------------------- roles (PRD 3.4)

export type Role = 'Model_Developer' | 'Independent_Validator' | 'Executive_Auditor';
export type Permission = 'model:ingest' | 'binder:generate' | 'validation:signoff' | 'ledger:read';

export const ROLES: { role: Role; persona: string; who: string; blurb: string; permissions: Permission[] }[] = [
  { role: 'Model_Developer', persona: 'Quantitative Risk Analyst', who: 'quant.analyst@demo-bank.example', blurb: 'Builds and submits models. Cannot approve their own work.', permissions: ['model:ingest', 'binder:generate', 'ledger:read'] },
  { role: 'Independent_Validator', persona: 'Model Risk Officer', who: 'model.risk.officer@demo-bank.example', blurb: 'Second line of defence. The only role that can sign off or reject.', permissions: ['binder:generate', 'validation:signoff', 'ledger:read'] },
  { role: 'Executive_Auditor', persona: 'CISO / Internal Audit', who: 'ciso@demo-bank.example', blurb: 'Oversight without write access: can regenerate binders and read the audit ledger, cannot submit or decide.', permissions: ['binder:generate', 'ledger:read'] },
];
export const PERMISSIONS: { id: Permission; label: string; endpoint: string }[] = [
  { id: 'model:ingest', label: 'Ingest a model payload', endpoint: 'POST /api/v1/mrm/ingest' },
  { id: 'binder:generate', label: 'Run validation and generate the binder', endpoint: 'POST /api/v1/mrm/audit-binder/generate' },
  { id: 'validation:signoff', label: 'Sign off or reject', endpoint: 'POST /api/v1/mrm/signoff' },
  { id: 'ledger:read', label: 'Read the audit ledger', endpoint: 'GET /api/v1/mrm/ledger' },
];
export const roleDef = (r: Role) => ROLES.find((x) => x.role === r)!;
export const can = (r: Role, p: Permission) => roleDef(r).permissions.includes(p);
export const isRole = (v: unknown): v is Role => ROLES.some((x) => x.role === v);

// ---------------------------------------------------------------- OpenAPI

const bearer = [{ bearerAuth: [] }];
const json = (schema: unknown) => ({ content: { 'application/json': { schema } } });
const err = { description: 'Problem detail', ...json({ $ref: '#/components/schemas/Problem' }) };

export function openapi(origin: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'MRM Security Engine API',
      version: API_VERSION,
      description: 'Out-of-band model risk and security compliance adapter. Ingests scorecard metadata, metrics and SHAP vectors, evaluates fair lending, drift and adversarial robustness, and returns an SR 11-7 audit binder. Demonstration deployment: tokens come from a demo issuer and the sandbox portfolio is synthetic.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/v1/mrm/token': {
        post: { summary: 'Demo identity provider: issue a short-lived JWT for a role', requestBody: json({ type: 'object', required: ['role'], properties: { role: { enum: ROLES.map((r) => r.role) } } }), responses: { 200: { description: 'Signed HS256 token', ...json({ $ref: '#/components/schemas/Token' }) }, 400: err } },
      },
      '/api/v1/mrm/ingest': {
        post: { summary: 'Validate, hash and ledger a model payload', security: bearer, requestBody: json({ $ref: '#/components/schemas/Envelope' }), responses: { 200: { description: 'Ingest receipt with execution hash and threshold checks', ...json({ $ref: '#/components/schemas/Receipt' }) }, 401: err, 403: err, 422: err } },
      },
      '/api/v1/mrm/audit-binder/generate': {
        post: { summary: 'Run the four-stage validation and return the SR 11-7 binder', security: bearer, requestBody: json({ $ref: '#/components/schemas/Envelope' }), responses: { 200: { description: 'Binder (Markdown), summary, binder hash and ledger block', ...json({ type: 'object' }) }, 401: err, 403: err, 422: err } },
      },
      '/api/v1/mrm/signoff': {
        post: { summary: 'Record an independent validation decision', security: bearer, requestBody: json({ type: 'object', required: ['model_id', 'decision'], properties: { model_id: { type: 'string' }, decision: { enum: ['APPROVE', 'REJECT'] }, comment: { type: 'string', maxLength: 500 } } }), responses: { 200: { description: 'Ledger block for the decision', ...json({ type: 'object' }) }, 401: err, 403: err } },
      },
      '/api/v1/mrm/ledger': { get: { summary: 'Read the hash-chained audit ledger', security: bearer, responses: { 200: { description: 'Blocks, oldest first', ...json({ type: 'object' }) }, 401: err } } },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Envelope: { oneOf: [{ type: 'object', required: ['input_payload'], properties: { api_version: { type: 'string' }, endpoint: { type: 'string' }, auth_mechanism: { type: 'string' }, input_payload: { $ref: '#/components/schemas/InputPayload' } } }, { $ref: '#/components/schemas/InputPayload' }] },
        InputPayload: z.toJSONSchema(InputPayload, { target: 'openapi-3.0' }),
        Token: { type: 'object', properties: { access_token: { type: 'string' }, token_type: { enum: ['Bearer'] }, expires_in: { type: 'integer' }, role: { type: 'string' }, sub: { type: 'string' } } },
        Receipt: { type: 'object', properties: { model_id: { type: 'string' }, execution_hash: { type: 'string', description: 'SHA-256 of the canonical payload' }, checks: { type: 'array', items: { type: 'object' } }, block: { type: 'object' } } },
        Problem: { type: 'object', properties: { error: { type: 'string' }, detail: {}, required_permission: { type: 'string' } } },
      },
    },
  };
}

export const CONTRACT_FEATURES = FEATURES.map((f) => f.key);
export const PRODUCTION_SAMPLE_SIZE = PROD_N;
