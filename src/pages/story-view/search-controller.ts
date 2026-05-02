/**
 * StorySearchController — concern D from story-view.ts
 *
 * Owns: match list, debouncer, highlight spans.
 * The page keeps the four template-facing fields and passes itself as
 * SearchState so the controller can mutate them directly — no extra
 * indirection, template bindings stay unchanged.
 */

import { buildNormalizedIndex, wrapRange } from './text-index';

/** The four template-facing search fields that live on the page. */
export interface SearchState {
  searchOpen: boolean;
  searchQuery: string;
  searchMatches: { page: number; occurrence: number }[];
  currentMatchIdx: number;
}

/** Callbacks the controller needs from its host (the page). */
export interface SearchHost {
  getActivePageIndex(): number;
  getContentRootForPage(page: number): HTMLElement | null;
  getScrollElement(): HTMLElement | undefined;
  getPageContent(): string[];
  isContinuousMode(): boolean;
  scrollToPage(page: number, speed: number): void;
  slideTo(page: number, speed?: number): void;
  setSuppressScrollSave(v: boolean): void;
}

export class StorySearchController {
  // Per-page normalized-text cache. Tied to one story's lifetime — instantiate
  // a fresh controller if the host ever swaps stories without unmounting.
  private searchPageTexts: string[] = [];
  // Map: match index → wrapped spans (sparse — only for materialized pages).
  private searchHighlightSpans: { [idx: number]: HTMLElement[] } = {};
  private searchInputDebounce: any;

  constructor(private state: SearchState, private host: SearchHost) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Open the search bar and focus its input after a short render delay. */
  toggleSearch(rootElement: any): void {
    this.state.searchOpen = true;
    setTimeout(() => {
      const el = rootElement && rootElement.nativeElement.querySelector('.search-bar input');
      if (el) (el as HTMLInputElement).focus();
    }, 50);
  }

  closeSearch(): void {
    this.state.searchOpen = false;
    this.clearHighlights();
    this.state.searchMatches = [];
    this.state.currentMatchIdx = -1;
  }

  onSearchInput(): void {
    if (this.searchInputDebounce) clearTimeout(this.searchInputDebounce);
    this.searchInputDebounce = setTimeout(() => this.runSearch(), 200);
  }

  nextMatch(): void {
    if (this.state.searchMatches.length === 0) return;
    this.state.currentMatchIdx = (this.state.currentMatchIdx + 1) % this.state.searchMatches.length;
    this.jumpToMatch(this.state.currentMatchIdx);
  }

  prevMatch(): void {
    if (this.state.searchMatches.length === 0) return;
    this.state.currentMatchIdx = (this.state.currentMatchIdx - 1 + this.state.searchMatches.length) % this.state.searchMatches.length;
    this.jumpToMatch(this.state.currentMatchIdx);
  }

  /**
   * Re-wrap all highlight spans on currently-rendered pages.  Idempotent —
   * safe to call after page changes, materialization, or current-index updates.
   */
  rehighlight(): void {
    this.clearHighlights();
    if (!this.state.searchOpen || this.state.searchMatches.length === 0) return;
    const qLower = this.state.searchQuery
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!qLower) return;

    // In slides mode only the active slide's DOM is queryable; limit to active page.
    const activePage = this.host.getActivePageIndex();
    const byPage: { [page: number]: number[] } = {};
    this.state.searchMatches.forEach((m, i) => {
      if (!this.host.isContinuousMode() && m.page !== activePage) return;
      if (!byPage[m.page]) byPage[m.page] = [];
      byPage[m.page].push(i);
    });

