import { Component, ViewChild, ViewChildren, QueryList, ElementRef, HostListener, NgZone } from '@angular/core';
import { IonicPage, Slides, NavController, NavParams, Platform, PopoverController } from 'ionic-angular';

import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';
import { AndroidFullScreen } from '@ionic-native/android-full-screen';

import { STORYSTYLEOPTIONS_KEY } from '../../providers/db';
import { Stories, Analytics, Settings, History, User, UX } from '../../providers/providers';
import { Story } from '../../models/story';

@IonicPage({ priority: 'low' })
@Component({
  selector: 'page-story-view',
  templateUrl: 'story-view.html',
})
export class StoryViewPage {
  Math: Math = Math;

  slides: any[] = [];
  dir: string = 'ltr';
  slidesPerView: number = 1;
  alternatePagination: boolean = true;
  inFullscreen = false;
  enableImmersive = false;
  statusBarHeight = 30;
  firstTimeNextPage = true;
  story: Story;
  translations;
  @ViewChild('slidesElement') slidesElement: Slides;
  @ViewChild('range') range: any;
  @ViewChild('rootElement') rootElement: any;
  @ViewChildren('continuousPage') continuousPages: QueryList<ElementRef>;

  private scrollElement: HTMLElement;
  private scrollSaveTimeout: any;
  private pauseSub: any;
  private resumeSub: any;

  // Continuous mode state
  pageHeights: number[] = [];
  materialized: boolean[] = [];
  measured: boolean[] = [];
  estimatedPageHeight = 1200;
  private intersectionObserver: IntersectionObserver;
  private continuousPagesSub: any;
  private continuousReady = false;
  private suppressScrollSave = false;
  private suppressRangeChange = false;
  private lastActivePage = 0;

  settings = {
    fontsize: 15,
    lineheight: 21.5,
    theme: 'black',
    color: 'rgb(255,255,255)',
    background: 'rgb(0,0,0)',
    font: 'sans-serif',
    textalign: 'justify',
    lowcontrast: false,
    buttonStyle: 'light',
    continuousMode: false,
  };

  constructor(
    public navCtrl: NavController,
    public platform: Platform,
    public storage: Storage,
    public appSettings: Settings,
    public user: User,
    public stories: Stories,
    public analytics: Analytics,
    public history: History,
    private popoverCtrl: PopoverController,
    public ux: UX,
    private androidFullScreen: AndroidFullScreen,
    private zone: NgZone,
    translate: TranslateService,
    public navParams: NavParams,
  ) {
    this.dir = platform.dir();
    this.story = navParams.get('story');

    // TODO: making this dynamic would be so much better, alas there is no way for ionic 3
    this.statusBarHeight = appSettings.allSettings.largeStatusbarHeight && platform.is('cordova') ? 60 : this.statusBarHeight;
    this.enableImmersive = appSettings.allSettings.enableImmersiveReading && platform.is('cordova');

    const loader = navParams.get('loader');
    if (loader) {
      loader.dismiss();
    }

    translate.get(['STORY_ENDOFSERIES', 'CLOSE_BUTTON', 'STORYVIEW_ERROR_IMAGE']).subscribe(values => {
      this.translations = values;
    });

    this.storage.get(STORYSTYLEOPTIONS_KEY).then(value => {
      if (value) {
        // Merge so newly added defaults survive when loading older saved settings
        this.settings = { ...this.settings, ...value };
      }
    });

    // get story from server
    if (!this.story.cached) {
      this.stories.getById(this.story.id).subscribe(story => {
        if (!story) {
          this.navCtrl.pop();
          return;
        }

        // add details & content to db
        this.story.series = story.series;
        this.story.length = story.length;
        this.story.tags = story.tags;
        this.story.content = story.content;
        this.story.cached = true;

        this.stories.cache(this.story);
        this.addSlides();
      });
    } else {
      this.addSlides();
    }

    this.history.add(this.story);
  }

