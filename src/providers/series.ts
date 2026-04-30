import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';

import { Story } from '../models/story';
import { Stories, SearchResultType } from './stories';
import { SERIES_FOLLOW_KEY } from './db';

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface FollowEntry {
  followedAt: number;
  lastSeenChapterId: number;
}

interface SeriesPersisted {
  followed: { [seriesId: string]: FollowEntry };
  lastPolledAt: number;
}

export interface NewChapters {
  [seriesId: string]: Story[];
}

@Injectable()
export class Series {
  private data: SeriesPersisted = { followed: {}, lastPolledAt: 0 };
  private ready: Promise<void>;
  newChapters: NewChapters = {};

  constructor(public storage: Storage, public stories: Stories) {
    this.ready = this.storage.get(SERIES_FOLLOW_KEY).then((d: any) => {
      if (d) {
        this.data = {
          followed: d.followed || {},
          lastPolledAt: d.lastPolledAt || 0,
        };
      }
    });
  }

  onReady(): Promise<void> {
    return this.ready;
  }

  get followed(): { [seriesId: string]: FollowEntry } {
    return this.data.followed;
  }

  isFollowed(seriesId: any): boolean {
    if (seriesId == null) return false;
    return !!this.data.followed[String(seriesId)];
  }

  follow(seriesId: any, latestChapterId: number) {
    if (seriesId == null) return;
    this.data.followed[String(seriesId)] = {
      followedAt: Date.now(),
      lastSeenChapterId: latestChapterId || 0,
    };
    this.persist();
  }

  unfollow(seriesId: any) {
    if (seriesId == null) return;
    delete this.data.followed[String(seriesId)];
    delete this.newChapters[String(seriesId)];
    this.persist();
  }

  getFollowedIds(): string[] {
    return Object.keys(this.data.followed);
  }

  isPollDue(): boolean {
    return Date.now() - this.data.lastPolledAt >= POLL_INTERVAL_MS;
  }

  poll(force: boolean = false): Promise<NewChapters> {
    if (!force && !this.isPollDue()) return Promise.resolve(this.newChapters);

    const ids = this.getFollowedIds();
    if (!ids.length) {
      this.data.lastPolledAt = Date.now();
      this.persist();
      return Promise.resolve({});
    }

    return Promise.all(
      ids.map(seriesId =>
        new Promise<void>(resolve => {
          this.stories.getSeries(parseInt(seriesId, 10)).subscribe(
            (res: SearchResultType) => {
              if (!res || !res[0]) return resolve();
              const chapters = res[0];
              const entry = this.data.followed[seriesId];
              if (!entry) return resolve();

              const sorted = chapters.slice().sort((a, b) => Number(b.id) - Number(a.id));
              const fresh = sorted.filter(s => Number(s.id) > entry.lastSeenChapterId);
              if (fresh.length) {
                this.newChapters[seriesId] = fresh;
                entry.lastSeenChapterId = Math.max(
                  entry.lastSeenChapterId,
                  ...fresh.map(s => Number(s.id)),
                );
              } else {
                delete this.newChapters[seriesId];
              }
              resolve();
            },
            () => resolve(),
          );
        }),
      ),
    ).then(() => {
      this.data.lastPolledAt = Date.now();
      this.persist();
      return this.newChapters;
    });
  }

  acknowledge(seriesId: any) {
    delete this.newChapters[String(seriesId)];
  }

  getAllNewChapters(): Story[] {
    const out: Story[] = [];
    Object.keys(this.newChapters).forEach(sid => {
      this.newChapters[sid].forEach(s => out.push(s));
    });
    return out;
  }

  hasNewChapters(): boolean {
    return Object.keys(this.newChapters).length > 0;
  }

  private persist() {
    this.storage.set(SERIES_FOLLOW_KEY, this.data);
  }
}
