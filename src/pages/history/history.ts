import { Component, ViewChild } from '@angular/core';
import { IonicPage, NavController, AlertController, PopoverController, Content } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Storage } from '@ionic/storage';

import { Stories, Settings, History, Series } from '../../providers/providers';
import { Story } from '../../models/story';

@IonicPage({ priority: 'high' })
@Component({
  selector: 'page-history',
  templateUrl: 'history.html',
})
export class HistoryPage {
  filteredStories: Story[] = [];
  inProgress: Story[] = [];
  newChapters: Story[] = [];
  sortMethod: string;
  openSegment: 'history' | 'series' = 'history';

  @ViewChild(Content) content: Content;

  HISTORY_LIMIT = History.HISTORY_LIMIT;

  onlyDownloaded = false;
  private translations;

  constructor(
    private translate: TranslateService,
    public navCtrl: NavController,
    public alertCtrl: AlertController,
    public storage: Storage,
    public s: Stories,
    public history: History,
    public settings: Settings,
    private popoverCtrl: PopoverController,
    public seriesFollow: Series,
  ) {
    this.translate.get(['HISTORY_TOOLTIP_CLEAR', 'CONFIRM', 'OK_BUTTON', 'CANCEL_BUTTON']).subscribe(values => {
      this.translations = values;
    });
  }

  ionViewWillEnter() {
    Promise.all([this.history.onReady(), this.settings.load(), this.seriesFollow.onReady()]).then(() => {
      this.onlyDownloaded = this.settings.allSettings.offlineMode;
      this.buildList();
      this.refreshShelves();

      if (!this.settings.allSettings.offlineMode && this.seriesFollow.isPollDue()) {
        this.seriesFollow.poll().then(() => this.refreshShelves());
      }
    });
  }

  ionViewDidEnter() {
    if (this.content) {
      this.content.resize();
    }
  }

  segmentChanged() {
    if (this.content) {
      this.content.resize();
    }
  }

  private refreshShelves() {
    // In-progress: stories the user has started but not finished, restricted
    // to chapters that belong to a followed (bookmarked) series. Most-recent
    // first. Excludes stories not actually paginated yet (length 0).
    this.inProgress = this.history
      .getStories()
      .slice()
      .reverse()
      .filter(
        s =>
          s &&
          s.length &&
          s.currentpage > 0 &&
          s.currentpage < s.length - 1 &&
          this.seriesFollow.isFollowed(s.series),
      );

    this.newChapters = this.seriesFollow.getAllNewChapters();
  }

  toggleDownloaded() {
    this.onlyDownloaded = !this.onlyDownloaded;
    this.buildList();
  }

  private buildList() {
    if (this.onlyDownloaded) {
      this.history.getDownloadStories().then(list => (this.filteredStories = list));
    } else {
      this.filteredStories = this.history.getStories().reverse();
    }
  }

  clearAll() {
    this.alertCtrl
      .create({
        title: this.translations.HISTORY_TOOLTIP_CLEAR,
        message: this.translations.CONFIRM,
        buttons: [
          {
            text: this.translations.OK_BUTTON,
            handler: () => {
              this.onlyDownloaded = false;
              this.history.reset();
              this.buildList();
            },
          },
          { text: this.translations.CANCEL_BUTTON },
        ],
      })
      .present();
  }

  delete(story: Story) {
    this.history.remove(story, this.onlyDownloaded).then(() => this.buildList());
  }

  download(story: Story) {
    this.s.download(story);
  }

  openSortPopover(ev: UIEvent) {
    const popover = this.popoverCtrl.create('SortPopover', {
      sortMethod: this.sortMethod,
    });

    popover.present({
      ev,
    });
    popover.onDidDismiss(method => {
      if (method !== null) {
        this.sortMethod = method;
      }
    });
  }
}
