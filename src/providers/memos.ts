import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';

import { MEMOS_KEY } from './db';

// Per-user, client-side notes attached to a story or an author. Not synced
// with the server — these are private scratch-pad annotations the reader
// keeps for themselves (continuity notes, reminders, "TODO: re-read").
type EntityKind = 'story' | 'author';

interface MemosData {
  stories: { [id: string]: string };
  authors: { [id: string]: string };
}

@Injectable()
export class Memos {
  private data: MemosData = { stories: {}, authors: {} };
  private ready: Promise<void>;

  constructor(public storage: Storage) {
    this.ready = this.storage.get(MEMOS_KEY).then((d: any) => {
      if (d) {
        this.data = {
          stories: (d.stories && typeof d.stories === 'object') ? d.stories : {},
          authors: (d.authors && typeof d.authors === 'object') ? d.authors : {},
        };
      }
    });
  }

  onReady(): Promise<void> {
    return this.ready;
  }

  get(kind: EntityKind, id: any): string {
    if (id == null) return '';
    return this.bucket(kind)[String(id)] || '';
  }

  has(kind: EntityKind, id: any): boolean {
    if (id == null) return false;
    return !!this.bucket(kind)[String(id)];
  }

  // Saves `memo`. An empty / whitespace-only string clears the entry so the
  // indicator disappears.
  set(kind: EntityKind, id: any, memo: string) {
    if (id == null) return;
    const key = String(id);
    const trimmed = (memo || '').trim();
    const bucket = this.bucket(kind);
    if (trimmed) bucket[key] = trimmed;
    else delete bucket[key];
    this.persist();
  }

  // Convenience wrappers — most call sites already know the kind.
  hasStoryMemo(id: any) { return this.has('story', id); }
  getStoryMemo(id: any) { return this.get('story', id); }
  setStoryMemo(id: any, memo: string) { this.set('story', id, memo); }

  hasAuthorMemo(id: any) { return this.has('author', id); }
  getAuthorMemo(id: any) { return this.get('author', id); }
  setAuthorMemo(id: any, memo: string) { this.set('author', id, memo); }

  private bucket(kind: EntityKind) {
    return kind === 'author' ? this.data.authors : this.data.stories;
  }

  private persist() {
    this.storage.set(MEMOS_KEY, this.data);
  }
}
