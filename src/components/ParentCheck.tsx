// "A question for a parent": a sum an adult does in their head and a young child usually cannot.
// Guards what only a parent should do: resetting a forgotten PIN, replacing the family's data with
// a backup, deleting all data. A wrong answer brings a new sum.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { parentQuestion } from '../profiles/pin';

interface Props {
  /** What a right answer does, in one sentence (before "כמה זה …?"). */
  children: ComponentChildren;
  confirmLabel?: string;
  /** Red confirm button (for deleting). */
  danger?: boolean;
  onPass: () => void | Promise<void>;
  onCancel: () => void;
}

export function ParentCheck({ children, confirmLabel = 'אישור', danger, onPass, onCancel }: Props) {
  const [question, setQuestion] = useState(() => parentQuestion());
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  async function submit(e: Event) {
    e.preventDefault();
    if (Number(answer.trim()) !== question.answer) {
      setWrong(true);
      setAnswer('');
      setQuestion(parentQuestion());
      input.current?.focus();
      return;
    }
    await onPass();
  }

  return (
    <form class="card parent-check" onSubmit={submit} data-testid="parent-check">
      <p class="parent-title">שאלה להורה</p>
      <p>
        {children} כמה זה{' '}
        <bdi dir="ltr" class="parent-q">
          {question.text}
        </bdi>
        ?
      </p>
      <input
        ref={input}
        class="input"
        inputMode="numeric"
        pattern="[0-9]*"
        dir="ltr"
        autoComplete="off"
        aria-label={`התשובה לתרגיל ${question.text}`}
        value={answer}
        onInput={(e) => setAnswer((e.target as HTMLInputElement).value)}
      />
      {wrong && (
        <p class="parent-wrong" role="alert">
          לא נכון. הנה תרגיל אחר.
        </p>
      )}
      <div class="row">
        <button class={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} type="submit" disabled={!answer.trim()}>
          {confirmLabel}
        </button>
        <button class="btn btn-secondary" type="button" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  );
}
