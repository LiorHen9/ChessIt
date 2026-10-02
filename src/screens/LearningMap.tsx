import { useEffect, useRef, useState } from 'preact/hooks';
import { StarRow } from '../components/StarRow';
import { PARTS, WORLDS } from '../content/index';
import { themeInfo } from '../content/puzzles/index';
import {
  currentStationId,
  isUnlocked,
  isWorldComplete,
  isWorldDone,
  isWorldPassed,
  isWorldUnlocked,
  stationStars,
  totals
} from '../learning/progress';
import { say } from '../learning/text';
import type { World } from '../learning/types';
import { PIECE_GLYPH } from '../chess/rules';
import { byGender, type Profile, type Progress } from '../profiles/profiles';

interface Props {
  profile: Profile;
  progress: Progress | null;
  onBack: () => void;
  onOpen: (stationId: string) => void;
  /** The puzzle set at the end of a world. */
  onPuzzles: (world: World) => void;
  onPlacement: () => void;
  showPlacement: boolean;
}

/** Horizontal position (percent) of the n-th node: a gentle zigzag. */
const ZIGZAG = [50, 74, 50, 26];
const ROW = 118; // px between nodes
const TOP = 52; // px from the top of a world's path to its first node centre

/** The part to show open: the one with "you are here", or the last part that is open. */
function currentPart(progress: Progress | null, here: string | null): number {
  if (here) {
    const w = WORLDS.find((w) => w.stations.some((s) => s.id === here));
    if (w) return w.part;
  }
  let part = WORLDS[0]?.part ?? 1;
  WORLDS.forEach((w, i) => {
    if (isWorldUnlocked(WORLDS, progress, i)) part = w.part;
  });
  return part;
}

export function LearningMap({ profile, progress, onBack, onOpen, onPuzzles, onPlacement, showPlacement }: Props) {
  const here = currentStationId(WORLDS, progress);
  const hereRef = useRef<HTMLDivElement>(null);
  const sum = totals(WORLDS, progress);
  const parts = [...new Set(WORLDS.map((w) => w.part))];
  const [open, setOpen] = useState<number[]>(() => [currentPart(progress, here)]);

  useEffect(() => {
    // After the app's own scroll-to-top for a new screen.
    const t = window.setTimeout(() => hereRef.current?.scrollIntoView({ block: 'center' }), 30);
    return () => clearTimeout(t);
  }, []);

  function toggle(part: number) {
    setOpen((o) => (o.includes(part) ? o.filter((p) => p !== part) : [...o, part]));
  }

  return (
    <main class="screen map">
      <header class="topbar">
        <button class="btn btn-ghost btn-back" onClick={onBack} aria-label="חזרה לבית">
          → בית
        </button>
        <span class="topbar-title">מסלול הלימוד</span>
        <span class="map-total" aria-label={`${sum.stars} כוכבים`}>
          ★ <bdi dir="ltr">{sum.stars}</bdi>
        </span>
      </header>

      {showPlacement && (
        <button class="action action-placement map-placement" onClick={onPlacement}>
          <span class="action-icon" aria-hidden="true">
            🧭
          </span>
          <span class="action-text">
            <span class="action-title">{byGender(profile, 'כבר מכיר שחמט?', 'כבר מכירה שחמט?', 'כבר מכירים שחמט?')}</span>
            <span class="action-sub">מבחן כניסה קצר יפתח את העולמות שכבר ידועים לך</span>
          </span>
        </button>
      )}

      {parts.map((part) => {
        const worlds = WORLDS.map((w, i) => ({ w, i })).filter(({ w }) => w.part === part);
        const stations = worlds.flatMap(({ w }) => w.stations);
        const done = stations.filter((s) => stationStars(progress, s.id) > 0).length;
        const passed = worlds.every(({ w }) => isWorldPassed(w, progress));
        const partComplete = worlds.every(({ w }) => isWorldComplete(w, progress));
        const unlocked = isWorldUnlocked(WORLDS, progress, worlds[0].i);
        const isOpen = open.includes(part);
        return (
          <section key={part} class={`map-part-block ${unlocked ? '' : 'is-locked'}`}>
            <h2 class="map-part">
              <button
                class="map-part-btn"
                aria-expanded={isOpen}
                onClick={() => toggle(part)}
                data-part={part}
              >
                <span class="map-part-num">
                  חלק <bdi dir="ltr">{part}</bdi>
                </span>
                <span class="map-part-title">{PARTS[part] ?? ''}</span>
                <span class="map-part-state">
                  {!unlocked ? (
                    '🔒'
                  ) : partComplete ? (
                    '✓'
                  ) : passed ? (
                    'עברתי ✓'
                  ) : (
                    <bdi dir="ltr">
                      {done}/{stations.length}
                    </bdi>
                  )}
                </span>
                <span class="map-part-chevron" aria-hidden="true">
                  {isOpen ? '▾' : '◂'}
                </span>
              </button>
            </h2>
            {isOpen &&
              worlds.map(({ w, i }) => (
                <WorldPath
                  key={w.id}
                  world={w}
                  open={isWorldUnlocked(WORLDS, progress, i)}
                  profile={profile}
                  progress={progress}
                  here={here}
                  hereRef={hereRef}
                  onOpen={onOpen}
                  onPuzzles={onPuzzles}
                />
              ))}
          </section>
        );
      })}

      {sum.done === sum.count && (
        <p class="map-end">🎊 סיימת את כל התחנות! עכשיו – משחקים נגד המחשב, וחידה בכל יום.</p>
      )}
    </main>
  );
}

