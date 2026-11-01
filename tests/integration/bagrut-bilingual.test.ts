import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { adminAgent, makeApp } from './helpers';
import type { Exam } from '../../shared/schemas';

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

describe('Bagrut admin: Hebrew names + questionnaire numbers', () => {
  it('admin edits names, several numbers, source and status; the public calendar gets them', async () => {
    const ctx = await makeApp();
    cleanup = ctx.cleanup;
    const admin = await adminAgent(ctx.app);
    const existing = (await ctx.store.get<Exam>('content/exams/seed-w27-math-1')) as Exam;
    const { id: _i, createdAt: _c, updatedAt: _u, ...input } = existing;
    const res = await admin.put('/api/admin/content/exams/seed-w27-math-1', {
      ...input,
      officialName: 'מתמטיקה',
      questionnaireNumbers: ['035481', '035581'],
      sourceUrl: 'https://parents.education.gov.il/gov-education/school/matriculation/dates',
      lastVerifiedOn: '2026-11-01',
      certainty: 'final',
    });
    expect(res.status).toBe(200);
    const pub = (await request(ctx.app).get('/api/public/snapshot')).body.exams['seed-w27-math-1'] as Exam;
    expect(pub).toMatchObject({ officialName: 'מתמטיקה', questionnaireNumbers: ['035481', '035581'], certainty: 'final', lastVerifiedOn: '2026-11-01' });
  });

  it('rejects malformed questionnaire numbers with a validation error', async () => {
    const ctx = await makeApp();
    cleanup = ctx.cleanup;
    const admin = await adminAgent(ctx.app);
    const existing = (await ctx.store.get<Exam>('content/exams/seed-w27-math-1')) as Exam;
    const { id: _i, createdAt: _c, updatedAt: _u, ...input } = existing;
    const res = await admin.put('/api/admin/content/exams/seed-w27-math-1', { ...input, questionnaireNumbers: ['abc'] });
    expect(res.status).toBe(400);
  });
});
