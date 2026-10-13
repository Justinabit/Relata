import assert from 'node:assert/strict';
import { test } from 'node:test';
import { relatedStudies } from '../server/research/related.js';
const work = (n: number) => ({ id: `https://openalex.org/W${7000000000 + n}`, title: `Related study ${n}`, publication_year: n === 14 ? 9999 : 2024, publication_date: n === 14 ? '9999' : '2024', type: 'article' });
test('related ids are deduplicated, bounded, validated, source-fetched and verified on a fresh instance', async () => {
  const original = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    const u = new URL(String(input)); urls.push(u.href);
    assert.equal(u.origin, 'https://api.openalex.org');
    const n = Number(u.pathname.split('W')[1]) - 7000000000;
    if (u.searchParams.get('select')?.includes('related_works')) return Response.json({ ...work(n), related_works: [work(1).id, work(2).id, 'https://evil.invalid/W3333333333', ...Array.from({ length: 15 }, (_, i) => work(i + 2).id)], referenced_works: [work(2).id] });
    return Response.json(work(n));
  }) as typeof fetch;
  try {
    const result = await relatedStudies('W7000000001');
    assert.equal(result.studies.length, 10); assert.equal(new Set(result.studies.map((s) => s.id)).size, 10);
    assert.ok(result.studies.every((s) => s.id !== 'W7000000001' && s.verification.verifiedBy.includes('openalex')));
    assert.equal(urls.length, 12); // parent, relations and 10 candidate ids
  } finally { globalThis.fetch = original; }
});
test('empty relations remain empty and upstream failures are explicit', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const u = new URL(String(input)); const n = Number(u.pathname.split('W')[1]) - 7000000000;
    if (n === 22) return Response.json({}, { status: 403 });
    return Response.json({ ...work(n), related_works: n === 21 ? [work(22).id] : [], referenced_works: [] });
  }) as typeof fetch;
  try {
    assert.deepEqual(await relatedStudies('W7000000020'), { studies: [], partial: false });
    await assert.rejects(() => relatedStudies('W7000000021'), /could not be verified/);
  } finally { globalThis.fetch = original; }
});
test('malformed dates in related records are excluded', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const n = Number(new URL(String(input)).pathname.split('W')[1]) - 7000000000;
    return Response.json({ ...work(n), related_works: [work(14).id] });
  }) as typeof fetch;
  try { assert.deepEqual(await relatedStudies('W7000000030'), { studies: [], partial: false }); }
  finally { globalThis.fetch = original; }
});
