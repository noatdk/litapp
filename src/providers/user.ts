import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import 'rxjs/add/operator/toPromise';
import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';

import { USER_KEY, FEED_KEY, LIST_KEY } from './db';
import { Api } from './shared/api';
import { Settings } from './settings';
import { UX } from './shared/ux';

// urls[6] in api.ts — auth.literotica.com.
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
    this.api.http
      .get(`https://auth.literotica.com/check?timestamp=${Math.floor(Date.now() / 1000)}&redirect=https://www.literotica.com/`, {
        withCredentials: true,
        observe: 'response',
        responseType: 'text',
      })
      .toPromise()
      .catch(() => null);
  }

  onReady() {
    return this.ready;
  }

  // Three-step JWT login flow that matches the website's own XHR sequence:
  //   1. POST auth.literotica.com/login {login,password}  → sets sessionid cookie
  //   2. GET  auth.literotica.com/check?timestamp=<unix>  → sets auth_token (JWT) cookie
  //   3. GET  /api/3/users/session                        → returns user profile
  // After step 2 the auth_token cookie is sent automatically with every
  // subsequent literotica.com request (withCredentials: true is already on by
  // default for /api/* calls), so authenticated v3 endpoints just work.
  login(info: any) {
    const loader = this.ux.showLoader();
    const authOpts = { withCredentials: true, responseType: 'text' as 'text' };

    return this.api
      .post('login', JSON.stringify({ login: info.username, password: info.password }), {
        ...authOpts,
        headers: { 'Content-Type': 'application/json' },
      }, false, AUTH_URL_INDEX)
      .switchMap(() => this.api.get(`check?timestamp=${Math.floor(Date.now() / 1000)}`, null, authOpts, AUTH_URL_INDEX))
      .switchMap(() => this.api.get('3/users/session'))
      .map((res: any) => {
        if (loader) loader.dismiss();
        if (!res || !res.userid) {
          throw Observable.throw(res);
        }
        this.user = {
          id: res.userid,
          username: res.username,
          date: new Date().getTime(),
        };
        this.storage.set(USER_KEY, this.user);
      });
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
