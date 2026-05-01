import { Injectable } from '@angular/core';
import { LoadingController } from 'ionic-angular';

import { Observable } from 'rxjs/Rx';

import { Author } from '../models/author';
import { User } from './user';
import { Api } from './shared/api';
import { UX } from './shared/ux';

const oldDefaultUserPic = 'https://www.literotica.com/imagesv2/da'; // the old api returns an invalid url to this image
const defaultUserPic = 'https://www.literotica.com/imagesv2/da_default.jpg';

@Injectable()
export class Authors {
  private authors: Map<number, Author> = new Map<number, Author>();

  constructor(public api: Api, public user: User, public loadingCtrl: LoadingController, public ux: UX) {}

  // Get an authors bio
  getDetails(id: any) {
    let cached = this.authors.get(id);
    // Re-fetch if the cached entry is missing extended profile fields
    // (followersCount is the cheapest probe for a v3 hydration).
    if (cached && cached.bio && cached.followersCount != null) {
      return Observable.of(cached);
    }

    const loader = this.ux.showLoader();
    return this.api
      .get(`3/authors/${id}`)
      .map((data: any) => {
        if (loader) loader.dismiss();
        const profile = Array.isArray(data) ? data[0] : data;
        if (!profile || !profile.userid) {
          this.ux.showToast();
          console.error('author.getDetails');
          return null;
        }

        if (!cached) {
          cached = new Author({
            id: profile.userid,
            picture: profile.userpic === oldDefaultUserPic ? defaultUserPic : profile.userpic,
            name: profile.username,
          });
        }

        cached.storycount = profile.submissions_count;
        cached.bio = profile.biography;
        cached.usertitle = (profile.usertitle || '').trim();
        cached.location = (profile.location || '').trim();
        cached.followersCount = Number(profile.followers_count) || 0;
        cached.followingsCount = Number(profile.followings_count) || 0;
        cached.commentsCount = Number(profile.comments_count) || 0;
        cached.favoriteStoriesCount = Number(profile.favorite_stories_count) || 0;
        cached.editorStatus = profile.editor_status || '';
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
        // The endpoint includes `following` only when the request is authenticated.
        // Don't clobber an existing value if it isn't returned.
        if (typeof profile.following === 'boolean') cached.following = profile.following;

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

  // Page through any user's followers / following lists. Both endpoints
  // share the same paginated shape:
  //   { current_page, last_page, total, per_page, data: [...users] }
  // The website keys these by username (not numeric userid).
  getFollowersOf(username: string, page: number = 1, pageSize: number = 50): Observable<{ users: Author[]; total: number; lastPage: number }> {
    return this.queryUserList(`3/users/${encodeURIComponent(username)}/followers`, page, pageSize);
  }

  getFollowingsOf(username: string, page: number = 1, pageSize: number = 50): Observable<{ users: Author[]; total: number; lastPage: number }> {
    const params = JSON.stringify({ userid: username, page, pageSize });
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

  extractFromFeed(item) {
    let cached = this.authors.get(item.id);
    if (cached && cached.updatetimestamp) {
      return cached;
    }

    if (!cached) {
      cached = new Author({
        id: item.userid,
        name: item.username,
        picture: item.userpic === oldDefaultUserPic ? defaultUserPic : item.userpic,
      });
    }

    cached.jointimestamp = item.joindate;
    cached.following = true;

    this.authors.set(cached.id, cached);
    return cached;
  }

  extractFromSearch(item) {
    const cached = this.authors.get(item.id);
    if (cached) {
      return cached;
    }

    const author = new Author({
      id: item.id,
      name: item.username,
      picture: item.userpic === oldDefaultUserPic ? defaultUserPic : item.userpic,
    });

    this.authors.set(author.id, author);
    return author;
  }

  extractFromNewSearch(item) {
    const cached = this.authors.get(item.userid);
    if (cached) {
      return cached;
    }

    const author = new Author({
      id: item.userid,
      name: item.username,
      picture: item.userpic,
    });

    this.authors.set(author.id, author);
    return author;
  }
}
