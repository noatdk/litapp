import { Pipe } from '@angular/core';
import { Observable } from 'rxjs/Observable';

import { Categories } from '../providers/categories';

// Resolves a numeric category id to its name via the Categories provider.
// Used in templates: `{{ story?.categoryID | categoryName | async }}`.
@Pipe({
  name: 'categoryName',
})
export class CategoryNamePipe {
  constructor(private c: Categories) {}

  transform(id: number): Observable<string> {
    if (id == null) return Observable.of('');
    return this.c.get(id).map(cat => (cat && cat.name) || '');
  }
}
