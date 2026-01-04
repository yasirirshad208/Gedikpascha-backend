import { Controller, Get, Param } from '@nestjs/common';
import { PublicCategoriesService } from './categories.service';

@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: PublicCategoriesService) {}

  @Get()
  async getAllCategories() {
    return this.categoriesService.getAllCategoriesWithSubcategories();
  }

  @Get(':slug')
  async getCategoryBySlug(@Param('slug') slug: string) {
    return this.categoriesService.getCategoryBySlug(slug);
  }
}
