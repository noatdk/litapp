import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import { Storage } from '@ionic/storage';

import { List } from '../models/list';
import { Story } from '../models/story';
import { Settings } from './settings';
import { Stories } from './stories';
import { User } from './user';
import { Api } from './shared/api';
import { LIST_KEY } from './db';
import { UX } from './shared/ux';
import {
  AddStoryToListResponse,
  CreateListResponse,
  DeleteListResponse,
  MyListsResponse,
  RemoveStoryFromListResponse,
  UpdateListResponse,
  UserListDetailResponse,
} from '../models/api';

// Persisted lists are revalidated against the server in the background once
// they age past this. Local mutations (add/remove story, edit, delete) bump
// the timestamp so they don't immediately trigger a re-fetch.
const LIST_CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedLists {
  at: number;
  lists: List[];
}

@Injectable()
export class Lists {
  private lists: List[];
  private cachedAt: number = 0;
  private ready;

  constructor(public api: Api, public s: Stories, public settings: Settings, public user: User, public storage: Storage, public ux: UX) {
    this.ready = new Promise((resolve, reject) => {
      Promise.all([this.settings.load(), this.user.onReady(), this.s.onReady(), this.storage.get(LIST_KEY)]).then(res => {
        if (!this.settings.allSettings.cachelists || this.settings.allSettings.offlineMode || !this.user.isLoggedIn()) {
          resolve();
          if (res[3]) {
            this.storage.remove(LIST_KEY);
          }
          return;
        }

        this.restoreCache(res[3]);

        if (this.lists && this.lists.length > 0) {
          // Cache hit: serve immediately so onReady() consumers (e.g. the
          // bookmark icon) don't block on the network.
          resolve();
          if (this.isStale()) this.revalidate();
          return;
        }

        // No cache (first run or cleared): full fetch, then resolve.
        this.query(true).subscribe((lists: any) => {
          if (!lists.length) {
            resolve();
            return;
          }
          let done = 0;
          lists.forEach(l => {
            this.getById(l.urlname, true).subscribe(() => {
              done += 1;
              if (done === lists.length) resolve();
            });
          });
        });
      });
    });
  }

  onReady() {
    return this.ready;
  }

  // Pulls a possibly-legacy storage payload back into memory. Older builds
  // wrote a bare List[] under LIST_KEY; we now wrap it as { at, lists }.
  private restoreCache(raw: any) {
    if (!raw) return;
    if (Array.isArray(raw)) {
      // Legacy shape: assume stale so we revalidate at first opportunity.
      this.lists = raw;
      this.cachedAt = 0;
    } else {
      this.lists = raw.lists || [];
      this.cachedAt = raw.at || 0;
    }

    // Re-link list.stories[] to the canonical Story instances held by the
    // Stories provider. Storage roundtrips strip object identity, which would
    // otherwise make `list.stories.indexOf(story)` always return -1 for a
    // story handed in from a fresh search/feed response.
    this.lists.forEach(l => {
      if (!l.stories) return;
      l.stories = l.stories.map(s => this.s.relink(s));
    });
  }

  private isStale(): boolean {
    return !this.cachedAt || Date.now() - this.cachedAt >= LIST_CACHE_TTL_MS;
  }

  private persist() {
    if (!this.settings.allSettings.cachelists || !this.user.isLoggedIn()) return;
    this.cachedAt = Date.now();
    const payload: CachedLists = { at: this.cachedAt, lists: this.lists };
    this.storage.set(LIST_KEY, payload);
  }

