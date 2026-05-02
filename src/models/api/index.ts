// Type-level barrel for every Literotica HTTP endpoint the app currently
// touches. Types are co-located with the provider domain they belong to.
//
// Coverage map (endpoint → declaring file):
//   /api/3/users/session, /3/users/{name}, /3/authors/{id}, follow/*,
//   /3/users/{name}/favorite/authors                            → users.ts
//   /api/3/search/stories, /3/stories/{id}, /3/stories/popular/*,
//   /3/stories/topcommentednew/*, /3/stories/{slug}/comments/after,
//   /api/2/submissions/{pages,vote}, /api/1/submissions          → stories.ts
//   /api/3/my/lists, /3/users/{id}/lists/{urlname},
//   /3/stories/{id}/lists/{listId}, /3/lists/{id}                → lists.ts
//   /api/3/tagsportal/{categories,top,by-name}, /3/constants     → tagsportal.ts
//   /api/3/activity/{counters,wall}                              → activity.ts
//   auth.literotica.com/login, /check, /api/2/auth/login         → auth.ts
//   api.github.com/repos/.../git/{refs/tags,tags/{sha}}          → github.ts
//   raw.githubusercontent.com/.../app.json                       → app-json.ts
//
// Shapes are derived from live captures (see tmp/api-shapes/) — many fields
// are optional because individual endpoints omit different subsets.

export * from './common';
export * from './users';
export * from './stories';
export * from './lists';
export * from './tagsportal';
export * from './activity';
export * from './auth';
export * from './github';
export * from './app-json';
