// Public GitHub API responses used by the in-app updater. Only the fields
// the app actually reads are declared; the GitHub responses contain many
// more, but we don't need to model them.

/** GET https://api.github.com/repos/{owner}/{repo}/git/refs/tags */
export type GithubRefsTagsResponse = GithubRef[];

export interface GithubRef {
  /** e.g. "refs/tags/v1.25.33" */
  ref: string;
  node_id: string;
  url: string;
  object: { sha: string; type: string; url: string };
}

/** GET https://api.github.com/repos/{owner}/{repo}/git/tags/{sha} */
export interface GithubTag {
  sha: string;
  node_id?: string;
  tag: string;
  message?: string;
  url?: string;
  tagger?: { name?: string; email?: string; date?: string };
  object: { sha: string; type: string; url: string };
}
