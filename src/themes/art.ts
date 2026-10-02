/** An SVG string as a CSS url() value. */
export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}
