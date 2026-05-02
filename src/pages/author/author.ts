import { Component, SecurityContext, ViewChild } from '@angular/core';
import { IonicPage, NavController, NavParams, PopoverController } from 'ionic-angular';
import { SocialSharing } from '@ionic-native/social-sharing';
import { TranslateService } from '@ngx-translate/core';
import { BrowserTab } from '@ionic-native/browser-tab';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { Authors, Stories, User, Settings, Filters, UX } from '../../providers/providers';
import { Author } from '../../models/author';
import { Story } from '../../models/story';
import { summarizeSeries, SeriesSummary } from '../../providers/series';
import { handleNoCordovaError, getAuthorPageUrl } from '../../app/utils';

// One row in the submissions list — either a standalone story or a series
// group containing multiple chapters. Series groups are collapsed by default
// and expand on tap, mirroring the History page's Series tab.
interface SubmissionRow {
  kind: 'story' | 'series';
  id: string; // story id for kind=story, seriesId for kind=series
  story?: Story;
  series?: SeriesSummary;
  chapters?: Story[]; // chapters of the series, ordered ascending by id
  expanded?: boolean;
}

@IonicPage({ priority: 'low' })
@Component({
  selector: 'page-author',
  templateUrl: 'author.html',
})
export class AuthorPage {
  @ViewChild('biotext') biotext;
  author: Author;
  showArrow = false;
  showBio = false;
  loaded = false;
  openSegment = '';
  currentSubmissionsPage = 1;
  currentFavsPage = 1;
  missingStoryCount = 0;
  translations;
  submissionRows: SubmissionRow[] = [];
  // How many chapters to show inline before the user has to expand the card.
  SERIES_PREVIEW_COUNT = 3;
  // Client-side sort for the submissions tab. The 1/user-submissions endpoint
  // ignores any sort param server-side (returns alphabetical), so we sort
  // whatever's been loaded so far. 'default' = alphabetical (API order).
  submissionsSort: 'default' | 'newest' | 'oldest' | 'views' | 'rating' = 'default';

  constructor(
    private socialSharing: SocialSharing,
    public navCtrl: NavController,
    public navParams: NavParams,
    public translate: TranslateService,
    public s: Stories,
    public a: Authors,
    public user: User,
    private browser: BrowserTab,
    public settings: Settings,
    public filters: Filters,
    public ux: UX,
    private popoverCtrl: PopoverController,
    private sanitizer: DomSanitizer,
  ) {
    const author = navParams.get('author');

    translate.get(['COPYPROMPT_MSG', 'AUTHOR_MISSING_STORIES']).subscribe(values => {
      this.translations = values;
    });

    if (!author || author.id == null) {
      this.loaded = true;
      return;
    }

    this.a.getDetails(author.id).subscribe(author => {
      this.author = author;
      this.loaded = true;
    });
  }

  ionViewDidEnter() {
    const loop = setInterval(() => {
      if (this.loaded) {
        if (this.biotext && this.biotext.nativeElement) {
          this.showArrow = this.biotext.nativeElement.scrollHeight > this.biotext.nativeElement.clientHeight;
        }
        clearInterval(loop);
      }
    }, 50);
  }

  loadSubmissions() {
    if (!this.author.stories) {
      this.s.getAuthorStories(this.author.id).subscribe(data => {
        this.author.stories = data[0];
        this.missingStoryCount = this.author.storycount - data[1];
        this.rebuildSubmissionRows();
      });
    } else {
      this.rebuildSubmissionRows();
    }
  }

  loadFavs() {
    if (!this.author.favs) {
      this.s.getAuthorFavs(this.author.id).subscribe(favs => {
        this.author.favs = favs[0];
      });
    }
  }

  loadMoreSubmissions(event) {
    if (!this.author.storycount || this.author.storycount < 11) event.enable(false);
    this.currentSubmissionsPage += 1;
    this.s.getAuthorStories(this.author.id, this.currentSubmissionsPage).subscribe(data => {
      if (!data[0].length) {
        event.enable(false);
        return;
      }
      data[0].forEach(s => this.author.stories.push(s));
      this.rebuildSubmissionRows();
      event.complete();
    });
  }