  private addSlides() {
    this.story.content.forEach((item, index) => {
      // Add fallback handlers for images
      const parsedContent = item.replace('<img src=', `<img alt='&nbsp;${this.translations.STORYVIEW_ERROR_IMAGE}' src=`);
      this.slides.push({
        content: parsedContent,
        page: index,
        desktoppage: index,
      });
      this.pageHeights.push(this.estimatedPageHeight);
      this.materialized.push(false);
      this.measured.push(false);
    });
  }

  ionViewWillEnter() {
    this.alternatePagination = this.appSettings.allSettings.alternatePagination;
    if (!this.settings.continuousMode && this.slidesElement) {
      if (this.story.currentpage > 0) this.slideTo(this.story.currentpage, 0);
      if (this.alternatePagination) this.slidesElement.lockSwipes(true);
    }
  }

  ionViewDidEnter() {
    this.analytics.track('StoryView');

    setTimeout(() => {
      // enable fullscreen mode when previous story in series was being read
      const shouldBeFullscreen = this.navParams.get('fullscreen') || this.inFullscreen;
      if (shouldBeFullscreen) {
        this.toggleImmersive();
      } else if (this.enableImmersive) {
        this.androidFullScreen.showUnderSystemUI();
      }

      this.rootElement.nativeElement.style.setProperty('--statusbar-height', `${this.statusBarHeight}px`);
    }, 10);

    setTimeout(() => {
      if (this.settings.continuousMode) {
        this.setupContinuous();
      } else {
        this.bindScroll();
        this.restoreScroll();
      }
    }, 50);

    this.pauseSub = this.platform.pause.subscribe(() => this.persistScroll());
    this.resumeSub = this.platform.resume.subscribe(() => {
      setTimeout(() => this.restoreScroll(), 50);
    });
  }

  ionViewWillLeave() {
    this.persistScroll();
    this.unbindScroll();
    this.teardownContinuous();
    if (this.pauseSub) this.pauseSub.unsubscribe();
    if (this.resumeSub) this.resumeSub.unsubscribe();
    if (this.enableImmersive) {
      this.androidFullScreen.showSystemUI();
    }
  }

  private toggleImmersive() {
    if (this.enableImmersive) {
      if (this.inFullscreen) {
        this.androidFullScreen.showSystemUI();
        this.androidFullScreen.showUnderSystemUI();
      } else {
        this.androidFullScreen.immersiveMode();
      }
    }
    this.inFullscreen = !this.inFullscreen;
  }

  // ----------------------------------------------------------------------
  // Moving between slides
  // ----------------------------------------------------------------------

  private slideTo(newPage: number, speed?: number) {
    if (this.settings.continuousMode) {
      this.scrollToPage(newPage, typeof speed === 'number' ? speed : 300);
      return;
    }
    if (this.alternatePagination) this.slidesElement.lockSwipes(false);
    this.slidesElement.slideTo(newPage, speed);
    if (this.alternatePagination) this.slidesElement.lockSwipes(true);
  }

  nextSlide(event?: MouseEvent) {
    if (event) event.stopPropagation();

    const active = this.getActivePageIndex();
    // try going to next in series on last page
    if (active >= this.slides.length - 1) {
      this.goToNextInSeries();
      return;
    }

    // hide status bar after reading the first page
    if (this.firstTimeNextPage && !this.inFullscreen) {
      this.toggleImmersive();
    }

    this.slideTo(active + 1);
    this.firstTimeNextPage = false;
  }

  prevSlide(event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.slideTo(this.getActivePageIndex() - 1);
  }

  clickSlides(event: MouseEvent) {
    if (this.alternatePagination || this.settings.continuousMode) {
      this.toggleImmersive();
      return;
    }

    if (event.clientX < this.platform.width() / 4) {
      // clicking in left most 25%
      this.prevSlide();
    } else if (event.clientX > (3 * this.platform.width()) / 4) {
      // clicking in right most 25%
      this.nextSlide();
    } else {
      this.toggleImmersive();
    }
  }

