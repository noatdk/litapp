import { Component, Input } from '@angular/core';
import { PopoverController } from 'ionic-angular';

import { Memos } from '../../providers/providers';
import { MemoKind } from './memo-button';

// Inline display of a memo (under page header). Hidden when no memo exists.
// Tapping it reopens the same popover used by <memo-button>.
@Component({
  selector: 'memo-preview',
  template: `
    <p class="memo" *ngIf="memos.has(kind, id)" (click)="open($event)">
      <strong><ion-icon [name]="iconName" color="secondary"></ion-icon> {{ titleKey | translate }}: </strong>
      {{ memos.get(kind, id) }}
    </p>
  `,
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

  open(ev: UIEvent) {
    if (this.id == null) return;
    this.popoverCtrl.create('MemoPopover', { kind: this.kind, id: this.id }).present({ ev });
  }
}
