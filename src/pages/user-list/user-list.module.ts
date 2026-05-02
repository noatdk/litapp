import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { UserListPage } from './user-list';
import { AuthorListItemModule } from '../../parts/author-list-item/author-list-item.module';

@NgModule({
  declarations: [UserListPage],
  imports: [IonicPageModule.forChild(UserListPage), TranslateModule.forChild(), AuthorListItemModule],
})
export class UserListPageModule {}
