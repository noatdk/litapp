import { Component } from '@angular/core';
import { IonicPage, NavController, PopoverController } from 'ionic-angular';

import { Memos, Stories, Authors, Series, History, Settings } from '../../providers/providers';
import { summarizeSeries } from '../../providers/series';
import { Story } from '../../models/story';
import { SearchResultType } from '../../providers/stories';

type MemoKind = 'story' | 'author' | 'series';
type Segment = MemoKind | 'all';
type SortMode = 'updated' | 'created' | 'title';

interface MemoEntry {
  kind: MemoKind;
  id: string;
  memo: string;
  createdAt: number;
  updatedAt: number;
  edited: boolean; // updatedAt meaningfully differs from createdAt
  title: string;
  subtitle?: string;
  // Whether the local caches resolved a real title for the host. When false,
  // we fall back to "{Kind} #{id}" so the row still renders.
  resolved: boolean;
  // Stash the cached Story so taps can route without a network roundtrip.
  story?: Story;
  // Lowercased haystack used by the search filter.
  searchBlob: string;
}

// Local-only listing of all memos the user has saved on this device, grouped by
// host kind (story / author / series) plus an "All" view. Memos themselves
// carry only the host id, free-form text and create/update timestamps — host
// display data is rehydrated from in-memory caches (Stories, Authors,
// Series.chapters) plus the recent-authors snapshot.
@IonicPage({ priority: 'high', segment: 'memos' })
@Component({
  selector: 'page-memos',
  templateUrl: 'memos.html',
})
export class MemosPage {
  storyMemos: MemoEntry[] = [];
  authorMemos: MemoEntry[] = [];
  seriesMemos: MemoEntry[] = [];
  openSegment: Segment = 'all';
  searchTerm: string = '';
  sortMode: SortMode = 'updated';

  // ms threshold under which createdAt and updatedAt are treated as the same
  // event (covers clock skew and the back-to-back save the user does after
  // typing the original memo).
  private static EDIT_EPSILON_MS = 2000;

  // Tracks ids we've already fired a hydration request for this view, so we
  // don't spam the API on every rebuild() (rebuild runs after each popover
  // dismiss to refresh edit timestamps).
  private hydratedSeries = new Set<string>();
  private hydratedAuthors = new Set<string>();
  private hydratedStories = new Set<string>();

  constructor(
    public navCtrl: NavController,
    public memos: Memos,
    public stories: Stories,
    public authors: Authors,
    public seriesProvider: Series,
    public history: History,
    public settings: Settings,
    private popoverCtrl: PopoverController,
  ) {}

  ionViewWillEnter() {
    Promise.all([this.memos.onReady(), this.stories.onReady(), this.seriesProvider.onReady(), this.settings.load()]).then(() => {
      this.rebuild();
      if (!this.settings.allSettings.offlineMode) this.hydrateMissing();
    });
  }

  private rebuild() {
    this.storyMemos = this.memos.listStoryIds().map(id => this.buildStoryEntry(id));
    this.authorMemos = this.memos.listAuthorIds().map(id => this.buildAuthorEntry(id));
    this.seriesMemos = this.memos.listSeriesIds().map(id => this.buildSeriesEntry(id));
  }

  // Fire-and-forget API fetches for any host whose local cache is cold. The
  // chapters/stories/authors providers stash results in their own caches, so
  // peek*/getChapters return populated data on the next rebuild(). Each id is
  // fetched at most once per page entry; failures are silent (the row stays
  // on its "{Kind} #{id}" fallback rather than blocking the list).
  private hydrateMissing() {
    this.seriesMemos
      .filter(e => !e.resolved && !this.hydratedSeries.has(e.id))
      .forEach(e => {
        this.hydratedSeries.add(e.id);
        this.stories.getSeries(parseInt(e.id, 10)).subscribe(
          (res: SearchResultType) => {
            if (!res || !res[0] || !res[0].length) return;
            const chapters = res[0];
            const sidNum = parseInt(e.id, 10);
            chapters.forEach(c => {
              if (c.series == null) c.series = sidNum;
            });
            this.seriesProvider.chapters[e.id] = chapters;
            this.seriesMemos = this.seriesMemos.map(m => (m.kind === 'series' && m.id === e.id ? this.buildSeriesEntry(e.id) : m));
          },
          () => {},
        );
      });

    this.storyMemos
      .filter(e => !e.resolved && !this.hydratedStories.has(e.id))
      .forEach(e => {
        this.hydratedStories.add(e.id);
        this.stories.getRichById(e.id).subscribe(
          () => {
            this.storyMemos = this.storyMemos.map(m => (m.kind === 'story' && m.id === e.id ? this.buildStoryEntry(e.id) : m));
          },
          () => {},
        );
      });

    this.authorMemos
      .filter(e => !e.resolved && !this.hydratedAuthors.has(e.id))
      .forEach(e => {
        this.hydratedAuthors.add(e.id);
        this.authors.getDetails(e.id).subscribe(
          () => {
            this.authorMemos = this.authorMemos.map(m => (m.kind === 'author' && m.id === e.id ? this.buildAuthorEntry(e.id) : m));
          },
          () => {},
        );
      });
  }

