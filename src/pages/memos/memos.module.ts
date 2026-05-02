import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { MemosPage } from './memos';

@NgModule({
  declarations: [MemosPage],
  imports: [IonicPageModule.forChild(MemosPage), TranslateModule.forChild(), TooltipsModule],
})
export class MemosPageModule {}
