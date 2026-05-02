import { Component, Input } from '@angular/core';
import { PopoverController } from 'ionic-angular';

import { Memos } from '../../providers/providers';
import { MemoKind } from './memo-button';
import { MemoPopover } from '../memo-popover/memo-popover';

// Inline display of a memo — a tappable sticky-note-style card surfaced under
// the page header on story-detail, author, and series pages. Shared anatomy:
// blue accent stripe on the left, icon + "Personal memo" label, the memo body
// (multiline), and a small edit pencil at the right. Hidden when no memo
// exists. Tapping anywhere on the card reopens the same popover used by
// <memo-button>.
@Component({
  selector: 'memo-preview',
  template: `
    <button
      type="button"
      class="memo-preview"
      *ngIf="memos.has(kind, id)"
      (click)="open($event)"
    >
      <span class="memo-preview__stripe"></span>
      <ion-icon class="memo-preview__icon" [name]="iconName"></ion-icon>
      <span class="memo-preview__body">
        <span class="memo-preview__label">{{ titleKey | translate }}</span>
        <span class="memo-preview__text">{{ memos.get(kind, id) }}</span>
      </span>
      <ion-icon class="memo-preview__edit" name="create"></ion-icon>
    </button>
  `,
  styleUrls: ['memo-preview.scss'],
})
export class MemoPreview {
  @Input() kind: MemoKind;
  @Input() id: any;

  constructor(public memos: Memos, private popoverCtrl: PopoverController) {}

  get iconName(): string {
    return this.kind === 'series' ? 'albums' : 'paper';
  }

  get titleKey(): string {
    return this.kind === 'series' ? 'MEMO_SERIES_TITLE' : 'MEMO_TITLE';
  }

  open(_ev: UIEvent) {
    if (this.id == null) return;
    this.popoverCtrl
      .create(MemoPopover, { kind: this.kind, id: this.id }, { cssClass: 'memo-popover' })
      .present();
  }
}
