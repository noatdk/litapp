import { Component } from '@angular/core';
import { IonicPage, NavParams, ViewController } from 'ionic-angular';

import { Memos } from '../../providers/providers';

// Tiny editor surfaced from story-detail / author pages. Receives `kind`
// ('story' | 'author') and `id` via NavParams; persists via Memos provider.
@IonicPage({ priority: 'low' })
@Component({
  selector: 'memo-popover',
  templateUrl: 'memo-popover.html',
})
export class MemoPopover {
  kind: 'story' | 'author';
  id: any;
  memo: string = '';

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
