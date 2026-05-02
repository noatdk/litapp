import { Component, NgZone, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Config, Nav, Platform, App, AlertController, Menu } from 'ionic-angular';
import { WebIntent } from '@ionic-native/web-intent';

import { Globals, Analytics, UX, Stories, Lists, Feed, Settings, User, Api } from '../providers/providers';
import { FingerprintAIO } from '@ionic-native/fingerprint-aio';
import { StatusBar } from '@ionic-native/status-bar';

@Component({
  template: `
    <ng-container *ngIf="loggedIn">
      <ion-menu [content]="content" (ionOpen)="onMenuOpen()" (ionClose)="onMenuClose()">
        <ion-header>
          <ion-toolbar>
            <ion-title>Literotica <small>(unofficial)</small></ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list>
            <button menuClose ion-item (click)="openPage('TabsPage')">
              {{ 'MENU_HOME' | translate }}
            </button>

            <button menuClose ion-item (click)="openLinkDialog()" *ngIf="!settings.allSettings.offlineMode">
              {{ 'MENU_OPENLINK' | translate }}
            </button>

            <button menuClose ion-item (click)="openPage('SettingsPage')">
              {{ 'MENU_SETTINGS' | translate }}
            </button>
          </ion-list>
        </ion-content>

        <ion-footer class="account-footer" *ngIf="!settings.allSettings.offlineMode">
          <div *ngIf="!user.isLoggedIn()" class="signed-out">
            <p class="muted">{{ 'ACCOUNT_SIGNED_OUT_TITLE' | translate }}</p>
            <button menuClose ion-button block small (click)="login()">
              <ion-icon name="log-in"></ion-icon>&nbsp; {{ 'LOGIN' | translate }}
            </button>
          </div>

          <div *ngIf="user.isLoggedIn()" class="signed-in">
            <button menuClose class="identity" (click)="openAuthorPage()"
              title="{{ 'ACCOUNT_OPEN_AUTHOR_PAGE' | translate }}">
              <span class="avatar" [class.has-image]="!!avatarUrl">
                <img *ngIf="avatarUrl" [src]="avatarUrl" (error)="avatarUrl = ''" alt="" />
                <span *ngIf="!avatarUrl">{{ avatarLetter() }}</span>
              </span>
              <span class="user-info">
                <span class="username">{{ user.getDetails().username }}</span>
                <span class="status"
                   [class.muted]="jwtState() === 'fresh' || jwtState() === 'unknown'"
                   [class.warn]="jwtState() === 'stale'"
                   [class.error]="jwtState() === 'expired'">
                  <ng-container [ngSwitch]="jwtState()">
                    <ng-container *ngSwitchCase="'fresh'">{{ 'ACCOUNT_JWT_REFRESH_IN' | translate }} {{ jwtRemaining() }}</ng-container>
                    <ng-container *ngSwitchCase="'stale'">{{ 'ACCOUNT_JWT_REFRESH_IN' | translate }} {{ jwtRemaining() }}</ng-container>
                    <ng-container *ngSwitchCase="'expired'">{{ (needsRelogin() ? 'ACCOUNT_JWT_RELOGIN_REQUIRED' : 'ACCOUNT_JWT_EXPIRED') | translate }}</ng-container>
                    <ng-container *ngSwitchDefault>id #{{ user.getDetails().id }}</ng-container>
                  </ng-container>
                </span>
              </span>
            </button>
            <div class="actions">
              <button *ngIf="!needsRelogin()" class="icon-btn" (click)="refreshJwt()"
                [disabled]="refreshing" title="{{ 'ACCOUNT_JWT_REFRESH_NOW' | translate }}">
                <ion-icon name="refresh"></ion-icon>
              </button>
              <button *ngIf="needsRelogin()" menuClose class="icon-btn warn" (click)="relogin()"
                title="{{ 'ACCOUNT_RELOGIN' | translate }}">
                <ion-icon name="log-in"></ion-icon>
              </button>
              <button class="icon-btn danger" (click)="logout()" title="{{ 'LOGOUT' | translate }}">
                <ion-icon name="log-out"></ion-icon>
              </button>
            </div>
          </div>
        </ion-footer>
      </ion-menu>
      <ion-nav #content root="TabsPage"></ion-nav>
    </ng-container>
  `,
})
export class MyApp {
  @ViewChild(Nav) nav: Nav;
  @ViewChild(Menu) menu: Menu;

