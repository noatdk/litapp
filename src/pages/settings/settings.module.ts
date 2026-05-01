import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonicPageModule } from 'ionic-angular';

import { SettingsPage } from './settings';
import { EntityPickerModule } from '../../parts/entity-picker/entity-picker.module';

@NgModule({
  declarations: [SettingsPage],
  imports: [IonicPageModule.forChild(SettingsPage), TranslateModule.forChild(), EntityPickerModule],
  exports: [SettingsPage],
})
export class SettingsPageModule {}
