import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
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
import { clearSavedGame, getLastProfileId, loadSavedGame, setLastProfileId, type SavedGame } from '../game/savedGame';
import { requestPersistence } from '../storage/db';
import { loadContent } from '../content/index';
import { ProfilePicker } from '../screens/ProfilePicker';
import { ProfileEditor } from '../screens/ProfileEditor';
import { Home } from '../screens/Home';
import type { FinishedGame, GameConfig } from '../screens/GameScreen';
import { DEFAULT_POSITION } from '../chess/handicap';
import { LearningMap } from '../screens/LearningMap';
import { StationScreen } from '../screens/StationScreen';
import { offerPlacement } from '../screens/Home';
import { PinScreen } from '../screens/PinScreen';
import type { PuzzleMode } from '../screens/PuzzleScreen';
import { themeInfo } from '../content/puzzles/index';
import { PieceSprite } from '../components/Piece';
import { applyTheme } from '../themes/index';
import { activateSettings } from '../profiles/settings';
import { hasPin } from '../profiles/pin';
import { stopSpeaking } from '../audio/speech';
import { lazy } from './lazy';
import { logError } from './errorLog';
import { completedStations, dismissNudge, loadBackupState, shouldNudge, type BackupState } from '../storage/backupState';
import { clearRoomFromUrl, loadOpenRoom, roomFromUrl, type OpenRoom } from '../net/openRoom';
import type { RoomStart } from '../screens/RoomScreen';

// Not needed for the first screen: separate chunks (see lazy.tsx).
const GameScreen = lazy(() => import('../screens/GameScreen').then((m) => m.GameScreen));
const GameSetup = lazy(() => import('../screens/GameSetup').then((m) => m.GameSetup));
const ComputerSetup = lazy(() => import('../screens/ComputerSetup').then((m) => m.ComputerSetup));
const GameSummary = lazy(() => import('../screens/GameSummary').then((m) => m.GameSummary));
const PuzzleScreen = lazy(() => import('../screens/PuzzleScreen').then((m) => m.PuzzleScreen));
const PuzzlesHub = lazy(() => import('../screens/PuzzlesHub').then((m) => m.PuzzlesHub));
const ReviewScreen = lazy(() => import('../screens/ReviewScreen').then((m) => m.ReviewScreen));
const PlacementTest = lazy(() => import('../screens/PlacementTest').then((m) => m.PlacementTest));
const SettingsScreen = lazy(() => import('../screens/SettingsScreen').then((m) => m.SettingsScreen));
// Rooms (screens, relay, QR): one chunk, loaded only when someone opens a room.
const RoomScreen = lazy(() => import('../screens/RoomScreen').then((m) => m.RoomScreen));
// Backup and About: used rarely, each its own chunk.
const BackupScreen = lazy(() => import('../screens/BackupScreen').then((m) => m.BackupScreen));
const AboutScreen = lazy(() => import('../screens/AboutScreen').then((m) => m.AboutScreen));

/** Where the family screens (backup, about) go back to. */
type FamilyBack = 'settings' | 'profiles' | 'first';
const BACK_LABEL: Record<FamilyBack, string> = { settings: 'להגדרות', profiles: 'חזרה', first: 'חזרה' };