  loggedIn: boolean = false;
  refreshing = false;
  avatarUrl: string = '';
  private tick: any;
  private avatarFetchedFor: any = null;

  constructor(
    public platform: Platform,
    public app: App,
    public translate: TranslateService,
    public webIntent: WebIntent,
    public config: Config,
    public alertCtrl: AlertController,
    public settings: Settings,
    public analytics: Analytics, // necessary for tracking startup
    public ux: UX,
    public g: Globals,
    public s: Stories,
    public l: Lists,
    public f: Feed,
    public user: User,
    public api: Api,
    public faio: FingerprintAIO,
    public statusBar: StatusBar,
    private zone: NgZone,
  ) {
    this.initTranslate();
    this.settings.load().then(() => {
      if (this.settings.allSettings.enableLock && !this.loggedIn && !this.g.isWebApp()) {
        this.showLockScreen();
      } else {
        this.loggedIn = true;
      }

      if (this.settings.allSettings.checkforappupdates && !this.settings.allSettings.offlineMode && !this.g.isWebApp()) {
        this.g.checkForUpdates();
      }

      if (this.settings.allSettings.amoledBlackTheme) {
        const styleSheet = document.createElement('link');
        styleSheet.setAttribute('href', './assets/black-theme.css');
        styleSheet.setAttribute('rel', 'stylesheet');
        document.head.appendChild(styleSheet);
        this.statusBar.backgroundColorByHexString('#000');
      } else {
        this.statusBar.backgroundColorByHexString('#111');
      }
    });

    this.catchShareIntent();
    this.platform.resume.subscribe(() => {
      this.catchShareIntent();
    });
  }

  showLockScreen() {
    this.faio
      .isAvailable()
      .then(enabled => {
        if (!enabled) {
          this.loggedIn = true;
          return;
        }

        this.faio
          .show({
            clientId: 'litapp',
            clientSecret: '3}D+v862s4a6c>y5elLFj4xA', // not used for encryption so doesn't matter this is committed
            disableBackup: false,
          })
          .then((result: boolean) => {
            if (result) {
              this.loggedIn = result;
            }
          })
          .catch(() => this.platform.exitApp());
      })
      .catch(() => (this.loggedIn = true));
  }

  catchShareIntent() {
    if (!this.g.isWebApp()) {
      this.webIntent
        .getIntent()
        .then(intent => {
          if (intent.action === 'android.intent.action.SEND' && intent.extras) {
            this.openURL(intent.extras['android.intent.extra.TEXT']);
          }
        })
        .catch(e => console.warn('Native: tried webIntent:', e));
    }
  }

  initTranslate() {
    this.translate.setDefaultLang('en');
    const browserLang = this.translate.getBrowserLang();

    if (browserLang) {
      if (browserLang === 'zh') {
        const browserCultureLang = this.translate.getBrowserCultureLang();

        if (browserCultureLang.match(/-CN|CHS|Hans/i)) {
          this.translate.use('zh-cmn-Hans');
        } else if (browserCultureLang.match(/-TW|CHT|Hant/i)) {
          this.translate.use('zh-cmn-Hant');
        }
      } else {
        this.translate.use(this.translate.getBrowserLang());
      }
    } else {
      this.translate.use('en');
    }

    this.translate.get(['BACK_BUTTON_TEXT']).subscribe(values => {
      this.config.set('ios', 'backButtonText', values.BACK_BUTTON_TEXT);
    });
  }

  openPage(page) {
    if (page.title === 'TabsPage') {
      this.nav.setRoot(page);
    } else {
      this.nav.push(page);
    }
  }

  // --- Account footer (Discord-style bottom-of-sidebar panel) ---

  onMenuOpen() {
    if (!this.user.isLoggedIn()) return;
    this.user.checkIfEverythingIsFucked().then(answer => {
      if (answer) this.user.logout();
    });
    this.fetchAvatar();
    this.zone.runOutsideAngular(() => {
      if (this.tick) return;
      this.tick = setInterval(() => {
        this.zone.run(() => {}); // trigger CD so jwtRemaining() refreshes
      }, 1000);
    });
  }

  onMenuClose() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  login() {
    this.nav.push('LoginPage');
  }

  logout() {
    this.user.logout();
  }

  relogin() {
    this.user.removeStoredUser().then(() => {
      this.nav.push('LoginPage');
    });
  }

