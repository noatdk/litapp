import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { Button } from 'ionic-angular';

import { Story } from '../../models/story';
import { Series } from '../../providers/providers';

// Toolbar button for toggling series follow state. Centralizes icon, color
// tint when followed, click handler, and i18n key for the tooltip.
@Component({
  selector: 'series-follow-button',
  template: `
    <button
      ion-button
      icon-only
      (click)="toggle()"
      [tooltip]="'STORYDETAIL_TOOLTIP_FOLLOW_SERIES' | translate"
      event="press"
      navTooltip
    >
      <ion-icon
        [name]="followed ? 'notifications' : 'notifications-outline'"
        [color]="followed ? 'secondary' : ''"
      ></ion-icon>
    </button>
  `,
  styles: [':host { display: contents; }'],
})
export class SeriesFollowButton implements AfterViewInit {
  @Input() seriesId: any;
  // Provide either a single representative story (e.g., from story-detail)
  // or the chapter list (e.g., from story-series). The component picks the
  // latest chapter as both `lastSeenChapterId` and the followed-shelf entry.
  @Input() story: Story;
  @Input() chapters: Story[];

  // Same Ionic 3 ToolbarItem quirk as memo-button: ion-buttons only sees
  // direct Button children, so promote the inner button's role manually.
  @ViewChild(Button) private innerButton: Button;

  constructor(public seriesFollow: Series) {}

  ngAfterViewInit() {
    if (this.innerButton) this.innerButton.setRole('bar-button');
  }

  get followed(): boolean {
    return this.seriesFollow.isFollowed(this.seriesId);
  }

  toggle() {
    if (this.seriesId == null) return;
    if (this.followed) {
      this.seriesFollow.unfollow(this.seriesId);
      return;
    }
    this.seriesFollow.follow(this.seriesId, this.chapters, this.story);
  }
}
