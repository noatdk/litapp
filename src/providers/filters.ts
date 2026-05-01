import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';

import { Story } from '../models/story';
import { FILTERS_KEY } from './db';

export interface BlockedEntity {
  id: string;
  name: string;
}

interface FiltersData {
  tags: string[];
  authors: BlockedEntity[];
  series: BlockedEntity[];
  categories: BlockedEntity[];
}

function normTag(t: string): string {
  return (t || '').trim().toLowerCase();
}

function normId(raw: any): string {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  const n = parseInt(s, 10);
  return !isNaN(n) && String(n) === s ? String(n) : '';
}

function normEntity(raw: any): BlockedEntity | null {
  if (!raw) return null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const id = normId(raw);
    return id ? { id, name: '' } : null;
  }
  const id = normId(raw.id);
  if (!id) return null;
  return { id, name: typeof raw.name === 'string' ? raw.name : '' };
}

@Injectable()
export class Filters {
  private data: FiltersData = { tags: [], authors: [], series: [], categories: [] };
  private ready: Promise<void>;

  constructor(public storage: Storage) {
    this.ready = this.storage.get(FILTERS_KEY).then((d: any) => {
      if (!d) return;
      if (Array.isArray(d)) {
        this.data.tags = d.map(normTag).filter(Boolean);
        return;
      }
      if (typeof d === 'object') {
        this.data.tags = Array.isArray(d.tags)
          ? d.tags.map(normTag).filter(Boolean)
          : Array.isArray(d.blockedTags) ? d.blockedTags.map(normTag).filter(Boolean) : [];
        // New {id,name} shape with backwards-compat for old `*Ids` arrays.
        this.data.authors = this.loadEntities(d.authors, d.authorIds);
        this.data.series = this.loadEntities(d.series, d.seriesIds);
        this.data.categories = this.loadEntities(d.categories, d.categoryIds);
      }
    });
  }

  private loadEntities(modern: any, legacyIds: any): BlockedEntity[] {
    if (Array.isArray(modern) && modern.length) {
      return modern.map(normEntity).filter(Boolean) as BlockedEntity[];
    }
    if (Array.isArray(legacyIds)) {
      return legacyIds
        .map(id => normEntity(id))
        .filter(Boolean) as BlockedEntity[];
    }
    return [];
  }

  onReady(): Promise<void> {
    return this.ready;
  }

  getBlockedTags(): string[] {
    return this.data.tags.slice();
  }

  getBlockedAuthors(): BlockedEntity[] {
    return this.data.authors.slice();
  }

  getBlockedSeries(): BlockedEntity[] {
    return this.data.series.slice();
  }

  getBlockedCategories(): BlockedEntity[] {
    return this.data.categories.slice();
  }

  isAuthorBlocked(id: any): boolean {
    const s = normId(id);
    return !!s && this.data.authors.some(e => e.id === s);
  }

  isCategoryBlocked(id: any): boolean {
    const s = normId(id);
    return !!s && this.data.categories.some(e => e.id === s);
  }

  isSeriesBlocked(id: any): boolean {
    const s = normId(id);
    return !!s && this.data.series.some(e => e.id === s);
  }

  isTagBlocked(tag: string): boolean {
    const t = normTag(tag);
    return !!t && this.data.tags.indexOf(t) >= 0;
  }

  addBlockedTag(raw: string): boolean {
    const t = normTag(raw);
    if (!t || this.data.tags.indexOf(t) >= 0) return false;
    this.data.tags.push(t);
    this.persist();
    return true;
  }

  addBlockedAuthor(idOrEntity: any, name?: string): boolean {
    return this.addEntity('authors', idOrEntity, name);
  }

  addBlockedSeries(idOrEntity: any, name?: string): boolean {
    return this.addEntity('series', idOrEntity, name);
  }

  addBlockedCategory(idOrEntity: any, name?: string): boolean {
    return this.addEntity('categories', idOrEntity, name);
  }

  private addEntity(key: 'authors' | 'series' | 'categories', idOrEntity: any, name?: string): boolean {
    const ent = normEntity(
      typeof idOrEntity === 'object' && idOrEntity !== null
        ? idOrEntity
        : { id: idOrEntity, name: name || '' },
    );
    if (!ent) return false;
    if (this.data[key].some(e => e.id === ent.id)) return false;
    this.data[key].push(ent);
    this.persist();
    return true;
  }

  removeBlockedTag(tag: string) {
    const t = normTag(tag);
    this.data.tags = this.data.tags.filter(x => x !== t);
    this.persist();
  }

  removeBlockedAuthor(id: any) {
    const s = normId(id);
    this.data.authors = this.data.authors.filter(e => e.id !== s);
    this.persist();
  }

  removeBlockedSeries(id: any) {
    const s = normId(id);
    this.data.series = this.data.series.filter(e => e.id !== s);
    this.persist();
  }

  removeBlockedCategory(id: any) {
    const s = normId(id);
    this.data.categories = this.data.categories.filter(e => e.id !== s);
    this.persist();
  }

  apply(stories: Story[]): Story[] {
    if (!stories || !stories.length) return stories || [];
    return stories.filter(s => !this.isBlocked(s));
  }

  isBlocked(story: Story): boolean {
    if (!story) return false;

    if (this.data.authors.length && story.author && story.author.id != null) {
      if (this.isAuthorBlocked(story.author.id)) return true;
    }

    if (this.data.series.length && story.series != null && Number(story.series) > 0) {
      if (this.isSeriesBlocked(story.series)) return true;
    }

    if (this.data.categories.length && story.categoryID != null) {
      if (this.isCategoryBlocked(story.categoryID)) return true;
    }

    if (this.data.tags.length && story.tags && story.tags.length) {
      for (const tag of story.tags) {
        if (this.isTagBlocked(tag)) return true;
      }
    }

    return false;
  }

  private persist() {
    this.storage.set(FILTERS_KEY, this.data);
  }
}
