// Declare possible values with defaults here

var ENV = {
  CORS_PROXY: process.env.CORS_PROXY || '',
  DEV: process.env.DEV === 'true' || false,
  APP_JSON_RAW_BASE:
    process.env.APP_JSON_RAW_BASE ||
    'https://raw.githubusercontent.com/theilluminatus/litapp/master',
  GITHUB_TAGS_REPO: process.env.GITHUB_TAGS_REPO || 'theilluminatus/litapp',
};

// Writes to file
const data = `
/* tslint:disable */
export interface AppEnv {
  CORS_PROXY: string;
  DEV: boolean;
  APP_JSON_RAW_BASE: string;
  GITHUB_TAGS_REPO: string;
}
export const ENV: AppEnv = ${JSON.stringify(ENV)};
`;
require('fs').writeFileSync('src/app/env.ts', data, 'utf-8');
