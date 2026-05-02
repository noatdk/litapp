import { Component } from '@angular/core';
import { IonicPage, NavParams, ViewController } from 'ionic-angular';
import { BrowserTab } from '@ionic-native/browser-tab';
import { ENV } from '../../app/env';
import { handleNoCordovaError } from '../../app/utils';
import { Api } from '../../providers/providers';
import { AppJsonResponse, GithubRefsTagsResponse, GithubTag } from '../../models/api';

@IonicPage()
@Component({
  selector: 'update-popover',
  template: `
    <div class="main">
      <h2>{{ 'SETTINGS_UPDATE_TITLE' | translate }} v{{ data.versionName }}</h2>

      <pre>
        {{ changelog }}
      </pre
      >

      <div>
        <button ion-button (click)="cancel()" color="light">{{ 'CANCEL_BUTTON' | translate }}</button>
        <button ion-button (click)="update()">{{ 'DOWNLOAD_BUTTON' | translate }}</button>
      </div>
    </div>
  `,
  styles: [
    `
      .main {
        padding: 20px;
      }

      pre {
        min-height: 180px;
        white-space: pre-line;
        overflow-y: auto;
        max-height: 40vh;
      }
    `,
  ],
})
export class UpdatePopover {
  data: Partial<AppJsonResponse>;
  changelog: string;

  constructor(navParams: NavParams, private viewCtrl: ViewController, private browser: BrowserTab, private api: Api) {
    this.data = navParams.get('data') || {};

    const tagsRepo = ENV.GITHUB_TAGS_REPO || 'theilluminatus/litapp';
    this.api.get<GithubRefsTagsResponse>(`repos/${tagsRepo}/git/refs/tags`, undefined, undefined, 5).subscribe(list => {
      const tagSha = Array.isArray(list) ? list.reverse()[0].object.sha : '';
      if (!tagSha) return;
      this.api.get<GithubTag>(`repos/${tagsRepo}/git/tags/${tagSha}`, undefined, undefined, 5).subscribe(tag => {
        this.changelog = ((tag && tag.message) || '').replace(/\n/gi, '\n\n');
      });
    });
  }

  cancel() {
    this.viewCtrl.dismiss();
  }

  update() {
    const updateLink = this.data.updatelink || 'https://theilluminatus.github.io/litapp';
    this.browser.openUrl(updateLink).catch(err => handleNoCordovaError(err, () => window.open(updateLink)));
  }
}
