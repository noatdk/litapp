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
import { FACT_DEFS } from '../../data/literotica-constants';

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
  avatarFailed = false;
  refreshing = false;
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

    // Pass `author.name` as a hint so getDetails routes the cold-cache fetch
    // to the rich `/3/users/{name}` endpoint. Without the hint, navigating in
    // from story-detail (where the cache hasn't seen this author yet) falls
    // back to the lesser `/3/authors/{id}` shape and the new fields go missing.
    this.a.getDetails(author.id, false, author.name).subscribe(a => {
      this.author = a;
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

  // Force-refetch this author's profile, bypassing the provider's in-memory
  // cache. Used by the toolbar refresh button so the user can pull fresh data
  // after the upstream API or local model has changed.
  refresh() {
    if (!this.author || this.author.id == null || this.refreshing) return;
    this.refreshing = true;
    this.avatarFailed = false;
    this.a.getDetails(this.author.id, true, this.author.name).subscribe(
      (a: Author) => {
        this.refreshing = false;
        if (a) this.author = a;
      },
      () => { this.refreshing = false; },
    );
  }

  avatarLetter(): string {
    const name = (this.author && this.author.name) || '';
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  // True iff the author has at least one non-default per-type submission count.
  // Hides the breakdown row entirely for legacy /3/authors/{id} responses
  // (which never populate these fields).
  hasBreakdown(): boolean {
    const a = this.author as any;
    if (!a) return false;
    return !!(a.storiesCount || a.poemsCount || a.audiosCount || a.illustrationsCount || a.sgsCount || a.seriesCount);
  }

  // True iff the Links card has anything to render.
  hasLinks(): boolean {
    const a = this.author as any;
    if (!a) return false;
    if (a.supportMeLink || a.homepage) return true;
    return this.socialEntries().length > 0;
  }

  // Social-handle base URLs + display labels + ionicon names. Order here is
  // the order chips render in the Links card.
  private static SOCIAL_META: { [k: string]: { base: string; label: string; icon: string } } = {
    x:          { base: 'https://x.com/',           label: 'X / Twitter',  icon: 'logo-twitter' },
    facebook:   { base: 'https://facebook.com/',    label: 'Facebook',     icon: 'logo-facebook' },
    instagram:  { base: 'https://instagram.com/',   label: 'Instagram',    icon: 'logo-instagram' },
    tiktok:     { base: 'https://tiktok.com/@',     label: 'TikTok',       icon: 'musical-notes' },
    tumblr:     { base: 'https://',                 label: 'Tumblr',       icon: 'logo-tumblr' },
    youtube:    { base: 'https://youtube.com/@',    label: 'YouTube',      icon: 'logo-youtube' },
    kofi:       { base: 'https://ko-fi.com/',       label: 'Ko-fi',        icon: 'cafe' },
    wattpad:    { base: 'https://wattpad.com/user/', label: 'Wattpad',     icon: 'book' },
    ao3:        { base: 'https://archiveofourown.org/users/', label: 'AO3', icon: 'bookmarks' },
    allpoetry:  { base: 'https://allpoetry.com/',   label: 'AllPoetry',    icon: 'paper' },
    deviantart: { base: 'https://',                 label: 'DeviantArt',   icon: 'brush' },
    gumroad:    { base: 'https://gumroad.com/',     label: 'Gumroad',      icon: 'pricetag' },
    goodreads:  { base: 'https://goodreads.com/',   label: 'Goodreads',    icon: 'book' },
    medium:     { base: 'https://medium.com/@',     label: 'Medium',       icon: 'paper' },
    substack:   { base: 'https://',                 label: 'Substack',     icon: 'mail' },
  };

  socialEntries(): Array<{ key: string; handle: string; url: string; label: string; icon: string }> {
    const socials = (this.author as any) && (this.author as any).socials;
    if (!socials) return [];
    const out: Array<{ key: string; handle: string; url: string; label: string; icon: string }> = [];
    for (const k of Object.keys(AuthorPage.SOCIAL_META)) {
      const v = socials[k];
      if (!v) continue;
      const meta = AuthorPage.SOCIAL_META[k];
      // If the value already looks like a URL, use it verbatim. Otherwise
      // prepend the platform's base URL.
      const url = /^https?:\/\//i.test(v) ? v : meta.base + v;
      out.push({ key: k, handle: v, url, label: meta.label, icon: meta.icon });
    }
    return out;
  }

  // Map the support_me_service value to an ionicon name + display label.
  // Defaults are used when the service is empty or unknown.
  supportIcon(service: string): string {
    switch ((service || '').toLowerCase()) {
      case 'patreon':       return 'heart';
      case 'kofi':          return 'cafe';
      case 'subscribestar': return 'star';
      case 'gumroad':       return 'pricetag';
      default:              return 'cash';
    }
  }
  supportLabel(service: string): string {
    switch ((service || '').toLowerCase()) {
      case 'patreon':       return 'Patreon';
      case 'kofi':          return 'Ko-fi';
      case 'subscribestar': return 'SubscribeStar';
      case 'gumroad':       return 'Gumroad';
      default:              return service ? service[0].toUpperCase() + service.slice(1) : 'this author';
    }
  }

  // Per-process set of (field,code) pairs we've already toasted about, so we
  // don't spam the user when an unknown code shows up across many profile
  // visits. Decoder table itself lives in
  // src/data/literotica-constants.ts (FACT_DEFS) — see header there for source.
  private static reportedMissing: Set<string> = new Set();

  // Decode a fact code to its human label using the official /3/constants
  // table. Returns '' for "no answer" (so the row is skipped) and the raw
  // code for genuinely unknown values, with a one-time toast warning so the
  // gap can be filled in. Checkbox fields concatenate per-char labels.
  factLabel(field: string, code: string): string {
    if (!code) return '';
    const def = FACT_DEFS[field];
    if (!def || !def.values) return code;
    const trimmed = String(code).trim().toLowerCase();
    if (def.nosave && trimmed === def.nosave) return '';

    if (def.type === 'checkbox') {
      const labels: string[] = [];
      const unknowns: string[] = [];
      for (const ch of trimmed) {
        const lbl = def.values[ch];
        if (lbl) labels.push(lbl);
        else unknowns.push(ch);
      }
      for (const u of unknowns) this.reportMissingCode(field, u);
      return labels.length ? labels.join(', ') : trimmed;
    }

    const lbl = def.values[trimmed];
    if (lbl) return lbl;
    this.reportMissingCode(field, trimmed);
    return trimmed;
  }

  // One-time toast per unknown (field,code) pair — alerts the user that the
  // local FACT_DEFS table is out of sync with the upstream /3/constants
  // payload, without spamming them across multiple profile visits.
  private reportMissingCode(field: string, code: string) {
    const key = `${field}:${code}`;
    if (AuthorPage.reportedMissing.has(key)) return;
    AuthorPage.reportedMissing.add(key);
    if (this.ux && (this.ux as any).showToast) {
      try { this.ux.showToast('INFO', `Unknown ${field} code “${code}”`, 3500); } catch (e) { /* no-op */ }
    }
    console.warn(`[author.facts] unknown code for ${field}: ${JSON.stringify(code)}`);
  }

  // Build the list of fact rows that have a value, in the canonical display
  // order. Empty fields are skipped so the card collapses for sparse profiles.
  factEntries(): Array<{ label: string; value: string }> {
    const a = this.author as any;
    if (!a) return [];
    const rows: Array<{ field: string; label: string; raw: string }> = [
      { field: 'sex',         label: 'Sex',           raw: a.factSex },
      { field: 'orientation', label: 'Orientation',   raw: a.factOrientation },
      { field: 'weight',      label: 'Weight',        raw: a.factWeight },
      { field: 'height',      label: 'Height',        raw: a.factHeight },
      { field: 'datingstat',  label: 'Dating Status', raw: a.factDatingstat },
      { field: 'pets',        label: 'Pets',          raw: a.factPets },
      { field: 'smoke',       label: 'Smokes',        raw: a.factSmoke },
      { field: 'drink',       label: 'Drinks',        raw: a.factDrink },
    ];
    const out: Array<{ label: string; value: string }> = [];
    // Birthday goes first when set (mirrors the SSR site's order).
    if (a.factDob) {
      const formatted = this.formatDob(a.factDob);
      if (formatted) out.push({ label: 'Birthday', value: formatted });
    }
    for (const r of rows) {
      if (!r.raw) continue;
      const value = this.factLabel(r.field, r.raw);
      if (!value) continue;          // skips "No Answer" (nosave) codes
      out.push({ label: r.label, value });
    }
    // Free-text fields tack on at the bottom when set.
    if (a.factInterests) out.push({ label: 'Interests', value: a.factInterests });
    if (a.factFetishes)  out.push({ label: 'Fetishes',  value: a.factFetishes });
    return out;
  }

  // API returns dob as "MM/DD/YYYY". Render in the same long-form date the
  // SSR site uses (e.g. "July 26, 1972"). Returns empty on parse failure so
  // the row drops out rather than displaying garbage.
  private formatDob(raw: string): string {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw).trim());
    if (!m) return '';
    const [, mm, dd, yyyy] = m;
    const t = Date.parse(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
    if (isNaN(t)) return '';
    const d = new Date(t);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }

  openExternal(url: string) {
    if (!url) return;
    this.browser.isAvailable()
      .then(ok => ok ? this.browser.openUrl(url) : window.open(url, '_blank'))
      .catch(() => window.open(url, '_blank'));
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
