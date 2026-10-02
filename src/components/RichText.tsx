// Hebrew text with square names (e4) and numbers kept left-to-right.
// Square names are also styled so they stand out while learning the board.
// Chess symbols get U+FE0E so iPhone shows them as text, not as emoji.
const TOKEN = /([a-h][1-8]|\d+(?:[–-]\d+)?)/g;
const CHESS_GLYPH = /([♔-♟])(?!\uFE0E)/g;

export function RichText({ text }: { text: string }) {
  const parts = text.replace(CHESS_GLYPH, '$1\uFE0E').split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const isSquare = /^[a-h][1-8]$/.test(part);
        return (
          <bdi key={i} dir="ltr" class={isSquare ? 'sq-name' : undefined}>
            {part}
          </bdi>
        );
      })}
    </>
  );
}
