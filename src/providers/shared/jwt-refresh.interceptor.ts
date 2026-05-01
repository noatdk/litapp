import { Injectable, Injector } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/throw';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/mergeMap';

import { Api } from './api';

@Injectable()
export class JwtRefreshInterceptor implements HttpInterceptor {
  private refreshPromise: Promise<any> | null = null;

  constructor(private injector: Injector) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).catch((err: any) => {
      if (!this.shouldRefresh(req, err)) return Observable.throw(err);
      return Observable.fromPromise(this.refresh()).mergeMap(() => next.handle(req));
    });
  }

  private shouldRefresh(req: HttpRequest<any>, err: any): boolean {
    if (!(err instanceof HttpErrorResponse) || err.status !== 401) return false;
    if (req.url.indexOf('/check?') > -1 || req.url.indexOf('/login') > -1) return false;
    const msg = err.error && err.error.message;
    return typeof msg === 'string' && /JWT/i.test(msg);
  }

  private refresh(): Promise<any> {
    if (this.refreshPromise) return this.refreshPromise;
    const api = this.injector.get(Api);
    const url = `${api.urls[6]}/check?timestamp=${Math.floor(Date.now() / 1000)}`;
    this.refreshPromise = api.http
      .get(url, { withCredentials: true, responseType: 'text' })
      .toPromise()
      .then(
        v => {
          this.refreshPromise = null;
          return v;
        },
        e => {
          this.refreshPromise = null;
          throw e;
        },
      );
    return this.refreshPromise;
  }
}
