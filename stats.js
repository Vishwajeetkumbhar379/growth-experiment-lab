// Growth experiment statistics. Pure functions, no dependencies.
// Works in the browser (window.GrowthStats) and in Node (import / require).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GrowthStats = api;
})(typeof self !== "undefined" ? self : this, function () {
  // Standard normal CDF (Zelen & Severo 26.2.17, max error 7.5e-8)
  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - p : p;
  }

  // Inverse normal CDF (Acklam's algorithm, relative error 1.15e-9)
  function normInv(p) {
    if (p <= 0 || p >= 1) throw new RangeError("p must be between 0 and 1");
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425, hi = 1 - lo;
    let q, r;
    if (p < lo) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > hi) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /** Two-proportion z-test plus a Bayesian view. Returns everything the UI shows. */
  function abTest(nA, cA, nB, cB, alpha = 0.05) {
    if (nA <= 0 || nB <= 0 || cA < 0 || cB < 0 || cA > nA || cB > nB) throw new RangeError("check visitors and conversions");
    const pA = cA / nA, pB = cB / nB;
    const pool = (cA + cB) / (nA + nB);
    const sePool = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
    const z = sePool ? (pB - pA) / sePool : 0;
    const pValue = 2 * (1 - normCdf(Math.abs(z)));
    const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
    const zc = normInv(1 - alpha / 2);
    // Beta(1+c, 1+n-c) posteriors, normal approximation of P(B > A)
    const post = (c, n) => {
      const a = 1 + c, b = 1 + n - c;
      return { mean: a / (a + b), varr: (a * b) / ((a + b) ** 2 * (a + b + 1)) };
    };
    const A = post(cA, nA), B = post(cB, nB);
    const probBBeatsA = normCdf((B.mean - A.mean) / Math.sqrt(A.varr + B.varr));
    return {
      pA, pB,
      uplift: pA ? (pB - pA) / pA : 0,
      diff: pB - pA,
      ciLow: pB - pA - zc * se,
      ciHigh: pB - pA + zc * se,
      z, pValue,
      significant: pValue < alpha,
      probBBeatsA,
    };
  }

  /** Visitors needed per variant to detect a relative lift (two-sided test). */
  function sampleSize(baseline, relativeMde, alpha = 0.05, power = 0.8) {
    if (!(baseline > 0 && baseline < 1) || !(relativeMde > 0)) throw new RangeError("baseline must be 0-1 and MDE positive");
    const p1 = baseline, p2 = baseline * (1 + relativeMde);
    if (p2 >= 1) throw new RangeError("MDE too large for this baseline");
    const za = normInv(1 - alpha / 2), zb = normInv(power);
    const pBar = (p1 + p2) / 2;
    const n = (za * Math.sqrt(2 * pBar * (1 - pBar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p2 - p1) ** 2;
    return Math.ceil(n);
  }

  function duration(nPerVariant, variants, dailyVisitors, trafficShare = 1) {
    const daily = dailyVisitors * trafficShare;
    return daily > 0 ? Math.ceil((nPerVariant * variants) / daily) : Infinity;
  }

  /** ICE: impact, confidence, ease on 1-10. Returns the average, rounded to one decimal. */
  function ice(impact, confidence, ease) {
    return Math.round(((impact + confidence + ease) / 3) * 10) / 10;
  }

  function verdict(r) {
    if (r.significant && r.diff > 0) return { tone: "win", text: "B wins. The lift is statistically significant; ship it and keep measuring." };
    if (r.significant && r.diff < 0) return { tone: "lose", text: "B loses. Keep A and write down what you learned." };
    if (r.probBBeatsA > 0.9) return { tone: "lean", text: "Leaning B, but not significant yet. Keep the test running to the planned sample size." };
    return { tone: "flat", text: "No clear winner yet. Don't stop early; check the planned sample size." };
  }

  return { normCdf, normInv, abTest, sampleSize, duration, ice, verdict };
});
