import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';
import { AlertController } from 'ionic-angular';

import { Story } from '../models/story';
import { STORY_KEY, MYRATINGS_KEY } from './db';
import { Authors } from './authors';
import { Filters } from './filters';
import { User } from './user';
import { Globals } from './globals';
import { Api } from './shared/api';
import { UX } from './shared/ux';

/*
  Angular http typing doesn't seem to handle tuples well
  so we cast to the more strictly typed SearchResultType in public methods.
*/
type ObservableSearchResult = Observable<(Story[] | number)[]>; // array, first param story, second number
export type SearchResultType = [Story[], number];

// Allowlist for story HTML coming back from `2/submissions/pages?raw=yes`.
// raw=yes returns whatever the author submitted, so we narrow it to basic
// formatting tags before it ever hits [innerHTML] downstream — Angular's
// sanitizer would catch <script>/<iframe>/on*-handlers, but it still passes
// through plenty we don't want in a reader (forms, embeds, inline styles,
// arbitrary classes that could clash with our scss).
const STORY_ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'em',
  'i',
  'strong',
  'b',
  'u',
  'sub',
  'sup',
  's',
  'small',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
  'span',
  'div',
]);

const STORY_ALLOWED_ATTRS: { [tag: string]: Set<string> } = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title']),
};

// Block-level tags. A <br> directly adjacent to one of these (with only
// whitespace text in between) is the API's between-block spacer artifact —
// each block in raw=yes mode is followed by `<br /><br />` which stacks on
// top of the block's own margins. We only strip those; <br>s between inline
// content (or in stories that use plain-text + <br> separators with no block
// wrappers, like /s/threads-the-island) are preserved.
const STORY_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'div', 'table']);

function isBlockSibling(node: Node | null): boolean {
  if (!node) return false;
  if (node.nodeType === 1) {
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'br') return false;
    return STORY_BLOCK_TAGS.has(tag);
  }
  return false;
}

// Walk past whitespace-only text nodes and <br> tags to find the nearest
// "real" sibling — used to decide whether a <br> sits between blocks.
function nextMeaningfulSibling(node: Node, dir: 'prev' | 'next'): Node | null {
  let cur = dir === 'prev' ? node.previousSibling : node.nextSibling;
  while (cur) {
    if (cur.nodeType === 3) {
      if ((cur.textContent || '').trim().length > 0) return cur;
    } else if (cur.nodeType === 1) {
      return cur;
    }
    cur = dir === 'prev' ? cur.previousSibling : cur.nextSibling;
  }
  return null;
}

function sanitizeStoryHtml(html: string): string {
  if (!html) return html;
  // DOMParser keeps malformed HTML resilient — far safer than regex stripping.
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  const walk = (node: Element) => {
    // Snapshot children — we'll be mutating during the walk.
    const children = Array.from(node.children);
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      if (!STORY_ALLOWED_TAGS.has(tag)) {
        // Replace the disallowed element with its text content so we don't
        // silently drop story prose stuck inside an unexpected wrapper.
        const text = doc.createTextNode(child.textContent || '');
        if (child.parentNode) child.parentNode.replaceChild(text, child);
        continue;
      }

      // Strip <br> only when it's a between-block spacer — i.e. the nearest
      // non-whitespace neighbor on either side is a block element. Anywhere
      // else (between inline runs, or in stories that use only text + <br>)
      // it's a real line break the author intended.
      if (tag === 'br') {
        const prev = nextMeaningfulSibling(child, 'prev');
        const next = nextMeaningfulSibling(child, 'next');
        if (isBlockSibling(prev) || isBlockSibling(next)) {
          if (child.parentNode) child.parentNode.removeChild(child);
          continue;
        }
      }

      const allowed = STORY_ALLOWED_ATTRS[tag] || new Set<string>();
      for (const attr of Array.from(child.attributes)) {
        if (!allowed.has(attr.name.toLowerCase())) {
          child.removeAttribute(attr.name);
          continue;
        }
        // Block javascript:/data: URLs on links and images.
        if (attr.name === 'href' || attr.name === 'src') {
          const v = (attr.value || '').trim().toLowerCase();
          if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:')) {
            child.removeAttribute(attr.name);
          }
        }
      }
      walk(child);
    }
  };

  walk(root);
  return root.innerHTML;
}

