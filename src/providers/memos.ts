import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';

import { MEMOS_KEY } from './db';

// Per-user, client-side notes attached to a story, author, or series. Not synced
// with the server — these are private scratch-pad annotations the reader
// keeps for themselves (continuity notes, reminders, "TODO: re-read").
type EntityKind = 'story' | 'author' | 'series';

export interface MemoRecord {
  text: string;
  createdAt: number; // ms epoch — first time the memo was saved
  updatedAt: number; // ms epoch — last edit
}

interface Bucket {
  [id: string]: MemoRecord;
}

interface MemosData {
  stories: Bucket;
  authors: Bucket;
  series: Bucket;
}

@Injectable()
export class Memos {
  private data: MemosData = { stories: {}, authors: {}, series: {} };
  private ready: Promise<void>;

  constructor(public storage: Storage) {
    this.ready = this.storage.get(MEMOS_KEY).then((d: any) => {
      if (d) {
        this.data = {
          stories: this.normalizeBucket(d.stories),
          authors: this.normalizeBucket(d.authors),
          series: this.normalizeBucket(d.series),
        };
      }
    });
  }

  // Migrate the old shape (id -> string) and tolerate partially-shaped
  // records. Missing timestamps are backfilled to "now" so subsequent sorts
  // by updatedAt have a stable value (the alternative — 0 — would shove every
  // legacy memo to the bottom of the list).
  private normalizeBucket(raw: any): Bucket {
    const out: Bucket = {};
    if (!raw || typeof raw !== 'object') return out;
    const now = Date.now();
    Object.keys(raw).forEach(id => {
      const v = raw[id];
      if (typeof v === 'string') {
        const text = v.trim();
        if (text) out[id] = { text, createdAt: now, updatedAt: now };
        return;
      }
      if (v && typeof v === 'object' && typeof v.text === 'string') {
        const text = v.text.trim();
        if (!text) return;
        const createdAt = Number(v.createdAt) || now;
        const updatedAt = Number(v.updatedAt) || createdAt;
        out[id] = { text, createdAt, updatedAt };
      }
    });
    return out;
  }

  onReady(): Promise<void> {
    return this.ready;
  }

  get(kind: EntityKind, id: any): string {
    const e = this.getEntry(kind, id);
    return e ? e.text : '';
  }

  getEntry(kind: EntityKind, id: any): MemoRecord | undefined {
    if (id == null) return undefined;
    return this.bucket(kind)[String(id)];
  }

  has(kind: EntityKind, id: any): boolean {
    if (id == null) return false;
    return !!this.bucket(kind)[String(id)];
  }

  // Saves `memo`. An empty / whitespace-only string clears the entry so the
  // indicator disappears. createdAt is preserved across edits; updatedAt
  // always reflects the latest save.
  set(kind: EntityKind, id: any, memo: string) {
    if (id == null) return;
    const key = String(id);
    const trimmed = (memo || '').trim();
    const bucket = this.bucket(kind);
    if (!trimmed) {
      delete bucket[key];
    } else {
      const now = Date.now();
      const prev = bucket[key];
      bucket[key] = {
        text: trimmed,
        createdAt: prev ? prev.createdAt : now,
        updatedAt: now,
      };
    }
    this.persist();
  }

  // Convenience wrappers — most call sites already know the kind.
  hasStoryMemo(id: any) {
    return this.has('story', id);
  }
  getStoryMemo(id: any) {
    return this.get('story', id);
  }
  setStoryMemo(id: any, memo: string) {
    this.set('story', id, memo);
  }

  hasAuthorMemo(id: any) {
    return this.has('author', id);
  }
  getAuthorMemo(id: any) {
    return this.get('author', id);
  }
  setAuthorMemo(id: any, memo: string) {
    this.set('author', id, memo);
  }

  hasSeriesMemo(id: any) {
    return this.has('series', id);
  }
  getSeriesMemo(id: any) {
    return this.get('series', id);
  }
  setSeriesMemo(id: any, memo: string) {
    this.set('series', id, memo);
  }

  listStoryIds(): string[] {
    return Object.keys(this.data.stories);
  }
  listAuthorIds(): string[] {
    return Object.keys(this.data.authors);
  }
  listSeriesIds(): string[] {
    return Object.keys(this.data.series);
  }

  private bucket(kind: EntityKind) {
    if (kind === 'author') return this.data.authors;
    if (kind === 'series') return this.data.series;
    return this.data.stories;
  }

  private persist() {
    this.storage.set(MEMOS_KEY, this.data);
  }
}
