import { Injectable } from '@angular/core';

import { Observable } from 'rxjs/Rx';

import { Author } from '../models/author';
import { User } from './user';
import { Api } from './shared/api';
import { UX } from './shared/ux';

const oldDefaultUserPic = 'https://www.literotica.com/imagesv2/da'; // the old api returns an invalid url to this image
const defaultUserPic = 'https://www.literotica.com/imagesv2/da_default.jpg';

@Injectable()
export class Authors {
  // Keys are id values; in practice they're numeric but multiple call sites
  // pass them as numeric strings, so the map is widened to `any` rather than
  // forcing every caller to coerce. Lookups still need to match key TYPE
  // exactly (Map.get is === based) — see the dual-typed lookup in getDetails.
  private authors: Map<any, Author> = new Map<any, Author>();

  constructor(public api: Api, public user: User, public ux: UX) {}

  // Get an author's full profile.
  //
  // Endpoint preference: when we know the author's username (typical — almost
  // every entry point caches one before the user opens AuthorPage), prefer
  // `/3/users/{username}`. That endpoint surfaces a much richer field set
  // (per-type counts, socials, support_me link, status, last_update_approx,
  // joindate_approx) than `/3/authors/{id}`, which only returns the legacy
  // shape. Fall back to the id-based endpoint if no name is cached.
  //
  // Pass `force=true` to bypass the in-memory cache — used by the page-level
  // refresh button so the user can pull a fresh response after, e.g., the API
  // shape changed or the author updated their bio.
  getDetails(id: any, force: boolean = false, nameHint?: string) {
    // Cache lookup tolerates the id being passed as either a number or a
    // numeric string — different code paths hand us different forms. We try
    // the value as-is first, then fall back to the alt-typed key.
    let cached = this.authors.get(id);
    if (!cached && typeof id === 'string' && /^\d+$/.test(id)) {
      cached = this.authors.get(Number(id));
    } else if (!cached && typeof id === 'number') {
      cached = this.authors.get(String(id));
    }
    // Short-circuit only on a fully-hydrated entry. We previously checked
    // `bio + followersCount`, but several lighter extractors (extractFromUserList
    // sets followersCount on first hydration; future endpoints may set bio in
    // a feed shape) could satisfy that test and starve the page of the rich
    // /3/users/{name} fields. The `_fullProfile` flag is set exclusively by
    // this method after a successful fetch — no extractor touches it — so the
    // cache is only trusted when getDetails has actually run end-to-end.
    if (!force && cached && (cached as any)._fullProfile) {
      return Observable.of(cached);
    }

    // If the cache had no entry but the caller knows the username (typical:
    // the story-detail page passes story.author with name set), prime the
    // cache so we route to the rich `/3/users/{name}` endpoint instead of
    // falling back to the lesser `/3/authors/{id}` shape.
    if (!cached && nameHint) {
      cached = new Author({ id, name: nameHint });
      this.authors.set(id, cached);
    } else if (cached && !cached.name && nameHint) {
      cached.name = nameHint;
    }

    const loader = this.ux.showLoader();
    const name = (cached && cached.name) || nameHint;
    // `withProfile:true` is the only param that adds value over the bare
    // /3/users/{name} response — it appends the `profile_header` block (cover
    // banner urls). All other speculative `with*` flags were verified no-ops.
    const profileParams = encodeURIComponent(JSON.stringify({ withProfile: true }));
    const url = name ? `3/users/${encodeURIComponent(name)}?params=${profileParams}` : `3/authors/${id}`;

    return this.api
      .get(url)
      .map((data: any) => {
        if (loader) loader.dismiss();
        // /3/users/{name} wraps the payload as { success, user: {...} };
        // /3/authors/{id} returns either an array or a bare object.
        let profile: any = data;
        if (data && data.user) profile = data.user;
        else if (Array.isArray(data)) profile = data[0];

        if (!profile || profile.userid == null) {
          this.ux.showToast();
          console.error('author.getDetails');
          return null;
        }

        if (!cached) {
          cached = new Author({ id: profile.userid });
          this.authors.set(profile.userid, cached);
        }
        // Always refresh name + picture from the response. Previously these
        // were only set on first-time creation, which broke the nameHint path
        // that creates an empty cached entry pre-fetch (the if-block above
        // would short-circuit and leave picture undefined).
        cached.name = profile.username || cached.name;
        cached.picture = profile.userpic === oldDefaultUserPic ? defaultUserPic : profile.userpic || cached.picture;

        cached.storycount = Number(profile.submissions_count) || 0;
        cached.bio = profile.biography || profile.bio || '';
        cached.usertitle = (profile.usertitle || '').trim();
        cached.customtitle = !!profile.customtitle;
        cached.location = (profile.location || '').trim();
        cached.homepage = (profile.homepage || '').trim();
        cached.followersCount = Number(profile.followers_count) || 0;
        cached.followingsCount = Number(profile.followings_count) || 0;
        cached.commentsCount = Number(profile.comments_count) || 0;
        cached.favoriteStoriesCount = Number(profile.favorite_stories_count) || 0;
        cached.editorStatus = profile.editor_status || '';

        // Fields only returned by /3/users/{name}. Guard each so the legacy
        // /3/authors/{id} fallback path doesn't blow up.
        cached.joindateApprox = profile.joindate_approx || '';
        cached.lastUpdateApprox = profile.last_update_approx || '';
        cached.status = profile.status || '';
        cached.supportMeLink = profile.support_me_link || '';
        cached.supportMeService = profile.support_me_service || '';
        cached.storiesCount = Number(profile.stories_count) || 0;
        cached.poemsCount = Number(profile.poems_count) || 0;
        cached.audiosCount = Number(profile.audios_count) || 0;
        cached.illustrationsCount = Number(profile.illustrations_count) || 0;
        cached.sgsCount = Number(profile.sgs_count) || 0;
        cached.seriesCount = Number(profile.series_count) || 0;

        // "More about me" — single-char codes for height/weight/datingstat/etc.
        // Stored verbatim; AuthorPage.factLabel decodes for display.
        cached.factSex = profile.sex || '';
        cached.factOrientation = profile.orientation || '';
        cached.factHeight = profile.height || '';
        cached.factWeight = profile.weight || '';
        cached.factDatingstat = profile.datingstat || '';
        cached.factPets = profile.pets || '';
        cached.factSmoke = profile.smoke || '';
        cached.factDrink = profile.drink || '';
        cached.factInterests = profile.interests || '';
        cached.factFetishes = profile.fetishes || '';
        cached.factDob = profile.dob || '';

        // Pluck the social handles that may be set. Empty strings collapse to
        // undefined so the template can `*ngIf` on the row directly.
        const social: any = {};
        const socialKeys = [
          'x',
          'facebook',
          'instagram',
          'tiktok',
          'tumblr',
          'youtube',
          'kofi',
          'wattpad',
          'ao3',
          'allpoetry',
          'deviantart',
          'gumroad',
          'goodreads',
          'medium',
          'substack',
        ];
        for (const k of socialKeys) {
          const v = profile[k];
          if (typeof v === 'string' && v.trim()) social[k] = v.trim();
        }
        cached.socials = social;

        if (profile.joindate) {
          // joindate is "MM/DD/YYYY". Convert to unix seconds for the date pipe.
          const [mm, dd, yyyy] = String(profile.joindate).split('/');
          if (mm && dd && yyyy) {
            const t = Math.round(Date.parse(`${yyyy}-${mm}-${dd}T00:00:00Z`) / 1000);
            if (!isNaN(t)) cached.jointimestamp = t;
          }
        }
        cached.lists = Array.isArray(profile.lists)
          ? profile.lists
              .filter(l => l && l.title)
              .map(l => ({
                id: Number(l.id),
                urlname: l.urlname || '',
                title: l.title,
                description: l.description || '',
                submissionType: l.submission_type || 'story',
                storiesCount: Number(l.stories_count) || 0,
              }))
          : [];
        // `profile_header` only appears when ?params={"withProfile":true} is sent.
        // The shape is { d1, d2, m1, m2 } — desktop/mobile @1x/@2x. Store as-is
        // so the template can pick the right size and emit srcset 2x.
        const ph = profile.profile_header;
        if (ph && (ph.m1 || ph.d1)) {
          cached.coverPicture = {
            m1: ph.m1 || '',
            m2: ph.m2 || '',
            d1: ph.d1 || '',
            d2: ph.d2 || '',
          };
        }
        // The endpoint includes `following` only when the request is authenticated.
        // Don't clobber an existing value if it isn't returned.
        if (typeof profile.following === 'boolean') cached.following = profile.following;

        // Sentinel: marks the cached entry as carrying the full /3/users/{name}
        // (or /3/authors/{id}) field set, so subsequent getDetails calls can
        // safely skip the network round-trip. Extractors do NOT set this flag.
        (cached as any)._fullProfile = true;

        this.authors.set(cached.id, cached);
        return cached;
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('author.getDetails', [id], error);
        return Observable.of(null);
      });
  }

