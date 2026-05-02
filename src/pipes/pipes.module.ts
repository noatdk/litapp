import { NgModule } from '@angular/core';

import { CategoryNamePipe } from './categoryName';
import { CompactNumberPipe } from './compactNumber';
import { LanguageNamePipe } from './languageName';

@NgModule({
  declarations: [CategoryNamePipe, CompactNumberPipe, LanguageNamePipe],
  exports: [CategoryNamePipe, CompactNumberPipe, LanguageNamePipe],
})
export class PipesModule {}
