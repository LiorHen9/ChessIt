// A short burst of confetti; purely decorative. Hidden when the user prefers less motion.
const COLORS = ['#e0a526', '#e76f51', '#2a9d8f', '#3a86ff', '#d6336c', '#2f9e44', '#8e5bd8'];

export function Confetti({ count = 36 }: { count?: number }) {
  const bits = [];
  for (let i = 0; i < count; i++) {
    // Deterministic spread, so it looks the same each time and needs no random state.
    const left = (i * 37) % 100;
    const delay = (i % 9) * 70;
    const drift = ((i * 53) % 60) - 30;
    const spin = (i * 97) % 360;
    bits.push(
      <span
        key={i}
        class="confetti-bit"
        style={`left:${left}%;background:${COLORS[i % COLORS.length]};animation-delay:${delay}ms;--drift:${drift}px;--spin:${spin}deg`}
      />
    );
  }
  return (
    <div class="confetti" aria-hidden="true">
      {bits}
    </div>
  );
}
