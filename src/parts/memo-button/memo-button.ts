import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { Button, PopoverController } from 'ionic-angular';

import { Memos } from '../../providers/providers';

export type MemoKind = 'story' | 'author' | 'series';

// Toolbar button for opening the memo popover. Centralizes icon, color tint
// when a memo exists, click handler, and i18n key for the tooltip.
@Component({
  selector: 'memo-button',
  template: `
    <button
      ion-button
      icon-only
      (click)="open($event)"
      [tooltip]="tooltipKey | translate"
      event="press"
      navTooltip
    >
      <ion-icon [name]="iconName" [color]="memos.has(kind, id) ? 'secondary' : ''"></ion-icon>
    </button>
  `,
  styles: [':host { display: contents; }'],
})
export class MemoButton implements AfterViewInit {
  @Input() kind: MemoKind;
  @Input() id: any;

  // Ionic 3's ToolbarItem uses @ContentChildren(Button) with descendants:false,
  // so wrapping a button in this component prevents it from being flipped to
  // role 'bar-button' (it'd render as a solid filled default button instead of
  // a clear toolbar icon button). Promote the role manually.
  @ViewChild(Button) private innerButton: Button;

  constructor(public memos: Memos, private popoverCtrl: PopoverController) {}

  ngAfterViewInit() {
    if (this.innerButton) this.innerButton.setRole('bar-button');
  }

  get iconName(): string {
    return this.kind === 'series' ? 'albums' : 'paper';
  }

  get tooltipKey(): string {
    return this.kind === 'series' ? 'MEMO_SERIES_BUTTON' : 'MEMO_BUTTON';
  }

  open(ev: UIEvent) {
    if (this.id == null) return;
    this.popoverCtrl.create('MemoPopover', { kind: this.kind, id: this.id }).present({ ev });
  }
}