  // Direct username lookup. Returns the Author (rich profile, with the
  // _fullProfile flag set) or null on 404 / network error. Used by the
  // user-list searchbar to surface an exact-match hit when the typed name
  // doesn't appear in the loaded follower/following pages.
  //
  // The /3/users/{name} endpoint returns the same shape as getDetails — we
  // run it through the same hydration so the result is interchangeable.
  getByUsername(name: string): Observable<Author | null> {
    const trimmed = (name || '').trim();
    if (!trimmed) return Observable.of(null);
    const profileParams = encodeURIComponent(JSON.stringify({ withProfile: true }));
    return this.api
      .get(`3/users/${encodeURIComponent(trimmed)}?params=${profileParams}`)
      .map((data: any) => {
        const profile = (data && data.user) || data;
        if (!profile || profile.userid == null) return null;
        // Reuse the cache: if we've seen this id, enrich rather than create.
        const id = profile.userid;
        let cached = this.authors.get(id);
        if (!cached) {
          cached = new Author({
            id,
            name: profile.username,
            picture: profile.userpic === oldDefaultUserPic ? defaultUserPic : profile.userpic,
          });
        }
        // Mirror the field set populated by getDetails so the UI sees the
        // same rich shape regardless of which path discovered the author.
        cached.storycount = Number(profile.submissions_count) || 0;
        cached.bio = profile.biography || profile.bio || '';
        cached.usertitle = (profile.usertitle || '').trim();
        cached.followersCount = Number(profile.followers_count) || 0;
        cached.followingsCount = Number(profile.followings_count) || 0;
        const ph2 = profile.profile_header;
        if (ph2 && (ph2.m1 || ph2.d1)) {
          cached.coverPicture = {
            m1: ph2.m1 || '',
            m2: ph2.m2 || '',
            d1: ph2.d1 || '',
            d2: ph2.d2 || '',
          };
        }
        (cached as any)._fullProfile = true;
        this.authors.set(id, cached);
        return cached;
      })
      .catch(() => Observable.of(null));
  }

