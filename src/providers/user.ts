import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';
import 'rxjs/add/operator/toPromise';
import { Storage } from '@ionic/storage';
import { TranslateService } from '@ngx-translate/core';
import { Md5 } from 'ts-md5/dist/cjs/md5';

import { USER_KEY, FEED_KEY, LIST_KEY } from './db';
import { Api, AUTH_URL_INDEX } from './shared/api';
import { Settings } from './settings';
import { UX } from './shared/ux';

// JWT (auth_token cookie) issued by auth.literotica.com lasts ~1 hour. We
// don't decode the cookie; we just remember when it was last minted/refreshed
// and surface a countdown from there.
const JWT_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class User {
  private user: any;
  private ready;
  // Wall-clock ms when the JWT was last successfully minted/refreshed. Not
  // persisted — resets on each app launch (we always re-mint at boot anyway).
  private jwtRefreshedAt: number = 0;

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

  // Last /check failure status code (e.g. 401) — drives the account page's
  // "expired / re-login" state. 0 means "no failure since last success".
  private jwtLastErrorStatus = 0;

  private refreshAuthToken(): Promise<boolean> {
    return this.api
      .get(
        `check?timestamp=${Math.floor(Date.now() / 1000)}`,
        null,
        { withCredentials: true, responseType: 'text' },
        AUTH_URL_INDEX,
      )
      .toPromise()
      .then(() => {
        this.jwtRefreshedAt = Date.now();
        this.jwtLastErrorStatus = 0;
        return true;
      })
      .catch((err: any) => {
        const status = (err && typeof err.status === 'number') ? err.status : 0;
        this.jwtLastErrorStatus = status || -1;
        // 401 means the underlying sessionid cookie is dead — the JWT is
        // unrecoverable without a re-login. Invalidate the cached timestamp
        // so the UI stops claiming the session is fresh.
        if (status === 401) this.jwtRefreshedAt = 0;
        return false;
      });
  }

  // Public: kick off a manual JWT refresh. Resolves with true on success.
  refreshJwt(): Promise<boolean> {
    return this.refreshAuthToken();
  }

  // ms since the JWT was minted/refreshed, or null if we don't know yet.
  jwtAgeMs(): number | null {
    return this.jwtRefreshedAt ? Date.now() - this.jwtRefreshedAt : null;
  }

  // ms remaining until the JWT is expected to expire (assumes 1h TTL). May be
  // negative once we're past the assumed expiry — the interceptor will refresh
  // reactively on the next 401.
  jwtRemainingMs(): number | null {
    if (!this.jwtRefreshedAt) return null;
    return this.jwtRefreshedAt + JWT_TTL_MS - Date.now();
  }

  // True when the most recent /check returned 401 — the sessionid cookie
  // upstream is dead and the user needs to re-login.
  jwtNeedsRelogin(): boolean {
    return this.jwtLastErrorStatus === 401;
  }

  jwtLastError(): number {
    return this.jwtLastErrorStatus;
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

    // The legacy v2 endpoints (vote/favorite/follow on /api/2/) still gate on
    // a session_id form param the JWT flow does NOT issue. The official
    // mobile app obtains it via POST /api/2/auth/login. We mirror that call
    // alongside the JWT login so legacy-only endpoints (currently: rating)
    // keep working. If it fails, the JWT flow is still authoritative and
    // login as a whole succeeds; just the legacy session_id stays unset.
    const v2LoginBody = new FormData();
    v2LoginBody.append('lang', (typeof navigator !== 'undefined' && navigator.language || 'en').slice(0, 2));
    v2LoginBody.append('username', info.username);
    // v2 auth/login expects MD5-hashed password (matches official mobile app's
    // me.vertex.lib.util.MD5 hashing of the password before POSTing).
    v2LoginBody.append('password', Md5.hashStr(info.password) as string);
    const v2Login$ = this.api
      .post('2/auth/login', v2LoginBody, undefined, true)
      .map((res: any) => {
        // Modern server returns session_id at login.session_id; the older
        // shape (per the mobile app's smali) had it under login.user.session_id.
        const login = res && res.login;
        const sid = (login && login.session_id) || (login && login.user && login.user.session_id);
        return typeof sid === 'string' ? sid : '';
      })
      .catch((err: any) => {
        console.error('[v2 auth/login] error:', err);
        return Observable.of('');
      });

    return this.api
      .post('login', JSON.stringify({ login: info.username, password: info.password }), {
        ...authOpts,
        headers: { 'Content-Type': 'application/json' },
      }, false, AUTH_URL_INDEX)
      .switchMap(() => this.api.get(`check?timestamp=${Math.floor(Date.now() / 1000)}`, null, authOpts, AUTH_URL_INDEX))
      .do(() => { this.jwtRefreshedAt = Date.now(); this.jwtLastErrorStatus = 0; })
      .switchMap(() => this.api.get('3/users/session'))
      .switchMap((res: any) => v2Login$.map(sessionId => ({ res, sessionId })))
      .map(({ res, sessionId }: any) => {
        if (loader) loader.dismiss();
        if (!res || !res.userid) {
          throw Observable.throw(res);
        }
        this.user = {
          id: res.userid,
          username: res.username,
          sessionId: sessionId || '',
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

  getSession(): string {
    return (this.user && this.user.sessionId) || '';
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
