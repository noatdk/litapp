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

  loadMore(event: any) {
    if (!this.canLoadMore()) {
      event.enable(false);
      return;
    }
    this.loadNextPage().then(() => event.complete());
  }

  openUser(user: Author) {
    this.navCtrl.push('AuthorPage', { author: user });
  }

  private canLoadMore(): boolean {
    return !this.loading && this.page < this.lastPage;
  }

  private loadNextPage(): Promise<void> {
    if (this.loading) return Promise.resolve();
    if (this.page > 0 && this.page >= this.lastPage) return Promise.resolve();

    this.loading = true;
    const next = this.page + 1;
    const obs$ = this.kind === 'following'
      ? this.authors.getFollowingsOf(this.username, next)
      : this.authors.getFollowersOf(this.username, next);

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