  // Background re-fetch of list metadata. Patches existing List instances in
  // place so consumers holding references keep working. If a list's `size`
  // changed server-side, drop its `stories` so the next access re-pages it.
  //
  // Uses /3/my/lists rather than /3/users/{id}/lists — same payload, but the
  // /my/ alias doesn't require threading the numeric user id and works under
  // session contexts where getId() may not yet be populated.
  private revalidate() {
    this.api
      .get<MyListsResponse>('3/my/lists')
      .map(d => {
        if (!d || (d as any).error || !Array.isArray(d)) return null;

        const seen = new Set<number>();
        d.forEach(l => {
          seen.add(l.id);
          const existing = this.lists && this.lists.find(x => x.id === l.id);
          if (!existing) {
            this.lists.push(
              new List({
                id: l.id,
                urlname: l.urlname,
                name: l.title,
                description: l.description,
                visibility: !l.is_private,
                size: l.stories_count,
                isdeletable: l.is_deletable,
                createtimestamp: l.created_at,
                updatetimestamp: l.updated_at,
                lastPage: -1,
              }),
            );
            return;
          }
          // Patch metadata. If size changed, drop cached stories.
          existing.name = l.title;
          existing.description = l.description;
          existing.visibility = !l.is_private;
          existing.isdeletable = !!l.is_deletable;
          existing.updatetimestamp = l.updated_at || '';
          if (existing.size !== l.stories_count) {
            existing.size = l.stories_count;
            existing.stories = undefined;
            existing.lastPage = -1;
          }
        });

        // Drop lists removed server-side.
        for (let i = this.lists.length - 1; i >= 0; i -= 1) {
          if (!seen.has(this.lists[i].id)) this.lists.splice(i, 1);
        }

        this.persist();
        return this.lists;
      })
      .catch(error => {
        // Best-effort background sync — log and move on. The cache is still
        // usable; consumers will see whatever was previously persisted.
        console.error('lists.revalidate', error);
        return Observable.of(null);
      })
      .subscribe();
  }

  // True iff `story` appears in any cached list. Compared by id so storage
  // roundtrips don't break the check (cached list.stories[] are plain objects
  // until relinked).
  isBookmarked(story: Story): boolean {
    if (!this.lists || !story || story.id == null) return false;
    return this.lists.some(l => !!l.stories && l.stories.some(s => s.id === story.id));
  }

  query(hideLoader?: boolean) {
    if (this.lists) {
      return Observable.of(this.lists);
    }

    let loader;
    if (!hideLoader) {
      loader = this.ux.showLoader();
    }

    // /3/my/lists is the logged-in alias of /3/users/{id}/lists — same shape,
    // no need to thread the numeric user id. See `revalidate` for the same.
    return this.api
      .get<MyListsResponse>('3/my/lists')
      .map(d => {
        if (loader) loader.dismiss();
        if ((d as any).error) {
          this.ux.showToast();
          console.error('lists.query', (d as any).error);
          return [];
        }

        this.lists = d.map(
          l =>
            new List({
              id: l.id,
              urlname: l.urlname,
              name: l.title,
              description: l.description,
              visibility: !l.is_private,
              size: l.stories_count,
              isdeletable: l.is_deletable,
              createtimestamp: l.created_at,
              updatetimestamp: l.updated_at,
              lastPage: -1,
            }),
        );
        this.persist();

        return this.lists;
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('lists.query', error);
        return Observable.of([]);
      });
  }

  getById(urlname: string, hideLoader?: boolean) {
    const list = this.lists.find(l => l.urlname === urlname);

    if (list.stories) {
      return Observable.of(list);
    }

    let loader;
    if (!hideLoader) {
      loader = this.ux.showLoader();
    }

    return Observable.create(observer => {
      const loop = (page: number, partialList: any) => {
        this.getListPage(urlname, loader, Object.assign({}, partialList), page).subscribe(l => {
          if (!l) return;

          let newPartialList = partialList;
          if (!partialList.stories) {
            newPartialList = l;
          } else {
            newPartialList.stories = newPartialList.stories.concat(l.stories);
          }

          if (l.size > newPartialList.stories.length && page < newPartialList.lastPage) {
            const next = page + 1;
            this.ux.updateLoader(`${Math.round((newPartialList.stories.length / l.size) * 100)}%`);
            loop(next, newPartialList);
          } else {
            this.lists[this.lists.indexOf(list)] = newPartialList;
            this.persist();
            if (loader) loader.dismiss();
            observer.next(newPartialList);
            observer.complete();
          }
        });
      };

      loop(1, list);
    });
  }

  getListPage(urlname: string, loader: any, list: any, i: number = 1) {
    const params = {
      page: i,
      sort: 'dateadd',
    };

    return this.api
      .get<UserListDetailResponse>(`3/users/${this.user.getId()}/lists/${urlname}`, { params: JSON.stringify(params) })
      .map(d => {
        if (!d.works.data) {
          this.ux.showToast();
          console.error('lists.getListPage', [urlname, list, i]);
          return null;
        }

        let newList = list;
        if (!list) {
          newList = new List({
            id: d.list.id,
            urlname: d.list.urlname,
            name: d.list.title,
            description: d.list.description,
            visibility: !d.list.is_private,
            size: d.list.stories_count,
            isdeletable: d.list.is_deletable,
            createtimestamp: d.list.created_at,
            updatetimestamp: d.list.updated_at,
          });
        }

        // Update page numbers (work around for "inconsistent story count" bug)
        newList.lastPage = d.works.meta.last_page;

        newList.stories = d.works.data.map(story => this.s.extactFromList(story));

        return newList;
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('lists.getListPage', [urlname, list, i], error);
        return Observable.of(null);
      });
  }

