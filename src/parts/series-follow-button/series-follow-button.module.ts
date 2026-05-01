import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { SeriesFollowButton } from './series-follow-button';

@NgModule({
  declarations: [SeriesFollowButton],
  imports: [CommonModule, IonicModule, TranslateModule.forChild(), TooltipsModule],
  exports: [SeriesFollowButton],
})
export class SeriesFollowButtonModule {}
