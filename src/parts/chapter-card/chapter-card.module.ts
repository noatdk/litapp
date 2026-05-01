import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { ChapterCard } from './chapter-card';
import { BookmarkPopoverModule } from '../bookmark-popover/bookmark-popover.module';
import { PipesModule } from '../../pipes/pipes.module';

@NgModule({
  declarations: [ChapterCard],
  imports: [
    IonicPageModule.forChild(ChapterCard),
    TranslateModule.forChild(),
    BookmarkPopoverModule,
    PipesModule,
  ],
  exports: [ChapterCard],
})
export class ChapterCardModule {}
