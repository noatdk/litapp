import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Author } from '../../models/author';

// Card-wrapped list of authors. Used by user-list (followers / following)
// and the history Authors tab so all three lists share visual anatomy.
// Composes the existing `author-list-item` row primitive inside a shared
// white-card surface — the previous inlined `.users-card` block on user-list
// is now centralized here.
@Component({
  selector: 'author-list',
  templateUrl: 'author-list.html',
})
export class AuthorList {
  @Input() authors: Author[] = [];
  @Input() showFollowToggle: boolean = false;

  @Output() itemClick: EventEmitter<Author> = new EventEmitter();
  @Output() followToggle: EventEmitter<{ author: Author; event: Event }> = new EventEmitter();

  // tslint:disable-next-line:variable-name
  trackById(_index: number, author: Author): any {
    return author && author.id;
  }

  onItemClick(author: Author) {
    this.itemClick.emit(author);
  }

  onFollowToggle(payload: { author: Author; event: Event }) {
    this.followToggle.emit(payload);
  }
}
