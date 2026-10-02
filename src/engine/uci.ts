// Tiny helpers for talking UCI to Stockfish, shared by the browser engine and the terminal simulation.

export interface SearchResult {
  /** Best move in UCI ("e2e4"), or "(none)" when there are no legal moves. */
  best: string;
  /** Score for the side to move, in centipawns. Mates are converted (see MATE_SCORE). */
  score: number;
  /** Moves to mate for the side to move (negative = getting mated), when Stockfish sees one. */
  mate?: number;
}

/** A mate counts as this many centipawns, minus a little per move so faster mates rank higher. */
export const MATE_SCORE = 10000;

export function mateToScore(mate: number): number {
  return mate > 0 ? MATE_SCORE - mate * 10 : -MATE_SCORE - mate * 10;
}

/** Collects `info` lines until `bestmove` and builds the result. */
export class SearchCollector {
  private score = 0;
  private mate: number | undefined;

  /** Returns the result when the search is finished, otherwise undefined. */
  feed(line: string): SearchResult | undefined {
    if (line.startsWith('info ') && line.includes(' score ')) {
      // Only the main line counts (multipv 1, or no multipv field).
      const mpv = /\bmultipv (\d+)/.exec(line);
      if (mpv && mpv[1] !== '1') return undefined;
      const cp = /\bscore cp (-?\d+)/.exec(line);
      const mate = /\bscore mate (-?\d+)/.exec(line);
      if (cp) {
        this.score = Number(cp[1]);
        this.mate = undefined;
      } else if (mate) {
        this.mate = Number(mate[1]);
        this.score = mateToScore(this.mate);
      }
      return undefined;
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(/\s+/)[1] ?? '(none)';
      return { best, score: this.score, mate: this.mate };
    }
    return undefined;
  }
}

export function goCommand(depth: number, movetime?: number): string {
  return movetime ? `go depth ${depth} movetime ${movetime}` : `go depth ${depth}`;
}