type Screen =
  | { name: 'loading' }
  | { name: 'profiles' }
  | { name: 'edit'; profile?: Profile; back?: 'profiles' | 'settings' }
  | { name: 'pin'; profile: Profile; then: 'home' | 'edit' }
  | { name: 'settings' }
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'computerSetup' }
  | { name: 'game'; config: GameConfig }
  | { name: 'summary'; game: FinishedGame }
  | { name: 'map' }
  | { name: 'station'; id: string; fromReview?: boolean }
  | { name: 'puzzles' }
  | { name: 'puzzle'; mode: PuzzleMode; back: 'home' | 'puzzles' | 'map' | 'review' }
  | { name: 'review' }
  | { name: 'placement'; back: 'home' | 'map' }
  | { name: 'room'; start: RoomStart }
  | { name: 'backup'; back: FamilyBack }
  | { name: 'about'; back: FamilyBack; focus?: 'report' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [active, setActive] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [saved, setSaved] = useState<SavedGame | undefined>(undefined);
  const [openRoom, setOpenRoom] = useState<OpenRoom | undefined>(undefined);
  const [backupState, setBackupState] = useState<BackupState | null>(null);
  /** A room code from a shared link or QR (?room=), handled once a profile is chosen. */
  const pendingRoom = useRef<string | null>(null);

  async function refresh(): Promise<Profile[]> {
    const list = await listProfiles();
    setProfiles(list);
    setSaved(await loadSavedGame());
    return list;
  }

  useEffect(() => {
    void requestPersistence();
    void (async () => {
      // The learning content is a separate download (lazy chunk); load it before the first screen.
      await loadContent().catch((e) => {
        console.error('[content] failed to load', e);
        logError(e, 'content');
      });
      const list = await refresh();
      pendingRoom.current = roomFromUrl();
      clearRoomFromUrl();
      const lastId = await getLastProfileId();
      // With a room link on a shared phone, first ask who is playing.
      const last = pendingRoom.current && list.length > 1 ? undefined : list.find((p) => p.id === lastId) ?? (pendingRoom.current ? list[0] : undefined);
      if (last && hasPin(last)) {
        setScreen({ name: 'pin', profile: last, then: 'home' });
      } else if (last) {
        await enterHome(last);
      } else {
        setScreen(list.length === 0 ? { name: 'edit' } : { name: 'profiles' });
      }
    })();
  }, []);

  // Shared screens (choosing a profile) use the default theme; a profile's own screens use its theme.
  // A layout effect, so it runs as the screen appears: a deferred effect could run after a quick
  // PIN had already entered the profile, and paint over the profile's own theme.
  useLayoutEffect(() => {
    // (The profile editor applies the theme being chosen itself, as a live preview.)
    if (screen.name === 'profiles' || screen.name === 'pin') void applyTheme('clean');
  }, [screen.name]);

  // Reading aloud stops when leaving a screen.
  useEffect(() => stopSpeaking, [screen]);

  // Each screen starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name, screen.name === 'station' ? screen.id : '', screen.name === 'puzzle' ? JSON.stringify(screen.mode) : '']);

  async function enterHome(p: Profile) {
    setActive(p);
    void setLastProfileId(p.id);
    void applyTheme(p.themeId);
    await activateSettings(p);
    setProgress(await getProgress(p.id));
    setSaved(await loadSavedGame());
    const room = await loadOpenRoom(p.id);
    setOpenRoom(room);
    setBackupState(await loadBackupState());
    const code = pendingRoom.current;
    pendingRoom.current = null;
    if (code) setScreen({ name: 'room', start: room?.code === code ? { kind: 'resume' } : { kind: 'join', code } });
    else setScreen({ name: 'home' });
  }

  async function handleSave(p: Profile) {
    await saveProfile(p);
    await refresh();
    await enterHome(p);
  }

  /** Theme or PIN changed from home or settings (already saved). */
  async function profileChanged(p: Profile) {
    setActive(p);
    await refresh();
  }

  function openProfile(p: Profile, then: 'home' | 'edit') {
    if (hasPin(p)) setScreen({ name: 'pin', profile: p, then });
    else if (then === 'home') void enterHome(p);
    else setScreen({ name: 'edit', profile: p });
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

  function familyBack(back: FamilyBack) {
    if (back === 'settings' && active) setScreen({ name: 'settings' });
    else setScreen(profiles.length === 0 ? { name: 'edit' } : { name: 'profiles' });
  }

  /** After a restore: everyone picks their profile again (the active one may have changed). */
  async function afterRestore() {
    setActive(null);
    setProgress(null);
    await activateSettings(null);
    const list = await refresh();
    setScreen(list.length === 0 ? { name: 'edit' } : { name: 'profiles' });
  }

  async function backHome() {
    if (active) await enterHome(active);
    else setScreen({ name: 'profiles' });
  }

  return (
    <>
      <PieceSprite />
      {renderScreen()}
    </>
  );

  function renderScreen() {
    switch (screen.name) {
      case 'loading':
        return <main class="screen loading" aria-busy="true" />;

      case 'profiles':
        return (
          <ProfilePicker
            profiles={profiles}
            onPick={(p) => openProfile(p, 'home')}
            onCreate={() => setScreen({ name: 'edit' })}
            onEdit={(p) => openProfile(p, 'edit')}
            onBackup={() => setScreen({ name: 'backup', back: 'profiles' })}
            onAbout={() => setScreen({ name: 'about', back: 'profiles' })}
          />
        );

      case 'pin': {
        const { profile, then } = screen;
        return (
          <PinScreen
            key={profile.id}
            profile={profile}
            onCancel={() => setScreen({ name: 'profiles' })}
            onPass={(p, reset) => {
              if (reset) void refresh();
              if (then === 'edit') setScreen({ name: 'edit', profile: p });
              else void enterHome(p);
            }}
          />
        );
      }

      case 'settings':
        return (
          <SettingsScreen
            profile={active!}
            onBack={() => setScreen({ name: 'home' })}
            onProfile={(p) => void profileChanged(p)}
            onEdit={() => setScreen({ name: 'edit', profile: active!, back: 'settings' })}
            onBackup={() => setScreen({ name: 'backup', back: 'settings' })}
            onAbout={(focus) => setScreen({ name: 'about', back: 'settings', focus })}
          />
        );

      case 'backup':
        return <BackupScreen backLabel={BACK_LABEL[screen.back]} onBack={() => familyBack(screen.back)} onRestored={() => void afterRestore()} />;

      case 'about':
        return (
          <AboutScreen
            backLabel={BACK_LABEL[screen.back]}
            focus={screen.focus}
            onBack={() => familyBack(screen.back)}
            // Start over from a clean slate: every module that keeps state in memory forgets it too.
            onDeleted={() => location.reload()}
          />
        );

      case 'edit':
        return (
          <ProfileEditor
            key={screen.profile?.id ?? 'new'}
            profile={screen.profile}
            canCancel={profiles.length > 0}
            onRestore={() => setScreen({ name: 'backup', back: 'first' })}
            onSave={(p) => void handleSave(p)}
            onDelete={(p) => void handleDelete(p)}
            onCancel={() => {
              if (screen.back === 'settings' && active) {
                void applyTheme(active.themeId);
                setScreen({ name: 'settings' });
              } else setScreen({ name: 'profiles' });
            }}
          />
        );

      case 'home':
        return (
          <Home
            profile={active!}
            progress={progress}
            hasSavedGame={!!saved}
            openRoom={openRoom}
            onRoom={() => setScreen({ name: 'room', start: { kind: 'menu' } })}
            onResumeRoom={() => setScreen({ name: 'room', start: { kind: 'resume' } })}
            onSwitchProfile={() => setScreen({ name: 'profiles' })}
            onNewGame={() => setScreen({ name: 'setup' })}
            onResume={resume}
            onLearn={() => setScreen({ name: 'map' })}
            onComputer={() => setScreen({ name: 'computerSetup' })}
            onDaily={() => setScreen({ name: 'puzzle', mode: { kind: 'daily' }, back: 'home' })}
            onPuzzles={() => setScreen({ name: 'puzzles' })}
            onReview={() => setScreen({ name: 'review' })}
            onPlacement={() => setScreen({ name: 'placement', back: 'home' })}
            onSettings={() => setScreen({ name: 'settings' })}
            onProfile={(p) => void profileChanged(p)}
            backupNudge={shouldNudge(backupState, completedStations(progress))}
            onBackup={() => setScreen({ name: 'backup', back: 'settings' })}
            onDismissNudge={() => {
              void dismissNudge();
              setBackupState({ ...backupState, nudgeDismissed: true });
            }}
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
            onPuzzles={(w) =>
              w.puzzles &&
              setScreen({
                name: 'puzzle',
                mode: {
                  kind: 'set',
                  theme: w.puzzles.theme,
                  count: w.puzzles.count,
                  title: `חידות: ${themeInfo(w.puzzles.theme)?.title ?? w.title}`
                },
                back: 'map'
              })
            }
            onPlacement={() => setScreen({ name: 'placement', back: 'map' })}
            showPlacement={offerPlacement(active!, progress)}
          />
        );

      case 'station':
        return (
          <StationScreen
            profile={active!}
            stationId={screen.id}
            progress={progress}
            fromReview={screen.fromReview}
            onExit={() => setScreen(screen.fromReview ? { name: 'review' } : { name: 'map' })}
            onOpen={(id) => setScreen({ name: 'station', id })}
            onProgress={setProgress}
          />
        );

      case 'puzzles':
        return (
          <PuzzlesHub
            profile={active!}
            progress={progress}
            onBack={() => setScreen({ name: 'home' })}
            onDaily={() => setScreen({ name: 'puzzle', mode: { kind: 'daily' }, back: 'puzzles' })}
            onTheme={(theme) => setScreen({ name: 'puzzle', mode: { kind: 'theme', theme }, back: 'puzzles' })}
          />
        );

      case 'puzzle': {
        const back = screen.back;
        return (
          <PuzzleScreen
            key={JSON.stringify(screen.mode)}
            profile={active!}
            progress={progress}
            mode={screen.mode}
            onExit={() => setScreen({ name: back } as Screen)}
            exitLabel={back === 'review' ? '🔁 לחזרה' : back === 'map' ? '🗺️ למפה' : undefined}
            onProgress={setProgress}
          />
        );
      }

      case 'review':
        return (
          <ReviewScreen
            profile={active!}
            progress={progress}
            onBack={() => setScreen({ name: 'home' })}
            onOpen={(item) =>
              setScreen(
                item.kind === 'station'
                  ? { name: 'station', id: item.id, fromReview: true }
                  : { name: 'puzzle', mode: { kind: 'one', theme: item.theme, id: item.id }, back: 'review' }
              )
            }
          />
        );

      case 'placement':
        return (
          <PlacementTest
            profile={active!}
            onExit={() => setScreen(screen.back === 'map' ? { name: 'map' } : { name: 'home' })}
            onMap={() => setScreen({ name: 'map' })}
            onProgress={setProgress}
          />
        );

      case 'room':
        return (
          <RoomScreen
            key={JSON.stringify(screen.start)}
            profile={active!}
            start={screen.start}
            openRoom={openRoom}
            onExit={() => void backHome()}
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
}
