/**
 * Pure DOM-text utilities shared by StorySearchController and anchor capture/restore.
 *
 * No Angular DI, no side-effects — import freely from any module that needs
 * to walk page text or wrap character ranges.
 */

export interface TextMap {
  node: Text;
  offset: number;
}

export interface NormalizedIndex {
  /** Whitespace-collapsed text from all text nodes under `root`. */
  normalized: string;
  /** Per-character back-map to the originating (textNode, offset) pair. */
  map: TextMap[];
}

/**
 * Walk all text nodes under `root` and produce a whitespace-collapsed string
 * plus a per-character back-map to the original (textNode, charOffset) pair.
 * Multiple consecutive whitespace characters (including &nbsp;) are folded
 * into a single space so match counts are layout-independent.
 */
export function buildNormalizedIndex(root: HTMLElement): NormalizedIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null as any);
  let normalized = '';
  const map: TextMap[] = [];
  let prevWasSpace = true;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const raw = node.textContent || '';
    for (let i = 0; i < raw.length; i += 1) {
      const c = raw.charCodeAt(i);
      const isSpace = c === 32 || c === 9 || c === 10 || c === 13 || c === 160;
      if (isSpace) {
        if (!prevWasSpace) {
          normalized += ' ';
          map.push({ node, offset: i });
          prevWasSpace = true;
        }
      } else {
        normalized += raw[i];
        map.push({ node, offset: i });
        prevWasSpace = false;
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return { normalized, map };
}

/**
 * Wrap the character range [startIdx, endIdx] (inclusive, into `map`) with
 * `<span class="${className}">` elements.  Each contiguous run within the
 * same Text node gets a single span; boundaries that straddle multiple nodes
 * produce one span per node segment.
 *
 * Returns the created span elements so the caller can toggle classes or
 * unwrap them later.  Silently skips segments that throw (e.g. Range
 * straddling a non-text boundary) — partial wraps are acceptable.
 */
export function wrapRange(map: TextMap[], startIdx: number, endIdx: number, className: string): HTMLElement[] {
  const wraps: HTMLElement[] = [];
  let i = startIdx;
  while (i <= endIdx) {
    const node = map[i].node;
    let j = i;
    let lastOffset = map[i].offset;
    while (j + 1 <= endIdx && map[j + 1].node === node) {
      j += 1;
      lastOffset = map[j].offset;
    }
    try {
      const r = document.createRange();
      r.setStart(node, map[i].offset);
      const len = (node.textContent || '').length;
      r.setEnd(node, Math.min(lastOffset + 1, len));
      const span = document.createElement('span');
      span.className = className;
      r.surroundContents(span);
      wraps.push(span);
    } catch (e) {
      // ignore — partial wrap is acceptable
    }
    i = j + 1;
  }
  return wraps;
}
