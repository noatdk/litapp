// Tag-portal & global constants. All public read endpoints (apikey/appid).

import { IntBool } from './common';

/**
 * GET /api/3/tagsportal/categories
 * Flat list of all categories. Used as the source of truth for category
 * names — `category_info.name` is missing on most other endpoints.
 */
export type TagsportalCategoriesResponse = ApiCategory[];

export interface ApiCategory {
  id: number;
  name: string;
  /** Long description (used on category pages). */
  ldesc: string;
  /** Short description (used in lists). */
  sdesc: string;
  /** Slug-style URL fragment (e.g. "first-time"). */
  pageUrl: string;
  /** Top-stories URL fragment. */
  topUrl: string;
  /** Category type discriminator: "story" / "audio" / "poetry" / etc. */
  type: string;
  language: number;
  submission_count: number;
}

/**
 * GET /api/3/tagsportal/top?count=N
 * Top tags ordered by usage. `cnt` is the per-tag submission count.
 */
export type TagsportalTopResponse = ApiTopTag[];

export interface ApiTopTag {
  id: number;
  tag: string;
  language: number;
  tagid: number;
  cnt: number;
  is_banned: IntBool;
}

/**
 * GET /api/3/tagsportal/by-name?params={"tags":["..."]}
 * Resolves tag names → tag ids. The Stories provider calls this before
 * /3/search/stories whenever the user filters by tag text.
 */
export type TagsportalByNameResponse = ApiTagLookup[];

export interface ApiTagLookup {
  id: number;
  tag: string;
  is_banned: IntBool;
}

/**
 * GET /api/3/constants
 * Server-side enum dump. We currently only consume `languages`.
 * The shape is loose ("any other constant the server happens to expose"),
 * so unrecognised top-level keys are tolerated.
 */
export interface ConstantsResponse {
  languages: { [shortname: string]: ApiLanguage };
  // Unrecognised constant groups — the server may add more without notice.
  [key: string]: any;
}

export interface ApiLanguage {
  id: number;
  shortname: string;
  longname: string;
  showorder: number;
  status: boolean;
  flag: string;
  flagNew: string;
  domain: string;
}
