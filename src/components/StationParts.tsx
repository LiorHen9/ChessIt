// Pieces shared by the drill station screen and the real-position station screen:
// the top bar, the lesson demo player and the board adapter for drill pieces.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Board, type BoardPosition } from './Board';
import { Confetti } from './Confetti';
import { RichText } from './RichText';
import { StarRow } from './StarRow';
import { demoFrames } from '../learning/demo';
import { movesFrom, type Pieces } from '../learning/drill';
import type { Station } from '../learning/types';

/** The board shows drill pieces; only the learner's pieces can be picked up. */
export function drillPosition(pieces: Pieces, learner: 'w' | 'b' | null): BoardPosition {
  return {
    get: (s) => pieces.get(s),
    canPick: (s) => learner !== null && pieces.get(s)?.color === learner,
    movesFrom: (s) =>
      learner !== null && pieces.get(s)?.color === learner
        ? movesFrom(pieces, s).map((m) => ({ to: m.to, captured: !!m.captured, promotion: m.promotion }))
        : []
  };
}

export function TopBar({ title, onExit, back = '→ מפה', backLabel = 'חזרה למפה' }: { title: string; onExit: () => void; back?: string; backLabel?: string }) {
  return (
    <header class="topbar">
      <button class="btn btn-ghost btn-back" onClick={onExit} aria-label={backLabel}>
        {back}
      </button>
      <span class="topbar-title">{title}</span>
      <span />
    </header>
  );
}

/** Plays the lesson demo frame by frame, with a replay button. */
export function LessonDemo({ station }: { station: Station }) {
  const frames = useMemo(() => demoFrames(station), [station]);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (i >= frames.length - 1) return;
    const t = window.setTimeout(() => setI(i + 1), frames[i].ms);
    return () => clearTimeout(t);
  }, [i, run]);

  const f = frames[i];
  const ended = i >= frames.length - 1;
  return (
    <section class="demo" aria-label="הדגמה">
      <Board
        key={run}
        position={drillPosition(f.pieces, null)}
        orientation="w"
        interactive={false}
        showHints={false}
        lastMove={f.move ? { ...f.move, animate: true, id: i + 1 } : null}
        marks={f.marks}
        onMove={() => {}}
      />
      <div class="demo-bar">
        <p class="demo-caption" aria-live="polite">
          {f.caption ? <RichText text={f.caption} /> : ' '}
        </p>
        <div class="demo-steps" aria-hidden="true">
          {frames.map((_, n) => (
            <span key={n} class={n <= i ? 'is-on' : ''} />
          ))}
        </div>
        <button
          class="btn btn-secondary demo-replay"
          onClick={() => {
            setI(0);
            setRun((r) => r + 1);
          }}
          disabled={!ended}
        >
          ▶ שוב
        </button>
      </div>
    </section>
  );
}

export interface DoneProps {
  stars: 1 | 2 | 3;
  /** The line under the title ("בלי אף טעות!"). */
  line: ComponentChildren;
  tip?: ComponentChildren;
  /** "You finished the world" and similar. */
  extra?: ComponentChildren;
  next?: { label: string; onClick: () => void } | null;
  onAgain?: () => void;
  onExit: () => void;
  exitLabel?: string;
}

/** The end-of-station card: stars, a short line, and what to do next. */
export function DoneDialog({ stars, line, tip, extra, next, onAgain, onExit, exitLabel = '🗺️ למפה' }: DoneProps) {
  return (
    <div class="done-backdrop">
      <section class="card done" role="dialog" aria-label="סיום התחנה">
        <Confetti />
        <div class="done-emoji" aria-hidden="true">
          {stars === 3 ? '🏆' : '🎉'}
        </div>
        <StarRow stars={stars} animate size="lg" />
        <h2 class="done-title">{stars === 3 ? 'מושלם!' : 'כל הכבוד!'}</h2>
        <p class="done-line">{line}</p>
        {tip && <p class="done-tip">{tip}</p>}
        {extra}
        <div class="done-actions">
          {next && (
            <button class="btn btn-primary btn-big" onClick={next.onClick}>
              {next.label} ←
            </button>
          )}
          <div class="row">
            {onAgain && (
              <button class="btn btn-secondary" onClick={onAgain}>
                ↺ שוב
              </button>
            )}
            <button class="btn btn-secondary" onClick={onExit}>
              {exitLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** "בלי אף טעות!" / "עם טעות אחת." / "עם 3 טעויות." */
export function mistakesLine(n: number): ComponentChildren {
  if (n === 0) return 'בלי אף טעות!';
  if (n === 1) return 'עם טעות אחת.';
  return (
    <>
      עם <bdi dir="ltr">{n}</bdi> טעויות.
    </>
  );
}
