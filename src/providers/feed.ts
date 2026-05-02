import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import { Storage } from '@ionic/storage';

import { FeedItem } from '../models/feeditem';
import { Stories } from './stories';
import { Authors } from './authors';
import { Filters } from './filters';
import { User } from './user';
import { Settings } from './settings';
import { FEED_KEY } from './db';
import { Api } from './shared/api';
import { UX } from './shared/ux';
import { Activity } from './activity';
import { ActivityWallResponse, ApiActivityItem } from '../models/api';

@Injectable()
export class Feed {
  private ready: Promise<void>;
  private timeout = 1000 * 60 * 10;
  private feed;
  private feedtimeout = new Date().getTime() + this.timeout;

  feedbadge = '';

  constructor(
    public api: Api,
    public s: Stories,
    public a: Authors,
    public user: User,
    public settings: Settings,
    public storage: Storage,
    public ux: UX,
    public filters: Filters,
    public activity: Activity,
  ) {
    this.ready = new Promise((resolve, reject) => {
      Promise.all([this.settings.load(), this.user.onReady()]).then(() => {
        if (!this.settings.allSettings.checkforfeedupdates || this.settings.allSettings.offlineMode || !this.user.isLoggedIn()) {
          resolve();
          return;
        }

        this.feedbadge = '·';

        // Prefer the server's authoritative wall counter when available — it
        // reflects items not yet acknowledged on this account, across devices.
        // Falls back silently to the local "items since last viewed id" count
        // computed below if counters can't be fetched (no wall_id, network).
        this.activity.getCounters().subscribe(c => {
          if (c && typeof c.wall === 'number' && c.wall > 0) {
            this.feedbadge = c.wall > 15 ? '15+' : String(c.wall);
          }
        });

        this.query().subscribe(d => {
          if (d) {
            this.storage.get(FEED_KEY).then(id => {
              for (let i = 0; i < d.length; i += 1) {
                if (id === d[i].id) {
                  this.feedbadge = String(i);
                  break;
                }
              }
              if (this.feedbadge === '') this.feedbadge = '15+';
              resolve();
            });
          } else resolve();
        });
      });
    });
  }

  onReady() {
    return this.ready;
  }

  query(lastid?: number, showloader?: boolean, force = false) {
    if (!force && !lastid && this.feed && new Date().getTime() < this.feedtimeout) {
      return Observable.of(this.feed);
    }

    if (!lastid || !this.feed) {
      this.feed = [];
    }

    let loader;
    if (showloader) {
      loader = this.ux.showLoader();
    }

    const params = {
      chunked: 1,
      limit: 10,
    };

    if (lastid) {
      params['last_id'] = lastid;
    }

    return this.api
      .get<ActivityWallResponse>(`3/activity/wall?params=${JSON.stringify(params)}`)
      .map(d => {
        if (loader) loader.dismiss();
        if (!d.data) {
          this.ux.showToast();
          console.error('feed.query', [lastid]);
          return [];
        }

        const items = d.data
          .map((item: ApiActivityItem) => {
            const isStory = item.action === 'published-story';
            try {
              // `what` is polymorphic on `action`:
              //   published-story → full story object (handled separately
              //                     via Stories.extractFromFeed below)
              //   profile-updated → string[] of changed field names
              //   publish-news    → { content, url } site-news payload
              //   other verbs     → unknown shapes; render as a friendly fallback
              let text: string[] = [];
              if (!isStory) {
                if (Array.isArray(item.what)) {
                  text = item.what as string[];
                } else if (item.action === 'publish-news' && item.what && typeof (item.what as any).content === 'string') {
                  text = [(item.what as any).content];
                } else {
                  text = ['their profile'];
                }
              }
              return new FeedItem({
                text,
                id: item.id,
                timestamp: item.when,
                author: this.a.extractFromFeed(item.who),
                story: !isStory ? undefined : this.s.extractFromFeed(item),
              });
            } catch (error) {
              return new FeedItem(null);
            }
          })
          // filter out invalid items, blocklisted stories, and (optionally)
          // non-story activity entries.
          .filter((item: FeedItem) => {
            if (!item.id) return false;
            if (this.settings.allSettings.onlyShowStoriesInFeed && !item.story) return false;
            if (item.story && this.filters.isBlocked(item.story)) return false;
            return true;
          });

        items.forEach(i => this.feed.push(i));
        this.feedtimeout = new Date().getTime() + this.timeout;
        return items;
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('feed.query', [lastid], error);
        return Observable.of([]);
      });
  }
}