  private commonFields(kind: MemoKind, id: string): { memo: string; createdAt: number; updatedAt: number; edited: boolean } {
    const entry = this.memos.getEntry(kind, id);
    const memo = entry ? entry.text : '';
    const createdAt = entry ? entry.createdAt : 0;
    const updatedAt = entry ? entry.updatedAt : 0;
    const edited = updatedAt - createdAt > MemosPage.EDIT_EPSILON_MS;
    return { memo, createdAt, updatedAt, edited };
  }

  private buildStoryEntry(id: string): MemoEntry {
    const base = this.commonFields('story', id);
    const story = this.stories.peekById(id);
    let title: string;
    let subtitle: string | undefined;
    let resolved = false;
    if (story) {
      const author = story.author && (story.author.name || (story.author as any).username);
      title = story.title || `Story #${id}`;
      subtitle = author ? `by ${author}` : undefined;
      resolved = !!story.title;
    } else {
      title = `Story #${id}`;
    }
    return {
      id,
      title,
      subtitle,
      resolved,
      story,
      ...base,
      kind: 'story',
      searchBlob: `${title}\n${subtitle || ''}\n${base.memo}`.toLowerCase(),
    };
  }

  private buildAuthorEntry(id: string): MemoEntry {
    const base = this.commonFields('author', id);
    const cached = this.authors.peek(id);
    let title: string;
    let subtitle: string | undefined;
    let resolved = false;
    if (cached && cached.name) {
      title = cached.name;
      subtitle = cached.usertitle || undefined;
      resolved = true;
    } else {
      const recent = this.history.getRecentAuthors().find(a => String(a.id) === id);
      if (recent && recent.name) {
        title = recent.name;
        subtitle = recent.usertitle || undefined;
        resolved = true;
      } else {
        title = `Author #${id}`;
      }
    }
    return {
      id,
      title,
      subtitle,
      resolved,
      ...base,
      kind: 'author',
      searchBlob: `${title}\n${subtitle || ''}\n${base.memo}`.toLowerCase(),
    };
  }

  private buildSeriesEntry(id: string): MemoEntry {
    const base = this.commonFields('series', id);
    const chapters = this.seriesProvider.chapters && this.seriesProvider.chapters[id];
    let title: string;
    let subtitle: string | undefined;
    let resolved = false;
    if (chapters && chapters.length) {
      const summary = summarizeSeries(id, chapters);
      title = summary.title || `Series #${id}`;
      subtitle = summary.authorName ? `by ${summary.authorName}` : undefined;
      resolved = !!summary.title;
    } else {
      title = `Series #${id}`;
    }
    return {
      id,
      title,
      subtitle,
      resolved,
      ...base,
      kind: 'series',
      searchBlob: `${title}\n${subtitle || ''}\n${base.memo}`.toLowerCase(),
    };
  }

  open(entry: MemoEntry) {
    if (entry.kind === 'story') {
      this.navCtrl.push('StoryDetailPage', {
        story: entry.story,
        id: entry.id,
      });
      return;
    }
    if (entry.kind === 'author') {
      const cached = this.authors.peek(entry.id);
      const author = cached || { id: entry.id, name: entry.resolved ? entry.title : undefined };
      this.navCtrl.push('AuthorPage', { author, id: entry.id });
      return;
    }
    if (entry.kind === 'series') {
      this.navCtrl.push('StorySeriesPage', { seriesId: entry.id });
    }
  }

  edit(entry: MemoEntry, ev: Event) {
    if (ev) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    const popover = this.popoverCtrl.create('MemoPopover', { kind: entry.kind, id: entry.id }, { cssClass: 'memo-popover' });
    popover.present();
    popover.onDidDismiss(() => this.rebuild());
  }

  iconFor(kind: MemoKind): string {
    if (kind === 'series') return 'albums';
    if (kind === 'author') return 'person';
    return 'paper';
  }

  kindLabelKey(kind: MemoKind): string {
    if (kind === 'series') return 'MEMOS_KIND_SERIES';
    if (kind === 'author') return 'MEMOS_KIND_AUTHOR';
    return 'MEMOS_KIND_STORY';
  }

  get visibleEntries(): MemoEntry[] {
    let pool: MemoEntry[];
    switch (this.openSegment) {
      case 'story':
        pool = this.storyMemos;
        break;
      case 'author':
        pool = this.authorMemos;
        break;
      case 'series':
        pool = this.seriesMemos;
        break;
      default:
        pool = [...this.storyMemos, ...this.authorMemos, ...this.seriesMemos];
    }

    const term = this.searchTerm.trim().toLowerCase();
    if (term) pool = pool.filter(e => e.searchBlob.indexOf(term) > -1);

    const sorted = pool.slice();
    if (this.sortMode === 'created') {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else if (this.sortMode === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return sorted;
  }

  segmentCount(kind: Segment): number {
    if (kind === 'story') return this.storyMemos.length;
    if (kind === 'author') return this.authorMemos.length;
    if (kind === 'series') return this.seriesMemos.length;
    return this.totalCount;
  }

  get totalCount(): number {
    return this.storyMemos.length + this.authorMemos.length + this.seriesMemos.length;
  }

  clearSearch() {
    this.searchTerm = '';
  }
}
