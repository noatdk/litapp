import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { AuthorPage } from './author';
import { StoryListNormalPageModule } from '../../parts/story-list-normal/story-list-normal.module';
import { MemoPopoverModule } from '../../parts/memo-popover/memo-popover.module';

@NgModule({
  declarations: [AuthorPage],
  imports: [
    IonicPageModule.forChild(AuthorPage),
    TranslateModule.forChild(),
    TooltipsModule,
    StoryListNormalPageModule,
    MemoPopoverModule,
  ],
})
export class AuthorPageModule {}
