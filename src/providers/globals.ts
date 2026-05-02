import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';
import { Platform, PopoverController } from 'ionic-angular';

import { Api } from './shared/api';
import { User } from './user';
import { GLOBALS_KEY, VERSION_KEY } from './db';
import { ENV } from '../app/env';
import { UX } from './shared/ux';
import { ApiLanguage, AppJsonResponse, ConstantsResponse, TagsportalTopResponse } from '../models/api';

@Injectable()
export class Globals {
  private globals: ConstantsResponse;
  private ready: Promise<void>;
  private version = 25; // just increase number, unrelated to version number

  constructor(
    public api: Api,
    public platform: Platform,
    public user: User,
    public storage: Storage,
    public translate: TranslateService,
    public ux: UX,
    private popoverCtrl: PopoverController,
  ) {
    this.storage.get(VERSION_KEY).then(v => {
      if (v && v !== this.version) {
        setTimeout(() => {
          this.ux.showToast('INFO', 'UPDATED_MSG', 15000);
          this.user.removeStoredUser();
        }, 2000);
      }

      this.storage.set(VERSION_KEY, this.version);
    });

    this.ready = new Promise((resolve, reject) => {
      this.storage.get(GLOBALS_KEY).then(d => {
        if (d) {
          this.globals = d;
          resolve();
        } else {
          this.query().subscribe(() => {
            resolve();
          });
        }
      });
    });
  }

  onReady() {
    return this.ready;
  }

  // these getters assume globals has already been cached and loaded

  getLanguage(id: number): string | null {
    if (!this.globals || !this.globals.languages) return null;
    const langs = this.globals.languages as { [shortname: string]: ApiLanguage };
    const match = Object.keys(langs).find(k => Number(langs[k].id) === id);
    return match ? langs[match].shortname : null;
  }

  getSearchableLanguages(): { id: string; name: string }[] {
    if (!this.globals || !this.globals.languages) return [];
    const langs = this.globals.languages as { [shortname: string]: ApiLanguage };
    return Object.keys(langs)
      .map(k => langs[k])
      .filter(lang => !!lang.domain)
      .map(lang => ({ id: String(lang.id), name: lang.longname }));
  }

  getPopularTags() {
    const params = {
      limit: 100,
      periodCheck: false,
      period: 'all',
    };
    return this.api.get<TagsportalTopResponse>('3/tagsportal/top', params);
  }

  getVersion() {
    return this.version;
  }

  isDev() {
    // Override to show everything when developing in browser
    return ENV.DEV;
  }

  isWebApp() {
    // Override to show everything when developing in browser
    return !this.platform.is('cordova') && !this.isDev();
  }

  checkForUpdates(manual: boolean = false) {
    if (this.isWebApp()) return;
    // check for updates
    if (manual) this.ux.showToast('INFO', 'UPDATE_STARTED', 2000);
    this.api
      .get<AppJsonResponse>('app.json', undefined, undefined, 3)
      .catch(error => {
        console.error('globals.checkForUpdates', error);
        return Observable.of(null as AppJsonResponse | null);
      })
      .subscribe(d => {
        if (d) {
          if (d.appid !== this.api.appid) {
            this.api.appid = d.appid;
          }
          if (d.apikey !== this.api.apikey) {
            this.api.apikey = d.apikey;
          }

          if (d.version > this.version) {
            this.ux.showToast('INFO', 'UPDATE_MSG', 15000, 'VIEW_BUTTON', true).then(() => {
              this.popoverCtrl.create('UpdatePopover', { data: d }, { cssClass: 'dark-backdrop' }).present();
            });
          } else {
            if (manual) this.ux.showToast('INFO', 'UPDATE_ALREADYDONE', undefined, undefined, true);
          }
        } else {
          this.ux.showToast('ERROR', 'UPDATE_FAILEDMSG', undefined, undefined, true);
        }
      });
  }

  private query() {
    if (this.globals) return Observable.of(this.globals);

    const loader = this.ux.showLoader();
    return this.api
      .get<ConstantsResponse>('3/constants', null, null, null, 10000)
      .map(d => {
        if (loader) loader.dismiss();
        if (!d) {
          this.ux.showToast();
          console.error('globals.query');
          return null;
        }

        this.globals = d;
        this.storage.set(GLOBALS_KEY, this.globals);
        return this.globals;
      })
      .catch(error => {
        if (loader) loader.dismiss();
        this.ux.showToast();
        console.error('globals.query', error);
        return Observable.of(null);
      });
  }
}
