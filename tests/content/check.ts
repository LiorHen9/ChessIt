// Checks every station in src/content/worlds (deep checks included: mate in 2+, endgames
// against the defender), the placement test and the puzzle files, and prints a solution
// for each station.
// Run with: bun tests/content/check.ts   (or: npx tsx tests/content/check.ts)
import { Chess } from 'chess.js';
import { CONTENT_ISSUES, loadContent, WORLDS } from '../../src/content/index';
import { checkPlacement } from '../../src/content/placement';
import { checkPuzzleFile, PUZZLE_FILES } from '../../src/content/puzzles/index';
import { captureTargets, solve, startState } from '../../src/learning/goals';
import { mateMove, simulateDefender, solution } from '../../src/learning/real';
import { isRealGoal, type Goal } from '../../src/learning/types';

await loadContent(true);

function realSolution(fen: string, goal: Goal): string {
  const chess = new Chess(fen);
  switch (goal.kind) {
    case 'mateIn':
      return `mate: ${mateMove(chess, goal.n)?.san ?? '?'}`;
    case 'playOut':
      if (goal.opponent === 'defender' && goal.until === 'mate') return `test player mates in ${simulateDefender(fen)}`;
      return `play ${goal.until === 'mate' ? 'to mate' : goal.until + ' moves'} vs ${goal.opponent}`;
    case 'findBestMove':
      return goal.line ? `line ${goal.line.join(' ')}` : goal.accept === 'check' ? 'any check' : `moves ${goal.moves!.join(' ')}`;
    default:
      return `${goal.kind}: ${solution(chess, goal)?.san ?? '?'}`;
  }
}

let count = 0;
for (const w of WORLDS) {
  console.log(`\n${w.icon} ${w.title} (${w.id}, part ${w.part})${w.puzzles ? `  + puzzles ${w.puzzles.theme}×${w.puzzles.count}` : ''}`);
  for (const s of w.stations) {
    count++;
    let sol: string;
    if (isRealGoal(s.goal)) {
      sol = [s, ...(s.more ?? [])].map((r) => realSolution(r.fen, r.goal)).join(' | ');
    } else {
      const start = startState(s.fen)!;
      const path = s.goal.kind === 'tapSquares' ? null : solve(s.goal, start, captureTargets(s.goal, start));
      sol = path ? `best ${path.length}: ${path.map((m) => m.from + m.to).join(' ')}` : 'tap';
    }
    console.log(`  ${s.id.padEnd(18)} ${s.type.padEnd(8)} ★★★≤${s.stars['3']} ★★≤${s.stars['2']}  ${sol}`);
  }
}

const placementIssues = checkPlacement();
console.log(`\nPlacement test: ${placementIssues.length} issues`);

let puzzles = 0;
const puzzleIssues: string[] = [];
for (const [name, load] of Object.entries(PUZZLE_FILES)) {
  const file = await load();
  const problems = checkPuzzleFile(file);
  puzzles += file.puzzles.length;
  console.log(`puzzles ${name}: ${file.puzzles.length} (${problems.length} problems)`);
  puzzleIssues.push(...problems.map((p) => `${name}: ${p}`));
}

const all = [...CONTENT_ISSUES.map((i) => `${i.level} ${i.where}: ${i.message}`), ...placementIssues, ...puzzleIssues];
for (const line of all) console.log('  !', line);
console.log(`\n${count} stations, ${puzzles} puzzles, ${all.length} issues`);
if (CONTENT_ISSUES.some((i) => i.level === 'error') || placementIssues.length || puzzleIssues.length) process.exit(1);
