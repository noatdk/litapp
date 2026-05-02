import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

import { Globals, Categories, Filters, UX } from '../../providers/providers';
import { TranslateService } from '@ngx-translate/core';
import { Category } from '../../models/category';

@IonicPage({ priority: 'high', segment: 'explore' })
@Component({
  selector: 'page-explore',
  templateUrl: 'explore.html',
})
export class ExplorePage {
  groupedCats: Category[][];
  popularTags: any = [];
  foldCats = true;
  foldTags = true;

  private allCats: Category[][] = [];
  private allTags: any[] = [];

  constructor(
    public translate: TranslateService,
    public navCtrl: NavController,
    public navParams: NavParams,
    public g: Globals,
    public c: Categories,
    public filters: Filters,
    public ux: UX,
  ) {
    this.c.getAllSortedGrouped().subscribe((cats: Category[][]) => {
      this.allCats = cats;
      this.refreshCategories();
    });

    this.g.onReady().then(() => {
      this.g.getPopularTags().subscribe((tags: any) => {
        if (tags) {
          this.allTags = tags as any[];
          this.refreshTags();
        }
      });
    });
  }

  private refreshCategories() {
    this.groupedCats = (this.allCats || []).map(group => group.filter(cat => !this.filters.isCategoryBlocked(cat.id)));
  }

  private refreshTags() {
    this.popularTags = (this.allTags || []).filter(t => !this.filters.isTagBlocked(t && t.tag));
  }

  openCategory(cat: Category, sortOrder: string) {
    this.navCtrl.push('TopListPage', {
      category: cat,
      order: sortOrder,
    });
  }

  openTag(tag) {
    this.navCtrl.push('SearchPage', {
      query: tag,
    });
  }

  blockCategory(cat: Category, event: UIEvent) {
    event.stopPropagation();
    this.filters.addBlockedCategory(cat.id, cat.name || '');
    this.refreshCategories();
    this.ux.showToast('INFO', 'CATEGORY_BLOCKED');
  }

  blockTag(tag: any, event: UIEvent) {
    event.stopPropagation();
    const tagName = tag && tag.tag ? tag.tag : '';
    if (!tagName) return;
    this.filters.addBlockedTag(tagName);
    this.refreshTags();
    this.ux.showToast('INFO', 'TAG_BLOCKED');
  }
}