  @HostListener('window:volumebuttonslistener', ['$event'])
  onVolumeRocker(event) {
    if (!this.appSettings.allSettings.navigateWithVolumeRocker) return;
    if (event.signal === 'volume-up') {
      this.prevSlide();
    }
    if (event.signal === 'volume-down') {
      this.nextSlide();
    }
  }

  slideSelectionChange(event: any) {
    // Ionic's ion-range fires ionChange even on programmatic setValue, so
    // ignore those echoes — otherwise scroll-driven page updates would snap
    // scrollTop back to the page start, losing the user's in-page offset.
    if (this.suppressRangeChange) return;
    this.slideTo(event.value - 1, 0);
  }

  slideChanged() {
    // Persist previous slide scroll before switching active element.
    this.persistScroll();

    const currentIndex = this.slidesElement.getActiveIndex();
    if (currentIndex >= this.slides.length) {
      this.goToNextInSeries();
      return;
    }

    // only one page
    if (this.range) {
      this.suppressRangeChange = true;
      this.range.setValue(currentIndex + 1);
      setTimeout(() => (this.suppressRangeChange = false), 0);
      this.story.currentpage = currentIndex;
      this.stories.cache(this.story);
    }

    setTimeout(() => {
      this.bindScroll();
      this.restoreScroll();
    }, 50);
  }

  goToNextInSeries() {
    if (!this.story.series || this.appSettings.allSettings.offlineMode) return;

    this.stories.getSeries(this.story.series).subscribe(data => {
      for (let i = 0; i < data[0].length - 1; i += 1) {
        if (data[0][i].id === this.story.id) {
          this.navCtrl.push('StoryViewPage', {
            story: data[0][i + 1],
            fullscreen: this.inFullscreen,
          });
          this.navCtrl.remove(this.navCtrl.indexOf(this.navCtrl.last()), 1);
          return;
        }
      }

      this.ux.showToast('INFO', 'STORY_ENDOFSERIES', 2000, undefined, undefined, true);
    });
  }

  // ----------------------------------------------------------------------
  // Popovers / other pages
  // ----------------------------------------------------------------------

  showPopover(ev: UIEvent) {
    const wasContinuous = this.settings.continuousMode;
    // The popover binds directly to `settings`, so by the time onDidDismiss
    // fires the mode has already flipped and *ngIf has swapped the DOM. Grab
    // the anchor now while the previous mode's container is still mounted —
    // saved scroll offsets don't translate cleanly between modes (different
    // paddings, page heights), and a sentence-level anchor is far less
    // disorienting for the user.
    const anchor = this.captureAnchor();
    const popover = this.popoverCtrl.create('StoryPopover', {
      settings: this.settings,
    });

    popover.present({
      ev,
    });

    popover.onDidDismiss(() => {
      this.storage.set(STORYSTYLEOPTIONS_KEY, this.settings);

      if (wasContinuous !== this.settings.continuousMode) {
        this.persistScroll();
        this.unbindScroll();
        this.teardownContinuous();
        // Reset measurement cache; pages will remeasure under the new layout.
        this.pageHeights = this.slides.map(() => this.estimatedPageHeight);
        this.materialized = this.slides.map(() => false);
        this.measured = this.slides.map(() => false);
        this.continuousReady = false;

        setTimeout(() => {
          if (this.settings.continuousMode) {
            this.setupContinuous();
            // setupContinuous runs scroll restore passes up to ~600ms; chase
            // it so the anchor wins.
            if (anchor) setTimeout(() => this.restoreAnchor(anchor), 750);
          } else {
            const targetPage = anchor ? anchor.page : this.story.currentpage;
            if (targetPage > 0 && this.slidesElement) this.slideTo(targetPage, 0);
            this.bindScroll();
            if (anchor) {
              setTimeout(() => this.restoreAnchor(anchor), 350);
            } else {
              this.restoreScroll();
            }
          }
        }, 100);
      }
    });
  }

