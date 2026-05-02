// Story / submission endpoints across v1, v2 and v3 APIs.

import { IntBool, V2Envelope, V3MetaTotal, V3MetaSubmissionsCount, LaravelPaginator } from './common';
import { ApiTagRef, ApiUserLite, ApiUserProfile } from './users';

// ---------- Story (v3 search shape) ----------
// Returned by /3/search/stories, /3/stories/{id}, /3/stories/popular/{cat},
// /3/stories/topcommentednew/{cat}, and embedded under comment.story on
// /3/stories/{slug}/comments/after.
//
// The `author` shape varies per endpoint:
//   - search-stories, comments/after, topcommentednew → ApiUserLite
//   - stories/{id} (detail), popular                  → ApiUserProfile
// Both are valid; consumers should narrow as needed.
export interface ApiStoryV3 {
  id: number;
  title: string;
  url: string;
  description: string;
  type: string;
  /** "approved" / similar — observed values are loose strings. */
  status: string;
  authorname: string;
  author: ApiUserLite | ApiUserProfile;

  // category
  category: number;
  category_info: ApiCategoryInfo;

  // counts
  comment_count: number;
  favorite_count: number;
  view_count: number;
  rate_all: number;
  rate_count: number;
  reading_lists_count: number;
  words_count?: number;
  series_count?: number;
  reading_time?: number;

  // flags
  allow_vote: IntBool;
  allow_download: IntBool;
  enable_comments: IntBool;
  is_hot: boolean;
  is_new: boolean;
  contest_winner: number;
  writers_pick: boolean;

  // localisation / discovery
  language: number;
  newlanguage: number;
  rank: number | null;
  date_approve: string;
  tags: ApiTagRef[];

  // optional extras
  series?: ApiStorySeries | any[];
  followedAuthors?: number[] | null;
  contests?: any[];
  pageText?: string | null;
  /** Set on /3/users/{id}/lists/{urlname} entries; not on plain search. */
  in_list?: boolean;
  /** Set when fetched in a list context. */
  date_added?: string;
}

export interface ApiCategoryInfo {
  type: string;
  pageUrl: string;
  /** `/3/users/{id}/lists/{urlname}` returns the richer form with id + name. */
  id?: number;
  name?: string;
  ldesc?: string;
  sdesc?: string;
}

export interface ApiStorySeries {
  meta: {
    id: number;
    title: string;
    url: string;
    created_at: string;
    updated_at: string;
    /** Submission ids in series order. */
    order: number[];
  };
  items: ApiStorySeriesItem[];
}

export interface ApiStorySeriesItem {
  id: number;
  category: number;
  category_info: ApiCategoryInfo;
  title: string;
  type: string;
  url: string;
}

// ---------- Search (v3) ----------
/**
 * GET /api/3/search/stories?params={...}
 *
 * Query params (URL-encoded JSON in `params`):
 *   - page: number
 *   - size: number       (default ~50)
 *   - q?: string         (keywords)
 *   - tags?: number[]    (resolved via tagsportal/by-name first)
 *   - sort_by?: string
 *   - language?: number
 *   - …other filter knobs (popular, editorsChoice, winner, etc.)
 */
export interface SearchStoriesResponse {
  data: ApiStoryV3[];
  meta: V3MetaTotal;
}

// ---------- Tagsportal-style search wrapper ----------
// Some endpoints reuse the v1 envelope: { submissions, meta:{submissions_count} }.
export interface TagsportalSearchResponse {
  submissions: ApiStoryV3[];
  meta: V3MetaSubmissionsCount;
}

// ---------- Single-story detail ----------
/**
 * GET /api/3/stories/{id}
 * Single record wrapped with pages_count metadata and (sometimes) the first
 * page's text. Pass-through `submission` carries the rich author profile.
 */
export interface StoryDetailResponse {
  meta: { pages_count: number };
  submission: ApiStoryV3;
  pageText: string;
}

// ---------- Popular / topcommentednew ----------
/** GET /api/3/stories/popular/{categoryId}?params={size,page} */
export type PopularStoriesResponse = TagsportalSearchResponse;

/** GET /api/3/stories/topcommentednew/{categoryId}?params={size,page} */
export type TopCommentedNewStoriesResponse = LaravelPaginator<ApiStoryV3>;

// ---------- Comments ----------
/**
 * GET /api/3/stories/{slug}/comments/after?params={limit,…}
 * Note: the path uses the URL slug ("im-chefsessel"), not the numeric id.
 */
export interface CommentsAfterResponse {
  meta: { total: number; per_page: number };
  data: ApiCommentV3[];
}

export interface ApiCommentV3 {
  id: number;
  /** Unix epoch seconds. */
  date: number;
  /** Rating value (0 if comment isn't a rating). */
  rate: number;
  /** Comment kind discriminator (server-defined). */
  type: number;
  text: string;
  title: string;
  /** Embedded story snippet (lite author). */
  story: ApiStoryV3;
  /** Comment author (rich profile). */
  author: ApiUserProfile;
}

// ---------- Story body pages (v2) ----------
/**
 * GET /api/2/submissions/pages?filter=[{property,value},...]
 * Filter must include `submission_id` (snake_case). Pass `raw=yes` to get
 * original HTML (h1-h6, p, ul, blockquote, …) and preserve page breaks —
 * without it the body is flattened to <br/>-joined text and pages get
 * silently concatenated.
 */
export interface SubmissionsPagesResponse extends V2Envelope {
  meta: { filter: { submission_id: number; raw?: string } };
  total: number;
  pages: ApiSubmissionPage[];
}

export interface ApiSubmissionPage {
  id: number;
  name: string;
  series_id: number;
  related_id: number;
  /** Sanitised HTML (or `<br/>`-joined plain text when `raw` is unset). */
  content: string;
  lang: string;
  submission_id: string;
  url: string;
  is_favorited: boolean;
  allow_vote: boolean;
  tags: ApiTagRef[];
}

// ---------- Voting (v2) ----------
/**
 * POST /api/2/submissions/vote
 * FormData fields: filter (JSON), lang, user_id, session_id, vote.
 * `session_id` is captured at v2 auth/login.
 */
export interface SubmissionsVoteResponse extends V2Envelope {
  /** Server doesn't echo per-user vote state on success — clients persist locally. */
  vote?: number;
}

// ---------- Legacy v1 search ----------
/**
 * GET /api/1/submissions?filter=[{property,value},...]&page=N
 * Used as a fallback path by the search panel. On success the response
 * contains `submissions` + `total`; on failure it returns the V1 error
 * envelope (e.g. {success:false, error:"No Filters Provided"}).
 */
export interface SubmissionsListResponse extends V2Envelope {
  submissions?: ApiStoryV3[];
  total?: number;
}
