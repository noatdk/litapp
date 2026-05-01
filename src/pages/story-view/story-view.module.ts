import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';
import { ScrollbarModule } from 'ngx-scrollbar';

import { StoryViewPage } from './story-view';
import { StoryPopoverModule } from './story-popover.module';
import { BookmarkPopoverModule } from '../../parts/bookmark-popover/bookmark-popover.module';

@NgModule({
  declarations: [StoryViewPage],
  imports: [
    IonicPageModule.forChild(StoryViewPage),
    FormsModule,
    TranslateModule.forChild(),
    TooltipsModule,
    ScrollbarModule,
    StoryPopoverModule,
    BookmarkPopoverModule,
  ],
  exports: [StoryViewPage],
})
export class StoryViewPageModule {}
