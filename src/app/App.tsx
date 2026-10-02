import { useEffect, useState } from 'preact/hooks';
import {
  deleteProfile,
  getProgress,
  computerProfile,
  COMPUTER_ID,
  GUEST,
  listProfiles,
  setEngineLevel,
  saveProfile,
  type Profile,
  type Progress
} from '../profiles/profiles';
import {
  clearSavedGame,
  getLastProfileId,
  loadSavedGame,
  setLastProfileId,
  type SavedGame
} from '../game/savedGame';
import { requestPersistence } from '../storage/db';
import { ProfilePicker } from '../screens/ProfilePicker';
import { ProfileEditor } from '../screens/ProfileEditor';
import { Home } from '../screens/Home';
import { GameSetup } from '../screens/GameSetup';
import { GameScreen, type FinishedGame, type GameConfig } from '../screens/GameScreen';
import { ComputerSetup } from '../screens/ComputerSetup';
import { GameSummary } from '../screens/GameSummary';
import { DEFAULT_POSITION } from '../chess/handicap';
import { LearningMap } from '../screens/LearningMap';
import { StationScreen } from '../screens/StationScreen';

type Screen =
  | { name: 'loading' }
  | { name: 'profiles' }
  | { name: 'edit'; profile?: Profile }
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'computerSetup' }
  | { name: 'game'; config: GameConfig }
  | { name: 'summary'; game: FinishedGame }
  | { name: 'map' }
  | { name: 'station'; id: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [active, setActive] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [saved, setSaved] = useState<SavedGame | undefined>(undefined);

  async function refresh(): Promise<Profile[]> {
    const list = await listProfiles();
    setProfiles(list);
    setSaved(await loadSavedGame());
    return list;
  }

  useEffect(() => {
    void requestPersistence();
    void (async () => {
      const list = await refresh();
      const lastId = await getLastProfileId();
      const last = list.find((p) => p.id === lastId);
      if (last) {
        await enterHome(last);
      } else {
        setScreen(list.length === 0 ? { name: 'edit' } : { name: 'profiles' });
      }
    })();
  }, []);

  // Each screen starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name, screen.name === 'station' ? screen.id : '']);

  async function enterHome(p: Profile) {
    setActive(p);
    void setLastProfileId(p.id);
    setProgress(await getProgress(p.id));
    setSaved(await loadSavedGame());
    setScreen({ name: 'home' });
  }

  async function handleSave(p: Profile) {
    await saveProfile(p);
    await refresh();
    await enterHome(p);
  }

  async function handleDelete(p: Profile) {
    await deleteProfile(p.id);
    if (saved && (saved.whiteId === p.id || saved.blackId === p.id)) await clearSavedGame();
    const list = await refresh();
    if (active?.id === p.id) setActive(null);
    setScreen(list.length === 0 ? { name: 'edit' } : { name: 'profiles' });
  }

  function findPlayer(id: string, level = 1): Profile | undefined {
    if (id === GUEST.id) return GUEST;
    if (id === COMPUTER_ID) return computerProfile(level);
    return profiles.find((p) => p.id === id);
  }

  function resume() {
    if (!saved) return;
    const level = saved.computer?.level ?? 1;
    const white = findPlayer(saved.whiteId, level);
    const black = findPlayer(saved.blackId, level);
    if (!white || !black) {
      void clearSavedGame();
      setSaved(undefined);
      return;
    }
    setScreen({
      name: 'game',
      config: {
        white,
        black,
        options: saved.options,
        moves: saved.moves,
        startedAt: saved.startedAt,
        // Games saved before phase 3 have no startFen: they began at the normal position.
        startFen: saved.startFen ?? DEFAULT_POSITION,
        computer: saved.computer
      }
    });
  }

  async function backHome() {
    if (active) await enterHome(active);
    else setScreen({ name: 'profiles' });
  }

  switch (screen.name) {
    case 'loading':
      return <main class="screen loading" aria-busy="true" />;

    case 'profiles':
      return (
        <ProfilePicker
          profiles={profiles}
          onPick={(p) => void enterHome(p)}
          onCreate={() => setScreen({ name: 'edit' })}
          onEdit={(p) => setScreen({ name: 'edit', profile: p })}
        />
      );

    case 'edit':
      return (
        <ProfileEditor
          key={screen.profile?.id ?? 'new'}
          profile={screen.profile}
          canCancel={profiles.length > 0}
          onSave={(p) => void handleSave(p)}
          onDelete={(p) => void handleDelete(p)}
          onCancel={() => setScreen({ name: 'profiles' })}
        />
      );

    case 'home':
      return (
        <Home
          profile={active!}
          progress={progress}
          hasSavedGame={!!saved}
          onSwitchProfile={() => setScreen({ name: 'profiles' })}
          onNewGame={() => setScreen({ name: 'setup' })}
          onResume={resume}
          onLearn={() => setScreen({ name: 'map' })}
          onComputer={() => setScreen({ name: 'computerSetup' })}
        />
      );

    case 'setup':
      return (
        <GameSetup
          me={active!}
          others={profiles.filter((p) => p.id !== active!.id)}
          onCancel={() => setScreen({ name: 'home' })}
          onStart={(white, black, options, startFen) => {
            void clearSavedGame();
            setScreen({ name: 'game', config: { white, black, options, moves: [], startedAt: Date.now(), startFen } });
          }}
        />
      );

    case 'computerSetup':
      return (
        <ComputerSetup
          me={active!}
          progress={progress}
          onCancel={() => setScreen({ name: 'home' })}
          onStart={(c) => {
            void clearSavedGame();
            void setEngineLevel(active!.id, c.level, false).then(setProgress);
            const cpu = computerProfile(c.level);
            setScreen({
              name: 'game',
              config: {
                white: c.color === 'w' ? active! : cpu,
                black: c.color === 'b' ? active! : cpu,
                options: { rotate: false, hints: c.hints },
                moves: [],
                startedAt: Date.now(),
                startFen: c.startFen,
                computer: { level: c.level, color: c.color === 'w' ? 'b' : 'w' }
              }
            });
          }}
        />
      );

    case 'summary':
      return (
        <GameSummary
          game={screen.game}
          onExit={() => void backHome()}
          onRematch={() => setScreen({ name: 'game', config: { ...screen.game.rematch, startedAt: Date.now() } })}
        />
      );

    case 'map':
      return (
        <LearningMap
          profile={active!}
          progress={progress}
          onBack={() => setScreen({ name: 'home' })}
          onOpen={(id) => setScreen({ name: 'station', id })}
        />
      );

    case 'station':
      return (
        <StationScreen
          profile={active!}
          stationId={screen.id}
          progress={progress}
          onExit={() => setScreen({ name: 'map' })}
          onOpen={(id) => setScreen({ name: 'station', id })}
          onProgress={setProgress}
        />
      );

    case 'game':
      return (
        <GameScreen
          key={screen.config.startedAt}
          config={screen.config}
          onExit={() => void backHome()}
          onRematch={(config) => setScreen({ name: 'game', config })}
          onSummary={(game) => setScreen({ name: 'summary', game })}
          onProgress={setProgress}
        />
      );
  }
}
