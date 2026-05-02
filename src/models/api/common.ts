// Shared primitives used across multiple Literotica API responses.
//
// The API is loosely typed on the server side: many boolean-ish fields come
// back as 0/1 integers, dates are ISO strings, and counts are sometimes
// nullable. We model the observed shapes — see tmp/api-shapes/ for raw
// captures used to derive these. Optional `?` is used liberally for fields
// that the API has been seen to omit/null on different endpoints.

/** 0 = false, 1 = true. The API uses these for "allow_*", "is_*", flags. */
export type IntBool = 0 | 1;

/** Legacy v3 search/list pagination wrapper. */
export interface V3MetaTotal {
  pageSize?: number;
  total: number;
}

/** Used by tagsportal/popular endpoints — same idea, different field name. */
export interface V3MetaSubmissionsCount {
  submissions_count: number;
}

/** Laravel-style paginator returned by some v3 list endpoints. */
export interface LaravelPaginator<T> {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
  data: T[];
  links?: PaginatorLink[];
  from?: number;
  to?: number;
}

export interface PaginatorLink {
  url: string | null;
  label: string;
  active: boolean;
}

/** Wrapper used by v2 endpoints (1/submissions, 2/submissions/*, 2/auth/*). */
export interface V2Envelope {
  success: boolean;
  apiver: string;
  error?: string;
  errors?: V2FieldError[];
}

export interface V2FieldError {
  type: string;
  error: string;
  message: string;
  field: string;
}

/** Convenience: an endpoint that *only* responds with V2Envelope on error. */
export type V2Result<TSuccess> = (TSuccess & V2Envelope) | V2Envelope;
