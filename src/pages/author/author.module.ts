import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { AuthorPage } from './author';
import { StoryListNormalPageModule } from '../../parts/story-list-normal/story-list-normal.module';
import { MemoButtonModule } from '../../parts/memo-button/memo-button.module';
import { StoryListItemModule } from '../../parts/story-list-item/story-list-item.module';
import { PipesModule } from '../../pipes/pipes.module';
import { AuthorSortPopoverModule } from './author-sort-popover.module';

@NgModule({
  declarations: [AuthorPage],
  imports: [
    IonicPageModule.forChild(AuthorPage),
    TranslateModule.forChild(),
    TooltipsModule,
    StoryListNormalPageModule,
    MemoButtonModule,
    StoryListItemModule,
    PipesModule,
    AuthorSortPopoverModule,
  ],
})
export class AuthorPageModule {}
