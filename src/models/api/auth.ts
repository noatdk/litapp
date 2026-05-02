// Authentication endpoints. Two parallel auth surfaces:
//
//   1. JWT flow on auth.literotica.com (modern; sets auth_token cookie)
//        POST /login                           — JSON {login,password} body
//        GET  /check?timestamp={unix}          — refresh; sets auth_token
//
//   2. Legacy v2 cookie+session on literotica.com/api/2/auth/login
//      Required for `/api/2/submissions/vote` (and any other endpoint that
//      still gates on a `session_id` form param the JWT flow doesn't issue).

/**
 * POST https://auth.literotica.com/login
 * Body: JSON { login, password }.
 * Response: 200 OK with the literal text "OK" — payload is uninteresting,
 * what matters is the `sessionid` cookie set on the response.
 */
export interface JwtLoginRequest {
  login: string;
  password: string;
}

/** Body is opaque text ("OK"); use it as a status check only. */
export type JwtLoginResponse = string;

/**
 * GET https://auth.literotica.com/check?timestamp={unix}
 * Response body is the raw JWT (ES384). Also issued via the `auth_token`
 * cookie which is what subsequent literotica.com calls actually use.
 */
export type JwtCheckResponse = string;

/**
 * POST /api/2/auth/login
 * Multipart fields: lang, username, password (MD5 hex).
 * Used solely to capture the `session_id` for legacy vote calls.
 */
export interface V2LoginResponse {
  success: boolean;
  apiver: string;
  login?: {
    status: string;
    session_id: string;
    user: {
      user_id: string;
      username: string;
      bio_exists: boolean;
      submissions: { stories: number; poems: number; illustra: number };
      favorites: { stories: number; poems: number; illustra: number; users: number };
    };
  };
  error?: string;
}