  showInfo(story: Story) {
    this.navCtrl.push('StoryDetailPage', {
      story,
    });
  }

  showSeries(story: Story) {
    this.navCtrl.push('StorySeriesPage', {
      story,
    });
  }

  openListPicker(ev: UIEvent) {
    const popover = this.popoverCtrl.create('BookmarkPopover', {
      story: this.story,
    });

    popover.present({
      ev,
    });
  }

  // ----------------------------------------------------------------------
  // Scroll persistence
  // ----------------------------------------------------------------------

  private getActivePageIndex(): number {
    if (this.settings.continuousMode) {
      return this.lastActivePage;
    }
    try {
      if (this.slidesElement) return this.slidesElement.getActiveIndex();
    } catch (err) {
      // ignore
    }
    return this.story && typeof this.story.currentpage === 'number' ? this.story.currentpage : 0;
  }

  private getScrollKey(page: number): string {
    return `storyscroll:${this.story.id}:${page}`;
  }

  private getScrollElement(): HTMLElement {
    if (!this.rootElement || !this.rootElement.nativeElement) return undefined;

    if (this.settings.continuousMode) {
      // Continuous mode uses the ion-content's own scroll container.
      return this.rootElement.nativeElement.querySelector('.continuous-content .scroll-content');
    }

    // ngx-scrollbar renders a dedicated scroll view element; keep the query tight for perf.
    const activeSlide = this.rootElement.nativeElement.querySelector('ion-slide.swiper-slide-active');
    if (!activeSlide) return undefined;
    return activeSlide.querySelector('.ng-scrollbar-view') || activeSlide.querySelector('.scroll-content');
  }

  // ----------------------------------------------------------------------
  // Anchor capture/restore for mode switches
  // ----------------------------------------------------------------------

  private getContentRootForPage(page: number): HTMLElement | null {
    if (!this.rootElement || !this.rootElement.nativeElement) return null;
    const root = this.rootElement.nativeElement as HTMLElement;
    if (this.settings.continuousMode) {
      const pageEl = root.querySelector(`.continuous-page[data-page="${page}"]`) as HTMLElement | null;
      return pageEl ? (pageEl.querySelector('.continuous-page-content') as HTMLElement) : null;
    }
    // Slides mode: only the active slide actually has its content rendered.
    const active = root.querySelector('ion-slide.swiper-slide-active') as HTMLElement | null;
    if (!active) return null;
    return active.querySelector('#slide-content') as HTMLElement;
  }

  // Walk all text nodes under root and produce (a) a whitespace-normalized
  // string and (b) a per-character map back to the original (textNode, offset).
  // Lets us treat the page as flat text for searching while still rebuilding
  // a precise DOM Range when we want to scroll/highlight.
  private buildNormalizedIndex(root: HTMLElement): { normalized: string; map: Array<{ node: Text; offset: number }> } {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null as any);
    let normalized = '';
    const map: Array<{ node: Text; offset: number }> = [];
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

