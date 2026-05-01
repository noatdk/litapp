import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';

import { Story } from '../models/story';
import { Stories, SearchResultType } from './stories';
import { History } from './history';
import { SERIES_FOLLOW_KEY } from './db';

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Persisted state per follow is intentionally minimal:
//   followedAt        — when the user followed (display only).
//   anchorChapterId   — the latest chapter id at follow time. Chapters older
//                       than this are pre-existing back-catalog and don't
//                       count as "new"; chapters newer than this are flagged
//                       as new until they show up in the read history.
// Read state itself is not duplicated here — we ask History.getIds() at view
// time, so a chapter the user reads via the normal flow is automatically
// removed from the unread set with no separate acknowledge step.
export interface FollowEntry {
  followedAt: number;
  anchorChapterId: number;
}

interface SeriesPersisted {
  followed: { [seriesId: string]: FollowEntry };
  lastPolledAt: number;
}

export interface SeriesSummary {
  title: string;
  representative?: Story;
  authorName?: string;
  chaptersCount: number;
  totalViews: number;
  totalComments: number;
  totalFavorites: number;
  totalLists: number;
  categoryID?: number;
  isHot: boolean;
}

export function summarizeSeries(seriesId: any, chapters: Story[]): SeriesSummary {
  const list = chapters || [];
  const sortedDesc = list.slice().sort((a, b) => Number(b.id) - Number(a.id));
  const rep = sortedDesc[0];
  if (rep && rep.series == null) rep.series = parseInt(String(seriesId), 10);
  const titleFromApi = list.map(c => c.seriesTitle).find(t => !!t);
  const title = titleFromApi || stripChapterSuffix((rep && rep.title) || '');
  const sum = (key: string) => list.reduce((s, c) => s + (Number(c[key]) || 0), 0);
  return {
    title,
    representative: rep,
    chaptersCount: list.length,
    totalViews: sum('viewcount'),
    totalComments: sum('commentscount'),
    totalFavorites: sum('favoritescount'),
    totalLists: sum('listscount'),
    authorName: rep && rep.author && (rep.author.name || rep.author.username),
    categoryID: rep && rep.categoryID,
    isHot: list.some(c => !!c.ishot),
  };
}

function stripChapterSuffix(title: string): string {
  return title.replace(/\s*[-–—:]?\s*(Ch|Chapter|Pt|Part)\.?\s*\d+.*$/i, '').trim() || title;
}

@Injectable()
export class Series {
  private data: SeriesPersisted = { followed: {}, lastPolledAt: 0 };
  private ready: Promise<void>;
  // In-memory chapter cache keyed by seriesId, populated by poll() and by
  // follow() when the caller already has the chapter list. Not persisted —
  // refetched per session via poll().
  chapters: { [seriesId: string]: Story[] } = {};

  constructor(public storage: Storage, public stories: Stories, public history: History) {
    this.ready = this.storage.get(SERIES_FOLLOW_KEY).then((d: any) => {
      if (d) {
        this.data = {
          followed: this.normalizeFollowed(d.followed),
          lastPolledAt: d.lastPolledAt || 0,
        };
      }
    });
  }

  // Migrate from any prior shape (lastSeenChapterId, cached display fields,
  // persisted newChapters) down to just the essentials.
  private normalizeFollowed(raw: any): { [seriesId: string]: FollowEntry } {
    const out: { [seriesId: string]: FollowEntry } = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(sid => {
      const e = raw[sid] || {};
      out[sid] = {
        followedAt: Number(e.followedAt) || Date.now(),
        anchorChapterId: Number(e.anchorChapterId) || Number(e.lastSeenChapterId) || 0,
      };
    });
    return out;
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

  follow(seriesId: any, chapters?: Story[], fallbackStory?: Story) {
    if (seriesId == null) return;
    const sid = String(seriesId);
    const existing = this.data.followed[sid];
    const followedAt = (existing && existing.followedAt) || Date.now();
    let anchor = existing ? existing.anchorChapterId : 0;

    if (chapters && chapters.length) {
      anchor = chapters.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
      this.chapters[sid] = chapters;
    } else if (fallbackStory) {
      anchor = parseInt(fallbackStory.id, 10) || anchor;
    }

    this.data.followed[sid] = { followedAt, anchorChapterId: anchor };
    this.persist();
  }

  unfollow(seriesId: any) {
    if (seriesId == null) return;
    const sid = String(seriesId);
    delete this.data.followed[sid];
    delete this.chapters[sid];
    this.persist();
  }

  getFollowedIds(): string[] {
    return Object.keys(this.data.followed);
  }

  getChapters(seriesId: any): Story[] | undefined {
    return this.chapters[String(seriesId)];
  }

  // Chapters added since the user followed AND not yet read. Returns [] when
  // the chapter cache hasn't been populated for this series yet (poll pending).
  getUnreadChapters(seriesId: any): Story[] {
    const sid = String(seriesId);
    const entry = this.data.followed[sid];
    const chapters = this.chapters[sid];
    if (!entry || !chapters) return [];
    const readIds = new Set(this.history.getIds().map(String));
    return chapters
      .filter(c => Number(c.id) > entry.anchorChapterId && !readIds.has(String(c.id)))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  getAllUnreadCount(): number {
    return this.getFollowedIds().reduce((sum, sid) => sum + this.getUnreadChapters(sid).length, 0);
  }

  isPollDue(): boolean {
    return Date.now() - this.data.lastPolledAt >= POLL_INTERVAL_MS;
  }

  poll(force: boolean = false): Promise<void> {
    if (!force && !this.isPollDue()) return Promise.resolve();

    const ids = this.getFollowedIds();
    if (!ids.length) {
      this.data.lastPolledAt = Date.now();
      this.persist();
      return Promise.resolve();
    }

    return Promise.all(
      ids.map(seriesId =>
        new Promise<void>(resolve => {
          this.stories.getSeries(parseInt(seriesId, 10)).subscribe(
            (res: SearchResultType) => {
              if (!res || !res[0]) return resolve();
              const chapters = res[0];
              const sidNum = parseInt(seriesId, 10);
              chapters.forEach(c => { if (c.series == null) c.series = sidNum; });
              this.chapters[seriesId] = chapters;
              resolve();
            },
            () => resolve(),
          );
        }),
      ),
    ).then(() => {
      this.data.lastPolledAt = Date.now();
      this.persist();
    });
  }

  private persist() {
    this.storage.set(SERIES_FOLLOW_KEY, this.data);
  }
}
