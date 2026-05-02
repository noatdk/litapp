import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { UX } from './ux';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector) {}

  handleError(error: any): void {
    try {
      this.injector.get(UX).hideLoader();
    } catch (e) {}
    console.error(error);
  }
}