  private captureAnchor(): { page: number; text: string } | null {
    try {
      const page = this.getActivePageIndex();
      const root = this.getContentRootForPage(page);
      const scrollEl = this.scrollElement || this.getScrollElement();
      if (!root || !scrollEl) return null;

      const { normalized, map } = this.buildNormalizedIndex(root);
      if (!normalized || map.length === 0) return null;

      const containerTop = scrollEl.getBoundingClientRect().top;

      // Binary-search the first character whose rect top is at or below the
      // container's top — that's the first reading position visible to the user.
      const charTop = (idx: number): number => {
        const m = map[idx];
        if (!m) return Number.POSITIVE_INFINITY;
        const len = (m.node.textContent || '').length;
        const end = Math.min(m.offset + 1, len);
        if (end <= m.offset) return Number.POSITIVE_INFINITY;
        const r = document.createRange();
        r.setStart(m.node, m.offset);
        r.setEnd(m.node, end);
        return r.getBoundingClientRect().top;
      };

      let lo = 0;
      let hi = map.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (charTop(mid) >= containerTop - 5) hi = mid;
        else lo = mid + 1;
      }
      let start = Math.max(0, Math.min(lo, map.length - 1));
      // Snap back to a word boundary so the snippet doesn't begin mid-word.
      while (start > 0 && normalized[start - 1] !== ' ') start -= 1;

      // ~100 chars is roughly a sentence — long enough to be unique on a page,
      // short enough not to span huge swathes of layout.
      const text = normalized.substring(start, start + 100).trim();
      if (text.length < 20) return null;
      return { page, text };
    } catch (_e) {
      return null;
    }
  }

  private restoreAnchor(anchor: { page: number; text: string }): void {
    const root = this.getContentRootForPage(anchor.page);
    const scrollEl = this.scrollElement || this.getScrollElement();
    if (!root || !scrollEl) return;

    const { normalized, map } = this.buildNormalizedIndex(root);
    const idx = normalized.indexOf(anchor.text);
    if (idx < 0 || !map[idx]) return;
    const endIdx = Math.min(idx + anchor.text.length, map.length) - 1;
    const startMap = map[idx];
    const endMap = map[endIdx];

    const range = document.createRange();
    try {
      range.setStart(startMap.node, startMap.offset);
      const endLen = (endMap.node.textContent || '').length;
      range.setEnd(endMap.node, Math.min(endMap.offset + 1, endLen));
    } catch (_e) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = scrollEl.getBoundingClientRect();
    // Park the anchor ~80px below the container's top so it's clearly visible
    // and not jammed against the (sometimes immersive) header.
    const target = scrollEl.scrollTop + (rect.top - containerRect.top) - 80;

    this.suppressScrollSave = true;
    scrollEl.scrollTop = Math.max(0, target);
    setTimeout(() => (this.suppressScrollSave = false), 150);

    this.flashAnchor(map, idx, endIdx, root);
  }

  // Wrap each per-text-node slice of the matched range in a <span> that fades
  // out via CSS. surroundContents only works within a single text node, so we
  // group consecutive map entries by node and wrap each group.
  private flashAnchor(
    map: Array<{ node: Text; offset: number }>,
    startIdx: number,
    endIdx: number,
    fallback: HTMLElement,
  ): void {
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
        span.className = 'reader-anchor-flash';
        r.surroundContents(span);
        wraps.push(span);
      } catch (_e) {
        // Non-fatal; we'll just have a partial flash.
      }
      i = j + 1;
    }

    if (wraps.length === 0) {
      fallback.classList.add('reader-anchor-flash');
      setTimeout(() => fallback.classList.remove('reader-anchor-flash'), 2500);
      return;
    }

    setTimeout(() => {
      wraps.forEach(span => {
        const p = span.parentNode;
        if (!p) return;
        while (span.firstChild) p.insertBefore(span.firstChild, span);
        p.removeChild(span);
        if ((p as any).normalize) (p as any).normalize();
      });
    }, 2500);
  }

  private bindScroll() {
    const el = this.getScrollElement();
    if (!el || this.scrollElement === el) return;

    this.unbindScroll();
    this.scrollElement = el;
    this.scrollElement.addEventListener('scroll', this.onScroll as any);
  }

  private unbindScroll() {
    if (this.scrollElement) {
      this.scrollElement.removeEventListener('scroll', this.onScroll as any);
    }
    this.scrollElement = undefined;
    if (this.scrollSaveTimeout) clearTimeout(this.scrollSaveTimeout);
    this.scrollSaveTimeout = undefined;
  }

  private onScroll = () => {
    if (this.settings.continuousMode) this.updateActivePageFromScroll();
    if (this.suppressScrollSave) return;
    if (this.scrollSaveTimeout) return;
    this.scrollSaveTimeout = setTimeout(() => {
      this.scrollSaveTimeout = undefined;
      this.persistScroll();
    }, 200);
  }

  private persistScroll() {
    const el = this.scrollElement || this.getScrollElement();
    if (!el) return;

    if (this.settings.continuousMode) {
      const page = this.getActivePageIndex();
      const offset = Math.max(0, Math.floor((el.scrollTop || 0) - this.getPageStart(page)));
      this.storage.set(this.getScrollKey(page), offset);
      this.story.currentpage = page;
      this.stories.cache(this.story);
      if (this.range) {
        this.suppressRangeChange = true;
        this.range.setValue(page + 1);
        setTimeout(() => (this.suppressRangeChange = false), 0);
      }
      return;
    }

    const page = this.getActivePageIndex();
    const top = Math.max(0, Math.floor(el.scrollTop || 0));
    this.storage.set(this.getScrollKey(page), top);
  }

  private restoreScroll() {
    const page = this.getActivePageIndex();
    const el = this.scrollElement || this.getScrollElement();
    if (!el) return;

    this.storage.get(this.getScrollKey(page)).then((offset: number) => {
      if (typeof offset !== 'number' || isNaN(offset)) return;
      const target = this.settings.continuousMode ? this.getPageStart(page) + offset : offset;
      setTimeout(() => (el.scrollTop = target), 0);
      // extra restore pass for images/font layout changes
      setTimeout(() => (el.scrollTop = target), 250);
    });
  }

  // ----------------------------------------------------------------------
  // Continuous mode
  // ----------------------------------------------------------------------

  private setupContinuous() {
    this.bindScroll();

    // Materialize every page from 0 up to the saved page (plus a window below)
    // so cumulative heights are exact at restore time. Without this, restored
    // scrollTop would land in the wrong page because pages above the saved one
    // would still be using the placeholder estimate.
    const startPage = this.story && typeof this.story.currentpage === 'number' ? this.story.currentpage : 0;
    this.lastActivePage = startPage;
    for (let i = 0; i <= Math.min(startPage + 2, this.slides.length - 1); i += 1) {
      this.materialized[i] = true;
    }

    // Wait for layout, measure, then restore scroll.
    setTimeout(() => {
      this.measureAllRendered();
      this.suppressScrollSave = true;
      this.restoreContinuousScroll(startPage).then(() => {
        // After scroll, additional pages may have been materialized via observer.
        setTimeout(() => {
          this.measureAllRendered();
          this.suppressScrollSave = false;
          this.continuousReady = true;
        }, 200);
      });
      this.observeContinuousPages();
    }, 50);
  }

  private teardownContinuous() {
    if (this.continuousPagesSub) {
      this.continuousPagesSub.unsubscribe();
      this.continuousPagesSub = undefined;
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }
    this.continuousReady = false;
  }

  private observeContinuousPages() {
    const root = this.scrollElement || this.getScrollElement();
    if (!root || !('IntersectionObserver' in window)) return;

    this.intersectionObserver = new IntersectionObserver(
      entries => {
        let needsMeasure = false;
        entries.forEach(entry => {
          if (!(entry as any).isIntersecting && entry.intersectionRatio <= 0) return;
          const idx = parseInt((entry.target as HTMLElement).getAttribute('data-page'), 10);
          if (isNaN(idx)) return;
          if (!this.materialized[idx]) {
            this.zone.run(() => (this.materialized[idx] = true));
            needsMeasure = true;
          } else if (!this.measured[idx]) {
            // Already materialized (e.g. via materializeWindow during scroll)
            // but never measured — pick up its real height now.
            needsMeasure = true;
          }
        });
        if (needsMeasure) setTimeout(() => this.measureAllRendered(), 0);
      },
      { root, rootMargin: '1500px 0px 1500px 0px', threshold: 0 },
    );

    this.continuousPages.forEach(ref => this.intersectionObserver.observe(ref.nativeElement));
    // Mode toggle teardown can null out the observer before this fires; guard
    // against a late changes notification from the unmounting *ngFor.
    this.continuousPagesSub = this.continuousPages.changes.subscribe(() => {
      if (!this.intersectionObserver) return;
      this.continuousPages.forEach(ref => this.intersectionObserver.observe(ref.nativeElement));
    });
  }

  private materializeWindow(centerPage: number, radius: number = 2) {
    const min = Math.max(0, centerPage - radius);
    const max = Math.min(this.slides.length - 1, centerPage + radius);
    for (let i = min; i <= max; i += 1) this.materialized[i] = true;
  }

  private measureAllRendered() {
    if (!this.continuousPages) return;
    const el = this.scrollElement || this.getScrollElement();
    const prevScrollTop = el ? el.scrollTop : 0;
    const activePage = this.lastActivePage;
    const prevPageStart = this.getPageStart(activePage);

    let changed = false;
    this.continuousPages.forEach(ref => {
      const node = ref.nativeElement as HTMLElement;
      const idx = parseInt(node.getAttribute('data-page'), 10);
      if (isNaN(idx)) return;
      // Skip placeholders (would echo back min-height) and pages whose height
      // we've already locked in — measuring once and freezing means later
      // image/font reflow can't trigger compensation that fights the user.
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

    // Compensate scroll position so the user's view doesn't jump when heights
    // above the active page change (e.g. images loading after first render).
    // Pages above the saved page are pre-materialized in setupContinuous, so
    // the only deltas seen here at runtime should be from late content like
    // images/fonts in already-rendered pages.
    if (changed && el && this.continuousReady) {
      const newPageStart = this.getPageStart(activePage);
      const delta = newPageStart - prevPageStart;
      if (Math.abs(delta) > 0.5) {
        this.suppressScrollSave = true;
        el.scrollTop = Math.max(0, prevScrollTop + delta);
        setTimeout(() => (this.suppressScrollSave = false), 50);
      }
    }
  }

  private getPageStart(page: number): number {
    let total = 0;
    for (let i = 0; i < page && i < this.pageHeights.length; i += 1) total += this.pageHeights[i] || 0;
    return total;
  }

  private updateActivePageFromScroll() {
    const el = this.scrollElement;
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
      // Expand materialization window around new active page.
      this.materializeWindow(page, 2);
      this.zone.run(() => {
        if (this.range) {
          this.suppressRangeChange = true;
          this.range.setValue(page + 1);
          setTimeout(() => (this.suppressRangeChange = false), 0);
        }
        this.story.currentpage = page;
      });
    }
  }

  private scrollToPage(page: number, speed: number = 300) {
    const el = this.scrollElement || this.getScrollElement();
    if (!el) return;
    const clamped = Math.max(0, Math.min(this.slides.length - 1, page));
    this.materializeWindow(clamped, 2);

    // Allow new placeholders to lay out before scrolling so the target offset is correct.
    setTimeout(() => {
      this.measureAllRendered();
      const target = this.getPageStart(clamped);
      this.lastActivePage = clamped;
      this.story.currentpage = clamped;
      if (speed > 0 && (el as any).scrollTo) {
        (el as any).scrollTo({ top: target, behavior: 'smooth' });
      } else {
        el.scrollTop = target;
      }
    }, 0);
  }

  private restoreContinuousScroll(page: number): Promise<void> {
    return new Promise(resolve => {
      const el = this.scrollElement || this.getScrollElement();
      if (!el) {
        resolve();
        return;
      }
      this.storage.get(this.getScrollKey(page)).then((offset: number) => {
        const off = typeof offset === 'number' && !isNaN(offset) ? offset : 0;
        const apply = () => {
          this.measureAllRendered();
          el.scrollTop = this.getPageStart(page) + off;
        };
        // Apply repeatedly to absorb async layout shifts (fonts swap, images
        // resolve their dimensions). Each pass remeasures and re-anchors using
        // the latest pageHeights so the user lands on the exact saved offset.
        setTimeout(apply, 0);
        setTimeout(apply, 100);
        setTimeout(apply, 300);
        setTimeout(() => {
          apply();
          resolve();
        }, 600);
      });
    });
  }
}
