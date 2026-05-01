import { Component, ViewChild } from '@angular/core';
import { IonicPage, NavController, AlertController, PopoverController, Content } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Storage } from '@ionic/storage';

import { Stories, Settings, History, Series } from '../../providers/providers';
import { summarizeSeries } from '../../providers/series';
import { Story } from '../../models/story';

interface SeriesCard {
  seriesId: string;
  title: string;
  representative?: Story;
  authorName?: string;
  chaptersCount: number;
  totalViews: number;
  totalComments: number;
  totalFavorites: number;
  totalLists: number;
  categoryID?: number;
  isHot: boolean;
  newChapters: Story[];
  expanded: boolean;
}

@IonicPage({ priority: 'high' })
@Component({
  selector: 'page-history',
  templateUrl: 'history.html',
})
export class HistoryPage {
  filteredStories: Story[] = [];
  followedSeriesView: SeriesCard[] = [];
  totalNewChapters: number = 0;
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

      if (this.settings.allSettings.offlineMode) return;

      // Display metadata isn't persisted — fetch chapters on entry whenever the
      // in-memory cache is missing entries (fresh session, just-followed series,
      // etc.). poll() populates seriesFollow.chapters and re-diffs newChapters.
      const followed = this.seriesFollow.followed;
      const needsLoad = Object.keys(followed).some(id => !this.seriesFollow.getChapters(id));
      if (needsLoad || this.seriesFollow.isPollDue()) {
        this.seriesFollow.poll(needsLoad).then(() => this.refreshShelves());
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
    const followed = this.seriesFollow.followed;
    const prevExpanded = new Set(this.followedSeriesView.filter(c => c.expanded).map(c => c.seriesId));
    const cards: SeriesCard[] = [];

    Object.keys(followed).forEach(seriesId => {
      const chapters = this.seriesFollow.getChapters(seriesId);
      if (!chapters || !chapters.length) return; // not yet fetched this session
      const summary = summarizeSeries(seriesId, chapters);
      const newChapters = this.seriesFollow.getUnreadChapters(seriesId);
      cards.push({
        seriesId,
        newChapters,
        title: summary.title,
        representative: summary.representative,
        authorName: summary.authorName,
        chaptersCount: summary.chaptersCount,
        totalViews: summary.totalViews,
        totalComments: summary.totalComments,
        totalFavorites: summary.totalFavorites,
        totalLists: summary.totalLists,
        categoryID: summary.categoryID,
        isHot: summary.isHot,
        expanded: prevExpanded.has(seriesId) || newChapters.length > 0,
      });
    });

    cards.sort((a, b) => b.newChapters.length - a.newChapters.length);
    this.followedSeriesView = cards;
    this.totalNewChapters = cards.reduce((sum, c) => sum + c.newChapters.length, 0);
  }

  toggleCard(card: SeriesCard) {
    card.expanded = !card.expanded;
  }

  formatCount(n: any): string {
    const v = Number(n);
    if (!v || isNaN(v)) return '0';
    if (v >= 1000000) return `${Math.round(v / 100000) / 10}m`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(v);
  }

  openCardSeries(card: SeriesCard) {
    this.navCtrl.push('StorySeriesPage', { seriesId: card.seriesId });
  }

  unfollowCard(card: SeriesCard, ev: Event) {
    if (ev) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    this.seriesFollow.unfollow(card.seriesId);
    this.refreshShelves();
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