interface WorldProps {
  world: World;
  open: boolean;
  profile: Profile;
  progress: Progress | null;
  here: string | null;
  hereRef: { current: HTMLDivElement | null };
  onOpen: (stationId: string) => void;
  onPuzzles: (world: World) => void;
}

function WorldPath({ world, open, profile, progress, here, hereRef, onOpen, onPuzzles }: WorldProps) {
  const done = world.stations.filter((s) => stationStars(progress, s.id) > 0).length;
  const complete = isWorldComplete(world, progress);
  const passed = !complete && isWorldPassed(world, progress);
  const n = world.stations.length;
  // The puzzle node (if any) is one more node on the path.
  const nodes = n + (world.puzzles ? 1 : 0);
  const height = TOP * 2 + (nodes - 1) * ROW;
  const points = Array.from({ length: nodes }, (_, i) => ({ x: ZIGZAG[i % ZIGZAG.length], y: TOP + i * ROW }));
  const puzzleInfo = world.puzzles ? themeInfo(world.puzzles.theme) : undefined;
  const puzzlesOpen = isWorldDone(world, progress);

  // One curved segment between each pair of nodes; finished segments are drawn solid.
  const segments = points.slice(1).map((p, i) => {
    const a = points[i];
    const midY = (a.y + p.y) / 2;
    const d = `M${a.x},${a.y} C${a.x},${midY} ${p.x},${midY} ${p.x},${p.y}`;
    const finished = stationStars(progress, world.stations[i].id) > 0;
    return <path key={i} d={d} class={finished ? 'path-done' : 'path-todo'} vector-effect="non-scaling-stroke" />;
  });

  const glyph = world.character ? PIECE_GLYPH[world.character.piece] + '︎' : world.icon;
  return (
    <section class={`world ${open ? '' : 'is-locked'}`} style={`--w:var(--world-${world.id})`} aria-label={`עולם ${world.title}`}>
      <div class="world-banner">
        <span class="world-glyph" aria-hidden="true">
          {glyph}
        </span>
        <div class="world-text">
          <h3 class="world-title">{world.title}</h3>
          {world.character && <p class="world-char">{world.character.name}</p>}
        </div>
        <span class="world-count">
          {open ? (
            complete ? (
              '✓'
            ) : passed ? (
              <span class="world-passed">עברתי ✓</span>
            ) : (
              <bdi dir="ltr">
                {done}/{n}
              </bdi>
            )
          ) : (
            '🔒'
          )}
        </span>
      </div>
      {world.character && open && done === 0 && (
        <p class="world-hello">{say(world.character.hello, profile)}</p>
      )}

      <div class="path" style={`height:${height}px`}>
        <svg class="path-line" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {segments}
        </svg>
        {world.stations.map((s, i) => {
          const stars = stationStars(progress, s.id);
          const unlocked = isUnlocked(WORLDS, progress, s.id);
          const isHere = s.id === here;
          const p = points[i];
          return (
            <div
              key={s.id}
              ref={isHere ? hereRef : undefined}
              class={`node ${s.type === 'lesson' ? 'node-lesson' : 'node-game'} ${stars > 0 ? 'is-done' : ''} ${
                unlocked ? '' : 'is-locked'
              } ${isHere ? 'is-here' : ''}`}
              style={`left:${p.x}%;top:${p.y}px`}
            >
              {isHere && (
                <span class="here-tag">
                  <span aria-hidden="true">{profile.avatar}</span> {byGender(profile, 'אתה כאן', 'את כאן', 'כאן!')}
                </span>
              )}
              <button
                class="node-btn"
                disabled={!unlocked}
                onClick={() => onOpen(s.id)}
                aria-label={`${s.title}${unlocked ? '' : ' (נעול)'}${stars ? `, ${stars} כוכבים` : ''}`}
                data-station={s.id}
              >
                <span aria-hidden="true">{unlocked ? s.icon ?? (s.type === 'lesson' ? '📖' : '🎯') : '🔒'}</span>
              </button>
              <span class="node-title">{s.title}</span>
              {stars > 0 && <StarRow stars={stars} />}
            </div>
          );
        })}
        {world.puzzles && (
          <div
            class={`node node-puzzle ${puzzlesOpen ? '' : 'is-locked'}`}
            style={`left:${points[n].x}%;top:${points[n].y}px`}
          >
            <button
              class="node-btn"
              disabled={!puzzlesOpen}
              onClick={() => onPuzzles(world)}
              aria-label={`חידות: ${puzzleInfo?.title ?? ''}${puzzlesOpen ? '' : ' (נעול)'}`}
              data-puzzles={world.id}
            >
              <span aria-hidden="true">{puzzlesOpen ? '🧩' : '🔒'}</span>
            </button>
            <span class="node-title">חידות בונוס</span>
          </div>
        )}
      </div>
    </section>
  );
}
