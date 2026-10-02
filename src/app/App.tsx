import { useEffect, useState } from 'preact/hooks';
import { MiniBoard } from '../components/MiniBoard';

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function useInstalled(): boolean {
  const query = '(display-mode: standalone)';
  const [installed, setInstalled] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setInstalled(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return installed;
}

export function App() {
  const online = useOnline();
  const installed = useInstalled();

  return (
    <main class="home">
      <header class="hero">
        <p class="eyebrow">שלב 0 · התשתית מוכנה</p>
        <h1>שחמט ביחד</h1>
        <p class="lead">לומדים שחמט צעד אחר צעד – ילדים, הורים, כל המשפחה.</p>
      </header>

      <MiniBoard />

      <ul class="status" aria-label="מצב האפליקציה">
        <li class={online ? 'ok' : 'warn'}>
          <span class="dot" aria-hidden="true" />
          {online ? 'מחובר לאינטרנט' : 'אין אינטרנט – והכול עדיין עובד'}
        </li>
        <li class={installed ? 'ok' : 'idle'}>
          <span class="dot" aria-hidden="true" />
          {installed ? 'מותקן במסך הבית' : 'אפשר להוסיף למסך הבית מתפריט הדפדפן'}
        </li>
      </ul>

      <footer class="foot">בקרוב: פרופילים, לוח משחק ועולם הכלים</footer>
    </main>
  );
}
