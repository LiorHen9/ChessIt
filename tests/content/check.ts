// Checks every station in src/content/worlds and prints the shortest solution.
// Run with: npx tsx tests/content/check.ts   (or: bun tests/content/check.ts)
import { CONTENT_ISSUES, WORLDS } from '../../src/content/index';
import { captureTargets, solve, startState } from '../../src/learning/goals';

let count = 0;
for (const w of WORLDS) {
  console.log(`\n${w.icon} ${w.title} (${w.id})`);
  for (const s of w.stations) {
    count++;
    const start = startState(s.fen)!;
    const path = s.goal.kind === 'tapSquares' ? null : solve(s.goal, start, captureTargets(s.goal, start));
    const sol = path ? `best ${path.length}: ${path.map((m) => m.from + m.to).join(' ')}` : 'tap';
    console.log(`  ${s.id.padEnd(16)} ${s.type.padEnd(8)} ★★★≤${s.stars['3']} ★★≤${s.stars['2']}  ${sol}`);
  }
}
console.log(`\n${count} stations, ${CONTENT_ISSUES.length} issues`);
if (CONTENT_ISSUES.some((i) => i.level === 'error')) process.exit(1);
