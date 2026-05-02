/**
 * ContinuousScrollController — concern B + continuous-mode parts of concern C.
 *
 * Owns: pageHeights, materialized, measured arrays; IntersectionObserver;
 * ResizeObserver-based scroll restore; active-page tracking from scroll events.
 *
 * Slides-mode scroll persistence stays on the page because it's tightly
 * coupled to ionic's Slides lifecycle.
 */

import { QueryList, ElementRef, NgZone } from '@angular/core';
import { Storage } from '@ionic/storage';

export interface ContinuousHost {
  getPageCount(): number;
  getScrollElement(): HTMLElement | undefined;
  persistScroll(): void;
  setSuppressScrollSave(v: boolean): void;
  onActivePageChanged(page: number): void;
  /** Called after any page becomes newly materialized so search can rehighlight. */
  onMaterialized(): void;
  readonly zone: NgZone;
  readonly storage: Storage;
  getScrollKey(page: number): string;
}

export class ContinuousScrollController {
  /** Template-bound: `[style.minHeight.px]="pageHeights[i]"` etc. */
  pageHeights: number[] = [];
  materialized: boolean[] = [];
  measured: boolean[] = [];
  readonly estimatedPageHeight = 1200;

  private intersectionObserver: IntersectionObserver;
  private continuousPagesSub: any;
  ready = false;
  lastActivePage = 0;

  constructor(private host: ContinuousHost) {}

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Initialise arrays for `count` pages (call once after addSlides). */
  init(count: number): void {
    this.pageHeights = Array(count).fill(this.estimatedPageHeight);
    this.materialized = Array(count).fill(false);
    this.measured = Array(count).fill(false);
    this.ready = false;
    this.lastActivePage = 0;
  }

  /** Reset measurement cache after a mode toggle (page count stays the same). */
  reset(): void {
    const n = this.pageHeights.length;
    this.pageHeights = Array(n).fill(this.estimatedPageHeight);
    this.materialized = Array(n).fill(false);
    this.measured = Array(n).fill(false);
    this.ready = false;
  }

  setup(startPage: number, continuousPages: QueryList<ElementRef>): void {
    // Pre-materialize pages 0..startPage+2 so cumulative heights are exact at restore.
    this.lastActivePage = startPage;
    const max = Math.min(startPage + 2, this.host.getPageCount() - 1);
    for (let i = 0; i <= max; i += 1) {
      this.materialized[i] = true;
    }

    setTimeout(() => {
      this.measureAllRendered(continuousPages);
      this.host.setSuppressScrollSave(true);
      this.restoreContinuousScroll(startPage, continuousPages).then(() => {
        setTimeout(() => {
          this.measureAllRendered(continuousPages);
          this.host.setSuppressScrollSave(false);
          this.ready = true;
        }, 200);
      });
      this.observePages(continuousPages);
    }, 50);
  }

  teardown(): void {
    if (this.continuousPagesSub) {
      this.continuousPagesSub.unsubscribe();
      this.continuousPagesSub = undefined;
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }
    this.ready = false;
  }

  // --------------------------------------------------------------------------
  // Scroll handling
  // --------------------------------------------------------------------------

  onScroll(continuousPages: QueryList<ElementRef>): void {
    this.updateActivePage(continuousPages);
  }

  scrollToPage(page: number, speed: number, continuousPages: QueryList<ElementRef>): void {
    const el = this.host.getScrollElement();
    if (!el) return;
    const clamped = Math.max(0, Math.min(this.host.getPageCount() - 1, page));
    this.materializeWindow(clamped, 2);

    // Allow placeholders to lay out before scrolling so the offset is correct.
    setTimeout(() => {
      this.measureAllRendered(continuousPages);
      const target = this.getPageStart(clamped);
      this.lastActivePage = clamped;
      this.host.onActivePageChanged(clamped);
      if (speed > 0 && (el as any).scrollTo) {
        (el as any).scrollTo({ top: target, behavior: 'smooth' });
      } else {
        el.scrollTop = target;
      }
    }, 0);
  }

  getPageStart(page: number): number {
    let total = 0;
    for (let i = 0; i < page && i < this.pageHeights.length; i += 1) total += this.pageHeights[i] || 0;
    return total;
  }

  /** Returns the page index and within-page offset for the current scroll position. */
  getContinuousScrollOffset(scrollEl: HTMLElement): { page: number; offset: number } {
    const page = this.lastActivePage;
    const offset = Math.max(0, Math.floor((scrollEl.scrollTop || 0) - this.getPageStart(page)));
    return { page, offset };
  }

  materializeWindow(centerPage: number, radius: number = 2): void {
    const min = Math.max(0, centerPage - radius);
    const max = Math.min(this.host.getPageCount() - 1, centerPage + radius);
    for (let i = min; i <= max; i += 1) this.materialized[i] = true;
  }

