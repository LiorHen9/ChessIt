// A short celebration burst; purely decorative. The theme picks the kind: confetti (clean),
// stars flying up (space) or falling leaves (forest). Hidden when the user prefers less motion.
import { useTheme } from '../themes/index';

const COLORS = {
  confetti: ['#e0a526', '#e76f51', '#2a9d8f', '#3a86ff', '#d6336c', '#2f9e44', '#8e5bd8'],
  stars: ['#ffd43b', '#fff3bf', '#a5d8ff', '#ffffff', '#fcc419', '#d0bfff'],
  leaves: ['#2f9e44', '#74b816', '#e8590c', '#f59f00', '#a9e34b', '#c2410c']
};

export function Confetti({ count = 36 }: { count?: number }) {
  const kind = useTheme().celebrate;
  const colors = COLORS[kind];
  const bits = [];
  for (let i = 0; i < count; i++) {
    // Deterministic spread, so it looks the same each time and needs no random state.
    const left = (i * 37) % 100;
    const delay = (i % 9) * 70;
    const drift = ((i * 53) % 60) - 30;
    const spin = (i * 97) % 360;
    const size = kind === 'confetti' ? 1 : 0.8 + ((i * 29) % 10) / 10;
    bits.push(
      <span
        key={i}
        class="confetti-bit"
        style={`left:${left}%;background:${colors[i % colors.length]};animation-delay:${delay}ms;--drift:${drift}px;--spin:${spin}deg;--s:${size}`}
      />
    );
  }
  return (
    <div class={`confetti is-${kind}`} aria-hidden="true" data-celebrate={kind}>
      {bits}
    </div>
  );
}
