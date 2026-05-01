import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

import { Globals, Categories, Filters } from '../../providers/providers';
import { TranslateService } from '@ngx-translate/core';
import { Category } from '../../models/category';

@IonicPage({ priority: 'high' })
@Component({
  selector: 'page-explore',
  templateUrl: 'explore.html',
})
export class ExplorePage {
  groupedCats: Category[][];
  popularTags: any = [];
  foldCats = true;
  foldTags = true;

  constructor(
    public translate: TranslateService,
    public navCtrl: NavController,
    public navParams: NavParams,
    public g: Globals,
    public c: Categories,
    public filters: Filters,
  ) {
    this.c.getAllSortedGrouped().subscribe((cats: Category[][]) => {
      // Drop blocked categories so they disappear from Explore entirely.
      this.groupedCats = cats.map(group =>
        group.filter(cat => !this.filters.isCategoryBlocked(cat.id)),
      );
    });

    this.g.onReady().then(() => {
      this.g.getPopularTags().subscribe((tags: any) => {
        if (tags) {
          this.popularTags = (tags as any[]).filter(t => !this.filters.isTagBlocked(t && t.tag));
        }
      });
    });
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
}
