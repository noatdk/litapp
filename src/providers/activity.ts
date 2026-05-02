import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';

import { Api } from './shared/api';
import { User } from './user';
import { ActivityCountersResponse } from '../models/api';

// Re-exported for callers that previously imported the type from this module.
export type ActivityCounters = ActivityCountersResponse;

const COUNTERS_TTL_MS = 60 * 1000;

@Injectable()
export class Activity {
  private countersCache: ActivityCounters | null = null;
  private countersAt: number = 0;

  constructor(public api: Api, public user: User) {}

  // GET /api/3/activity/counters?params={}
  // Cached for ~60s so callers can poll cheaply. The endpoint authenticates
  // via the auth_token cookie — no `wall_id` param is needed (the session
  // response stopped emitting wall_id in 2026 and the server now resolves
  // the wall from the JWT subject).
  getCounters(force: boolean = false): Observable<ActivityCounters | null> {
    if (!force && this.countersCache && Date.now() - this.countersAt < COUNTERS_TTL_MS) {
      return Observable.of(this.countersCache);
    }

    if (!this.user.isLoggedIn()) return Observable.of(null);

    const params = encodeURIComponent(JSON.stringify({}));
    return this.api
      .get<ActivityCountersResponse>(`3/activity/counters?params=${params}`)
      .map(res => {
        if (!res || typeof res !== 'object') return null;
        const c: ActivityCounters = {
          wall: Number(res.wall) || 0,
          works: Number(res.works) || 0,
          my: Number(res.my) || 0,
          authors: Number(res.authors) || 0,
          comments: Number(res.comments) || 0,
        };
        this.countersCache = c;
        this.countersAt = Date.now();
        return c;
      })
      .catch(error => {
        console.error('activity.getCounters', error);
        return Observable.of(null);
      });
  }

  // Cached read for synchronous template binding (e.g. Feed tab badge).
  // Returns null until the first /counters call resolves.
  cachedCounters(): ActivityCounters | null {
    return this.countersCache;
  }
}