    Object.keys(byPage).forEach(pageStr => {
      const page = parseInt(pageStr, 10);
      const root = this.host.getContentRootForPage(page);
      if (!root) return;
      const { normalized, map } = buildNormalizedIndex(root);
      const lower = normalized.toLowerCase();

      // Wrap in descending occurrence order so earlier offsets stay valid.
      const ordered = byPage[page].slice().sort((a, b) => this.state.searchMatches[b].occurrence - this.state.searchMatches[a].occurrence);

      ordered.forEach(i => {
        const occ = this.state.searchMatches[i].occurrence;
        let from = 0;
        let foundIdx = -1;
        for (let k = 0; k <= occ; k += 1) {
          foundIdx = lower.indexOf(qLower, from);
          if (foundIdx < 0) break;
          from = foundIdx + qLower.length;
        }
        if (foundIdx < 0) return;
        const endIdx = Math.min(foundIdx + qLower.length, map.length) - 1;
        const isCurrent = i === this.state.currentMatchIdx;
        const className = isCurrent ? 'reader-search-hit current' : 'reader-search-hit';
        this.searchHighlightSpans[i] = wrapRange(map, foundIdx, endIdx, className);
      });
    });
  }

  scrollCurrentIntoView(scrollEl: HTMLElement | undefined): void {
    const spans = this.searchHighlightSpans[this.state.currentMatchIdx];
    if (!spans || spans.length === 0) return;
    const el = scrollEl || this.host.getScrollElement();
    if (!el) return;
    const r = spans[0].getBoundingClientRect();
    const cr = el.getBoundingClientRect();

    const margin = 40;
    if (r.top >= cr.top + margin && r.bottom <= cr.bottom - margin) return;

    this.host.setSuppressScrollSave(true);
    el.scrollTop = Math.max(0, el.scrollTop + (r.top - cr.top) - 100);
    setTimeout(() => this.host.setSuppressScrollSave(false), 150);
  }

  clearHighlights(): void {
    Object.keys(this.searchHighlightSpans).forEach(k => {
      this.searchHighlightSpans[k].forEach(span => {
        const p = span.parentNode;
        if (!p) return;
        while (span.firstChild) p.insertBefore(span.firstChild, span);
        p.removeChild(span);
        if ((p as any).normalize) (p as any).normalize();
      });
    });
    this.searchHighlightSpans = {};
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private getNormalizedPageText(page: number): string {
    if (this.searchPageTexts[page] != null) return this.searchPageTexts[page];
    const html = this.host.getPageContent()[page] || '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const { normalized } = buildNormalizedIndex(tmp);
    this.searchPageTexts[page] = normalized;
    return normalized;
  }

  private runSearch(): void {
    this.clearHighlights();
    const q = this.state.searchQuery.replace(/\s+/g, ' ').trim();
    this.state.searchMatches = [];
    this.state.currentMatchIdx = -1;
    if (q.length < 2) return;

    const qLower = q.toLowerCase();
    const total = this.host.getPageContent().length;
    for (let p = 0; p < total; p += 1) {
      const text = this.getNormalizedPageText(p).toLowerCase();
      let from = 0;
      let occ = 0;
      while (true) {
        const idx = text.indexOf(qLower, from);
        if (idx < 0) break;
        this.state.searchMatches.push({ page: p, occurrence: occ });
        occ += 1;
        from = idx + qLower.length;
      }
    }
    if (this.state.searchMatches.length > 0) {
      this.state.currentMatchIdx = 0;
      this.jumpToMatch(0);
    }
  }

  private jumpToMatch(idx: number): void {
    const m = this.state.searchMatches[idx];
    if (!m) return;
    const active = this.host.getActivePageIndex();

    // Immediate class swap so the orange "current" highlight follows the tap.
    this.updateCurrentHighlight();

    const after = (delay: number) =>
      setTimeout(() => {
        this.rehighlight();
        this.scrollCurrentIntoView(this.host.getScrollElement());
      }, delay);

    if (active !== m.page) {
      if (this.host.isContinuousMode()) {
        this.host.scrollToPage(m.page, 0);
        after(300);
      } else {
        this.host.slideTo(m.page, 0);
        // slideChanged rebinds scroll ~50ms later; give the new active slide time to render.
        after(250);
      }
    } else {
      this.rehighlight();
      this.scrollCurrentIntoView(this.host.getScrollElement());
    }
  }

  private updateCurrentHighlight(): void {
    Object.keys(this.searchHighlightSpans).forEach(k => {
      const i = parseInt(k, 10);
      const isCurrent = i === this.state.currentMatchIdx;
      this.searchHighlightSpans[i].forEach(span => {
        if (isCurrent) span.classList.add('current');
        else span.classList.remove('current');
      });
    });
  }
}
