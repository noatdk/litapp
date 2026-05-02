import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { UserListPage } from './user-list';
import { AuthorListModule } from '../../parts/author-list/author-list.module';

@NgModule({
  declarations: [UserListPage],
  imports: [IonicPageModule.forChild(UserListPage), TranslateModule.forChild(), AuthorListModule],
})
export class UserListPageModule {}
