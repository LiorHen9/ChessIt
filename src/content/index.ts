// Loads the learning-path worlds and checks them.
// A broken station is reported in the console and left out of the map, so a content
// mistake never breaks the app. The worlds are listed in ./worlds/all.ts and loaded lazily
// with loadContent(), so they are not part of the first download.
import { Chess, type Square } from 'chess.js';
import { isSquare, parseFen } from '../learning/drill';
import { captureTargets, solve, startState } from '../learning/goals';
import { escapeWay, isSafe, mateMove, playUci, realFenProblem, simulateDefender, solution } from '../learning/real';
import { isRealGoal, type AgeText, type DemoStep, type Goal, type Station, type World } from '../learning/types';

/** Titles of the parts of the path, shown as headers on the map. */
export const PARTS: Record<number, string> = {
  1: 'הלוח',
  2: 'הכלים',
  3: 'אוכלים ושומרים',
  4: 'שח',
  5: 'מט',
  6: 'חוקים מיוחדים',
  7: 'טריקים',
  8: 'פתיחה ומשחק שלם'
};

export interface Issue {
  where: string;
  message: string;
  /** Errors remove the station; warnings only get logged. */
  level: 'error' | 'warning';
}

const AGE_KEYS = ['kids5_7', 'kids8_12', 'teenAdult'] as const;

function checkText(t: unknown, where: string, issues: Issue[], level: Issue['level'] = 'error') {
  const obj = t as Partial<AgeText> | undefined;
  for (const k of AGE_KEYS) {
    if (!obj || typeof obj[k] !== 'string' || !obj[k]!.trim()) {
      issues.push({ where, message: `missing text for ${k}`, level });
    }
  }
}

function checkSquares(list: unknown, where: string, issues: Issue[]): list is Square[] {
  if (!Array.isArray(list) || !list.every(isSquare)) {
    issues.push({ where, message: `bad square list ${JSON.stringify(list)}`, level: 'error' });
    return false;
  }
  return true;
}

function checkDemo(demo: DemoStep[], where: string, issues: Issue[]) {
  demo.forEach((d, i) => {
    const w = `${where} demo[${i}]`;
    if (d.fen !== undefined && !parseFen(d.fen)) issues.push({ where: w, message: 'bad fen', level: 'warning' });
    if (d.move !== undefined && !/^[a-h][1-8][a-h][1-8]$/.test(d.move))
      issues.push({ where: w, message: `bad move ${d.move}`, level: 'warning' });
    for (const key of ['highlight', 'highlightAlt', 'dots', 'labels'] as const) {
      const v = d[key];
      if (v !== undefined && !(Array.isArray(v) && v.every(isSquare)))
        issues.push({ where: w, message: `bad ${key}`, level: 'warning' });
    }
    if (d.showMoves !== undefined && !isSquare(d.showMoves))
      issues.push({ where: w, message: 'bad showMoves', level: 'warning' });
  });
}

