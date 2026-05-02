import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';

import { AuthorList } from './author-list';
import { AuthorListItemModule } from '../author-list-item/author-list-item.module';

@NgModule({
  declarations: [AuthorList],
  imports: [IonicPageModule.forChild(AuthorList), TranslateModule.forChild(), AuthorListItemModule],
  exports: [AuthorList, AuthorListItemModule],
})
export class AuthorListModule {}
