// Reading-list endpoints. All tier-2/tier-3 (logged-in) calls.

import { ApiUserList } from './users';
import { ApiStoryV3 } from './stories';

/**
 * GET /api/3/my/lists
 * Flat array of the logged-in user's reading lists (no envelope).
 */
export type MyListsResponse = ApiUserList[];

/**
 * GET /api/3/users/{userId}/lists/{urlname}?params={page,...}
 * Detail view: list metadata + paginated works in the list.
 */
export interface UserListDetailResponse {
  list: ApiUserList;
  works: {
    data: ApiStoryV3[];
    meta: {
      total: number;
      current_page: number;
      last_page: number;
      from: number;
      to: number;
      per_page: number;
    };
    links: { url: string | null; label: string; active: boolean }[];
  };
}

/**
 * Common envelope for list mutation endpoints. Verified live (2026):
 *   success: { success: true, list: {...} }     (only present on POST/PATCH)
 *   error:   { success: false, message: "..." } (e.g. "not-found")
 *
 * Note the `message` key — v3 list endpoints use it where v1/v2 envelopes
 * use `error`. Both kept here so mixed-version callers can read either.
 */
export interface ListMutationEnvelope {
  success: boolean;
  list?: ApiUserList;
  message?: string;
  error?: string;
}

/** PUT /api/3/stories/{storyId}/lists/{listId} — body `{}`. */
export type AddStoryToListResponse = ListMutationEnvelope;

/** DELETE /api/3/stories/{storyId}/lists/{listId}. */
export type RemoveStoryFromListResponse = ListMutationEnvelope;

/**
 * POST /api/3/users/{userId}/lists
 *
 * Body uses camelCase `isPrivate` — matches the in-app sender. The server
 * tolerates camelCase even though the read shape returns snake_case
 * `is_private` on the list resource.
 */
export interface CreateListRequest {
  title: string;
  description?: string;
  isPrivate?: 0 | 1;
}
export type CreateListResponse = ListMutationEnvelope;

/** PATCH /api/3/lists/{listId} — partial of CreateListRequest. */
export type UpdateListRequest = Partial<CreateListRequest>;
export type UpdateListResponse = ListMutationEnvelope;

/** DELETE /api/3/lists/{listId}. */
export type DeleteListResponse = ListMutationEnvelope;