  addStory(list: List, story: Story) {
    return this.api
      .put<AddStoryToListResponse>(`3/stories/${story.id}/lists/${list.id}`, {})
      .map(res => res && res.success)
      .catch(error => {
        this.ux.showToast();
        console.error('lists.addStory', [list, story], error);
        return Observable.of(false);
      })
      .subscribe(d => {
        if (d) {
          if (!list.stories) list['stories'] = [];
          // Avoid duplicates if a stale revalidation interleaves with the add.
          if (!list.stories.some(s => s.id === story.id)) {
            list.stories.push(story);
            list.size += 1;
          }
          this.persist();
        } else {
          this.ux.showToast();
          console.error('lists.addStory', [list, story]);
        }
      });
  }

  removeStory(list: List, story: Story) {
    return this.api
      .delete<RemoveStoryFromListResponse>(`3/stories/${story.id}/lists/${list.id}`)
      .map(res => res && res.success)
      .catch(error => {
        this.ux.showToast();
        console.error('lists.removeStory', [list, story], error);
        return Observable.of(false);
      })
      .subscribe(d => {
        if (d) {
          if (!list.stories) return;
          list.stories.forEach((s, i) => {
            if (s.id === story.id) {
              list.stories.splice(i, 1);
            }
          });
          list.size -= 1;
          this.persist();
        } else {
          this.ux.showToast();
          console.error('lists.removeStory', [list, story]);
        }
      });
  }

  add(list: List) {
    const data = {
      title: list.name,
      description: list.description,
      isPrivate: list.visibility ? 0 : 1,
    };

    return this.api
      .post<CreateListResponse>(`3/users/${this.user.getId()}/lists`, data, undefined, false)
      .map(res => {
        if (!res || !res.success || !res.list) {
          this.ux.showToast();
          console.error('lists.add', [list]);
          return false;
        }

        this.lists.push(
          new List({
            id: res.list.id,
            urlname: res.list.urlname,
            name: res.list.title,
            description: res.list.description,
            visibility: !res.list.is_private,
            size: res.list.stories_count,
            isdeletable: res.list.is_deletable,
            createtimestamp: res.list.created_at,
          }),
        );
        this.persist();

        return true;
      })
      .catch(error => {
        this.ux.showToast();
        console.error('lists.add', [list], error);
        return Observable.of(false);
      });
  }

  edit(list: List) {
    const data = {
      title: list.name,
      description: list.description,
      isPrivate: list.visibility ? 0 : 1,
    };

    return this.api
      .patch<UpdateListResponse>(`3/lists/${list.id}`, data)
      .map(res => {
        if (!res || !res.success || !res.list) {
          this.ux.showToast();
          console.error('lists.edit', [list]);
          return false;
        }

        const updated = res.list;
        this.lists.forEach(l => {
          if (l.id === list.id) {
            l.name = updated.title;
            l.description = updated.description;
            l.visibility = !updated.is_private;
          }
        });
        this.persist();

        return true;
      })
      .catch(error => {
        this.ux.showToast();
        console.error('lists.edit', [list], error);
        return Observable.of(false);
      });
  }

  delete(list: List) {
    return this.api
      .delete<DeleteListResponse>(`3/lists/${list.id}`)
      .map(res => {
        if (!res || !res.success) {
          this.ux.showToast();
          console.error('lists.delete', [list]);
          return false;
        }

        this.lists.forEach((l, i) => {
          if (l.urlname === list.urlname) {
            this.lists.splice(i, 1);
          }
        });
        this.persist();

        return true;
      })
      .catch(error => {
        this.ux.showToast();
        console.error('lists.delete', [list], error);
        return Observable.of(false);
      });
  }

  refresh() {
    this.storage.remove(LIST_KEY);
    this.lists = null;
    this.cachedAt = 0;
    return this.query();
  }
}
