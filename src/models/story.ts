import { Author } from './author';
import { List } from './list';

export class Story {
  constructor(fields: any) {
    // Quick and dirty extend/assign fields to this model. The `this as any`
    // cast is needed because the class itself doesn't carry the index
    // signature that the merged interface declaration adds (TS 2.4).
    for (const f in fields) {
      (this as any)[f] = fields[f];
    }
  }
}

export interface Story {
  [prop: string]: any;

  id: any;
  title: string;
  content: any;
  description: string;
  rating: number;
  myrating: number;
  category: string;
  categoryID: number;
  lang: string;
  tags: string[];
  series: number;
  seriesTitle: string;
  timestamp: string;
  author: Author;
  url: string;
  length: number;
  currentpage: number;
  viewcount: number;
  commentscount: number;
  favoritescount: number;
  listscount: number;
  ishot: boolean;
  isnew: boolean;
  iswriterspick: boolean;
  iscontestwinner: boolean;
  commentsenabled: boolean;
  ratingenabled: boolean;
  cached: boolean;
  downloaded: boolean;
  downloadedtimestamp: Date | number;
  lists: List[];
  comments: {
    user: string;
    userId: string;
    text: string;
    timestamp: string;
  }[];
}
