import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { UserListPage } from './user-list';

@NgModule({
  declarations: [UserListPage],
  imports: [IonicPageModule.forChild(UserListPage), TranslateModule.forChild()],
})
export class UserListPageModule {}
