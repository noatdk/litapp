import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { AuthorSortPopover } from './author-sort-popover';

@NgModule({
  declarations: [AuthorSortPopover],
  imports: [FormsModule, IonicPageModule.forChild(AuthorSortPopover), TranslateModule.forChild()],
  entryComponents: [AuthorSortPopover],
})
export class AuthorSortPopoverModule {}
