import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { StoryDetailPage } from './story-detail';
import { BookmarkPopoverModule } from '../../parts/bookmark-popover/bookmark-popover.module';
import { MemoPopoverModule } from '../../parts/memo-popover/memo-popover.module';

@NgModule({
  declarations: [StoryDetailPage],
  imports: [
    IonicPageModule.forChild(StoryDetailPage),
    TranslateModule.forChild(),
    TooltipsModule,
    BookmarkPopoverModule,
    MemoPopoverModule,
  ],
})
export class StoryDetailPageModule {}
