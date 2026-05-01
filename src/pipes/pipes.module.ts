import { NgModule } from '@angular/core';

import { CategoryNamePipe } from './categoryName';
import { CompactNumberPipe } from './compactNumber';

@NgModule({
  declarations: [CategoryNamePipe, CompactNumberPipe],
  exports: [CategoryNamePipe, CompactNumberPipe],
})
export class PipesModule {}
