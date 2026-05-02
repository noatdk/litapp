import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

import { Authors } from '../../providers/providers';
import { Author } from '../../models/author';

export type UserListKind = 'followers' | 'following';

// Paginated list of users — drives both the Followers and Following screens
// reachable from the Author page stat counters.
@IonicPage({ priority: 'low' })
@Component({
  selector: 'page-user-list',
  templateUrl: 'user-list.html',
})
export class UserListPage {
  username: string;
  kind: UserListKind = 'followers';
  users: Author[] = [];
  total: number = 0;
  loading: boolean = false;

  // Search state. The followers/following endpoints don't accept any filter
  // query param (verified — every name/q/search/filter shape is silently
  // ignored), so we filter the already-loaded pages client-side. In parallel
  // we fire a single `/3/users/{exactName}` lookup so an exact-username match
  // surfaces even before the user has scrolled deep enough to load that page.
  query: string = '';
  searching: boolean = false; // true while the exact-name API call is in flight
  exactMissed: boolean = false; // true after a finished call returned 404
  private exactHit: Author | null = null;

  private page: number = 0;
  private lastPage: number = 1;

  constructor(public navCtrl: NavController, public navParams: NavParams, public authors: Authors) {
    this.username = navParams.get('username') || '';
    this.kind = navParams.get('kind') === 'following' ? 'following' : 'followers';
  }

  ionViewWillEnter() {
    this.loadNextPage();
  }

  get titleKey(): string {
    return this.kind === 'following' ? 'AUTHOR_FOLLOWING' : 'AUTHOR_FOLLOWERS';
  }

  // The list rendered by the template. When no query is set, we render every
  // loaded user; otherwise we substring-filter on username and prepend the
  // exact-match hit (deduped) so it sits at the top.
  get filtered(): Author[] {
    if (!this.query) return this.users;
    const q = this.query.toLowerCase();
    const local = this.users.filter(u => (u.name || '').toLowerCase().indexOf(q) >= 0);
    if (this.exactHit && !local.find(u => u.id === this.exactHit.id)) {
      return [this.exactHit, ...local];
    }
    return local;
  }

  loadMore(event: any) {
    if (!this.canLoadMore()) {
      event.enable(false);
      return;
    }
    this.loadNextPage().then(() => event.complete());
  }

  openUser(user: Author) {
    this.navCtrl.push('AuthorPage', { author: user, id: user && user.id });
  }

  // Searchbar `ionInput` handler. The component already debounces by 350ms
  // (set via [debounce] on the template), so this fires once per pause.
  // tslint:disable-next-line: variable-name
  onSearch(_ev: any) {
    const q = (this.query || '').trim();
    this.exactHit = null;
    this.exactMissed = false;
    if (!q) {
      this.searching = false;
      return;
    }
    if (q.length < 2) return;
    this.searching = true;
    // /3/users/{name} 404s for unknown usernames. We treat 404 as a "no exact
    // match" hint rather than a hard failure — the local substring filter
    // still runs against the loaded list.
    this.authors.getByUsername(q).subscribe(
      (a: Author) => {
        this.searching = false;
        if (a && a.name) {
          this.exactHit = a;
          this.exactMissed = false;
        } else {
          this.exactMissed = true;
        }
      },
      () => {
        this.searching = false;
        this.exactMissed = true;
      },
    );
  }

  clearSearch() {
    this.query = '';
    this.exactHit = null;
    this.exactMissed = false;
    this.searching = false;
  }

  private canLoadMore(): boolean {
    return !this.loading && this.page < this.lastPage;
  }

  private loadNextPage(): Promise<void> {
    if (this.loading) return Promise.resolve();
    if (this.page > 0 && this.page >= this.lastPage) return Promise.resolve();

    this.loading = true;
    const next = this.page + 1;
    const obs$ =
      this.kind === 'following' ? this.authors.getFollowingsOf(this.username, next) : this.authors.getFollowersOf(this.username, next);

    return obs$
      .toPromise()
      .then(res => {
        if (res) {
          this.users = this.users.concat(res.users);
          this.total = res.total;
          this.lastPage = res.lastPage || next;
          this.page = next;
        }
        this.loading = false;
      })
      .catch(() => {
        this.loading = false;
      });
  }
}
