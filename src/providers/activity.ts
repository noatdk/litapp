import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Rx';

import { Api } from './shared/api';
import { User } from './user';

// /3/activity/counters payload — drives the Feed tab badge and (potentially)
// future surfaces for works/my/authors/comments. The wall page itself is
// already covered by the Feed provider, which calls /3/activity/wall directly.
export interface ActivityCounters {
  wall: number;
  works: number;
  my: number;
  authors: number;
  comments: number;
}

const COUNTERS_TTL_MS = 60 * 1000;

@Injectable()
export class Activity {
  private countersCache: ActivityCounters | null = null;
  private countersAt: number = 0;

  constructor(public api: Api, public user: User) {}

  // GET /api/3/activity/counters?params={"wall_id":N}
  // Cached for ~60s so callers can poll cheaply. wallId comes from the user's
  // session response, captured at login or lazily via User.ensureWallId() for
  // pre-existing user records that didn't capture it.
  getCounters(force: boolean = false): Observable<ActivityCounters | null> {
    if (!force && this.countersCache && (Date.now() - this.countersAt) < COUNTERS_TTL_MS) {
      return Observable.of(this.countersCache);
    }

    return Observable.fromPromise(this.user.ensureWallId()).switchMap(wallId => {
      if (!wallId) return Observable.of(null);
      const params = encodeURIComponent(JSON.stringify({ wall_id: wallId }));
      return this.api
        .get(`3/activity/counters?params=${params}`)
        .map((res: any) => {
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
    });
  }

  // Cached read for synchronous template binding (e.g. Feed tab badge).
  // Returns null until the first /counters call resolves.
  cachedCounters(): ActivityCounters | null {
    return this.countersCache;
  }
}
