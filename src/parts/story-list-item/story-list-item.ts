import { Component, Input, Output, EventEmitter } from '@angular/core';
import { NavController, PopoverController, LoadingController, ActionSheetController } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';

import { Lists, Memos, User, Filters, UX, Categories } from '../../providers/providers';
import { Story } from '../../models/story';
import { Author } from '../../models/author';

@Component({
  selector: 'story-list-item',
  templateUrl: 'story-list-item.html',
})
export class StoryListItem {
  Math: Math = Math;

  @Input() story: Story;
  @Input() ishistory: boolean = false;
  @Output() onDeleteBySwiping: EventEmitter<any> = new EventEmitter();
  @Output() onDownloadBySwiping: EventEmitter<any> = new EventEmitter();

  constructor(
    public navCtrl: NavController,
    private popoverCtrl: PopoverController,
    private loadingCtrl: LoadingController,
    public user: User,
    public lists: Lists,
    public memos: Memos,
    public filters: Filters,
    public ux: UX,
    public categories: Categories,
    public actionSheetCtrl: ActionSheetController,
    public translate: TranslateService,
  ) {}

  pressPosition = null;
  pressTimer = null;

  resetTouch() {
    clearTimeout(this.pressTimer);
    this.pressPosition = null;
    this.pressTimer = null;
  }

  handleTouchStart(story: Story, event: TouchEvent) {
    this.resetTouch();
    if (event.touches.length !== 1) return;

    this.pressPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    this.pressTimer = setTimeout(() => {
      this.openStoryDetail(story);
    }, 650);
  }

  handleTouchMove(story: Story, event: TouchEvent) {
    if (event.touches.length !== 1 || !this.pressPosition) return;
    const allowedMove = 30;

    if (
      Math.abs(event.touches[0].clientX - this.pressPosition.x) > allowedMove ||
      Math.abs(event.touches[0].clientY - this.pressPosition.y) > allowedMove
    ) {
      this.resetTouch();
    }
  }

  handleTouchEnd(story: Story, event: TouchEvent) {
    this.resetTouch();
  }

  handleClick(story: Story, event) {
    this.resetTouch();
    this.openStory(story);
  }

  openStory(story: Story) {
    const minSizeForLoader = 35;

    let loader;
    if (story.length > minSizeForLoader) {
      loader = this.loadingCtrl.create({ spinner: 'crescent' });
      loader.present();
    }

    setTimeout(
      () => {
        this.navCtrl.push('StoryViewPage', {
          story,
          loader,
        });
      },
      story.length > minSizeForLoader ? 100 : 0,
    );
  }

  openStoryDetail(story: Story) {
    this.navCtrl.push('StoryDetailPage', {
      story,
    });
  }

  showAuthor(author: Author, event) {
    event.stopPropagation();
    this.navCtrl.push('AuthorPage', {
      author,
    });
  }

  openListPicker(story: Story, ev: UIEvent) {
    ev.stopPropagation();
    const popover = this.popoverCtrl.create('BookmarkPopover', {
      story,
    });

    popover.present({
      ev,
    });
  }

  openMemo(kind: 'story' | 'series', id: any) {
    if (id == null) return;
    this.popoverCtrl
      .create('MemoPopover', { kind, id }, { cssClass: 'memo-popover' })
      .present();
  }

  openActionsMenu(story: Story, ev: UIEvent) {
    ev.stopPropagation();
    if (!story) return;

    const hasAuthor = !!(story.author && story.author.id != null);
    const hasSeries = !!(story.series && Number(story.series) > 0);
    const hasCategory = story.categoryID != null;
    const isAuthorBlocked = hasAuthor && this.filters.isAuthorBlocked(story.author.id);
    const isSeriesBlocked = hasSeries && this.filters.isSeriesBlocked(story.series);
    const isCategoryBlocked = hasCategory && this.filters.isCategoryBlocked(story.categoryID);

    this.translate
      .get([
        'STORYACTION_BLOCK_AUTHOR',
        'STORYACTION_UNBLOCK_AUTHOR',
        'STORYACTION_BLOCK_SERIES',
        'STORYACTION_UNBLOCK_SERIES',
        'STORYACTION_BLOCK_CATEGORY',
        'STORYACTION_UNBLOCK_CATEGORY',
        'AUTHOR_BLOCKED',
        'AUTHOR_UNBLOCKED',
        'SERIES_BLOCKED',
        'SERIES_UNBLOCKED',
        'CATEGORY_BLOCKED',
        'CATEGORY_UNBLOCKED',
        'MEMO_BUTTON',
        'MEMO_SERIES_BUTTON',
        'CANCEL_BUTTON',
      ])
      .subscribe(t => {
        const buttons: any[] = [];

        if (story.id != null) {
          buttons.push({
            text: t.MEMO_BUTTON,
            icon: 'paper',
            handler: () => this.openMemo('story', story.id),
          });
        }

        if (hasSeries) {
          buttons.push({
            text: t.MEMO_SERIES_BUTTON,
            icon: 'albums',
            handler: () => this.openMemo('series', story.series),
          });
        }

        if (hasAuthor) {
          buttons.push({
            text: isAuthorBlocked ? t.STORYACTION_UNBLOCK_AUTHOR : t.STORYACTION_BLOCK_AUTHOR,
            icon: isAuthorBlocked ? 'eye' : 'eye-off',
            role: isAuthorBlocked ? undefined : 'destructive',
            handler: () => {
              if (isAuthorBlocked) {
                this.filters.removeBlockedAuthor(story.author.id);
                this.ux.showToast('INFO', 'AUTHOR_UNBLOCKED');
              } else {
                this.filters.addBlockedAuthor(story.author.id, story.author.name || '');
                this.ux.showToast('INFO', 'AUTHOR_BLOCKED');
              }
            },
          });
        }

        if (hasSeries) {
          buttons.push({
            text: isSeriesBlocked ? t.STORYACTION_UNBLOCK_SERIES : t.STORYACTION_BLOCK_SERIES,
            icon: 'albums',
            role: isSeriesBlocked ? undefined : 'destructive',
            handler: () => {
              if (isSeriesBlocked) {
                this.filters.removeBlockedSeries(story.series);
                this.ux.showToast('INFO', 'SERIES_UNBLOCKED');
              } else {
                this.filters.addBlockedSeries(story.series, '');
                this.ux.showToast('INFO', 'SERIES_BLOCKED');
              }
            },
          });
        }

        if (hasCategory) {
          buttons.push({
            text: isCategoryBlocked ? t.STORYACTION_UNBLOCK_CATEGORY : t.STORYACTION_BLOCK_CATEGORY,
            icon: isCategoryBlocked ? 'folder' : 'folder-open',
            role: isCategoryBlocked ? undefined : 'destructive',
            handler: () => {
              if (isCategoryBlocked) {
                this.filters.removeBlockedCategory(story.categoryID);
                this.ux.showToast('INFO', 'CATEGORY_UNBLOCKED');
              } else {
                this.filters.addBlockedCategory(
                  story.categoryID,
                  this.categories.nameSync(story.categoryID),
                );
                this.ux.showToast('INFO', 'CATEGORY_BLOCKED');
              }
            },
          });
        }

        buttons.push({ text: t.CANCEL_BUTTON, role: 'cancel' });

        this.actionSheetCtrl
          .create({ title: story.title || '', buttons })
          .present();
      });
  }

  delete(story: Story, slidingItem: any) {
    slidingItem.close();
    this.onDeleteBySwiping.emit(story);
  }

  download(story: Story, slidingItem: any) {
    slidingItem.close();
    this.onDownloadBySwiping.emit(story);
  }
}
