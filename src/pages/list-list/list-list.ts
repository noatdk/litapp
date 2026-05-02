import { Component } from '@angular/core';
import { IonicPage, NavController } from 'ionic-angular';

import { List } from '../../models/list';
import { Lists } from '../../providers/providers';

@IonicPage({ priority: 'high', segment: 'lists' })
@Component({
  selector: 'page-list-list',
  templateUrl: 'list-list.html',
})
export class ListListPage {
  lists: List[];
  showLoader = false;

  constructor(public navCtrl: NavController, public l: Lists) {
    this.showLoader = true;
    this.l.onReady().then(() => {
      this.refreshLists();
    });
  }

  openList(list: List) {
    this.navCtrl.push('ListViewPage', {
      list,
    });
  }

  addList() {
    this.navCtrl.push('ListCreatePage', {
      callback: () => this.refreshLists(),
    });
  }

  edit(list: List, item, event) {
    event.stopPropagation();
    item.close();
    this.navCtrl.push('ListCreatePage', {
      list,
    });
  }

  delete(list: List, item, event) {
    event.stopPropagation();
    this.l.delete(list).subscribe(d => {
      if (d) {
        item.close();
        this.refreshLists();
      }
    });
  }

  // Pick a glyph that matches the Author Lists section. Checks urlname AND
  // name because Literotica uses different urlname conventions per type
  // (e.g. 'interactive' / 'ink' for story games), so name is a reliable
  // English fallback for the default-list catalogue.
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

  private refreshLists(force: boolean = false) {
    const callback = (data: List[] | null | undefined) => {
      if (data) {
        this.lists = [];
        data.forEach(d => this.lists.push(d));
        this.showLoader = false;
      }
    };

    if (force) {
      this.l.refresh().subscribe(callback);
    } else {
      this.l.query(true).subscribe(callback);
    }
  }
}
