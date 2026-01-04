import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [CategoriesModule],
  exports: [CategoriesModule],
})
export class AdminModule {}


