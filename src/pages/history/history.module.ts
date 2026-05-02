import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';
import { NgPipesModule } from 'ngx-pipes';

import { HistoryPage } from './history';
import { StoryListPageModule } from '../../parts/story-list/story-list.module';
import { StoryListNormalPageModule } from '../../parts/story-list-normal/story-list-normal.module';
import { SortPopoverModule } from '../../parts/sort-popover/sort-popover.module';
import { ChapterCardModule } from '../../parts/chapter-card/chapter-card.module';
import { AuthorListModule } from '../../parts/author-list/author-list.module';
import { PipesModule } from '../../pipes/pipes.module';

@NgModule({
  declarations: [HistoryPage],
  imports: [
    IonicPageModule.forChild(HistoryPage),
    TranslateModule.forChild(),
    NgPipesModule,
    TooltipsModule,
    SortPopoverModule,
    StoryListPageModule,
    StoryListNormalPageModule,
    ChapterCardModule,
    AuthorListModule,
    PipesModule,
  ],
})
export class HistoryPageModule {}