  // Group submissions by series. Stories with series>0 fold into a single
  // SubmissionRow per series; standalones stay one-to-one. The order within
  // the returned rows is driven by submissionsSort (applied client-side; the
  // upstream endpoint ignores its sort param).
  rebuildSubmissionRows() {
    const stories = this.author && this.author.stories;
    if (!stories || !stories.length) {
      this.submissionRows = [];
      return;
    }

    const prevExpanded = new Set(
      this.submissionRows.filter(r => r.kind === 'series' && r.expanded).map(r => r.id),
    );
    const seriesMap = new Map<string, Story[]>();
    const rows: SubmissionRow[] = [];

    stories.forEach(story => {
      const seriesId = story.series && Number(story.series) > 0 ? String(story.series) : '';
      if (!seriesId) {
        rows.push({ kind: 'story', id: String(story.id), story });
        return;
      }
      const existing = seriesMap.get(seriesId);
      if (existing) {
        existing.push(story);
      } else {
        const chapters: Story[] = [story];
        seriesMap.set(seriesId, chapters);
        rows.push({
          kind: 'series',
          id: seriesId,
          chapters,
          expanded: prevExpanded.has(seriesId),
        });
      }
    });

    // Materialize series rows: sort chapters ascending and compute summary.
    rows.forEach(row => {
      if (row.kind !== 'series') return;
      row.chapters = (row.chapters || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
      row.series = summarizeSeries(row.id, row.chapters);
    });

    this.submissionRows = this.applyRowSort(rows);
  }

  // Sort the row list per submissionsSort. Series rows are scored by their
  // representative chapter (latest by id) so they sit naturally among
  // standalones — e.g. a series whose latest part is recent shows up under
  // "newest" alongside recent standalones.
  private applyRowSort(rows: SubmissionRow[]): SubmissionRow[] {
    if (this.submissionsSort === 'default') return rows;

    const score = (row: SubmissionRow): { ts: number; views: number; rate: number } => {
      let target: Story | undefined;
      if (row.kind === 'story') {
        target = row.story;
      } else {
        const chapters = row.chapters || [];
        target = chapters.slice().sort((a, b) => Number(b.id) - Number(a.id))[0];
      }
      return {
        ts: Number(target && target.timestamp) || 0,
        views: Number(target && target.viewcount) || 0,
        rate: Number(target && target.rating) || 0,
      };
    };

    return rows.slice().sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      switch (this.submissionsSort) {
        case 'newest': return sb.ts - sa.ts;
        case 'oldest': return sa.ts - sb.ts;
        case 'views':  return sb.views - sa.views;
        case 'rating': return sb.rate - sa.rate;
        default:       return 0;
      }
    });
  }

  onSortChange() {
    this.rebuildSubmissionRows();
  }

  openSortPopover(ev: UIEvent) {
    const popover = this.popoverCtrl.create('AuthorSortPopover', {
      sortMethod: this.submissionsSort,
    });
    popover.present({ ev });
    popover.onDidDismiss(method => {
      if (method) {
        this.submissionsSort = method;
        this.rebuildSubmissionRows();
      }
    });
  }

  sortLabelKey(): string {
    switch (this.submissionsSort) {
      case 'newest': return 'AUTHOR_SORT_NEWEST';
      case 'oldest': return 'AUTHOR_SORT_OLDEST';
      case 'views':  return 'AUTHOR_SORT_VIEWS';
      case 'rating': return 'AUTHOR_SORT_RATING';
      default:       return 'AUTHOR_SORT_DEFAULT';
    }
  }

  // True when the user has more pages worth of submissions to load — the
  // current sort is then "incomplete" and we surface a hint in the UI.
  hasUnloadedSubmissions(): boolean {
    if (!this.author || !this.author.storycount || !this.author.stories) return false;
    return this.author.stories.length < this.author.storycount;
  }

  toggleSeriesRow(row: SubmissionRow) {
    if (row.kind !== 'series') return;
    row.expanded = !row.expanded;
  }

  openSubmissionStory(story: Story) {
    this.navCtrl.push('StoryDetailPage', { story });
  }

  openSeriesPage(row: SubmissionRow) {
    if (row.kind !== 'series') return;
    this.navCtrl.push('StorySeriesPage', { seriesId: row.id });
  }

  toggleBio() {
    this.showBio = !this.showBio;
  }

  // Don't expand/collapse when the user is tapping a link inside the bio.
  onBioClick(ev: any) {
    if (ev && ev.target && ev.target.tagName === 'A') return;
    this.toggleBio();
  }

  // The API returns biography as plain text with bare URLs and `\n` line
  // breaks (no HTML, no markdown). Mirror what the website does server-side:
  // escape HTML, auto-link http(s) URLs, and let CSS preserve newlines via
  // white-space: pre-wrap. We run the result through Angular's HTML sanitizer
  // (rather than bypassing it) so any vector smuggled into a URL — vbscript:,
  // data:text/html, etc. — gets stripped before [innerHTML] receives it.
  bioHtml(): SafeHtml {
    const raw = (this.author && this.author.bio) || '';
    if (!raw) return '';
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    // Linkify http(s)://… up to the next whitespace or common trailing punct.
    const linked = escaped.replace(
      /(https?:\/\/[^\s<>"]+[^\s<>"\.,;:!\?\)\]])/g,
      url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`,
    );
    return this.sanitizer.sanitize(SecurityContext.HTML, linked) || '';
  }

  loadMoreFavs(event) {
    this.currentFavsPage += 1;
    this.s.getAuthorFavs(this.author.id, this.currentFavsPage).subscribe(data => {
      if (!data[0].length) {
        event.enable(false);
        return;
      }
      data[0].forEach(s => this.author.favs.push(s));
      event.complete();
    });
  }

  isBlocked(): boolean {
    return !!this.author && this.filters.isAuthorBlocked(this.author.id);
  }

  toggleBlock() {
    if (!this.author) return;
    if (this.isBlocked()) {
      this.filters.removeBlockedAuthor(this.author.id);
      this.ux.showToast('INFO', 'AUTHOR_UNBLOCKED');
    } else {
      this.filters.addBlockedAuthor(this.author.id, this.author.name || '');
      this.ux.showToast('INFO', 'AUTHOR_BLOCKED');
    }
  }

  followToggle() {
    if (this.author.following) {
      this.a.unfollow(this.author);
    } else {
      this.a.follow(this.author);
    }
  }

  share() {
    const url = getAuthorPageUrl(this.author);
    this.socialSharing.share(null, null, null, url).catch(err =>
      handleNoCordovaError(err, () => {
        prompt(this.translations.COPYPROMPT_MSG, url);
      }),
    );
  }

  openLink() {
    const url = getAuthorPageUrl(this.author);
    this.browser.openUrl(url).catch(err => handleNoCordovaError(err, () => window.open(url)));
  }

  openFollowers() {
    if (!this.author || !this.author.followersCount) return;
    this.navCtrl.push('UserListPage', { username: this.author.name, kind: 'followers' });
  }

  openFollowing() {
    if (!this.author || !this.author.followingsCount) return;
    this.navCtrl.push('UserListPage', { username: this.author.name, kind: 'following' });
  }
}
