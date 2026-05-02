import { Component, Input, Output, EventEmitter } from '@angular/core';

import { Author } from '../../models/author';
import { Memos } from '../../providers/providers';

@Component({
  selector: 'author-list-item',
  templateUrl: 'author-list-item.html',
})
export class AuthorListItem {
  @Input() author: Author;
  @Input() showFollowToggle: boolean = false;
  @Output() itemClick: EventEmitter<Author> = new EventEmitter();
  @Output() followToggle: EventEmitter<{ author: Author; event: Event }> = new EventEmitter();

  constructor(public memos: Memos) {}

  hasMeta(): boolean {
    const a = this.author;
    if (!a) return false;
    return !!a.usertitle || a.storycount != null || a.followersCount != null;
  }

  handleClick() {
    this.itemClick.emit(this.author);
  }

  handleFollow(event: Event) {
    event.stopPropagation();
    this.followToggle.emit({ event, author: this.author });
  }
}
