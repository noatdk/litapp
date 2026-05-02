import { Component } from '@angular/core';
import { IonicPage, NavParams, ViewController } from 'ionic-angular';

export type AuthorSortKey = 'default' | 'newest' | 'oldest' | 'views' | 'rating';

// Tiny popover for the author submissions sort. Mirrors the SortPopover
// pattern used by History but with author-specific options.
@IonicPage({ priority: 'low' })
@Component({
  selector: 'author-sort-popover',
  template: `
    <ion-list radio-group [(ngModel)]="sortMethod">
      <ion-list-header>{{ 'AUTHOR_SORT_BY' | translate }}</ion-list-header>
      <ion-item>
        <ion-label>{{ 'AUTHOR_SORT_DEFAULT' | translate }}</ion-label>
        <ion-radio value="default" (ionSelect)="save()"></ion-radio>
      </ion-item>
      <ion-item>
        <ion-label>{{ 'AUTHOR_SORT_NEWEST' | translate }}</ion-label>
        <ion-radio value="newest" (ionSelect)="save()"></ion-radio>
      </ion-item>
      <ion-item>
        <ion-label>{{ 'AUTHOR_SORT_OLDEST' | translate }}</ion-label>
        <ion-radio value="oldest" (ionSelect)="save()"></ion-radio>
      </ion-item>
      <ion-item>
        <ion-label>{{ 'AUTHOR_SORT_VIEWS' | translate }}</ion-label>
        <ion-radio value="views" (ionSelect)="save()"></ion-radio>
      </ion-item>
      <ion-item>
        <ion-label>{{ 'AUTHOR_SORT_RATING' | translate }}</ion-label>
        <ion-radio value="rating" (ionSelect)="save()"></ion-radio>
      </ion-item>
    </ion-list>
  `,
})
export class AuthorSortPopover {
  sortMethod: AuthorSortKey;

  constructor(navParams: NavParams, private viewCtrl: ViewController) {
    this.sortMethod = navParams.get('sortMethod') || 'default';
  }

  save() {
    this.viewCtrl.dismiss(this.sortMethod);
  }
}
