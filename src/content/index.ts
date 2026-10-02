// Loads the learning-path worlds and checks them.
// A broken station is reported in the console and left out of the map, so a content
// mistake never breaks the app. To add a world: add its JSON file and list it in RAW.
import type { Square } from 'chess.js';
import { isSquare, parseFen } from '../learning/drill';
import { captureTargets, solve, startState } from '../learning/goals';
import type { AgeText, DemoStep, Station, World } from '../learning/types';
import board from './worlds/01-board.json';
import rook from './worlds/02-rook.json';
import bishop from './worlds/03-bishop.json';
import queen from './worlds/04-queen.json';
import king from './worlds/05-king.json';
import knight from './worlds/06-knight.json';
import pawn from './worlds/07-pawn.json';

const RAW: unknown[] = [board, rook, bishop, queen, king, knight, pawn];

/** Titles of the parts of the path, shown as headers on the map. */
export const PARTS: Record<number, string> = {
  1: 'הלוח',
  2: 'הכלים'
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
export function checkStation(s: Station): Issue[] {
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

export function loadWorlds(raw: unknown[]): { worlds: World[]; issues: Issue[] } {
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
      const found = checkStation(s);
      if (s.id && ids.has(s.id)) found.push({ where: `station ${s.id}`, message: 'duplicate id', level: 'error' });
      if (s.id) ids.add(s.id);
      issues.push(...found);
      if (!found.some((i) => i.level === 'error')) stations.push(s);
    }
    if (stations.length > 0) worlds.push({ ...w, stations });
  }
  return { worlds, issues };
}

const loaded = loadWorlds(RAW);
for (const i of loaded.issues) {
  const log = i.level === 'error' ? console.error : console.warn;
  log(`[content] ${i.where}: ${i.message}`);
}

export const WORLDS: World[] = loaded.worlds;
export const CONTENT_ISSUES: Issue[] = loaded.issues;

export function findStation(id: string): { world: World; station: Station; index: number } | null {
  for (const world of WORLDS) {
    const index = world.stations.findIndex((s) => s.id === id);
    if (index >= 0) return { world, station: world.stations[index], index };
  }
  return null;
}
