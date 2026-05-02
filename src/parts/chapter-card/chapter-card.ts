import { Component, Input } from '@angular/core';
import { NavController, PopoverController } from 'ionic-angular';

import { Lists, User } from '../../providers/providers';
import { Story } from '../../models/story';

// Numbered card for one chapter inside a series list. Use a different
// component if you need to render a one-off story — this one assumes the
// surrounding context is "chapters of series N".
@Component({
  selector: 'chapter-card',
  templateUrl: 'chapter-card.html',
})
export class ChapterCard {
  @Input() story: Story;
  @Input() index: number; // 1-based chapter number

  constructor(public navCtrl: NavController, public user: User, public lists: Lists, private popoverCtrl: PopoverController) {}

  open() {
    this.navCtrl.push('StoryDetailPage', { story: this.story, id: this.story && this.story.id });
  }

  bookmark(ev: Event) {
    ev.stopPropagation();
    if (!this.user.isLoggedIn()) return;
    this.popoverCtrl.create('BookmarkPopover', { story: this.story }).present({ ev });
  }
}
