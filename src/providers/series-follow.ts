import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import { Storage } from '@ionic/storage';

import { Story } from '../models/story';
import { Stories, SearchResultType } from './stories';
import { SERIES_FOLLOW_KEY } from './db';

// Daily background sweep over followed series. Local mutations bump
// lastPolledAt so a refresh isn't immediately re-triggered after a follow.
const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface FollowEntry {
  followedAt: number;
  // The id of the most-recent chapter we know about server-side. Used as the
  // baseline for "new chapter" detection — anything newer than this when we
  // poll counts as new.
  lastSeenChapterId: number;
}

interface FollowData {
  followed: { [seriesId: string]: FollowEntry };
  lastPolledAt: number;
}

// Result of a poll cycle: per-series, the chapters we hadn't seen before.
export interface NewChapters {
  [seriesId: string]: Story[];
}

@Injectable()
export class SeriesFollow {
  private data: FollowData = { followed: {}, lastPolledAt: 0 };
  private ready: Promise<void>;
  // Last poll's discoveries; cleared as the user opens stories.
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

  isFollowed(seriesId: any): boolean {
    if (seriesId == null) return false;
    return !!this.data.followed[String(seriesId)];
  }

  // Marks the series as followed. `latestChapterId` is the id of the newest
  // chapter the user has already seen — typically the chapter they were
  // reading when they hit the follow button. Anything newer than this on a
  // future poll surfaces as a "new chapter".
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

  // Hits the API once per followed series, comparing `series.items[*].id`
  // against the stored lastSeenChapterId. Updates `newChapters` with anything
  // beyond the cursor and bumps each entry forward so subsequent polls only
  // surface chapters from this point on.
  //
  // `force` skips the 24-hour gate, used by an explicit pull-to-refresh.
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
          this.stories.getSeries(parseInt(seriesId)).subscribe((res: SearchResultType) => {
            if (!res || !res[0]) return resolve();
            const chapters = res[0];
            const entry = this.data.followed[seriesId];
            if (!entry) return resolve();

            // Newest chapter has the highest id (literotica's series_id-based
            // ordering matches monotonic submission ids).
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
          }, () => resolve());
        }),
      ),
    ).then(() => {
      this.data.lastPolledAt = Date.now();
      this.persist();
      return this.newChapters;
    });
  }

  // Clears the new-chapter badge for a series — call when the user actually
  // opens / reads one of the surfaced chapters so it doesn't keep showing up.
  acknowledge(seriesId: any) {
    delete this.newChapters[String(seriesId)];
  }

  // Flat list of all chapters surfaced by the last poll, oldest series first.
  getAllNewChapters(): Story[] {
    const out: Story[] = [];
    Object.keys(this.newChapters).forEach(sid => {
      this.newChapters[sid].forEach(s => out.push(s));
    });
    return out;
  }

  // Returns true if a poll occurred recently AND there are new chapters to
  // show. Used to decide whether to render the "new chapters" shelf.
  hasNewChapters(): boolean {
    return Object.keys(this.newChapters).length > 0;
  }

  private persist() {
    this.storage.set(SERIES_FOLLOW_KEY, this.data);
  }
}
