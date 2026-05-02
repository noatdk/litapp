// app.json — fetched from the project's GitHub raw URL on launch by Globals.
// It carries hot-swappable values (current API key/app id, force-update info)
// independent of the shipped APK.

export interface AppJsonResponse {
  /** Build / version code (monotonically increasing integer). */
  version: number;
  /** Human-readable version string (e.g. "1.25.33"). */
  versionName: string;
  /** External URL for "update available" prompts. */
  updatelink: string;
  /** Server-side override for Api.apikey. */
  apikey: string;
  /** Server-side override for Api.appid. */
  appid: string;
}
