import { Story } from './story';

export class Author {
  constructor(fields: any) {
    // Quick and dirty extend/assign fields to this model
    for (const f in fields) {
      (this as any)[f] = fields[f];
    }
  }
}

export interface AuthorList {
  id: number;
  urlname: string;
  title: string;
  description: string;
  submissionType: string;
  storiesCount: number;
}

export interface Author {
  [prop: string]: any;

  id: any;
  name: string;
  picture: string;
  bio: string;
  updatetimestamp: number;
  jointimestamp: number;
  storycount: number;
  following: boolean;
  stories: Story[];
  favs: Story[];

  // Extended profile fields (3/authors/{id} or 3/users/{name} response)
  usertitle: string;
  customtitle: boolean; // true = author paid for a custom usertitle
  location: string;
  homepage: string;
  followersCount: number;
  followingsCount: number;
  commentsCount: number;
  favoriteStoriesCount: number;
  editorStatus: string;
  lists: AuthorList[];

  // Richer fields surfaced only by /3/users/{name}. All optional — older
  // /3/authors/{id} call doesn't populate them.
  joindateApprox: string; // e.g. "16 Years Ago"
  lastUpdateApprox: string; // e.g. "Last Year"
  status: string; // away/active marker (rarely populated)
  supportMeLink: string;
  supportMeService: string; // e.g. "patreon", "kofi"
  // Per-type submission counts (only the ones > 0 should be rendered).
  storiesCount: number;
  poemsCount: number;
  audiosCount: number;
  illustrationsCount: number;
  sgsCount: number;
  seriesCount: number;

  // "More about me" facts — single-char codes from /3/users/{name}.
  // Decoded for display by AuthorPage.factLabel(). Empty string = not set.
  factSex: string;
  factOrientation: string;
  factHeight: string;
  factWeight: string;
  factDatingstat: string;
  factPets: string;
  factSmoke: string;
  factDrink: string;
  factInterests: string; // free-text
  factFetishes: string; // free-text
  factDob: string; // raw "MM/DD/YYYY" string from /3/users/{name}
  // Cover banner urls returned only with ?params={"withProfile":true}.
  // Mobile sizes drive the in-app hero; desktop sizes kept for completeness.
  coverPicture?: {
    m1: string;
    m2: string;
    d1: string;
    d2: string;
  };
  // Social handles. Most are bare usernames/URLs — author.html linkifies them
  // by mapping the field key to the appropriate base URL.
  socials: {
    x?: string;
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    tumblr?: string;
    youtube?: string;
    kofi?: string;
    wattpad?: string;
    ao3?: string;
    allpoetry?: string;
    deviantart?: string;
    gumroad?: string;
    goodreads?: string;
    medium?: string;
    substack?: string;
  };
}
