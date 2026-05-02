import { Injectable } from '@angular/core';
import { ToastController, Toast } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

// Token returned by `showLoader()`. Callers .dismiss() when their request
// resolves; the previous implementation returned an Ionic `Loading` overlay,
// so the surface here mirrors its `.dismiss()` shape — no callsite changes.
export interface LoaderToken {
  dismiss(): void;
}

@Injectable()
export class UX {
  // Reactive state read by the global progress bar (see MyApp template).
  // We track a count rather than a flag so overlapping requests don't blink
  // the bar off the moment the first one resolves.
  //
  // `loaderVisible` is decoupled from `loaderCount` so the bar can finish its
  // current slide-out cycle after the last loader dismisses — yanking the
  // indicator mid-stride feels jittery. The animationiteration handler on
  // the indicator hides the bar at the end of the next cycle when the count
  // is back to 0.
  loaderCount: number = 0;
  loaderLabel: string = '';
  loaderVisible: boolean = false;

  activeToasts: Toast[] = [];
  offlineModeErrorCount = 0;

  constructor(public translate: TranslateService, public toastCtrl: ToastController) {}

  // Replaces the modal Ionic `LoadingController` overlay with a small,
  // non-obstructive progress indicator rendered globally by MyApp. The user
  // can keep tapping during the request — only the visual cue changes.
  //
  // Returns a token whose `.dismiss()` decrements the in-flight count. Calling
  // it more than once is a no-op so the global error handler / API error path
  // / success path can all dismiss without double-decrementing.
  showLoader(): LoaderToken {
    this.loaderCount += 1;
    this.loaderVisible = true;
    let dismissed = false;
    return {
      dismiss: () => {
        if (dismissed) return;
        dismissed = true;
        this.loaderCount = Math.max(0, this.loaderCount - 1);
        if (this.loaderCount === 0) this.loaderLabel = '';
        // Don't clear `loaderVisible` here — the indicator's animationiteration
        // handler does it on the next slide-out so the bar exits gracefully.
      },
    };
  }

  // Bound to the indicator's `(animationiteration)` event. Each iteration
  // ends with the indicator translated fully off the right edge, so hiding
  // here is the cleanest exit — no fade, no snap-back.
  onLoaderTick() {
    if (this.loaderCount === 0) this.loaderVisible = false;
  }

  // Optional textual hint shown next to the bar — used by series-download
  // progress reporting. Becomes a no-op when no loader is active.
  updateLoader(content: string) {
    if (this.loaderCount > 0) this.loaderLabel = content || '';
  }

  // Hard reset — used by the global error handler and offline-mode guard so a
  // crashed request can't leave the bar wedged on.
  hideLoader() {
    this.loaderCount = 0;
    this.loaderLabel = '';
    this.loaderVisible = false;
  }

  // label and buttonLabel can still contain a string just cast to any when needed
  showToast(
    type: 'ERROR' | 'INFO' = 'ERROR',
    label?: string,
    timeout?: number,
    buttonLabel?: string,
    removePrevious?: boolean,
    higher?: boolean,
  ): Promise<Toast> {
    const tag = `${type}_TAG`;
    return new Promise(resolve => {
      this.translate.get([label || 'LOAD_ERROR', buttonLabel || 'CLOSE_BUTTON', tag]).subscribe(translations => {
        const toast = this.toastCtrl.create({
          message: translations[tag] + (translations[label] || label || translations.LOAD_ERROR),
          showCloseButton: true,
          closeButtonText: translations[buttonLabel] || buttonLabel || translations.CLOSE_BUTTON,
          duration: timeout || 3000,
          cssClass: higher ? 'overui' : '',
        });
        toast.present();
        toast.onDidDismiss((data, role) => {
          if (role === 'close') {
            resolve(toast);
            this.activeToasts.splice(this.activeToasts.indexOf(toast), 1);
          }
        });

        if (removePrevious || (type === 'ERROR' && !label)) {
          this.activeToasts.forEach(toast => toast.dismiss());
          this.activeToasts = [toast];
        } else {
          this.activeToasts.push(toast);
        }
      });
    });
  }

  showOfflineModeError() {
    if (this.offlineModeErrorCount < 3) {
      this.showToast('ERROR', 'OFFLINE_ERROR', undefined, undefined, true);
      this.offlineModeErrorCount = this.offlineModeErrorCount + 1;
    }
    this.hideLoader();
    return Observable.of();
  }
}