  measureAllRendered(continuousPages: QueryList<ElementRef>): void {
    if (!continuousPages) return;
    const el = this.host.getScrollElement();
    const prevScrollTop = el ? el.scrollTop : 0;
    const activePage = this.lastActivePage;
    const prevPageStart = this.getPageStart(activePage);

    let changed = false;
    continuousPages.forEach(ref => {
      const node = ref.nativeElement as HTMLElement;
      const idx = parseInt(node.getAttribute('data-page'), 10);
      if (isNaN(idx)) return;
      // Skip placeholders and already-locked heights.
      if (!this.materialized[idx] || this.measured[idx]) return;
      const inner = node.firstElementChild as HTMLElement;
      const h = inner ? inner.offsetHeight : node.offsetHeight;
      if (h && Math.abs(h - this.pageHeights[idx]) > 1) {
        this.pageHeights[idx] = h;
        this.measured[idx] = true;
        changed = true;
      } else if (h) {
        this.measured[idx] = true;
      }
    });

    if (changed) {
      this.host.onMaterialized();
    }

    // Compensate scroll position so the user's view doesn't jump when heights
    // above the active page change (images loading after first render, etc.).
    if (changed && el && this.ready) {
      const newPageStart = this.getPageStart(activePage);
      const delta = newPageStart - prevPageStart;
      if (Math.abs(delta) > 0.5) {
        this.host.setSuppressScrollSave(true);
        el.scrollTop = Math.max(0, prevScrollTop + delta);
        setTimeout(() => this.host.setSuppressScrollSave(false), 50);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private observePages(continuousPages: QueryList<ElementRef>): void {
    const root = this.host.getScrollElement();
    if (!root || !('IntersectionObserver' in window)) return;

    this.intersectionObserver = new IntersectionObserver(
      entries => {
        let needsMeasure = false;
        entries.forEach(entry => {
          if (!(entry as any).isIntersecting && entry.intersectionRatio <= 0) return;
          const idx = parseInt((entry.target as HTMLElement).getAttribute('data-page'), 10);
          if (isNaN(idx)) return;
          if (!this.materialized[idx]) {
            this.host.zone.run(() => (this.materialized[idx] = true));
            needsMeasure = true;
          } else if (!this.measured[idx]) {
            needsMeasure = true;
          }
        });
        if (needsMeasure) setTimeout(() => this.measureAllRendered(continuousPages), 0);
      },
      { root, rootMargin: '1500px 0px 1500px 0px', threshold: 0 },
    );

    continuousPages.forEach(ref => this.intersectionObserver.observe(ref.nativeElement));
    // Guard against late changes notifications arriving after teardown.
    this.continuousPagesSub = continuousPages.changes.subscribe(() => {
      if (!this.intersectionObserver) return;
      continuousPages.forEach(ref => this.intersectionObserver.observe(ref.nativeElement));
    });
  }

  private updateActivePage(continuousPages: QueryList<ElementRef>): void {
    const el = this.host.getScrollElement();
    if (!el) return;
    const top = el.scrollTop;
    let acc = 0;
    let page = 0;
    for (let i = 0; i < this.pageHeights.length; i += 1) {
      const next = acc + (this.pageHeights[i] || 0);
      if (top < next - 1) {
        page = i;
        break;
      }
      acc = next;
      page = i;
    }
    if (page !== this.lastActivePage) {
      this.lastActivePage = page;
      this.materializeWindow(page, 2);
      this.host.zone.run(() => {
        this.host.onActivePageChanged(page);
      });
    }
  }

  private restoreContinuousScroll(page: number, continuousPages: QueryList<ElementRef>): Promise<void> {
    return new Promise(resolve => {
      const el = this.host.getScrollElement();
      if (!el) {
        resolve();
        return;
      }
      this.host.storage.get(this.host.getScrollKey(page)).then((offset: number) => {
        const off = typeof offset === 'number' && !isNaN(offset) ? offset : 0;
        const apply = () => {
          this.measureAllRendered(continuousPages);
          el.scrollTop = this.getPageStart(page) + off;
        };

        apply();

        if (typeof (window as any).ResizeObserver !== 'function') {
          // Older WebViews: fall back to a short fixed schedule.
          setTimeout(apply, 100);
          setTimeout(apply, 300);
          setTimeout(() => {
            apply();
            resolve();
          }, 600);
          return;
        }

        let stableFrames = 0;
        let lastHeight = el.scrollHeight;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          ro.disconnect();
          if (timer) clearTimeout(timer);
          resolve();
        };
        const ro = new (window as any).ResizeObserver(() => {
          stableFrames = 0;
          lastHeight = el.scrollHeight;
          apply();
        });
        ro.observe(el);

        const tick = () => {
          if (done) return;
          if (el.scrollHeight === lastHeight) {
            stableFrames += 1;
            if (stableFrames >= 2) {
              apply();
              finish();
              return;
            }
          } else {
            stableFrames = 0;
            lastHeight = el.scrollHeight;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const timer = setTimeout(() => {
          apply();
          finish();
        }, 1500);
      });
    });
  }
}
