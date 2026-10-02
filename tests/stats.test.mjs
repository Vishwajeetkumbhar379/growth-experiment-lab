import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const S = createRequire(import.meta.url)("../stats.js");
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test("normal CDF and its inverse", () => {
  near(S.normCdf(0), 0.5, 1e-7);
  near(S.normCdf(1.959964), 0.975, 1e-6);
  near(S.normInv(0.975), 1.959964, 1e-5);
  near(S.normInv(0.8), 0.841621, 1e-5);
});

test("A/B test matches a textbook example", () => {
  // 10,000 visitors each, 3.0% vs 3.6%
  const r = S.abTest(10000, 300, 10000, 360);
  near(r.uplift, 0.2, 1e-9);
  near(r.z, 2.373, 0.01);
  near(r.pValue, 0.0176, 0.001);
  assert.equal(r.significant, true);
  assert.ok(r.ciLow > 0 && r.ciHigh > r.ciLow);
  assert.ok(r.probBBeatsA > 0.98);
  assert.equal(S.verdict(r).tone, "win");
});

test("no difference is not significant", () => {
  const r = S.abTest(5000, 150, 5000, 152);
  assert.equal(r.significant, false);
  assert.equal(S.verdict(r).tone, "flat");
});

test("sample size matches the standard formula", () => {
  // baseline 5%, detect a 20% relative lift, alpha 5%, power 80% → about 8,158 per variant
  near(S.sampleSize(0.05, 0.2), 8158, 15);
  assert.equal(S.duration(8158, 2, 2000), 9);
});

test("ICE and input validation", () => {
  assert.equal(S.ice(8, 6, 7), 7);
  assert.throws(() => S.abTest(100, 120, 100, 10));
  assert.throws(() => S.sampleSize(0.9, 0.5));
});
