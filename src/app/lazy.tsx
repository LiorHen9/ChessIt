// Screens that are not needed right away are separate chunks, loaded on first use, so the first
// load stays small. The Service Worker still precaches every chunk, so they work offline.
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { logError } from './errorLog';

export function lazy<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const start = () => {
    if (!pending)
      pending = load().then((c) => {
        Loaded = c;
      });
    return pending;
  };

  return function Lazy(props: P) {
    const [, setReady] = useState(!!Loaded);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (Loaded) return;
      let alive = true;
      start().then(
        () => alive && setReady(true),
        (e) => {
          console.error('[lazy] failed to load a screen', e);
          logError(e, 'lazy screen');
          pending = null;
          if (alive) setFailed(true);
        }
      );
      return () => {
        alive = false;
      };
    }, []);
    if (Loaded) return <Loaded {...props} />;
    if (failed)
      return (
        <main class="screen">
          <p>לא הצלחנו לטעון את המסך. צריך חיבור לאינטרנט בפעם הראשונה.</p>
          <button class="btn btn-primary" onClick={() => location.reload()}>
            לנסות שוב
          </button>
        </main>
      );
    return <main class="screen loading" aria-busy="true" />;
  };
}