@Injectable()
export class Stories {
  private stories: Map<number, Story> = new Map<number, Story>();
  private myRatings: { [id: string]: number } = {};
  private ready;

  constructor(
    public api: Api,
    public a: Authors,
    public user: User,
    public g: Globals,
    public storage: Storage,
    public translate: TranslateService,
    public alertCtrl: AlertController,
    public ux: UX,
    public filters: Filters,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.storage.keys().then(keys => {
        if (keys.length < 1) {
          resolve();
          return;
        }

        const total = keys.length - 1;
        this.storage.forEach((value, key, index) => {
          if (key.indexOf(STORY_KEY) === 0) {
            this.stories.set(value.id, value);
          }
          if (index === total) {
            resolve();
          }
        });
      });
    });

    // Load locally-tracked ratings — the API doesn't return per-user vote
    // state, so we cache what the user did themselves to keep stars filled
    // across sessions.
    this.storage.get(MYRATINGS_KEY).then((d: any) => {
      if (d && typeof d === 'object') this.myRatings = d;
    });

    // Use this to see all of the in memory stories
    (window as any).checkCachedStories = () => console.log(this.stories);
  }

  onReady() {
    return this.ready;
  }

  // Returns the canonical Story instance for `s`, registering it in the
  // in-memory map if absent. Used by other providers (Lists) to deduplicate
  // story references after a storage roundtrip — JSON.parse'd plain objects
  // get folded back into a single instance per id.
  relink(s: any): Story {
    if (!s || s.id == null) return s;
    const existing = this.stories.get(s.id);
    if (existing) return existing;
    const story = s instanceof Story ? s : new Story(s);
    this.stories.set(story.id, story);
    return story;
  }

  // ----------------------------------------------------------------------
  // Searching
  // ----------------------------------------------------------------------

  searchStory(query: string, options: any, page?: number, limit?: number) {
    const filter = {
      q: query,
      ...options,
    };

    if (options.astags) {
      return this.tagsearch(filter, page) as Observable<SearchResultType>;
    }
    return this.newsearch(filter, page) as Observable<SearchResultType>;
  }

  getSeries(id: any) {
    const filter = [{ property: 'series_id', value: parseInt(id) }];
    return this.search(filter) as Observable<SearchResultType>;
  }

  getRelated(id: any) {
    const filter = [{ property: 'related_id', value: parseInt(id) }];
    return this.search(filter) as Observable<SearchResultType>;
  }

  getAuthorStories(id: any, page?: number) {
    const filter = [{ property: 'user_id', value: parseInt(id) }, { property: 'type', value: 'story' }];
    return this.search(filter, page, null, null, '1/user-submissions') as Observable<SearchResultType>;
  }

  getAuthorFavs(id: any, page?: number) {
    const filter = [{ property: 'user_id', value: parseInt(id) }, { property: 'type', value: 'story' }];
    return this.search(filter, page, null, null, '1/user-favorites') as Observable<SearchResultType>;
  }

  getTop(id?: any, page?: number, period?: 'week' | 'month' | 'year' | 'all', language?: number) {
    // The v3 popular endpoint exposes the website's period filter (week / month /
    // year / all-time). Fall back to the legacy v1/top for the unfiltered case so
    // existing callers keep their behavior.
    if (period) {
      return this.getPopular(id, page, period, language);
    }

    const filter: any[] = [{ property: 'type', value: 'story' }];

    if (id) {
      filter.push({ property: 'category_id', value: parseInt(id) });
    }

    return this.search(filter, page, null, null, '1/top') as Observable<SearchResultType>;
  }

  // 3/stories/popular/{categoryId} — top stories within a period.
  // categoryId of 0 (or omitted) means all categories.
  getPopular(id?: any, page?: number, period?: string, language?: number) {
    const filter: any = {};
    if (period) filter.period = period;
    if (language != null) filter.language = language;

    return this.newsearch(filter, page, 0, `3/stories/popular/${id || 0}`, true) as Observable<SearchResultType>;
  }

  getNew(id?: any, page?: number) {
    const filter: any[] = [{ property: 'type', value: 'story' }, { property: 'newonly', value: 'yes' }];

    if (id) {
      filter.push({ property: 'category_id', value: parseInt(id) });
    }

    return this.search(filter, page) as Observable<SearchResultType>;
  }

  getRandom(id?: any, page?: number) {
    const filter: any[] = [{ property: 'type', value: 'story' }, { property: 'random', value: 'yes' }];

    if (id) {
      filter.push({ property: 'category_id', value: parseInt(id) });
    }

    return this.search(filter, page, null, null, '1/submissions') as Observable<SearchResultType>;
  }

  // ----------------------------------------------------------------------
  // Author / Series search (no public endpoint — extracted from story search)
  // ----------------------------------------------------------------------
  // The v3 API exposes story search at `3/search/stories`; each result includes
  // user (author) + series_data. We piggyback on that to surface authors/series
  // by name. Imperfect but works without docs.

  searchAuthors(query: string): Observable<{ id: string; name: string; userpic?: string }[]> {
    const q = (query || '').trim();
    if (q.length < 2) return Observable.of([]);
    const params = { params: JSON.stringify({ page: 1, q, sort: '', astags: false }) };
    return this.api
      .get('3/search/stories', params)
      .map((data: any) => {
        const items = (data && data.data) || [];
        const seen = new Set<string>();
        const out: { id: string; name: string; userpic?: string }[] = [];
        for (const it of items) {
          const u = it && it.author;
          const id = u && (u.userid != null ? u.userid : u.id);
          if (id == null) continue;
          const sid = String(id);
          if (seen.has(sid)) continue;
          seen.add(sid);
          out.push({ id: sid, name: (u && u.username) || '', userpic: u && u.userpic });
        }
        return out;
      })
      .catch(error => {
        console.error('stories.searchAuthors', [query], error);
        return Observable.of([]);
      });
  }

  searchSeries(query: string): Observable<{ id: string; name: string }[]> {
    const q = (query || '').trim();
    if (q.length < 2) return Observable.of([]);
    const params = { params: JSON.stringify({ page: 1, q, sort: '', astags: false }) };
    return this.api
      .get('3/search/stories', params)
      .map((data: any) => {
        const items = (data && data.data) || [];
        const seen = new Set<string>();
        const out: { id: string; name: string }[] = [];
        for (const it of items) {
          const sd = it && it.series_data;
          const sid = sd && sd.id;
          if (sid == null) continue;
          const id = String(sid);
          if (id === '0' || seen.has(id)) continue;
          seen.add(id);
          out.push({ id, name: (sd && sd.title) || '' });
        }
        return out;
      })
      .catch(error => {
        console.error('stories.searchSeries', [query], error);
        return Observable.of([]);
      });
  }

  // helper for similar requests
  private search(filter: any, page?: number, sort?: string, urlIndex?: number, path?: string): ObservableSearchResult {
    const params = {
      page: page ? page : 1,
      filter: JSON.stringify(filter),
    };

    let loader;
    if (!page || page < 2) {
      loader = this.ux.showLoader();
    }

    return this.api
      .get(path ? path : '1/submissions', params, null, urlIndex)
      .map((data: any) => {
        if (loader) loader.dismiss();

        if (!data.success && !data.submissions) {
          if (!data.hasOwnProperty('total')) {
            this.ux.showToast();
            console.error('stories.search', [filter, page, sort]);
          }
          return [[], 0];
        }

        const stories = !data.submissions ? [] : data.submissions.map(story => this.extractFromSearch(story));
        return [this.filters.apply(stories), data.total as number];
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('stories.search', [filter, page, sort], error);
        return Observable.of([[], 0]);
      });
  }

  // api 3 used on search panel for keyword and tag search
  private newsearch(filter: any, page?: number, urlIndex?: number, path?: string, tags = false): ObservableSearchResult {
    delete filter.astags;
    if (!tags) {
      if (filter.category) {
        filter.categories = filter.category.map(c => parseInt(c));
        delete filter.category;
      }
    } else if (Array.isArray(filter.category)) {
      filter.category = parseInt(filter.category[0]);
    }

    const params = {
      params: JSON.stringify({
        page: page ? page : 1,
        ...filter,
      }),
    };

    let loader;
    if (!page || page < 2) {
      loader = this.ux.showLoader();
    }

    return this.api
      .get(path ? path : '3/search/stories', params, null, urlIndex)
      .map((data: any) => {
        if (loader) loader.dismiss();

        // tag portals uses new api but level 1 structure of old api :'(
        const stories = tags ? data.submissions : data.data;
        const total: number = tags ? data.meta.submissions_count : data.meta.total;

        if (!stories) {
          if (!total) {
            this.ux.showToast();
            console.error('stories.newsearch', [filter, page, tags]);
          }
          return [[], 0];
        }

        return [this.filters.apply(stories.map(story => this.extractFromNewSearch(story))), total];
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('stories.newsearch', [filter, page, tags], error);
        return Observable.of([[], 0]);
      });
  }

  private tagsearch(filter: any, page?: number, urlIndex?: number, path?: string): ObservableSearchResult {
    const lookup = { params: JSON.stringify({ tags: filter.q.split(',').map(t => t.trim()) }) };
    delete filter.q;
    delete filter.astags;
    delete filter.languages;
    delete filter.popular;
    delete filter.editorsChoice;
    delete filter.winner;

    let loader;
    if (!page || page < 2) {
      loader = this.ux.showLoader();
    }

    // first lookup tag ids
    return this.api
      .get(path ? path : '3/tagsportal/by-name', lookup, null, urlIndex)
      .map((data: any) => {
        return data.map(t => t.id);
      })
      .mergeMap(ids => {
        // then lookup results
        // don't load any results when the tag doesn't exist (otherwise all stories will be shown)
        if (ids.length < 1) return Observable.throw('No results');

        const params = {
          tags: ids,
          sort_by: filter.sort,
          ...filter,
        };
        return this.newsearch(params, page, 0, '3/tagsportal/stories', true);
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast('INFO', 'SEARCH_TAG_NOTFOUND');
        return Observable.of([[], 0]);
      });
  }

  // ----------------------------------------------------------------------
  // Specific Story/series endpoints
  // ----------------------------------------------------------------------

  // 3/stories/{id} — cheap metadata refresh (badges, counts, tags, series block).
  // Does NOT update full content — use getById for that. Mutates and returns the
  // cached Story instance when one exists so subscribers update in place.
  getMetadata(id: any): Observable<Story | null> {
    return this.api
      .get(`3/stories/${id}`)
      .map((data: any) => {
        const sub = data && data.submission;
        if (!sub || !sub.id) {
          console.error('stories.getMetadata', [id]);
          return null;
        }

        const cached = this.stories.get(sub.id) || new Story({ id: sub.id.toString() });
        cached.title = sub.title;
        cached.description = sub.description;
        cached.categoryID = sub.category;
        cached.lang = this.g.getLanguage(sub.language);
        cached.rating = sub.rate_all;
        cached.viewcount = sub.view_count;
        cached.ishot = sub.is_hot;
        cached.isnew = sub.is_new;
        cached.iswriterspick = sub.writers_pick;
        cached.iscontestwinner = sub.contest_winner > 0;
        cached.commentsenabled = sub.enable_comments > 0;
        cached.ratingenabled = sub.allow_vote > 0;
        cached.tags = !sub.tags ? [] : sub.tags.map(t => t.tag);
        if (sub.series && sub.series.meta) cached.series = sub.series.meta.id;
        if (data.meta && data.meta.pages_count) cached.length = data.meta.pages_count;

        this.stories.set(cached.id, cached);
        return cached;
      })
      .catch(error => {
        console.error('stories.getMetadata', [id], error);
        return Observable.of(null);
      });
  }

  // 3/stories/{slug}/comments/after — public, oldest-first, cursor by comment id.
  // Pass after=0 for the first page; for subsequent pages pass the lastId
  // returned in the previous response.
  getComments(story: Story, after: number = 0) {
    const slug = (story && story.url ? story.url : '').replace(/^.*\/s\//, '').split('?')[0];
    if (!slug) return Observable.of({ comments: [], total: 0, perPage: 0, lastId: 0 });

    const params = { params: JSON.stringify({ after }) };
    return this.api
      .get(`3/stories/${slug}/comments/after`, params)
      .map((data: any) => {
        const items = (data && data.data) || [];
        return {
          comments: items.map(c => this.extractComment(c)),
          total: (data && data.meta && data.meta.total) || 0,
          perPage: (data && data.meta && data.meta.per_page) || items.length,
          lastId: items.length ? items[items.length - 1].id : after,
        };
      })
      .catch(error => {
        console.error('stories.getComments', [story && story.id, after], error);
        return Observable.of({ comments: [], total: 0, perPage: 0, lastId: after });
      });
  }

  // Fetches a fully-populated Story by id (title + author + category + counts +
  // tags + …) via the 1/submissions search endpoint. Used for URL deep-link
  // entry where only the id is known and the regular `getById` content path
  // doesn't carry author/category metadata. Caches the result so subsequent
  // `getById(id)` reads see the rich Story instance and merge content into it.
  getRichById(id: any): Observable<Story | null> {
    return this.api
      .get(`3/stories/${id}`)
      .map((data: any) => {
        console.info(
          '[getRichById] /3/stories/%s response keys=%o submission keys=%o',
          id,
          data && Object.keys(data),
          data && data.submission && Object.keys(data.submission),
        );
        const sub = data && data.submission;
        if (!sub || !sub.id) return null;
        const cached = this.stories.get(sub.id) || new Story({ id: String(sub.id) });
        cached.title = sub.title || cached.title;
        cached.description = sub.description || cached.description;
        if (sub.category != null) cached.categoryID = sub.category;
        if (sub.language) cached.lang = this.g.getLanguage(sub.language);
        if (sub.rate_all != null) cached.rating = sub.rate_all;
        if (sub.view_count != null) cached.viewcount = sub.view_count;
        cached.ishot = sub.is_hot;
        cached.isnew = sub.is_new;
        cached.iswriterspick = sub.writers_pick;
        cached.iscontestwinner = sub.contest_winner > 0;
        cached.commentsenabled = sub.enable_comments > 0;
        cached.ratingenabled = sub.allow_vote > 0;
        if (sub.tags) cached.tags = sub.tags.map(t => t.tag || t.name || t);
        if (sub.series && sub.series.meta) cached.seriesTitle = sub.series.meta.title;
        if (sub.series && sub.series.meta) cached.series = sub.series.meta.id;
        // Try a few common author field shapes — log so we can verify which is present.
        const userish = sub.user || sub.author || sub.submitter || (sub.series && sub.series.user);
        if (userish) {
          cached.author = this.a.extractFromSearch(userish);
        }
        this.stories.set(cached.id, cached);
        return cached;
      })
      .catch(error => {
        console.error('stories.getRichById', [id], error);
        return Observable.of(null);
      });
  }

  // Get a story by ID
  getById(id: any, force: boolean = false, noLoaderDismiss = false): Observable<Story | null> {
    const cached = this.stories.get(id);
    if (cached && !force) {
      if (cached.length) {
        return Observable.of(cached);
      }
    }

    // raw=yes preserves the author's original HTML (h1-h6, p, ul, blockquote,
    // code, …); without it the API flattens everything to <br />-separated
    // text, losing all heading + list structure. It also restores the story's
    // original page breaks (the default mode silently concatenates pages).
    const filter = [{ property: 'submission_id', value: parseInt(id) }, { property: 'raw', value: 'yes' }];
    const params = { filter: JSON.stringify(filter).trim() };

    const loader = this.ux.showLoader();
    return this.api
      .get('2/submissions/pages', params)
      .map((data: any) => {
        if (loader && !noLoaderDismiss) loader.dismiss();
        if (!data.success) {
          console.error('stories.getById', [id]);
          this.ux.showToast();
          return null;
        }

        const story =
          cached ||
          new Story({
            id: data.pages[0].submission_id,
            title: data.pages[0].name,
            url: data.pages[0].url,
            ratingenabled: data.pages[0].allow_vote,
          });

        const tags = !data.pages[0].tags
          ? []
          : data.pages[0].tags.sort((a, b) => b.submission_count - a.submission_count).map(el => el.name);

        story.series = data.pages[0].series_id;
        story.lang = data.pages[0].lang;
        story.length = data.total;
        story.tags = tags;
        story.content = data.pages.map(p => sanitizeStoryHtml(p.content));

        this.stories.set(story.id, story);
        return story;
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('stories.getById', [id], error);
        return Observable.of(null);
      });
  }

  // Mirrors the official mobile app's vote call:
  // POST /api/2/submissions/vote?apikey&appid (form-data: filter,
  // submission_id, lang, user_id, session_id, vote). session_id is captured
  // at login from the v2 auth/login response. Returns Observable<boolean>.
  // On success we also persist the rating locally so the UI keeps the stars
  // filled across sessions (the API doesn't echo per-user vote state).
  rate(story: Story, rating: number): Observable<boolean> {
    if (!story || !story.id) return Observable.of(false);

    const sessionId = this.user.getSession();
    if (!sessionId) {
      this.ux.showToast('INFO', 'SESSIONTIMEOUT_MSG');
      console.error('stories.rate: no session_id — log out and log back in');
      return Observable.of(false);
    }

    const filter = [{ property: 'submission_id', value: parseInt(story.id) }];
    const data = new FormData();
    data.append('filter', JSON.stringify(filter));
    data.append('lang', ((typeof navigator !== 'undefined' && navigator.language) || 'en').slice(0, 2));
    data.append('user_id', String(this.user.getId()));
    data.append('session_id', sessionId);
    data.append('vote', String(rating));

    return this.api
      .post('2/submissions/vote', data, undefined, true)
      .map((res: any) => {
        if (!res || !res.success) {
          this.ux.showToast();
          console.error('stories.rate', [story.id, rating], res && res.error);
          return false;
        }
        story.myrating = rating;
        this.myRatings[String(story.id)] = rating;
        this.storage.set(MYRATINGS_KEY, this.myRatings);
        return true;
      })
      .catch(error => {
        this.ux.showToast();
        console.error('stories.rate', [story.id, rating], error);
        return Observable.of(false);
      });
  }

  getMyRating(id: any): number {
    if (id == null) return 0;
    return this.myRatings[String(id)] || 0;
  }

  hydrateMyRating(story: Story): void {
    if (!story || story.id == null) return;
    const r = this.getMyRating(story.id);
    if (r && !story.myrating) story.myrating = r;
  }

  downloadSeries(series: Story[]): void {
    // define downloading loop
    const loop = (index: number = 0) => {
      if (index < 1) {
        this.ux.showLoader();
      }

      if (index >= series.length) {
        this.ux.hideLoader();
        // done!
        return;
      }
      if (!series[index].cached) {
        this.getById(series[index].id, false, true).subscribe(s => {
          if (s) {
            // spread the original data gotten from the series list call to the story content
            const story = { ...series[index], ...s };
            this.stories.set(story.id, story); // override the basic version saved in getById
            this.download(story);
          } else {
            this.ux.showToast('ERROR', 'SERIES_DOWNLOAD_ERROR');
            this.ux.hideLoader();
            return;
          }
          // tslint:disable-next-line: prefer-template
          this.ux.updateLoader(Math.round(index + (1 / series.length) * 100) + '%');
          loop(index + 1);
        });
        return;
      }
      this.download(series[index]);
      // tslint:disable-next-line: prefer-template
      this.ux.updateLoader(Math.round(index + (1 / series.length) * 100) + '%');
      loop(index + 1);
    };

    // ask for confirmation when lots of stories in list
    if (series.length > 10) {
      this.translate.get(['CONFIRM', 'SERIES_DOWNLOAD_SIZEWARNING', 'DOWNLOAD_BUTTON', 'CANCEL_BUTTON']).subscribe(translations => {
        this.alertCtrl
          .create({
            title: translations.CONFIRM,
            message: translations.SERIES_DOWNLOAD_SIZEWARNING,
            buttons: [
              {
                text: translations.DOWNLOAD_BUTTON,
                handler: () => {
                  loop();
                },
              },
              { text: translations.CANCEL_BUTTON },
            ],
          })
          .present();
      });
    } else {
      loop();
    }
  }

  // ----------------------------------------------------------------------
  // CRUD methods
  // ----------------------------------------------------------------------

  persist(story: Story): Promise<void> {
    const cleanedStory = Object.assign({}, story);
    if (cleanedStory.author && cleanedStory.author.stories) delete cleanedStory.author.stories;
    // category is resolved at render time from categoryID; don't persist it.
    delete cleanedStory.category;
    return this.storage.set(`${STORY_KEY}_${story.id}`, cleanedStory);
  }

  download(story: Story): Promise<void> {
    story.downloaded = true;
    story.downloadedtimestamp = new Date();
    story.cached = true;
    return this.persist(story);
  }

  undownload(story: Story): Promise<void> {
    story.downloaded = false;
    story.downloadedtimestamp = null;
    return this.persist(story);
  }

  cache(story: Story): Promise<void> {
    story.cached = true;
    return this.persist(story);
  }

  remove(story: Story): Promise<void> {
    return this.storage.remove(`${STORY_KEY}_${story.id}`);
  }

  removeAll(excludeDownloaded?: boolean): Promise<void[]> {
    return Promise.all(
      Array.from(this.stories).map(([_, story]) => {
        if (!(excludeDownloaded && story.downloaded)) {
          return this.remove(story);
        }
      }),
    );
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  parseUrl(url: string): string {
    return !url.includes('//') ? `https://www.literotica.com/s/${url}` : url;
  }

  extractFromFeed(item): Story {
    const cached = this.stories.get(item.what.id);
    if (cached) {
      return cached;
    }

    const author = this.a.extractFromFeed(item.who);
    const story = new Story({
      author,
      id: item.what.id.toString(),
      title: item.what.title,
      description: item.what.description,
      categoryID: item.what.category,
      lang: this.g.getLanguage(item.what.language),
      timestamp: item.when,
      rating: item.what.rate_all,
      viewcount: item.what.view_count,
      url: this.parseUrl(item.what.url),
      tags: !item.what.tags ? [] : item.what.tags.map(t => t.tag),
      ishot: item.what.is_hot,
      isnew: item.what.is_new,
      iswriterspick: item.what.writers_pick,
      iscontestwinner: item.what.contest_winner,
      commentsenabled: item.what.enable_comments,
      ratingenabled: item.what.allow_vote,
    });

    this.stories.set(story.id, story);
    return story;
  }

  extactFromList(item): Story {
    const cached = this.stories.get(item.id);
    if (cached) {
      return cached;
    }

    const author = this.a.extractFromFeed(item.author);
    const story = new Story({
      author,
      id: item.id.toString(),
      title: item.title,
      description: item.description,
      categoryID: item.category,
      lang: this.g.getLanguage(item.language),
      timestamp: Math.round(Date.parse(item.date_added) / 1000),
      rating: item.rate_all,
      viewcount: item.view_count,
      url: this.parseUrl(item.url),
      tags: !item.tags ? [] : item.tags.map(t => t.tag),
      ishot: item.is_hot,
      isnew: item.is_new,
      iswriterspick: item.writers_pick,
      iscontestwinner: item.contest_winner,
      commentsenabled: item.enable_comments > 0 ? true : false,
      ratingenabled: item.allow_vote,
    });

    this.stories.set(story.id, story);
    return story;
  }

  extractFromSearch(item): Story {
    const cached = this.stories.get(item.id);
    if (cached) {
      return cached;
    }

    const author = this.a.extractFromSearch(item.user);
    const story = new Story({
      author,
      id: item.id.toString(),
      title: item.name,
      description: item.description,
      categoryID: item.category.id,
      lang: item.lang,
      timestamp: item.timestamp_published,
      rating: item.rate,
      viewcount: item.view_count,
      url: this.parseUrl(item.url),
      ishot: item.is_hot === 'no' ? false : true,
      isnew: item.is_new === 'no' ? false : true,
      iswriterspick: item.writers_pick === 'no' ? false : true,
      iscontestwinner: item.contest_winner === 'no' ? false : true,
      commentsenabled: item.enable_comments > 0 ? true : false,
      ratingenabled: item.allow_vote > 0 ? true : false,
      series: item.series_id ? parseInt(item.series_id, 10) : undefined,
      seriesTitle: item.series_data && item.series_data.title,
      commentscount: Number(item.comment_count) || 0,
      favoritescount: Number(item.favorite_count) || 0,
      listscount: Number(item.reading_lists_count) || 0,
    });

    this.stories.set(story.id, story);
    return story;
  }

  extractFromNewSearch(item): Story {
    const cached = this.stories.get(item.id);
    if (cached) {
      return cached;
    }

    const timestampParts = item.date_approve.split('/');

    const author = this.a.extractFromNewSearch(item.author);
    const story = new Story({
      author,
      id: item.id.toString(),
      title: item.title,
      description: item.description,
      categoryID: item.category,
      lang: this.g.getLanguage(item.language),
      timestamp: Math.round(Date.parse(`${timestampParts[2]}-${timestampParts[0]}-${timestampParts[1]}T00:00:00`) / 1000),
      rating: item.rate_all,
      viewcount: item.view_count,
      url: this.parseUrl(item.url),
      ishot: item.is_hot,
      isnew: item.is_new,
      iswriterspick: item.writers_pick,
      iscontestwinner: item.contest_winner > 0 ? true : false,
      commentsenabled: item.enable_comments > 0 ? true : false,
      ratingenabled: item.allow_vote > 0 ? true : false,
      commentscount: Number(item.comment_count) || 0,
      favoritescount: Number(item.favorite_count) || 0,
      listscount: Number(item.reading_lists_count) || 0,
    });

    this.stories.set(story.id, story);
    return story;
  }

  extractComment(item): { user: string; userId: string; text: string; timestamp: string } {
    const userId = item.author && (item.author.userid != null ? item.author.userid : item.author.id);
    return {
      user: item.author && item.author.username,
      userId: userId != null ? String(userId) : '',
      text: item.text,
      // unix seconds → ISO string so the template's date pipe can format it
      timestamp: item.date ? new Date(item.date * 1000).toISOString() : '',
    };
  }
}
