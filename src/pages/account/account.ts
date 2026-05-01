import { Component, NgZone } from '@angular/core';
import { IonicPage, NavController } from 'ionic-angular';

import { User, UX } from '../../providers/providers';

@IonicPage()
@Component({
  selector: 'page-account',
  templateUrl: 'account.html',
})
export class AccountPage {
  refreshing = false;
  // Re-rendered every second while on this page so the JWT countdown ticks.
  now: number = Date.now();
  private tick: any;

  constructor(public navCtrl: NavController, public user: User, public ux: UX, private zone: NgZone) {}

  ionViewDidEnter() {
    if (!this.user.isLoggedIn()) return;

    this.user.checkIfEverythingIsFucked().then(answer => {
      if (answer) {
        this.user.logout();
      }
    });

    this.zone.runOutsideAngular(() => {
      this.tick = setInterval(() => {
        this.zone.run(() => (this.now = Date.now()));
      }, 1000);
    });
  }

  ionViewWillLeave() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  login() {
    this.navCtrl.push('LoginPage');
  }

  logout() {
    this.user.logout();
    this.navCtrl.push('TabsPage');
  }

  relogin() {
    this.user.removeStoredUser().then(() => {
      this.navCtrl.push('LoginPage');
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

  jwtRemaining(): string {
    const ms = this.user.jwtRemainingMs();
    if (ms == null) return '—';
    return this.formatDuration(ms);
  }

  jwtAge(): string {
    const ms = this.user.jwtAgeMs();
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

  hasSession(): boolean {
    return !!this.user.getSession();
  }

  maskedSession(): string {
    const s = this.user.getSession();
    if (!s) return '';
    return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
  }

  private formatDuration(ms: number): string {
    const sign = ms < 0 ? '-' : '';
    const total = Math.abs(Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${sign}${h}h ${m}m ${s}s`;
    if (m) return `${sign}${m}m ${s}s`;
    return `${sign}${s}s`;
  }
}
