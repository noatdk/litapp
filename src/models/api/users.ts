// User / author endpoints.
// Authentication for v3 calls is the auth_token JWT (sent automatically
// via cookie). Public read endpoints work with apikey/appid only.

import { IntBool, LaravelPaginator } from './common';

// ---------- Tag (used inside story responses but co-defined for ergonomics) ----------
export interface ApiTagRef {
  id: number;
  tag: string;
  is_banned: IntBool;
  /** Present on `1/submissions` (legacy `name`) — mirrors `tag`. */
  name?: string;
  /** Present on submissions/pages — count across all submissions using this tag. */
  submission_count?: number;
}

// ---------- The "rich" author profile shape ----------
// Returned by:
//   GET /api/3/users/session
//   GET /api/3/users/{username}            (wrapped in { success, user })
//   GET /api/3/users/{username}/favorite/authors
//   nested under search-stories submission.author (popular, topcommentednew)
//   nested under stories/{id} submission.author
//
// The fields below are observed live (2026); any can be missing on a given
// endpoint, hence the heavy use of `?`. `null` is used where the server
// returns explicit JSON null rather than omitting the key.
export interface ApiUserProfile {
  // identity
  userid: number;
  username: string;
  userpic?: string;
  usertitle?: string;
  customtitle?: number;

  // free-form profile
  aim?: string;
  bio?: string;
  biography?: string;
  homepage?: string;
  icq?: string;
  joindate?: string;
  joindate_approx?: string;
  last_update?: string;
  last_update_approx?: string;
  location?: string | null;
  status?: string;
  options?: number;

  // counts
  comments_count?: number;
  followed_stories_count?: number;
  followers_count?: number;
  followings_count?: number;
  has_photo?: IntBool;
  stories_count?: number;
  poems_count?: number;
  illustrations_count?: number;
  audios_count?: number;
  sgs_count?: number;
  series_count?: number;
  stories_and_series_count?: number;
  audios_and_series_count?: number;
  poems_and_series_count?: number;
  illustras_and_series_count?: number;
  sgs_and_series_count?: number;
  fav_stories_count?: number;
  fav_poems_count?: number;
  fav_sgs_count?: number;
  fav_artworks_count?: number;
  fav_audios_count?: number;
  fav_authors_count?: number;
  favorites_count?: number | null;
  favorite_stories_count?: number;
  submissions_count?: number;

  // demographics (only on /3/users/{name}?withProfile)
  sex?: string;
  orientation?: string;
  weight?: string;
  height?: string;
  age?: string;
  datingstat?: string;
  interests?: string;
  fetishes?: string;

  // socials — null when unset
  instagram?: string | null;
  x?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  facebook?: string | null;
  wattpad?: string | null;
  ao3?: string | null;
  medium?: string | null;
  substack?: string | null;
  kofi?: string | null;
  tumblr?: string | null;
  goodreads?: string | null;
  allpoetry?: string | null;
  deviantart?: string | null;
  gumroad?: string | null;

  // misc
  drink?: string;
  smoke?: string;
  pets?: string;
  editor_status?: string;
  allowfeedback?: IntBool;
  disable_all_feedback?: IntBool;
  support_me_service?: string;
  support_me_link?: string | null;
  support_me_services?: any;
  redirect_support_me_urls?: any;

  // session-only fields
  email?: string;
  parentemail?: string;
  following_ids?: number[];
  userpic_status?: string;
  facts?: ApiUserFact[];
  beta?: { story?: boolean };
  enable_classic?: boolean;
  view_settings?: ApiUserViewSettings;
  contact_me?: number;
  lastvisit?: string;
  timezoneoffset?: number;
  action_executed_at?: string | null;

  // reading lists owned by this user
  lists?: ApiUserList[];
  /** Map keyed by list id (string) → array of submission ids in the list. */
  listscontent?: { [listId: string]: number[] };

  // Field present only on the legacy /3/authors/{id} response shape.
  messanger_name?: string;

  /** Cover-banner urls — only returned on /3/users/{name}?withProfile. */
  profile_header?: { d1?: string; d2?: string; m1?: string; m2?: string };

  /** Only returned on authenticated requests against the same author. */
  following?: boolean;

  /** Birth date "MM/DD/YYYY" — used as a profile fact. */
  dob?: string;
}

export interface ApiUserFact {
  field: string;
  value: string;
  updated_at: string;
  privacy_level: number;
}

export interface ApiUserViewSettings {
  font_name?: string;
  font_spacing?: string;
  font_size?: string;
  user_theme?: string;
  autodetect?: boolean;
  playback_rate?: number;
}

/** Lite profile used in places that only need name/avatar + counts. */
export interface ApiUserLite {
  userid: number;
  username: string;
  userpic?: string;
  stories_count?: number;
  poems_count?: number;
  audios_count?: number;
  illustrations_count?: number;
  sgs_count?: number;
}

// ---------- Reading-list summary ----------
// Embedded under `user.lists` in profile responses. Full list detail lives
// in models/api/lists.ts.
export interface ApiUserList {
  id: number;
  user_id: number;
  urlname: string;
  title: string;
  description: string;
  /** Null on the user's own lists (mixed types); set to the work type on
   *  another author's list (e.g. "story"). */
  submission_type: string | null;
  stories_count: number;
  created_at?: string;
  updated_at?: string | null;
  /** Only set on /3/my/lists and /3/users/session. */
  is_private?: IntBool;
  is_deletable?: IntBool;
}

// ---------- Endpoint envelopes ----------

/**
 * GET /api/3/users/session
 * Returns the logged-in user's full profile (rich shape, no envelope).
 * Requires auth_token cookie.
 */
export type SessionResponse = ApiUserProfile;

/**
 * GET /api/3/users/{username}?params={"withProfile":true}
 * Wrapped: { success, user }. `user` is the rich profile.
 */
export interface UserByNameResponse {
  success: boolean;
  user: ApiUserProfile;
}

/**
 * GET /api/3/authors/{id}
 * Legacy id-based endpoint. Returns a 1-element array containing the
 * lighter profile shape (no socials, no `_count` aggregates).
 */
export type AuthorByIdResponse = ApiUserProfile[];

/**
 * GET /api/3/users/{username}/favorite/authors?params={...}
 *
 * Shape varies by params:
 *   - `{page, pageSize}` (or any pagination) → Laravel paginator wrapper.
 *   - no pagination keys (e.g. `{nocache:true}`) → flat array of profiles.
 *
 * Use the variant that matches the call.
 */
export type FavoriteAuthorsFlatResponse = ApiUserProfile[];
export type FavoriteAuthorsPaginatedResponse = LaravelPaginator<ApiUserProfile>;
export type FavoriteAuthorsResponse = FavoriteAuthorsFlatResponse | FavoriteAuthorsPaginatedResponse;

/**
 * GET /api/3/users/{username}/followers?params={page,pageSize}
 * Always paginated.
 */
export type FollowersResponse = LaravelPaginator<ApiUserProfile>;

/**
 * POST /api/3/users/follow/{authorId}
 * Body: {} (empty object).
 * Response: 200 with no payload of consequence — providers ignore it.
 */
export type FollowAuthorResponse = any;

/**
 * DELETE /api/3/users/follow/{authorId}
 * Response: same idea — providers ignore the body.
 */
export type UnfollowAuthorResponse = any;
