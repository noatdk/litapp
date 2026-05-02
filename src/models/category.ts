export class Category {
  constructor(fields: any) {
    // Quick and dirty extend/assign fields to this model
    for (const f in fields) {
      (this as any)[f] = fields[f];
    }
  }
}

export interface Category {
  [prop: string]: any;

  id: number;
  name: string;
  description: string;
  type: string;
  url: string;
}
