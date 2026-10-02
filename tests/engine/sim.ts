// Terminal simulation of computer levels. Run with bun:
//   bun tests/engine/sim.ts                 # default suite (KidEngine checks, 100 games each)
//   bun tests/engine/sim.ts ladder [games]  # also Stockfish levels 3–8 against each other
// Stockfish runs as `node public/engine/stockfish-19-lite-single.js` (UCI over stdin/stdout).
//
// "Beginner" models a child who has finished the pieces world: knows how pieces move,
// grabs the biggest capture, sometimes spots a mate in one, and often just plays something.

import { Chess, type Move } from 'chess.js';
import { kidMove } from '../../src/engine/kid';
import { seededRng, type Rng } from '../../src/engine/random';
import { STOCKFISH_LEVELS } from '../../src/engine/levels';
import { goCommand, SearchCollector, type SearchResult } from '../../src/engine/uci';
import { PIECE_VALUE } from '../../src/chess/rules';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Player = (fen: string, rng: Rng) => Promise<string>;

const uci = (m: Move) => m.from + m.to + (m.promotion ?? '');

function beginner(fen: string, rng: Rng): Promise<string> {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const mates = moves.filter((m) => m.san.endsWith('#'));
  if (mates.length && rng() < 0.5) return Promise.resolve(uci(mates[0]));
  const captures = moves.filter((m) => m.captured).sort((a, b) => PIECE_VALUE[b.captured!] - PIECE_VALUE[a.captured!]);
  if (captures.length && rng() < 0.7) return Promise.resolve(uci(captures[0]));
  // Children love giving check: it often leads them to a mate.
  const checks = moves.filter((m) => m.san.endsWith('+'));
  if (checks.length && rng() < 0.5) return Promise.resolve(uci(checks[Math.floor(rng() * checks.length)]));
  // Otherwise a random move, but a beginner promotes to a queen.
  const m = moves[Math.floor(rng() * moves.length)];
  const q = m.promotion ? moves.find((x) => x.from === m.from && x.to === m.to && x.promotion === 'q') : undefined;
  return Promise.resolve(uci(q ?? m));
}

const kid =
  (level: number): Player =>
  (fen, rng) =>
    Promise.resolve(kidMove(fen, level, rng));

// ---------- Stockfish over stdin/stdout ----------

// The project is "type": "module", so node would treat the engine file as ESM.
// Run it through a .cjs copy (with the .wasm next to it, under the same name).
function engineScript(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chessit-sf-'));
  copyFileSync(resolve('public/engine/stockfish-19-lite-single.js'), join(dir, 'sf.cjs'));
  copyFileSync(resolve('public/engine/stockfish-19-lite-single.wasm'), join(dir, 'sf.wasm'));
  return join(dir, 'sf.cjs');
}

class UciProcess {
  private proc = Bun.spawn(['node', engineScript()], { stdin: 'pipe', stdout: 'pipe' });
  private buffer = '';
  private waiters: ((line: string) => boolean)[] = [];

  constructor() {
    void this.read();
  }

  private async read() {
    const decoder = new TextDecoder();
    for await (const chunk of this.proc.stdout as unknown as AsyncIterable<Uint8Array>) {
      this.buffer += decoder.decode(chunk);
      let i: number;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        this.waiters = this.waiters.filter((w) => !w(line));
      }
    }
  }

  send(cmd: string) {
    this.proc.stdin.write(cmd + '\n');
    this.proc.stdin.flush();
  }

  until(pred: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      this.waiters.push((line) => {
        if (pred(line)) {
          resolve(line);
          return true;
        }
        return false;
      });
    });
  }

  async ready() {
    this.send('uci');
    await this.until((l) => l === 'uciok');
    this.send('isready');
    await this.until((l) => l === 'readyok');
  }

  async search(fen: string, skill: number, depth: number, movetime?: number): Promise<SearchResult> {
    this.send(`setoption name Skill Level value ${skill}`);
    this.send(`position fen ${fen}`);
    const collector = new SearchCollector();
    let result: SearchResult | undefined;
    const done = this.until((l) => (result = collector.feed(l)) !== undefined);
    this.send(goCommand(depth, movetime));
    await done;
    return result!;
  }

  kill() {
    this.proc.kill();
  }
}

let sf: UciProcess | null = null;
async function stockfish(): Promise<UciProcess> {
  if (!sf) {
    sf = new UciProcess();
    await sf.ready();
  }
  return sf;
}

const sfLevel =
  (level: number): Player =>
  async (fen, rng) => {
    const cfg = STOCKFISH_LEVELS[level];
    if (rng() < cfg.kidMove) return kidMove(fen, 2, rng);
    const r = await (await stockfish()).search(fen, cfg.skill, cfg.depth, cfg.movetime);
    return r.best;
  };

// ---------- Games ----------

async function playGame(white: Player, black: Player, rng: Rng, maxPlies = 300): Promise<'w' | 'b' | 'draw'> {
  const chess = new Chess();
  while (!chess.isGameOver() && chess.history().length < maxPlies) {
    const player = chess.turn() === 'w' ? white : black;
    const m = await player(chess.fen(), rng);
    chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  }
  if (chess.isCheckmate()) return chess.turn() === 'w' ? 'b' : 'w';
  return 'draw';
}

/** A against B, alternating colours. Returns A's wins, draws and losses. */
async function match(nameA: string, a: Player, nameB: string, b: Player, games: number, seed: number) {
  const rng = seededRng(seed);
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (let i = 0; i < games; i++) {
    const aWhite = i % 2 === 0;
    const r = await playGame(aWhite ? a : b, aWhite ? b : a, rng);
    if (r === 'draw') draws++;
    else if ((r === 'w') === aWhite) wins++;
    else losses++;
  }
  const pct = Math.round((wins / games) * 100);
  console.log(`${nameA} vs ${nameB}: ${wins} wins, ${draws} draws, ${losses} losses (${pct}% wins for ${nameA})`);
  return { wins, draws, losses };
}

const args = process.argv.slice(2);
const games = Number(args[0] === 'ladder' ? args[2] : args[0]) || 100;
let failed = false;

const t0 = Date.now();
const onlyLadder = args.includes('--only-ladder');
if (!onlyLadder) {
const r1 = await match('beginner', beginner, 'level 1', kid(1), games, 1);
if (r1.wins < games / 2) {
  console.log('✗ the beginner should win at least half the games against level 1');
  failed = true;
} else console.log('✓ a beginner wins at least half the games against level 1');

const r2 = await match('level 2', kid(2), 'level 1', kid(1), games, 2);
if (r2.wins <= r2.losses) {
  console.log('✗ level 2 should beat level 1');
  failed = true;
} else console.log('✓ level 2 is stronger than level 1');

await match('beginner', beginner, 'level 2', kid(2), games, 3);
}

if (args[0] === 'ladder') {
  const n = Number(args[1]) || 20;
  await match('level 3', sfLevel(3), 'level 2', kid(2), n, 4);
  for (let lv = 4; lv <= 8; lv++) await match(`level ${lv}`, sfLevel(lv), `level ${lv - 1}`, sfLevel(lv - 1), n, 10 + lv);
  await match('beginner', beginner, 'level 3', sfLevel(3), n, 30);
}

sf?.kill();
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(failed ? 1 : 0);
