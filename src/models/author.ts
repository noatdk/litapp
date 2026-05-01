import { Story } from './story';

export class Author {
  constructor(fields: any) {
    // Quick and dirty extend/assign fields to this model
    for (const f in fields) {
      // @ts-ignore
      this[f] = fields[f];
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

  // Extended profile fields (3/authors/{id} response)
  usertitle: string;
  location: string;
  followersCount: number;
  followingsCount: number;
  commentsCount: number;
  favoriteStoriesCount: number;
  editorStatus: string;
  lists: AuthorList[];
}
