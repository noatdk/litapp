import { NgModule } from '@angular/core';

import { CategoryNamePipe } from './categoryName';

@NgModule({
  declarations: [CategoryNamePipe],
  exports: [CategoryNamePipe],
})
export class PipesModule {}
