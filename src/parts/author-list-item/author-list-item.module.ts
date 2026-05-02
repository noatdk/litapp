import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { TooltipsModule } from 'ionic-tooltips';

import { AuthorListItem } from './author-list-item';

@NgModule({
  declarations: [AuthorListItem],
  imports: [IonicPageModule.forChild(AuthorListItem), TranslateModule.forChild(), TooltipsModule],
  exports: [AuthorListItem],
})
export class AuthorListItemModule {}
