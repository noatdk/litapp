import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ConnectableObservable } from 'rxjs/observable/ConnectableObservable';
import { EmptyObservable } from 'rxjs/observable/EmptyObservable';
import 'rxjs/add/operator/publishReplay';

import { Category } from '../models/category';
import { Api } from './shared/api';
import { TagsportalCategoriesResponse } from '../models/api';

@Injectable()
export class Categories {
  private categories: ConnectableObservable<Category[]>;
  // Sorts first by 'master', 'story', 'poem', respectively, then by name
  private sortMap: Map<string, number> = new Map<string, number>();
  // id → name, populated from the same source as `categories` for sync access.
  private namesById: Map<number, string> = new Map<number, string>();

  constructor(public api: Api, public translate: TranslateService) {
    // Replayed cache shared across all subscribers; connect() keeps it warm.
    this.categories = this.api
      .get<TagsportalCategoriesResponse>('3/tagsportal/categories', null)
      .map(cats => {
        const tempcats: Category[] = [];

        cats.forEach(cat => {
          tempcats.push(
            new Category({
              id: cat.id,
              name: cat.name,
              description: cat.ldesc,
              type: cat.type,
              url: cat.pageUrl,
            }),
          );
        });

        this.translate.get(['EXPLORE_ALLCAT', 'EXPLORE_ALLCATDESCR']).subscribe(values => {
          tempcats.push(
            new Category({
              id: 0,
              name: values.EXPLORE_ALLCAT,
              description: values.EXPLORE_ALLCATDESCR,
              type: 'master',
              url: '',
            }),
          );
        });

        return tempcats;
      })
      .publishReplay(1);
    this.categories.connect();

    // Mirror the cache into a sync id -> name map for nameSync().
    this.categories.subscribe((cats: Category[]) => {
      cats.forEach(c => {
        if (c && c.id != null && c.name) this.namesById.set(c.id, c.name);
      });
    });

    this.sortMap.set('master', 0);
    this.sortMap.set('story', 1);
    this.sortMap.set('poem', 2);
  }

  private mapSorter(sortMap) {
    return (cat1, cat2) => {
      if (sortMap.get(cat1.type) > sortMap.get(cat2.type)) return 1;
      if (sortMap.get(cat1.type) < sortMap.get(cat2.type)) return -1;

      if (cat1.name > cat2.name) return 1;
      if (cat1.name < cat2.name) return -1;
    };
  }

  get(id: number) {
    return this.categories.map((cats: Category[]) => {
      return cats.find((cat: Category) => cat.id === id);
    });
  }

  // Sync lookup for callers that can't subscribe; '' until the list loads.
  nameSync(id: number): string {
    if (id == null) return '';
    return this.namesById.get(id) || '';
  }

  getAll() {
    // Current known types are 'master' (custom injected), 'story', 'poem', and 'illustra'
    // 'illustra' is not supported at this time (needs work to support the new comic format)
    return this.categories.map((cats: Category[]) => {
      return cats.filter((c: Category) => ['master', 'story', 'poem'].includes(c.type));
    });
  }

  getAllSorted() {
    return this.getAll().map((cats: Category[]) => {
      return cats.sort(this.mapSorter(this.sortMap));
    });
  }

  getAllSortedGrouped() {
    return this.getAllSorted().map((cats: Category[]) => {
      const groupedCats: Category[][] = [];

      this.sortMap.forEach((v: number, k: string) => {
        groupedCats.push(cats.filter((c: Category) => c.type === k));
      });

      return groupedCats;
    });
  }

  // query can be category id or name (for backwards compatibility)
  getClosestCategory(query: string) {
    return this.getAll().map(categories => {
      return categories.find(c => {
        if (c.id && c.id.toString() === query) return true;
        if (c.name && c.name === query) return true;
        if (c.name && c.name.toLowerCase().indexOf(query.toLowerCase()) > -1) return true;
        return false;
      });
    });
  }

  getType(type: string) {
    if (!this.sortMap.has(type)) {
      console.error('categories.getType', [type], 'Unsupported Category Type');
      return new EmptyObservable<Categories[]>();
    }
    return this.getAllSorted().map((cats: Category[]) => {
      return cats.filter((c: Category) => c.type === type);
    });
  }
}
