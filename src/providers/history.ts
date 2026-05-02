import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import { Storage } from '@ionic/storage';

import { Stories } from './stories';
import { HISTORY_KEY, RECENT_AUTHORS_KEY, STORY_KEY } from './db';
import { Story } from '../models/story';
import { Author } from '../models/author';

// Lightweight snapshot persisted for each viewed author. We don't persist the
// full Author (it carries bio/socials/etc.) — just enough to render a list row
// and route to AuthorPage. Re-opening the page rehydrates from the API.
export interface RecentAuthor {
  id: any;
  name: string;
  picture: string;
  usertitle?: string;
  storycount?: number;
  followersCount?: number;
  viewedAt: number; // ms epoch
}

@Injectable()
export class History {
  private ready;
  private history: Story[] = []; // ordered from old to new
  private recentAuthors: RecentAuthor[] = []; // ordered most-recent-first

  static HISTORY_LIMIT = 1000;
  static RECENT_AUTHORS_LIMIT = 100;

  constructor(public stories: Stories, public storage: Storage) {
    this.ready = new Promise((resolve, reject) => {
      Promise.all([
        this.stories.onReady(),
        this.storage.get(RECENT_AUTHORS_KEY).then(list => {
          this.recentAuthors = Array.isArray(list) ? list.filter(a => a && a.id != null) : [];
        }),
      ]).then(() => {
        this.storage.get(HISTORY_KEY).then(idList => {
          let loadedIndex = 0;
          if (idList) {
            const temp = [];
            idList.forEach((id, index) => {
              this.stories.getById(id).subscribe(story => {
                if (story) {
                  temp[index] = story;
                }

                loadedIndex += 1;
                if (loadedIndex === idList.length) {
                  this.history = temp;
                  this.clean().then(() => resolve(true));
                }
              });
            });
          } else {
            this.history = [];
            resolve(true);
          }
        });
      });
    });
  }

  onReady(): boolean {
    return this.ready;
  }

  // ordered by downloaded time
  getDownloadStories(): Promise<Story[]> {
    return new Promise(resolve => {
      this.storage.length().then(allStorageLength => {
        const idsList = [];
        this.storage.forEach((value, key, index) => {
          if (key.indexOf(STORY_KEY) > -1) {
            if (value.downloaded) {
              idsList.push(value.id);
            }
          }
          if (Number(index) >= allStorageLength) {
            // All ids were gathered
            Observable.forkJoin(idsList.map(id => this.stories.getById(id))).subscribe(list => {
              const sortedList = list.sort((a, b) => (b.downloadedtimestamp as number) - (a.downloadedtimestamp as number));
              resolve(sortedList);
            });
          }
        });
      });
    });
  }

  getStories(): Story[] {
    return this.history.slice();
  }

  getIds(): string[] {
    return this.history.map(story => story.id);
  }

  persist(): Promise<void> {
    return this.storage.set(HISTORY_KEY, this.getIds());
  }

  add(story: Story): Promise<void> {
    const index = this.getIds().indexOf(story.id);
    if (index > -1) {
      this.history.splice(index, 1);
    }

    this.history.push(story);
    return this.persist();
  }

  remove(story: Story, deleteDownloaded?: boolean): Promise<void[]> {
    const index = this.getIds().indexOf(story.id);
    const promises = [];
    if (index > -1) {
      this.history.splice(index, 1);
      promises.push(this.persist());
    }
    if (!story.downloaded || deleteDownloaded) {
      promises.push(this.stories.remove(story));
    }
    return Promise.all(promises);
  }

  reset(): void {
    this.history = [];
    this.storage.set(HISTORY_KEY, []);
    this.stories.removeAll();
  }

  getRecentAuthors(): RecentAuthor[] {
    return this.recentAuthors.slice();
  }

  addAuthor(author: Author): Promise<void> {
    if (!author || author.id == null) return Promise.resolve();
    const id = author.id;
    const idx = this.recentAuthors.findIndex(a => String(a.id) === String(id));
    if (idx > -1) this.recentAuthors.splice(idx, 1);
    this.recentAuthors.unshift({
      id,
      name: author.name || '',
      picture: author.picture || '',
      usertitle: author.usertitle || '',
      storycount: author.storycount,
      followersCount: author.followersCount,
      viewedAt: Date.now(),
    });
    if (this.recentAuthors.length > History.RECENT_AUTHORS_LIMIT) {
      this.recentAuthors.length = History.RECENT_AUTHORS_LIMIT;
    }
    return this.storage.set(RECENT_AUTHORS_KEY, this.recentAuthors);
  }

  removeAuthor(id: any): Promise<void> {
    const before = this.recentAuthors.length;
    this.recentAuthors = this.recentAuthors.filter(a => String(a.id) !== String(id));
    if (this.recentAuthors.length === before) return Promise.resolve();
    return this.storage.set(RECENT_AUTHORS_KEY, this.recentAuthors);
  }

  resetAuthors(): Promise<void> {
    this.recentAuthors = [];
    return this.storage.set(RECENT_AUTHORS_KEY, []);
  }

  clean(): Promise<void> {
    return new Promise(resolve => {
      const toRemove = this.history.slice(0, Math.max(this.history.length - History.HISTORY_LIMIT, 0));

      if (toRemove.length < 1) {
        resolve();
      } else {
        toRemove.forEach((story, index) => {
          this.remove(story);
        });
        resolve();
      }
    });
  }
}
