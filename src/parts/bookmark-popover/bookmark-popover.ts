import { Component } from '@angular/core';
import { Platform, IonicPage, NavParams, ViewController } from 'ionic-angular';

import { Story } from '../../models/story';
import { List } from '../../models/list';
import { Lists } from '../../providers/providers';

@IonicPage({ priority: 'low' })
@Component({
  selector: 'bookmark-popover',
  templateUrl: 'bookmark-popover.html',
})
export class BookmarkPopover {
  alllists: List[];
  story: Story;

  unregister;

  constructor(navParams: NavParams, public platform: Platform, public viewCtrl: ViewController, public l: Lists) {
    this.story = navParams.get('story');

    this.l.onReady().then(() => {
      this.l.query().subscribe(data => {
        if (data) {
          this.alllists = data;
        }
      });
    });
  }

  ionViewDidEnter() {
    this.unregister = this.platform.registerBackButtonAction(() => {
      this.viewCtrl.dismiss();
      this.unregister();
    });
  }

  ionViewDidLeave() {
    this.unregister();
  }

  hasStory(list: List): boolean {
    return !!list && !!list.stories && list.stories.some(s => s.id === this.story.id);
  }

  // Mirrors list-list.ts so the picker shows the same per-type glyph as the
  // My Lists page (paper/musical-notes/image/game-controller-b, default
  // bookmark). urlname AND name are checked because Literotica's urlname
  // conventions differ across submission types.
  listIconFor(list: List): string {
    const haystack = `${(list && list.urlname) || ''} ${(list && list.name) || ''}`.toLowerCase();
    if (haystack.indexOf('poem') >= 0) return 'paper';
    if (haystack.indexOf('audio') >= 0) return 'musical-notes';
    if (haystack.indexOf('artwork') >= 0) return 'image';
    if (haystack.indexOf('illustra') >= 0) return 'image';
    if (haystack.indexOf('game') >= 0) return 'game-controller-b';
    if (haystack.indexOf('ink') >= 0) return 'game-controller-b';
    if (haystack.indexOf('interactive') >= 0) return 'game-controller-b';
    return 'bookmark';
  }

  toggleFromList(list: List) {
    if (!list.stories) {
      // load list before adding
      this.l.getById(list.urlname).subscribe();
    } else {
      if (list.stories.some(s => s.id === this.story.id)) {
        this.l.removeStory(list, this.story);

        // Cheap hack to use the focus state as a loading indicator when adding items
        // TODO: no indicator when removing items from a list
        if (document.activeElement) (document.activeElement as HTMLElement).blur();
      } else {
        this.l.addStory(list, this.story);
      }
    }
  }
}
