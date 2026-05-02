import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, PopoverController, AlertController, ActionSheetController } from 'ionic-angular';
import { SocialSharing } from '@ionic-native/social-sharing';
import { BrowserTab } from '@ionic-native/browser-tab';
import { TranslateService } from '@ngx-translate/core';

import { Story } from '../../models/story';
import { Author } from '../../models/author';
import { Stories, Settings, User, Categories, Files, Filters, UX } from '../../providers/providers';
import { handleNoCordovaError } from '../../app/utils';
import { Category } from '../../models/category';

@IonicPage({ priority: 'low', segment: 'story/:id' })
@Component({
  selector: 'page-story-detail',
  templateUrl: 'story-detail.html',
})
export class StoryDetailPage {
  story: Story;
  myrating: number;
  rating: boolean = false;
  commentsTotal: number = 0;
  commentsCursor: number = 0;
  commentsLoading: boolean = false;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public alertCtrl: AlertController,
    private popoverCtrl: PopoverController,
    public translate: TranslateService,
    public c: Categories,
    public stories: Stories,
    public settings: Settings,
    public user: User,
    private socialSharing: SocialSharing,
    private browser: BrowserTab,
    public files: Files,
    public filters: Filters,
    public ux: UX,
    public actionSheetCtrl: ActionSheetController,
  ) {
    this.story = navParams.get('story');
    if (!this.story) {
      // Deep-link entry: only the id is in the URL. Stub a placeholder so the
      // refetch path below populates it. If the id is missing too, bail out.
      const idParam = navParams.get('id');
      if (idParam == null) {
        this.navCtrl.pop();
        return;
      }
      this.story = { id: String(idParam), cached: false } as Story;
    }
    this.stories.hydrateMyRating(this.story);
    this.myrating = this.story && this.story.myrating;

    // URL deep-link entry: nav params carry only `{id}` so title/author/
    // category etc. are missing. Fetch rich metadata first; the regular
    // getById content path doesn't include those fields.
    const needsRichMetadata = !this.story.title;

    const loadRest = () => {
      if (this.story.cached) {
        this.loadComments();
        return;
      }
      this.stories.getById(this.story.id).subscribe(story => {
        if (!story) {
          this.navCtrl.pop();
          return;
        }
        this.stories.hydrateMyRating(story);
        this.myrating = story.myrating;
        this.story.series = story.series;
        this.story.length = story.length;
        this.story.lang = story.lang;
        this.loadComments();
      });
    };

    if (needsRichMetadata) {
      this.stories.getRichById(this.story.id).subscribe(rich => {
        if (rich) {
          Object.assign(this.story, rich);
          this.stories.hydrateMyRating(this.story);
          this.myrating = this.story.myrating;
        }
        loadRest();
      });
    } else {
      loadRest();
    }
  }

  // Pulls comments via 3/stories/{slug}/comments/after. With after=0 we replace
  // the list (initial load); otherwise we append for "load more". The cursor
  // is the id of the last comment we've seen.
  loadComments(append: boolean = false) {
    if (!this.story || !this.story.commentsenabled || this.commentsLoading) return;
    this.commentsLoading = true;
    const after = append ? this.commentsCursor : 0;
    this.stories.getComments(this.story, after).subscribe(res => {
      // Hide comments by blocked authors. Total stays as the API total so the
      // user can still pull the next page; the visible count just goes down.
      const visible = (res.comments || []).filter(c => !this.filters.isAuthorBlocked(c.userId));
      this.story.comments = append ? (this.story.comments || []).concat(visible) : visible;
      this.commentsTotal = res.total;
      this.commentsCursor = res.lastId;
      this.commentsLoading = false;
    });
  }

  openCommenterMenu(comment: { user: string; userId: string }, ev: UIEvent) {
    if (ev) ev.stopPropagation();
    if (!comment || !comment.userId) return;

    this.translate.get(['COMMENTACTION_VIEW_PROFILE', 'STORYACTION_BLOCK_AUTHOR', 'CANCEL_BUTTON']).subscribe(t => {
      this.actionSheetCtrl
        .create({
          title: comment.user || '',
          buttons: [
            {
              text: t.COMMENTACTION_VIEW_PROFILE,
              icon: 'person',
              handler: () => this.viewCommenter(comment),
            },
            {
              text: t.STORYACTION_BLOCK_AUTHOR,
              role: 'destructive',
              icon: 'eye-off',
              handler: () => this.blockCommenter(comment),
            },
            { text: t.CANCEL_BUTTON, role: 'cancel' },
          ],
        })
        .present();
    });
  }

  private viewCommenter(comment: { user: string; userId: string }) {
    if (this.settings.allSettings.offlineMode) return;
    const author = new Author({ id: comment.userId, name: comment.user || '' });
    this.navCtrl.push('AuthorPage', { author, id: author && author.id });
  }

  private blockCommenter(comment: { user: string; userId: string }) {
    this.filters.addBlockedAuthor(comment.userId, comment.user || '');
    this.ux.showToast('INFO', 'AUTHOR_BLOCKED');
    if (this.story && this.story.comments) {
      this.story.comments = this.story.comments.filter(c => !this.filters.isAuthorBlocked(c.userId));
    }
  }

  hasMoreComments(): boolean {
    return !!this.story && !!this.story.comments && this.story.comments.length < this.commentsTotal;
  }

  showAuthor(author: Author) {
    if (this.settings.allSettings.offlineMode) return;
    this.navCtrl.push('AuthorPage', {
      author,
      id: author && author.id,
    });
  }

  readStory() {
    if (!this.story || !this.story.id) return;
    this.navCtrl.push('StoryViewPage', {
      story: this.story,
      id: this.story.id,
    });
  }

  showSeries() {
    this.navCtrl.push('StorySeriesPage', {
      story: this.story,
      seriesId: this.story && this.story.series,
    });
  }

  showRelated() {
    this.navCtrl.push('StoryRelatedPage', {
      story: this.story,
    });
  }

  rate(n: number) {
    if (!this.story || this.rating || !n || n < 1 || n > 5) return;
    if (this.story.myrating === n) return;
    this.rating = true;
    this.stories.rate(this.story, n).subscribe(ok => {
      this.rating = false;
      if (ok) this.myrating = this.story.myrating;
    });
  }

  search(query: string | number) {
    if (this.settings.allSettings.offlineMode) return;
    this.navCtrl.push('SearchPage', {
      query,
    });
  }

  category(story: Story) {
    if (this.settings.allSettings.offlineMode) return;
    this.translate.get(['STORYDETAIL_VIEWCAT', 'TOP', 'NEW']).subscribe(values => {
      const alert = this.alertCtrl.create({
        title: values.STORYDETAIL_VIEWCAT,
        buttons: [
          {
            text: values.TOP,
            handler: d => {
              this.openCategoryListPage(story, 'top');
            },
          },
          {
            text: values.NEW,
            handler: d => {
              this.openCategoryListPage(story as any, 'new');
            },
          },
        ],
      });
      alert.present();
    });
  }

  openCategoryListPage(story: Story, sortOrder: string) {
    this.c.getClosestCategory((story.categoryID || story.category).toString()).subscribe((cat: Category) => {
      this.navCtrl.push('TopListPage', {
        category: cat,
        order: sortOrder,
      });
    });
  }

  openListPicker(ev: UIEvent) {
    const popover = this.popoverCtrl.create(
      'BookmarkPopover',
      {
        story: this.story,
      },
      { cssClass: 'bookmark-popover' },
    );

    popover.present({
      ev,
    });
  }

  share() {
    this.socialSharing.share(null, null, null, this.story.url).catch(err =>
      handleNoCordovaError(err, () => {
        this.translate.get('COPYPROMPT_MSG').subscribe(label => prompt(label, this.story.url));
      }),
    );
  }

  export() {
    const filename = `litapp-story-${this.story.url}-${Math.round(new Date().getTime() / 1000)}.html`;
    const data = `
<html>
<body>
  <h1>
    <a href="https://www.literotica.com/s/${this.story.url}">${this.story.title}</a>
    (by <a href="https://www.literotica.com/stories/memberpage.php?uid=${this.story.author.id}">${this.story.author.name})</a>
  </h1>

  <ul>
    <li>Category: ${this.c.nameSync(this.story.categoryID)} (Tags: [${this.story.tags.join(', ')}])</li>
    <li>Rating: ${this.story.rating} (${this.story.viewcount} views)</li>
    <li>${this.story.length} pages</li>
    <li>Timestamp: ${new Date(parseInt(this.story.timestamp) * 1000).toISOString()}</li>
  </ul>

  <article>

    ${this.story.content.join('<br><hr><br>')}

  </article>

</body>
</html>
  `;

    this.files.save(filename, data, 'text/html');
  }

  toggleDownload() {
    if (this.story.downloaded) {
      this.stories.undownload(this.story);
    } else {
      this.stories.download(this.story);
    }
  }

  // updates part of story
  refreshStory() {
    // getById refreshes structure (content / pages / series id), getMetadata
    // refreshes the live badges + counts (is_new, is_hot, rate, view_count, ...)
    // that the pages endpoint doesn't return.
    this.stories.getById(this.story.id, true).subscribe(story => {
      this.updateValues(story);
      this.stories.getMetadata(this.story.id).subscribe(meta => {
        if (meta) this.updateValues(meta);
        this.myrating = this.story.myrating;
        this.stories.cache(this.story);
      });
    });
  }

  openLink() {
    this.browser.openUrl(this.story.url).catch(err => handleNoCordovaError(err, () => window.open(this.story.url)));
  }

  // quick and dirty fix
  private updateValues(story: Story) {
    const fields: any = Object.assign({}, story);
    const blackListedKeys = ['downloaded', 'cached', 'currentpage'];
    for (const f in this.story) {
      if (!blackListedKeys.includes(f) && fields[f] !== undefined) {
        (this.story as any)[f] = fields[f];
      }
    }
  }
}