/** Check one station. Returns its issues; any 'error' means the station cannot be played. */
export function checkStation(s: Station, deep = false): Issue[] {
  const issues: Issue[] = [];
  const where = `station ${s.id ?? '?'}`;
  if (!s.id) issues.push({ where, message: 'missing id', level: 'error' });
  if (s.type !== 'lesson' && s.type !== 'minigame') issues.push({ where, message: `bad type ${s.type}`, level: 'error' });
  if (!s.title) issues.push({ where, message: 'missing title', level: 'error' });
  checkText(s.text, where, issues);
  if (s.type === 'lesson') {
    checkText(s.task, `${where} task`, issues, 'warning');
    if (!s.demo?.length) issues.push({ where, message: 'lesson without demo', level: 'warning' });
  }
  if (s.demo) checkDemo(s.demo, where, issues);
  if (s.demoFen !== undefined && !parseFen(s.demoFen)) issues.push({ where, message: 'bad demoFen', level: 'warning' });

  const stars = s.stars;
  if (!stars || typeof stars['3'] !== 'number' || typeof stars['2'] !== 'number' || stars['2'] < stars['3']) {
    issues.push({ where, message: 'stars must be {"3": n, "2": m} with m >= n', level: 'error' });
  }

  if (s.goal && isRealGoal(s.goal)) {
    checkReal(s.fen, s.goal, where, issues, deep, s.stars);
    (s.more ?? []).forEach((r, i) => {
      if (r.text) checkText(r.text, `${where} round ${i + 2}`, issues);
      checkReal(r.fen, r.goal, `${where} round ${i + 2}`, issues, deep);
    });
    if (s.lastMove !== undefined && !/^[a-h][1-8][a-h][1-8]$/.test(s.lastMove))
      issues.push({ where, message: `bad lastMove ${s.lastMove}`, level: 'warning' });
    return issues;
  }
  if (s.more) issues.push({ where, message: '"more" rounds work only with real-position goals', level: 'warning' });

  const start = startState(s.fen ?? '');
  if (!start) {
    issues.push({ where, message: `bad fen "${s.fen}"`, level: 'error' });
    return issues;
  }
  const g = s.goal;
  if (!g || typeof g !== 'object') {
    issues.push({ where, message: 'missing goal', level: 'error' });
    return issues;
  }

  if (g.kind === 'tapSquares') {
    if (checkSquares(g.squares, where, issues) && g.squares.length === 0)
      issues.push({ where, message: 'tapSquares needs squares', level: 'error' });
    if (g.area !== undefined) checkSquares(g.area, where, issues);
    return issues;
  }

  const learnerPieces = [...start.pieces.values()].filter((p) => p.color === start.learner);
  if (learnerPieces.length === 0) issues.push({ where, message: 'learner has no pieces', level: 'error' });

  switch (g.kind) {
    case 'collectStars':
      if (checkSquares(g.squares, where, issues)) {
        for (const q of g.squares)
          if (start.pieces.has(q)) issues.push({ where, message: `star on occupied square ${q}`, level: 'error' });
      }
      break;
    case 'captureAll': {
      if (g.targets !== undefined && !checkSquares(g.targets, where, issues)) break;
      const targets = captureTargets(g, start);
      if (targets.length === 0) issues.push({ where, message: 'nothing to capture', level: 'error' });
      for (const q of targets) {
        const p = start.pieces.get(q);
        if (!p || p.color === start.learner) issues.push({ where, message: `no opponent piece on ${q}`, level: 'error' });
      }
      break;
    }
    case 'reachSquare':
      if (!isSquare(g.square)) issues.push({ where, message: 'bad square', level: 'error' });
      break;
    case 'promote':
      if (!learnerPieces.some((p) => p.type === 'p')) issues.push({ where, message: 'no pawn to promote', level: 'error' });
      break;
    default:
      issues.push({ where, message: `unknown goal ${(g as { kind: string }).kind}`, level: 'error' });
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  const path = solve(g, start, captureTargets(g, start));
  if (!path) {
    issues.push({ where, message: 'no solution found', level: 'error' });
  } else if (stars && stars['3'] < path.length) {
    issues.push({ where, message: `3 stars need ${stars['3']} moves but the best is ${path.length}`, level: 'warning' });
  }
  return issues;
}

export function loadWorlds(raw: unknown[], deep = false): { worlds: World[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  const worlds: World[] = [];
  for (const r of raw) {
    const w = r as World;
    if (!w || !w.id || !Array.isArray(w.stations)) {
      issues.push({ where: 'world', message: 'world without id or stations', level: 'error' });
      continue;
    }
    if (w.character) checkText(w.character.hello, `world ${w.id} character`, issues, 'warning');
    const stations: Station[] = [];
    for (const s of w.stations) {
      const found = checkStation(s, deep);
      if (s.id && ids.has(s.id)) found.push({ where: `station ${s.id}`, message: 'duplicate id', level: 'error' });
      if (s.id) ids.add(s.id);
      issues.push(...found);
      if (!found.some((i) => i.level === 'error')) stations.push(s);
    }
    if (stations.length > 0) worlds.push({ ...w, stations });
  }
  return { worlds, issues };
}

/** The checked worlds. Empty until loadContent() resolves (the app awaits it before the first screen). */
export let WORLDS: World[] = [];
export let CONTENT_ISSUES: Issue[] = [];

let loading: Promise<void> | null = null;

/**
 * Load and check every world (once). `deep` also runs the slow checks (mate in 2+ and
 * endgames against the defender), used by tests/content/check.ts.
 */
export function loadContent(deep = false): Promise<void> {
  if (!loading) {
    loading = import('./worlds/all').then(({ RAW }) => {
      const loaded = loadWorlds(RAW, deep);
      for (const i of loaded.issues) {
        const log = i.level === 'error' ? console.error : console.warn;
        log(`[content] ${i.where}: ${i.message}`);
      }
      WORLDS = loaded.worlds;
      CONTENT_ISSUES = loaded.issues;
    });
  }
  return loading;
}

export function findStation(id: string): { world: World; station: Station; index: number } | null {
  for (const world of WORLDS) {
    const index = world.stations.findIndex((s) => s.id === id);
    if (index >= 0) return { world, station: world.stations[index], index };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Real-position goals

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/**
 * Check a real-position task: the position is legal and the goal can be reached.
 * Quick checks always run; mate in 2+ and playOut endgames run only with `deep` (terminal).
 */
export function checkReal(fen: string, goal: Goal, where: string, issues: Issue[], deep = false, stars?: Station['stars']) {
  const err = (message: string) => issues.push({ where, message, level: 'error' });
  const problem = realFenProblem(fen ?? '');
  if (problem) return err(`bad position "${fen}": ${problem}`);
  const chess = new Chess(fen);
  switch (goal.kind) {
    case 'mateIn': {
      if (!Number.isInteger(goal.n) || goal.n < 1 || goal.n > 3) return err('mateIn needs n between 1 and 3');
      if (goal.n === 1 || deep) {
        const m = mateMove(new Chess(fen), goal.n);
        if (!m) err(`no forced mate in ${goal.n}`);
      }
      break;
    }
    case 'escapeCheck': {
      if (!chess.inCheck()) return err('escapeCheck: the learner is not in check');
      const ways = goal.ways ?? ['move', 'block', 'capture'];
      const have = new Set(chess.moves({ verbose: true }).map((m) => escapeWay(chess, m)));
      if (goal.findAll) {
        for (const w of ways) if (!have.has(w)) err(`escapeCheck: no way to "${w}"`);
      } else if (!ways.some((w) => have.has(w))) err('escapeCheck: none of the ways is possible');
      break;
    }
    case 'defend': {
      const p = isSquare(goal.square) ? chess.get(goal.square) : undefined;
      if (!p || p.color !== chess.turn()) return err(`defend: no learner piece on ${goal.square}`);
      if (isSafe(chess, goal.square)) err(`defend: the piece on ${goal.square} is not in danger`);
      else if (!solution(chess, goal)) err('defend: no move makes the piece safe');
      break;
    }
    case 'findBestMove': {
      if (goal.line) {
        if (!goal.line.length || !goal.line.every((u) => UCI.test(u))) return err('findBestMove: bad line');
        if (goal.line.length % 2 === 0) err('findBestMove: a line must end with a learner move');
        const c = new Chess(fen);
        for (const u of goal.line) if (!playUci(c, u)) return err(`findBestMove: illegal move ${u} in line`);
      } else if (goal.accept === 'check') {
        if (!chess.moves({ verbose: true }).some((m) => m.san.includes('+') || m.san.includes('#')))
          err('findBestMove: no checking move');
      } else {
        if (!goal.moves?.length || !goal.moves.every((u) => UCI.test(u))) return err('findBestMove: needs moves (UCI)');
        for (const u of goal.moves) if (!playUci(new Chess(fen), u)) err(`findBestMove: illegal move ${u}`);
      }
      break;
    }
    case 'playOut': {
      const opp = goal.opponent;
      if (opp !== 'defender' && !(Number.isInteger(opp) && opp >= 1 && opp <= 8)) return err('playOut: bad opponent');
      if (goal.until !== 'mate' && !(Number.isInteger(goal.until) && goal.until > 0)) return err('playOut: bad until');
      if (deep && opp === 'defender' && goal.until === 'mate') {
        const n = simulateDefender(fen, 60);
        if (n === null) err('playOut: the test player could not win against the defender');
        else if (stars && stars['3'] < n)
          issues.push({ where, message: `3 stars need ${stars['3']} moves but the test player needs ${n}`, level: 'warning' });
      }
      break;
    }
  }
}
