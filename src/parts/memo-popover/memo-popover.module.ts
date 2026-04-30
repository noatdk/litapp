import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { MemoPopover } from './memo-popover';

@NgModule({
  declarations: [MemoPopover],
  imports: [FormsModule, IonicPageModule.forChild(MemoPopover), TranslateModule.forChild()],
  entryComponents: [MemoPopover],
})
export class MemoPopoverModule {}
