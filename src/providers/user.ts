import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import 'rxjs/add/operator/toPromise';
import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';

import { USER_KEY, FEED_KEY, LIST_KEY } from './db';
import { Api } from './shared/api';
import { Settings } from './settings';
import { UX } from './shared/ux';

const AUTH_URL_INDEX = 6;

@Injectable()
export class User {
  private user: any;
  private ready;

  constructor(public api: Api, public settings: Settings, public storage: Storage, public translate: TranslateService, public ux: UX) {
    this.ready = new Promise((resolve, reject) => {
      Promise.all([this.settings.load(), this.storage.get(USER_KEY)]).then(data => {
        if (!this.settings.allSettings.offlineMode && data[1]) {
          this.user = data[1];
          if (this.user.date + 1000 * 60 * 60 * 24 * 360 < new Date().getTime()) {
            setTimeout(() => {
              this.ux.showToast('INFO', 'SESSIONTIMEOUT_MSG', 15000);
              this.removeStoredUser();
            }, 2000);
          } else {
            this.refreshAuthToken();
          }
        }
        resolve();
      });
    });
  }

  private refreshAuthToken() {
    this.api
      .get(
        `check?timestamp=${Math.floor(Date.now() / 1000)}`,
        null,
        { withCredentials: true, responseType: 'text' },
        AUTH_URL_INDEX,
      )
      .toPromise()
      .catch(() => null);
  }

  onReady() {
    return this.ready;
  }

  login(info: any) {
    const loader = this.ux.showLoader();

    const body = new URLSearchParams();
    body.set('login', info.username);
    body.set('password', info.password);

    return Observable.fromPromise(
      this.api.http
        .post('https://auth.literotica.com/login?redirect=www.literotica.com', body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          withCredentials: true,
          observe: 'response',
          responseType: 'text',
        })
        .toPromise()
        .then(() =>
          this.api.http
            .get(`https://auth.literotica.com/check?timestamp=${Math.floor(Date.now() / 1000)}&redirect=https://www.literotica.com/`, {
              withCredentials: true,
              observe: 'response',
              responseType: 'text',
            })
            .toPromise()
            .catch(() => null),
        )
        .then(() => this.api.get(`3/users/${info.username}`).toPromise())
        .then((res: any) => {
          if (loader) loader.dismiss();
          if (!res || !res.user || !res.user.userid) throw { error: { error: 'invalid response' } };
          this.user = {
            id: res.user.userid,
            username: res.user.username,
            session: '',
            date: new Date().getTime(),
          };
          this.storage.set(USER_KEY, this.user);
          return { success: true };
        })
        .catch((err: any) => {
          if (loader) loader.dismiss();
          throw err.error ? err : { error: { error: err.message || 'login failed' } };
        }),
    );
  }

  isLoggedIn(): boolean {
    return this.user && !this.settings.allSettings.offlineMode;
  }

  getId() {
    return this.user.id;
  }

  getName() {
    return this.user.username;
  }

  getSession() {
    return this.user.session;
  }

  getDetails() {
    return this.user;
  }

  checkIfEverythingIsFucked() {
    return new Promise(resolve => {
      this.storage.get(USER_KEY).then(user => {
        if (JSON.stringify(this.user) !== JSON.stringify(user)) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  removeStoredUser(): Promise<void[]> {
    return Promise.all([this.storage.remove(USER_KEY), this.storage.remove(FEED_KEY), this.storage.remove(LIST_KEY)]);
  }

  logout() {
    this.user = null;
    this.removeStoredUser().then(() => {
      window.location.reload();
    });
  }
}
