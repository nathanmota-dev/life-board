/** How many columns of at least `minWidth` fit in `width`, between 1 and `max`. */
export function masonryColumns(width: number, minWidth = 240, gap = 12, max = 5) {
  return Math.min(max, Math.max(1, Math.floor((width + gap) / (minWidth + gap))))
}

/** Deals items into columns left to right, so reading order runs across rows like Keep. */
export function distributeColumns<T>(items: T[], columns: number) {
  return Array.from({ length: columns }, (_, column) => items.filter((_, index) => index % columns === column))
}
