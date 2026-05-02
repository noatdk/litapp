// Activity / wall endpoints (logged-in only).

import { ApiStoryV3 } from './stories';

/**
 * GET /api/3/activity/counters?params={...}
 * Unread counters for each activity tab.
 *
 * Historical note: an older version required `wallId` in params (captured
 * at session-time via `wall_id`). The session response no longer contains
 * `wall_id` (verified live, 2026), and the endpoint now works with
 * `params={}` for the authenticated user.
 */
export interface ActivityCountersResponse {
  wall: number;
  works: number;
  my: number;
  authors: number;
  comments: number;
}

/**
 * GET /api/3/activity/wall?params={page,...}
 * Paginated activity feed.
 */
export interface ActivityWallResponse {
  data: ApiActivityItem[];
  new_activity_count: number;
}

export interface ApiActivityItem {
  id: string;
  /**
   * Discriminator. Observed values (incomplete — server may emit more):
   *   - "published-story"   → `what` is a full story payload (ApiStoryV3-like)
   *   - "publish-news"      → `what` is { content, url }
   *   - "profile-updated"   → `what` is string[] of changed field names
   * Other verbs (comment/favorite/follow) exist on the wall but were not
   * present in the captured sample; treat unknown actions as opaque.
   */
  action: string;
  /** Unix epoch seconds. */
  when: number;
  sequence: number;
  who: ApiActivityWho;
  /** Polymorphic on `action`; narrow before reading. */
  what: ApiActivityWhatStory | ApiActivityWhatNews | ApiActivityWhatProfile | ApiActivityWhatGeneric;
}

export interface ApiActivityWho {
  userid: number;
  username: string;
  userpic?: string;
}

/** Embedded story from a `published-story` activity item — full ApiStoryV3. */
export type ApiActivityWhatStory = ApiStoryV3;

/** Site-news payload from a `publish-news` activity item. */
export interface ApiActivityWhatNews {
  content: string;
  url: string;
}

/** Field-name list from a `profile-updated` activity item. */
export type ApiActivityWhatProfile = string[];

/** Fallback for unknown action types — kept loose so new verbs don't break. */
export type ApiActivityWhatGeneric = any;