  // Page through any user's followers / following lists. Both endpoints
  // share the same paginated shape:
  //   { current_page, last_page, total, per_page, data: [...users] }
  // The website keys these by username (not numeric userid).
  getFollowersOf(
    username: string,
    page: number = 1,
    pageSize: number = 50,
  ): Observable<{ users: Author[]; total: number; lastPage: number }> {
    return this.queryUserList(`3/users/${encodeURIComponent(username)}/followers`, page, pageSize);
  }

  getFollowingsOf(
    username: string,
    page: number = 1,
    pageSize: number = 50,
  ): Observable<{ users: Author[]; total: number; lastPage: number }> {
    const params = JSON.stringify({ page, pageSize, userid: username });
    return this.api
      .get(`3/users/${encodeURIComponent(username)}/favorite/authors?params=${encodeURIComponent(params)}`)
      .map((data: any) => this.extractUserList(data))
      .catch(error => {
        console.error('authors.getFollowingsOf', [username, page], error);
        return Observable.of({ users: [], total: 0, lastPage: 0 });
      });
  }

  private queryUserList(path: string, page: number, pageSize: number): Observable<{ users: Author[]; total: number; lastPage: number }> {
    const params = JSON.stringify({ page, pageSize });
    return this.api
      .get(`${path}?params=${encodeURIComponent(params)}`)
      .map((data: any) => this.extractUserList(data))
      .catch(error => {
        console.error('authors.queryUserList', [path, page], error);
        return Observable.of({ users: [], total: 0, lastPage: 0 });
      });
  }

  private extractUserList(data: any): { users: Author[]; total: number; lastPage: number } {
    const items = (data && data.data) || [];
    const users = items.map((u: any) => this.extractFromUserList(u));
    return {
      users,
      total: Number(data && data.total) || 0,
      lastPage: Number(data && data.last_page) || 0,
    };
  }

