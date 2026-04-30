import { Component } from '@angular/core';
import { IonicPage, NavController, AlertController, PopoverController } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Storage } from '@ionic/storage';

import { Stories, Settings, History, SeriesFollow } from '../../providers/providers';
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
    public seriesFollow: SeriesFollow,
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

      // Daily-cap polling for new chapters in followed series. Triggered when
      // the user lands on the History tab so it doesn't hit the network on
      // app start when the user might just be reading an open story.
      if (!this.settings.allSettings.offlineMode && this.seriesFollow.isPollDue()) {
        this.seriesFollow.poll().then(() => this.refreshShelves());
      }
    });
  }

  private refreshShelves() {
    // In-progress: stories the user has started but not finished. Most-
    // recent first. Excludes stories not actually paginated yet (length 0).
    this.inProgress = this.history
      .getStories()
      .slice()
      .reverse()
      .filter(s => s && s.length && s.currentpage > 0 && s.currentpage < s.length - 1);

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
