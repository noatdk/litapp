import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { EntityPicker } from './entity-picker';

@NgModule({
  declarations: [EntityPicker],
  imports: [FormsModule, IonicPageModule.forChild(EntityPicker), TranslateModule.forChild()],
  entryComponents: [EntityPicker],
})
export class EntityPickerModule {}
