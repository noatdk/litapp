import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { MemoButton } from './memo-button';
import { MemoPreview } from './memo-preview';
import { MemoPopoverModule } from '../memo-popover/memo-popover.module';

@NgModule({
  declarations: [MemoButton, MemoPreview],
  imports: [CommonModule, IonicModule, TranslateModule.forChild(), TooltipsModule, MemoPopoverModule],
  exports: [MemoButton, MemoPreview, MemoPopoverModule],
})
export class MemoButtonModule {}
