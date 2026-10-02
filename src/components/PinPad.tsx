// A big number pad for a 4-digit PIN. Dots show how many digits were typed (never the digits).
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { PIN_LENGTH } from '../profiles/pin';

interface Props {
  title: string;
  hint?: string;
  /** Called with the full PIN. Return false to shake and clear (wrong PIN). */
  onComplete: (pin: string) => Promise<boolean | void> | boolean | void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function PinPad({ title, hint, onComplete }: Props) {
  const [pin, setPinState] = useState('');
  const [wrong, setWrong] = useState(0);
  // Refs, so fast taps between renders are not lost.
  const typed = useRef('');
  const busy = useRef(false);
  const setPin = (v: string) => {
    typed.current = v;
    setPinState(v);
  };

  async function press(k: string) {
    if (busy.current) return;
    if (k === 'del') {
      setPin(typed.current.slice(0, -1));
      return;
    }
    if (typed.current.length >= PIN_LENGTH) return;
    const next = typed.current + k;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      busy.current = true;
      const ok = await onComplete(next);
      busy.current = false;
      if (ok === false) {
        setWrong((w) => w + 1);
        setPin('');
      }
    }
  }

  // A hardware keyboard works too (tablets, desktop testing). Registered once: re-adding the
  // listener after every render would drop keys typed in between. Layout effect: ready as soon as it shows.
  const latest = useRef(press);
  latest.current = press;
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) void latest.current(e.key);
      else if (e.key === 'Backspace') void latest.current('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="pinpad">
      <p class="pin-title">{title}</p>
      {hint && <p class="pin-hint">{hint}</p>}
      <div class={`pin-dots ${wrong ? 'is-wrong' : ''}`} key={wrong} dir="ltr" aria-label={`הוקלדו ${pin.length} ספרות מתוך ${PIN_LENGTH}`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} class={i < pin.length ? 'is-on' : ''} />
        ))}
      </div>
      <div class="pin-keys" dir="ltr">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              type="button"
              key={i}
              class={`pin-key ${k === 'del' ? 'pin-del' : ''}`}
              data-key={k}
              aria-label={k === 'del' ? 'מחיקת ספרה' : k}
              onClick={() => void press(k)}
            >
              {k === 'del' ? '⌫' : k}
            </button>
          )
        )}
      </div>
    </div>
  );
}
