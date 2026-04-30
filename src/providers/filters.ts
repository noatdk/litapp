import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';

import { Story } from '../models/story';
import { FILTERS_KEY } from './db';

interface FiltersData {
  tags: string[];
  authorIds: string[];
  seriesIds: string[];
  categoryIds: string[];
}

function normTag(t: string): string {
  return (t || '').trim().toLowerCase();
}

function normId(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const n = parseInt(s, 10);
  return !isNaN(n) && String(n) === s ? String(n) : '';
}

@Injectable()
export class Filters {
  private data: FiltersData = { tags: [], authorIds: [], seriesIds: [], categoryIds: [] };
  private ready: Promise<void>;

  constructor(public storage: Storage) {
    this.ready = this.storage.get(FILTERS_KEY).then((d: any) => {
      if (!d) return;
      if (Array.isArray(d)) {
        this.data.tags = d.map(normTag).filter(Boolean);
        return;
      }
      if (typeof d === 'object') {
        this.data = {
          tags: Array.isArray(d.tags) ? d.tags.map(normTag).filter(Boolean) : [],
          authorIds: Array.isArray(d.authorIds) ? d.authorIds.map(String).filter(Boolean) : [],
          seriesIds: Array.isArray(d.seriesIds) ? d.seriesIds.map(String).filter(Boolean) : [],
          categoryIds: Array.isArray(d.categoryIds) ? d.categoryIds.map(String).filter(Boolean) : [],
        };
        if (!this.data.tags.length && Array.isArray(d.blockedTags)) {
          this.data.tags = d.blockedTags.map(normTag).filter(Boolean);
        }
      }
    });
  }

  onReady(): Promise<void> {
    return this.ready;
  }

  getBlockedTags(): string[] {
    return this.data.tags.slice();
  }

  getBlockedAuthorIds(): string[] {
    return this.data.authorIds.slice();
  }

  getBlockedSeriesIds(): string[] {
    return this.data.seriesIds.slice();
  }

  getBlockedCategoryIds(): string[] {
    return this.data.categoryIds.slice();
  }

  addBlockedTag(raw: string): boolean {
    const t = normTag(raw);
    if (!t || this.data.tags.indexOf(t) >= 0) return false;
    this.data.tags.push(t);
    this.persist();
    return true;
  }

  addBlockedAuthorId(raw: string): boolean {
    const id = normId(raw);
    if (!id || this.data.authorIds.indexOf(id) >= 0) return false;
    this.data.authorIds.push(id);
    this.persist();
    return true;
  }

  addBlockedSeriesId(raw: string): boolean {
    const id = normId(raw);
    if (!id || this.data.seriesIds.indexOf(id) >= 0) return false;
    this.data.seriesIds.push(id);
    this.persist();
    return true;
  }

  addBlockedCategoryId(raw: string): boolean {
    const id = normId(raw);
    if (!id || this.data.categoryIds.indexOf(id) >= 0) return false;
    this.data.categoryIds.push(id);
    this.persist();
    return true;
  }

  removeBlockedTag(tag: string) {
    const t = normTag(tag);
    this.data.tags = this.data.tags.filter(x => x !== t);
    this.persist();
  }

  removeBlockedAuthorId(id: string) {
    this.data.authorIds = this.data.authorIds.filter(x => x !== String(id));
    this.persist();
  }

  removeBlockedSeriesId(id: string) {
    this.data.seriesIds = this.data.seriesIds.filter(x => x !== String(id));
    this.persist();
  }

  removeBlockedCategoryId(id: string) {
    this.data.categoryIds = this.data.categoryIds.filter(x => x !== String(id));
    this.persist();
  }

  apply(stories: Story[]): Story[] {
    if (!stories || !stories.length) return stories || [];
    return stories.filter(s => !this.isBlocked(s));
  }

  isBlocked(story: Story): boolean {
    if (!story) return false;

    if (this.data.authorIds.length && story.author && story.author.id != null) {
      if (this.data.authorIds.indexOf(String(story.author.id)) >= 0) return true;
    }

    if (this.data.seriesIds.length && story.series != null && Number(story.series) > 0) {
      if (this.data.seriesIds.indexOf(String(story.series)) >= 0) return true;
    }

    if (this.data.categoryIds.length && story.categoryID != null) {
      if (this.data.categoryIds.indexOf(String(story.categoryID)) >= 0) return true;
    }

    if (this.data.tags.length && story.tags && story.tags.length) {
      for (const tag of story.tags) {
        const low = normTag(tag);
        if (this.data.tags.indexOf(low) >= 0) return true;
      }
    }

    return false;
  }

  private persist() {
    this.storage.set(FILTERS_KEY, this.data);
  }
}
