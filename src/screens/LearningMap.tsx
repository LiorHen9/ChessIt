import { Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { StarRow } from '../components/StarRow';
import { PARTS, WORLDS } from '../content/index';
import {
  currentStationId,
  isUnlocked,
  isWorldComplete,
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
}

/** Horizontal position (percent) of the n-th node: a gentle zigzag. */
const ZIGZAG = [50, 74, 50, 26];
const ROW = 118; // px between nodes
const TOP = 52; // px from the top of a world's path to its first node centre

export function LearningMap({ profile, progress, onBack, onOpen }: Props) {
  const here = currentStationId(WORLDS, progress);
  const hereRef = useRef<HTMLDivElement>(null);
  const sum = totals(WORLDS, progress);

  useEffect(() => {
    // After the app's own scroll-to-top for a new screen.
    const t = window.setTimeout(() => hereRef.current?.scrollIntoView({ block: 'center' }), 30);
    return () => clearTimeout(t);
  }, []);

  let lastPart = 0;
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

      {WORLDS.map((world, w) => {
        const showPart = world.part !== lastPart;
        lastPart = world.part;
        return (
          <Fragment key={world.id}>
            {showPart && (
              <h2 class="map-part" key={`part-${world.part}`}>
                <span class="map-part-num">חלק <bdi dir="ltr">{world.part}</bdi></span>
                {PARTS[world.part] ?? ''}
              </h2>
            )}
            <WorldPath
              world={world}
              open={isWorldUnlocked(WORLDS, progress, w)}
              profile={profile}
              progress={progress}
              here={here}
              hereRef={hereRef}
              onOpen={onOpen}
            />
          </Fragment>
        );
      })}

      {sum.done === sum.count && (
        <p class="map-end">🎊 סיימת את כל התחנות! בקרוב יגיעו עולמות חדשים.</p>
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
}

function WorldPath({ world, open, profile, progress, here, hereRef, onOpen }: WorldProps) {
  const done = world.stations.filter((s) => stationStars(progress, s.id) > 0).length;
  const complete = isWorldComplete(world, progress);
  const n = world.stations.length;
  const height = TOP * 2 + (n - 1) * ROW;
  const points = world.stations.map((_, i) => ({ x: ZIGZAG[i % ZIGZAG.length], y: TOP + i * ROW }));

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
      </div>
    </section>
  );
}
