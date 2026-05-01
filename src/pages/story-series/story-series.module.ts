import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { StorySeriesPage } from './story-series';
import { StoryListPageModule } from '../../parts/story-list/story-list.module';
import { MemoButtonModule } from '../../parts/memo-button/memo-button.module';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

@NgModule({
  declarations: [StorySeriesPage],
  imports: [
    IonicPageModule.forChild(StorySeriesPage),
    TranslateModule.forChild(),
    TooltipsModule,
    StoryListPageModule,
    MemoButtonModule,
  ],
})
export class StorySeriesPageModule {}
