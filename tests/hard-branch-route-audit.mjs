/** Read-only geometry qualification for the optional hard-branch delivery bonus.
 * This samples the actual route API. It does not award money, change geometry,
 * or claim a physical driver completed the route. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FORKS, getEdge, routePointAtProgress } from '../dist/route-network.js';

const step = .5;
function measure(fork, branch) {
  let previous = routePointAtProgress(fork.from, { branch });
  let length3D = 0, lengthXZ = 0, ascent = 0, descent = 0;
  let peakGrade = 0, squaredGradeIntegral = 0, maxCurvature = 0;
  let totalAbsoluteTurn = 0, lengthAbove5PercentGrade = 0;
  const count = Math.ceil((fork.to - fork.from) / step);
  for (let i = 1; i <= count; i++) {
    const progress = fork.from + (fork.to - fork.from) * i / count;
    const point = routePointAtProgress(progress, { branch });
    const horizontal = Math.hypot(point.x - previous.x, point.z - previous.z);
    const vertical = point.height - previous.height;
    const grade = vertical / horizontal;
    assert.ok(Number.isFinite(grade) && horizontal > 0);
    lengthXZ += horizontal;
    length3D += Math.hypot(horizontal, vertical);
    ascent += Math.max(0, vertical);
    descent += Math.max(0, -vertical);
    peakGrade = Math.max(peakGrade, Math.abs(grade));
    squaredGradeIntegral += grade ** 2 * horizontal;
    maxCurvature = Math.max(maxCurvature, Math.abs(point.curvature));
    const turn = point.heading - previous.heading;
    totalAbsoluteTurn += Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
    if (Math.abs(grade) > .05) lengthAbove5PercentGrade += horizontal;
    previous = point;
  }
  const middle = routePointAtProgress((fork.from + fork.to) / 2, { branch });
  assert.equal(middle.edgeId, `${fork.id}-${branch}`);
  assert.equal(middle.branch, branch);
  return {
    branch, lengthXZ, length3D, ascent, descent,
    peakGradePercent: peakGrade * 100,
    rmsGradePercent: Math.sqrt(squaredGradeIntegral / lengthXZ) * 100,
    maxCurvature, totalAbsoluteTurnRadians: totalAbsoluteTurn,
    lengthAbove5PercentGrade,
    canonicalLength: getEdge(`${fork.id}-${branch}`).length,
  };
}

const forks = FORKS.map(fork => {
  const main = measure(fork, 'main');
  const alternate = measure(fork, 'alternate');
  const ascentRatio = main.ascent / alternate.ascent;
  const peakGradeDifferencePoints = main.peakGradePercent - alternate.peakGradePercent;
  // The main ridge is meaningfully steeper, not simply a different road ID.
  assert.ok(ascentRatio >= 1.15, `${fork.id}: main ascent advantage disappeared`);
  assert.ok(peakGradeDifferencePoints >= 1, `${fork.id}: main grade advantage disappeared`);
  assert.ok(main.rmsGradePercent >= alternate.rmsGradePercent * 1.15);
  assert.ok(main.lengthAbove5PercentGrade > alternate.lengthAbove5PercentGrade);
  assert.ok(Math.abs(main.lengthXZ - alternate.lengthXZ) < .001);
  assert.ok(Math.abs(main.maxCurvature - alternate.maxCurvature) < 1e-9);
  assert.ok(Math.abs(main.totalAbsoluteTurnRadians - alternate.totalAbsoluteTurnRadians) < 1e-8);
  return {
    id: fork.id, hardBranch: 'main', easyBranch: 'alternate',
    from: fork.from, to: fork.to,
    distinctInteriorFrom: fork.splitOverlapEnd + 24,
    distinctInteriorTo: fork.mergeOverlapStart - 24,
    ascentRatio, peakGradeDifferencePoints,
    main, alternate,
  };
});

const report = {
  passed: true,
  scope: 'Actual routePointAtProgress sampling at <=0.5 m; geometric qualification only, not a physical driver completion or payout test.',
  criteria: 'Main must have at least 15% more ascent and RMS grade, at least one percentage point steeper peak grade, and more path over 5% grade.',
  interpretation: 'All four main/ridge branches qualify. Both choices have mirrored planar length and curvature; the meaningful difference is ascent and grade. No geometry edit is required.',
  warning: 'Canonical route distance and both fork-edge lengths use the main arc table. Do not infer branch choice or difficulty from route distance, delivery distance, bridge contact, or edge length.',
  stepMetres: step,
  forks,
};
const directory = new URL('../qa/hard-branch-route-audit/', import.meta.url);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(new URL('report.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