  refreshJwt() {
    if (this.refreshing) return;
    this.refreshing = true;
    this.user.refreshJwt().then(ok => {
      this.refreshing = false;
      this.ux.showToast(ok ? 'INFO' : 'ERROR', ok ? 'ACCOUNT_JWT_REFRESHED' : 'ACCOUNT_JWT_REFRESH_FAILED');
    });
  }

  avatarLetter(): string {
    const d = this.user.getDetails();
    const name = (d && d.username) || '';
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  // Fetch the logged-in user's profile picture from /3/authors/{id}.
  // Cached per user id; called on every menu open but no-ops after the first
  // successful fetch. Falls back to the initial-letter avatar on failure.
  private fetchAvatar() {
    const d = this.user.getDetails();
    if (!d || d.id == null) return;
    if (this.avatarFetchedFor === d.id && this.avatarUrl) return;
    this.avatarFetchedFor = d.id;
    this.api.get(`3/authors/${d.id}`).subscribe(
      (data: any) => {
        const profile = Array.isArray(data) ? data[0] : data;
        const pic = profile && profile.userpic;
        if (pic && pic !== 'https://www.literotica.com/imagesv2/da') {
          this.avatarUrl = pic;
        }
      },
      () => { this.avatarFetchedFor = null; },
    );
  }

  openAuthorPage() {
    const details = this.user.getDetails();
    if (!details || details.id == null) return;
    const author = { id: details.id, name: details.username };
    const activeNav = this.app.getActiveNavs()[0] || this.nav;
    activeNav.push('AuthorPage', { author });
  }

  jwtRemaining(): string {
    const ms = this.user.jwtRemainingMs();
    if (ms == null) return '—';
    return this.formatDuration(ms);
  }

  jwtState(): 'fresh' | 'stale' | 'expired' | 'unknown' {
    if (this.user.jwtNeedsRelogin()) return 'expired';
    const ms = this.user.jwtRemainingMs();
    if (ms == null) return this.user.jwtLastError() ? 'expired' : 'unknown';
    if (ms <= 0) return 'expired';
    if (ms < 5 * 60 * 1000) return 'stale';
    return 'fresh';
  }

  needsRelogin(): boolean {
    return this.user.jwtNeedsRelogin();
  }

  private formatDuration(ms: number): string {
    const sign = ms < 0 ? '-' : '';
    const total = Math.abs(Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${sign}${h}h ${m}m`;
    if (m) return `${sign}${m}m ${s}s`;
    return `${sign}${s}s`;
  }

  openLinkDialog(url?) {
    this.translate.get(['MENU_OPENLINK', 'OPENLINK_DESCRIPTION', 'OK_BUTTON', 'CANCEL_BUTTON']).subscribe(translations => {
      this.alertCtrl
        .create({
          title: translations.MENU_OPENLINK,
          message: translations.OPENLINK_DESCRIPTION,
          inputs: [
            {
              name: 'url',
              placeholder: 'https://www.literotica.com/...',
            },
          ],
          buttons: [
            {
              text: translations.OK_BUTTON,
              handler: data => {
                this.openURL(data.url);
              },
            },
            { text: translations.CANCEL_BUTTON },
          ],
        })
        .present();
    });
  }

  openURL(url: string) {
    // https://www.literotica.com/s/slave-takes-mistress-to-hawaii
    // https://www.literotica.com/beta/s/the-year-of-the-cat-ch-10
    const storyRegex = /literotica\.com\/(beta\/)?s\/([-a-zA-Z0-9._+]*)/g;
    const storyMatch = storyRegex.exec(url);
    if (storyMatch) {
      this.nav.push('SearchPage', {
        storyurl: storyMatch[storyMatch.length - 1],
      });

      this.ux.showToast('INFO', 'OPENLINK_STORYWARNING', 2500);
      return;
    }

    // https://www.literotica.com/stories/memberpage.php?uid=1015993&page=submissions
    const authorRegex = /literotica\.com\/stories\/memberpage\.php\?.*uid=([0-9]*)/g;
    const authorMatch = authorRegex.exec(url);
    if (authorMatch) {
      const author = { id: authorMatch[1] };
      this.nav.push('AuthorPage', {
        author,
      });
      return;
    }

    // https://www.literotica.com/p/a-demons-lust
    const poemRegex = /literotica\.com\/p\/([-a-zA-Z0-9._+]*)/g;
    const poemMatch = poemRegex.exec(url);
    this.ux.showToast('INFO', poemMatch ? 'OPENLINK_UNSUPPORTED_POEM' : 'OPENLINK_UNSUPPORTED', 2500);
  }
}
