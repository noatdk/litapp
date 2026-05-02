import { Component, ViewChild, ViewChildren, QueryList, ElementRef, HostListener, NgZone } from '@angular/core';
import { IonicPage, Slides, NavController, NavParams, Platform, PopoverController } from 'ionic-angular';

import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';
import { AndroidFullScreen } from '@ionic-native/android-full-screen';

import { STORYSTYLEOPTIONS_KEY } from '../../providers/db';
import { Stories, Analytics, Settings, History, User, UX } from '../../providers/providers';
import { Story } from '../../models/story';
import { buildNormalizedIndex, wrapRange } from './text-index';
import { StorySearchController } from './search-controller';
import { ContinuousScrollController } from './continuous-scroll-controller';

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
  private suppressScrollSave = false;
  private suppressRangeChange = false;

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

  // --------------------------------------------------------------------------
  // In-story search — fields stay on page; template bindings unchanged.
  // StorySearchController writes these directly via the SearchState reference.
  // --------------------------------------------------------------------------

  searchOpen = false;
  searchQuery = '';
  searchMatches: { page: number; occurrence: number }[] = [];
  currentMatchIdx = -1;

  private readonly search: StorySearchController;

  // --------------------------------------------------------------------------
  // Continuous scroll
  // --------------------------------------------------------------------------

  private readonly continuousCtrl: ContinuousScrollController;

  // Expose arrays to template (was direct fields, now delegating to controller)
  get pageHeights() {
    return this.continuousCtrl.pageHeights;
  }
  get materialized() {
    return this.continuousCtrl.materialized;
  }
  get estimatedPageHeight() {
    return this.continuousCtrl.estimatedPageHeight;
  }
  get lastActivePage() {
    return this.continuousCtrl.lastActivePage;
  }

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
    readonly zone: NgZone,
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

    // StoryViewPage itself satisfies SearchState (has the four fields) and
    // provides the SearchHost callbacks via the anonymous object below.
    this.search = new StorySearchController(this, {
      getActivePageIndex: () => this.getActivePageIndex(),
      getContentRootForPage: p => this.getContentRootForPage(p),
      getScrollElement: () => this.scrollElement || this.getScrollElement(),
      getPageContent: () => (this.story && this.story.content) || [],
      isContinuousMode: () => this.settings.continuousMode,
      scrollToPage: (p, speed) => this.continuousCtrl.scrollToPage(p, speed, this.continuousPages),
      slideTo: (p, speed) => this.slideTo(p, speed),
      setSuppressScrollSave: v => {
        this.suppressScrollSave = v;
      },
    });

    this.continuousCtrl = new ContinuousScrollController({
      getPageCount: () => this.slides.length,
      getScrollElement: () => this.getScrollElement(),
      persistScroll: () => this.persistScroll(),
      setSuppressScrollSave: v => {
        this.suppressScrollSave = v;
      },
      onActivePageChanged: p => this.onContinuousPageChanged(p),
      onMaterialized: () => {
        if (this.searchOpen) this.search.rehighlight();
      },
      zone: this.zone,
      storage: this.storage,
      getScrollKey: p => this.getScrollKey(p),
    });

    // get story from server
    if (!this.story.cached) {
      this.stories.getById(this.story.id).subscribe(story => {
        if (!story) {
          this.navCtrl.pop();
          return;
        }

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
      const parsedContent = item.replace('<img src=', `<img alt='&nbsp;${this.translations.STORYVIEW_ERROR_IMAGE}' src=`);
      this.slides.push({
        content: parsedContent,
        page: index,
        desktoppage: index,
      });
    });
    this.continuousCtrl.init(this.slides.length);
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
    this.search.clearHighlights();
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

  slideTo(newPage: number, speed?: number) {
    if (this.settings.continuousMode) {
      this.continuousCtrl.scrollToPage(newPage, typeof speed === 'number' ? speed : 300, this.continuousPages);
      return;
    }
    if (this.alternatePagination) this.slidesElement.lockSwipes(false);
    this.slidesElement.slideTo(newPage, speed);
    if (this.alternatePagination) this.slidesElement.lockSwipes(true);
  }

  nextSlide(event?: MouseEvent) {
    if (event) event.stopPropagation();

    const active = this.getActivePageIndex();
    if (active >= this.slides.length - 1) {
      this.goToNextInSeries();
      return;
    }

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
      this.prevSlide();
    } else if (event.clientX > (3 * this.platform.width()) / 4) {
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
    // Ionic's ion-range fires ionChange even on programmatic setValue; ignore those echoes.
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

    if (this.range) {
      this.setRangeValue(currentIndex + 1);
      this.story.currentpage = currentIndex;
      this.stories.cache(this.story);
    }

    setTimeout(() => {
      this.bindScroll();
      if (this.searchOpen) {
        // restoreScroll's late re-apply pass would override the search scroll target.
        // Let the search drive position.
        this.search.rehighlight();
        this.search.scrollCurrentIntoView(this.scrollElement || this.getScrollElement());
      } else {
        this.restoreScroll();
      }
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
    // Capture before *ngIf swaps the DOM so the sentence anchor survives the mode switch.
    const anchor = this.captureAnchor();
    const popover = this.popoverCtrl.create('StoryPopover', {
      settings: this.settings,
    });

    popover.present({ ev });

    popover.onDidDismiss(() => {
      this.storage.set(STORYSTYLEOPTIONS_KEY, this.settings);

      if (wasContinuous !== this.settings.continuousMode) {
        this.persistScroll();
        this.unbindScroll();
        this.teardownContinuous();
        this.continuousCtrl.reset();

        setTimeout(() => {
          if (this.settings.continuousMode) {
            this.setupContinuous();
            // setupContinuous runs restore passes up to ~600ms; chase it so the anchor wins.
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
    this.navCtrl.push('StoryDetailPage', { story });
  }

  showSeries(story: Story) {
    this.navCtrl.push('StorySeriesPage', { story });
  }

  openListPicker(ev: UIEvent) {
    const popover = this.popoverCtrl.create('BookmarkPopover', { story: this.story });
    popover.present({ ev });
  }

  // ----------------------------------------------------------------------
  // In-story search — thin delegates to StorySearchController
  // ----------------------------------------------------------------------

  toggleSearch() {
    if (this.searchOpen) {
      this.search.closeSearch();
    } else {
      if (this.inFullscreen) this.toggleImmersive();
      this.search.toggleSearch(this.rootElement);
    }
  }

  closeSearch() {
    this.search.closeSearch();
  }

  onSearchInput() {
    this.search.onSearchInput();
  }

  nextMatch() {
    this.search.nextMatch();
  }

  prevMatch() {
    this.search.prevMatch();
  }

  // ----------------------------------------------------------------------
  // Continuous scroll — setup / teardown wired to controller
  // ----------------------------------------------------------------------

  private setupContinuous() {
    this.bindScroll();
    const startPage = this.story && typeof this.story.currentpage === 'number' ? this.story.currentpage : 0;
    this.continuousCtrl.setup(startPage, this.continuousPages);
  }

  private teardownContinuous() {
    this.continuousCtrl.teardown();
  }

  /** Callback from ContinuousScrollController when the active page changes. */
  private onContinuousPageChanged(p: number) {
    this.story.currentpage = p;
    if (this.range) this.setRangeValue(p + 1);
  }

  private setRangeValue(value: number) {
    if (!this.range) return;
    this.suppressRangeChange = true;
    this.range.setValue(value);
    setTimeout(() => (this.suppressRangeChange = false), 0);
  }

  // ----------------------------------------------------------------------
  // Scroll persistence (slides-mode only; continuous handled by controller)
  // ----------------------------------------------------------------------

  private getActivePageIndex(): number {
    if (this.settings.continuousMode) {
      return this.continuousCtrl.lastActivePage;
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

  private getScrollElement(): HTMLElement | undefined {
    if (!this.rootElement || !this.rootElement.nativeElement) return undefined;

    if (this.settings.continuousMode) {
      return this.rootElement.nativeElement.querySelector('.continuous-content .scroll-content') || undefined;
    }

    // ngx-scrollbar renders a dedicated scroll view element.
    const activeSlide = this.rootElement.nativeElement.querySelector('ion-slide.swiper-slide-active');
    if (!activeSlide) return undefined;
    return activeSlide.querySelector('.ng-scrollbar-view') || activeSlide.querySelector('.scroll-content') || undefined;
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
    if (this.settings.continuousMode) {
      this.continuousCtrl.onScroll(this.continuousPages);
    }
    if (this.suppressScrollSave) return;
    if (this.scrollSaveTimeout) return;
    this.scrollSaveTimeout = setTimeout(() => {
      this.scrollSaveTimeout = undefined;
      this.persistScroll();
    }, 200);
  };

  private persistScroll() {
    const el = this.scrollElement || this.getScrollElement();
    if (!el) return;

    if (this.settings.continuousMode) {
      const { page, offset } = this.continuousCtrl.getContinuousScrollOffset(el);
      this.storage.set(this.getScrollKey(page), offset);
      this.story.currentpage = page;
      this.stories.cache(this.story);
      this.setRangeValue(page + 1);
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
      const target = this.settings.continuousMode ? this.continuousCtrl.getPageStart(page) + offset : offset;
      setTimeout(() => (el.scrollTop = target), 0);
      // Extra restore pass for images/font layout changes.
      setTimeout(() => (el.scrollTop = target), 250);
    });
  }

  // ----------------------------------------------------------------------
  // Anchor capture / restore for mode switches (concerns E)
  // Uses buildNormalizedIndex / wrapRange from text-index.ts
  // ----------------------------------------------------------------------

  private getContentRootForPage(page: number): HTMLElement | null {
    if (!this.rootElement || !this.rootElement.nativeElement) return null;
    const root = this.rootElement.nativeElement as HTMLElement;
    if (this.settings.continuousMode) {
      const pageEl = root.querySelector(`.continuous-page[data-page="${page}"]`) as HTMLElement | null;
      return pageEl ? (pageEl.querySelector('.continuous-page-content') as HTMLElement) : null;
    }
    const active = root.querySelector('ion-slide.swiper-slide-active') as HTMLElement | null;
    if (!active) return null;
    return active.querySelector('#slide-content') as HTMLElement;
  }

  private captureAnchor(): { page: number; text: string } | null {
    try {
      const page = this.getActivePageIndex();
      const root = this.getContentRootForPage(page);
      const scrollEl = this.scrollElement || this.getScrollElement();
      if (!root || !scrollEl) return null;

      const { normalized, map } = buildNormalizedIndex(root);
      if (!normalized || map.length === 0) return null;

      const containerTop = scrollEl.getBoundingClientRect().top;

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
      // Snap back to word boundary so the snippet doesn't start mid-word.
      while (start > 0 && normalized[start - 1] !== ' ') start -= 1;

      const text = normalized.substring(start, start + 100).trim();
      if (text.length < 20) return null;
      return { page, text };
    } catch (e) {
      return null;
    }
  }

  private restoreAnchor(anchor: { page: number; text: string }): void {
    const root = this.getContentRootForPage(anchor.page);
    const scrollEl = this.scrollElement || this.getScrollElement();
    if (!root || !scrollEl) return;

    const { normalized, map } = buildNormalizedIndex(root);
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
    } catch (e) {
      return;
    }

    const rect = range.getBoundingClientRect();
    const containerRect = scrollEl.getBoundingClientRect();
    // Park the anchor ~80px below the container top so it's clearly visible.
    const target = scrollEl.scrollTop + (rect.top - containerRect.top) - 80;

    this.suppressScrollSave = true;
    scrollEl.scrollTop = Math.max(0, target);
    setTimeout(() => (this.suppressScrollSave = false), 150);

    this.flashAnchor(map, idx, endIdx, root);
  }

  // Briefly highlight the restored anchor with fading spans.
  private flashAnchor(map: { node: Text; offset: number }[], startIdx: number, endIdx: number, fallback: HTMLElement): void {
    const wraps = wrapRange(map, startIdx, endIdx, 'reader-anchor-flash');

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
}
