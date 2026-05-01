import { Component } from '@angular/core';
import { IonicPage, NavParams, ViewController } from 'ionic-angular';
import { Subject } from 'rxjs/Subject';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/switchMap';

import { Stories, Categories } from '../../providers/providers';
import { Category } from '../../models/category';

export type PickerKind = 'author' | 'series' | 'category';

interface PickerResult {
  id: string;
  name: string;
}

// Reusable search-and-pick popover. Opens with kind='author' | 'series' |
// 'category' and dismisses with `{ id, name }` when the user picks a row.
// Authors/series query `3/search/stories` and dedupe author/series_data;
// categories filter the local Categories list (no API call).
@IonicPage({ priority: 'low' })
@Component({
  selector: 'entity-picker',
  templateUrl: 'entity-picker.html',
})
export class EntityPicker {
  kind: PickerKind;
  query = '';
  loading = false;
  results: PickerResult[] = [];
  excludeIds: Set<string> = new Set();

  private categoriesAll: Category[] = [];
  private input$ = new Subject<string>();

  get titleKey(): string {
    if (this.kind === 'series') return 'PICKER_TITLE_SERIES';
    if (this.kind === 'category') return 'PICKER_TITLE_CATEGORY';
    return 'PICKER_TITLE_AUTHOR';
  }

  get placeholderKey(): string {
    if (this.kind === 'series') return 'PICKER_PLACEHOLDER_SERIES';
    if (this.kind === 'category') return 'PICKER_PLACEHOLDER_CATEGORY';
    return 'PICKER_PLACEHOLDER_AUTHOR';
  }

  constructor(
    public navParams: NavParams,
    public viewCtrl: ViewController,
    public stories: Stories,
    public categories: Categories,
  ) {
    this.kind = navParams.get('kind') || 'author';
    const exclude: any[] = navParams.get('exclude') || [];
    exclude.forEach(id => this.excludeIds.add(String(id)));

    if (this.kind === 'category') {
      this.categories.getAllSorted().subscribe((cats: Category[]) => {
        this.categoriesAll = cats || [];
        this.applyFilter();
      });
      return;
    }

    this.input$
      .debounceTime(350)
      .distinctUntilChanged()
      .switchMap(q => {
        const trimmed = (q || '').trim();
        if (trimmed.length < 2) {
          this.loading = false;
          this.results = [];
          return Observable.of<PickerResult[]>([]);
        }
        this.loading = true;
        return this.kind === 'series'
          ? this.stories.searchSeries(trimmed)
          : this.stories.searchAuthors(trimmed);
      })
      .subscribe((rows: PickerResult[]) => {
        this.loading = false;
        this.results = (rows || []).filter(r => !this.excludeIds.has(String(r.id)));
      });
  }

  onInput(v: string) {
    this.query = v || '';
    if (this.kind === 'category') {
      this.applyFilter();
      return;
    }
    this.input$.next(this.query);
  }

  private applyFilter() {
    const q = this.query.trim().toLowerCase();
    const all = this.categoriesAll
      .filter(c => c.id != null && Number(c.id) > 0) // skip the synthetic "All" entry (id 0)
      .filter(c => !this.excludeIds.has(String(c.id)))
      .map(c => ({ id: String(c.id), name: c.name }));
    this.results = q ? all.filter(c => c.name.toLowerCase().indexOf(q) >= 0) : all;
  }

  pick(row: PickerResult) {
    this.viewCtrl.dismiss({ picked: row });
  }

  cancel() {
    this.viewCtrl.dismiss();
  }
}
