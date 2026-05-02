import { Component } from '@angular/core';
import { IonicPage, NavParams, ViewController } from 'ionic-angular';

import { Memos } from '../../providers/providers';

// Tiny editor surfaced from story-detail / author / series pages. Receives `kind`
// ('story' | 'author' | 'series') and `id` via NavParams; persists via Memos provider.
@IonicPage({ priority: 'high' })
@Component({
  selector: 'memo-popover',
  templateUrl: 'memo-popover.html',
})
export class MemoPopover {
  kind: 'story' | 'author' | 'series';
  id: any;
  memo: string = '';

  get memoHeaderKey(): string {
    return this.kind === 'series' ? 'MEMO_SERIES_TITLE' : 'MEMO_TITLE';
  }

  constructor(navParams: NavParams, public viewCtrl: ViewController, public memos: Memos) {
    this.kind = navParams.get('kind');
    this.id = navParams.get('id');
    this.memo = this.memos.get(this.kind, this.id);
  }

  save() {
    this.memos.set(this.kind, this.id, this.memo);
    this.viewCtrl.dismiss({ memo: this.memos.get(this.kind, this.id) });
  }

  clear() {
    this.memo = '';
    this.memos.set(this.kind, this.id, '');
    this.viewCtrl.dismiss({ memo: '' });
  }

  cancel() {
    this.viewCtrl.dismiss();
  }
}
