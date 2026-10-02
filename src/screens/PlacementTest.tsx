// The placement test for teens and adults: one try per question, then the parts that are
// passed open on the map, and a first computer level is suggested.
import { useState } from 'preact/hooks';
import { RichText } from '../components/RichText';
import { RealTask } from '../components/RealTask';
import { TopBar } from '../components/StationParts';
import { PARTS } from '../content/index';
import { passedPart, PLACEMENT, suggestedLevel } from '../content/placement';
import { levelInfo } from '../engine/levels';
import { recordPlacement } from '../learning/progress';
import { gendered } from '../learning/text';
import { byGender, setEngineLevel, type Profile, type Progress } from '../profiles/profiles';

interface Props {
  profile: Profile;
  onExit: () => void;
  onMap: () => void;
  onProgress: (p: Progress) => void;
}

type Phase = 'intro' | 'quiz' | 'result';

export function PlacementTest({ profile, onExit, onMap, onProgress }: Props) {
  const g = (t: string) => gendered(t, profile);
  const [phase, setPhase] = useState<Phase>('intro');
  const [i, setI] = useState(0);
  const [right, setRight] = useState<string[]>([]);
  const [answer, setAnswer] = useState<'right' | 'wrong' | null>(null);
  const [result, setResult] = useState<{ part: number; score: number; level: number } | null>(null);

  async function skip() {
    onProgress(await recordPlacement(profile.id, 0, 0, true));
    onExit();
  }

  function answered(ok: boolean) {
    const q = PLACEMENT[i];
    const now = ok ? [...right, q.id] : right;
    setRight(now);
    setAnswer(ok ? 'right' : 'wrong');
    window.setTimeout(() => {
      setAnswer(null);
      if (i + 1 < PLACEMENT.length) {
        setI(i + 1);
        return;
      }
      void finish(now);
    }, 1100);
  }

  async function finish(rightIds: string[]) {
    const part = passedPart(rightIds);
    const score = rightIds.length;
    const level = suggestedLevel(score);
    setResult({ part, score, level });
    setPhase('result');
    await recordPlacement(profile.id, part, score);
    onProgress(await setEngineLevel(profile.id, level, true));
  }

  if (phase === 'intro') {
    return (
      <main class="screen placement">
        <TopBar title="מבחן כניסה" onExit={onExit} back="→ חזרה" backLabel="חזרה" />
        <section class="card placement-intro">
          <div class="done-emoji" aria-hidden="true">
            🧭
          </div>
          <h2>{g('כבר {מכיר|מכירה} קצת שחמט?')}</h2>
          <p>
            <bdi dir="ltr">{PLACEMENT.length}</bdi> שאלות קצרות, מהקל אל הקשה: איך זזים הכלים, אכילה, שח, מט, הצרחה, מזלג ופתיחה. בכל
            שאלה מסע אחד, וניסיון אחד.
          </p>
          <p>{g('לפי התוצאה נפתח את העולמות שכבר {אתה מכיר|את מכירה|מכירים}, ונציע רמת מחשב מתאימה. תמיד אפשר לחזור לכל עולם.')}</p>
          <button class="btn btn-primary btn-big" onClick={() => setPhase('quiz')}>
            {g('{התחל|התחילי}')} ←
          </button>
          <button class="btn btn-ghost" onClick={() => void skip()}>
            {g('{דלג|דלגי}, אני {מתחיל|מתחילה} מההתחלה')}
          </button>
        </section>
      </main>
    );
  }

  if (phase === 'result' && result) {
    const opened = result.part >= 1 ? Object.entries(PARTS).filter(([k]) => Number(k) <= result.part).map(([, v]) => v) : [];
    const lv = levelInfo(result.level);
    return (
      <main class="screen placement">
        <TopBar title="מבחן כניסה" onExit={onExit} back="→ בית" backLabel="חזרה לבית" />
        <section class="card placement-result" aria-live="polite">
          <div class="done-emoji" aria-hidden="true">
            {result.part >= 5 ? '🏆' : '🎉'}
          </div>
          <h2>
            ענית נכון על <bdi dir="ltr">{result.score}</bdi> מתוך <bdi dir="ltr">{PLACEMENT.length}</bdi>
          </h2>
          {opened.length ? (
            <>
              <p>{g('סימנו כ"עברתי" את החלקים:')}</p>
              <ul class="placement-parts">
                {opened.map((t) => (
                  <li key={t}>✓ {t}</li>
                ))}
              </ul>
              <p>{g('{תוכל|תוכלי} תמיד לחזור אליהם במפה.')}</p>
            </>
          ) : (
            <p>{g('הכי טוב להתחיל מההתחלה – המסלול יעבור מהר. בהצלחה!')}</p>
          )}
          <p class="placement-level">
            רמת מחשב מומלצת: {lv.icon} <strong>{lv.name}</strong> · רמה <bdi dir="ltr">{lv.level}</bdi>
          </p>
          <button class="btn btn-primary btn-big" onClick={onMap}>
            למסלול הלימוד ←
          </button>
        </section>
      </main>
    );
  }

  const q = PLACEMENT[i];
  return (
    <main class="screen placement station" style="--w:var(--accent)">
      <TopBar title="מבחן כניסה" onExit={onExit} back="→ חזרה" backLabel="חזרה" />
      <div class="placement-progress" aria-hidden="true">
        {PLACEMENT.map((p, n) => (
          <span key={p.id} class={n < i ? 'is-on' : n === i ? 'is-now' : ''} />
        ))}
      </div>
      <section class="card task">
        <span class="char-avatar" aria-hidden="true">
          🧭
        </span>
        <div class="task-body">
          <p class="task-text">
            <span class="chip">
              שאלה <bdi dir="ltr">{i + 1}/{PLACEMENT.length}</bdi>
            </span>{' '}
            <RichText text={g(q.text)} />
          </p>
        </div>
      </section>
      <RealTask
        key={q.id}
        task={{ fen: q.fen, goal: q.goal }}
        profile={profile}
        mode="test"
        allowHints={false}
        onDone={() => answered(true)}
        onFail={() => answered(false)}
      />
      {answer && (
        <p class={`feedback placement-answer is-${answer === 'right' ? 'good' : 'info'}`} aria-live="polite">
          {answer === 'right' ? '✓ נכון!' : byGender(profile, 'לא נורא – ממשיכים.', 'לא נורא – ממשיכים.', 'לא נורא – ממשיכים.')}
        </p>
      )}
      <button class="btn btn-ghost" onClick={() => void finish(right)}>
        {g('{סיים|סיימי} כאן')}
      </button>
    </main>
  );
}
