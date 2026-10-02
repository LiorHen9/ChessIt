interface Props {
  stars: number;
  /** Pop the earned stars in one after another. */
  animate?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StarRow({ stars, animate = false, size = 'sm' }: Props) {
  return (
    <span class={`star-row star-row-${size} ${animate ? 'is-animated' : ''}`} role="img" aria-label={`${stars} כוכבים מתוך 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} class={n <= stars ? 'star-on' : 'star-off'} style={animate ? `--i:${n}` : undefined} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}