  private extractFromUserList(item: any): Author {
    const id = item && (item.userid != null ? item.userid : item.id);
    const cached = this.authors.get(id);
    if (cached) {
      // Hydrate counts/usertitle if missing — saves a getDetails roundtrip
      // when the user later opens this author's profile.
      if (cached.usertitle == null && item.usertitle) cached.usertitle = String(item.usertitle).trim();
      if (cached.followersCount == null && item.followers_count != null) cached.followersCount = Number(item.followers_count) || 0;
      if (cached.storycount == null && item.submissions_count != null) cached.storycount = Number(item.submissions_count) || 0;
      return cached;
    }
    const author = new Author({
      id,
      name: item.username,
      picture: item.userpic === oldDefaultUserPic ? defaultUserPic : item.userpic,
      usertitle: (item.usertitle || '').trim(),
      storycount: Number(item.submissions_count) || 0,
      followersCount: Number(item.followers_count) || 0,
    });
    this.authors.set(author.id, author);
    return author;
  }

  // get authors you are following
  getFollowing() {
    const loader = this.ux.showLoader();
    return this.api
      .get(`3/users/${this.user.getId()}/favorite/authors?params={%22nocache%22:true}`)
      .map((data: any) => {
        if (loader) loader.dismiss();
        if (!data.length) {
          this.ux.showToast();
          console.error('author.getFollowing');
          return [];
        }

        return data.map(item => this.extractFromFeed(item));
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('author.getFollowing', error);
        return Observable.of([]);
      });
  }

  follow(author: Author) {
    const data = new FormData();
    data.append('type', 'member');
    data.append('id', author.id);

    return this.api
      .post(`3/users/follow/${author.id}`, {})
      .map((res: any) => res.success)
      .catch(error => {
        this.ux.showToast();
        console.error('author.follow', [author], error);
        return Observable.of(false);
      })
      .subscribe(d => {
        if (d) {
          author.following = true;
        } else {
          this.ux.showToast();
          console.error('author.follow', [author]);
        }
      });
  }

  unfollow(author: Author) {
    return this.api
      .delete(`3/users/follow/${author.id}`)
      .map((res: any) => res.success)
      .catch(error => {
        this.ux.showToast();
        console.error('author.unfollow', [author], error);
        return Observable.of(false);
      })
      .subscribe(d => {
        if (d) {
          author.following = false;
        } else {
          this.ux.showToast();
          console.error('author.unfollow', [author]);
        }
      });
  }

  // Hydrate an Author from a "following list" feed row.
  //
  // Cache discipline: lookup AND store under `item.userid` (the canonical
  // user id used everywhere else in the app). The previous shape looked up
  // by `item.id` (the feed-row id) and stored under `item.userid`, so when
  // those keys differed it created a new lightweight Author and clobbered
  // any rich entry that `getDetails` had already populated. That clobber
  // forced the user to re-tap the refresh button on every author page open.
  //
  // On cache hit we *enrich missing fields only* — never overwrite. Rich
  // fields (bio, socials, factHeight, etc.) populated by getDetails must
  // survive a feed-row visit.
  extractFromFeed(item) {
    const id = item.userid != null ? item.userid : item.id;
    let cached = this.authors.get(id);
    if (!cached) {
      cached = new Author({
        id,
        name: item.username,
        picture: item.userpic === oldDefaultUserPic ? defaultUserPic : item.userpic,
      });
      this.authors.set(id, cached);
    }
    if (item.joindate != null && cached.jointimestamp == null) {
      cached.jointimestamp = item.joindate;
    }
    cached.following = true;
    return cached;
  }

  // Search-result hydration. Same enrich-don't-overwrite contract as
  // extractFromFeed so a story search visit doesn't downgrade a previously
  // hydrated author profile.
  extractFromSearch(item) {
    const id = item.userid != null ? item.userid : item.id;
    let cached = this.authors.get(id);
    if (!cached) {
      cached = new Author({
        id,
        name: item.username,
        picture: item.userpic === oldDefaultUserPic ? defaultUserPic : item.userpic,
      });
      this.authors.set(id, cached);
    } else {
      if (!cached.name && item.username) cached.name = item.username;
      if (!cached.picture && item.userpic) cached.picture = item.userpic;
    }
    return cached;
  }

  extractFromNewSearch(item) {
    const id = item.userid;
    let cached = this.authors.get(id);
    if (!cached) {
      cached = new Author({
        id,
        name: item.username,
        picture: item.userpic,
      });
      this.authors.set(id, cached);
    } else {
      if (!cached.name && item.username) cached.name = item.username;
      if (!cached.picture && item.userpic) cached.picture = item.userpic;
    }
    return cached;
  }
}
