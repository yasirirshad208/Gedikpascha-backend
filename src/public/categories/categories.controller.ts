import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  PublicCategoriesService,
  PRODUCT_SCOPES,
  ProductScope,
} from './categories.service';

@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: PublicCategoriesService) {}

  /**
   * `scope` limits the list to categories that have products in that
   * marketplace, so a menu never offers a category that is empty on the page
   * it links to. An unknown value is ignored rather than rejected, so a stale
   * client falls back to the previous behaviour instead of breaking.
   */
  @Get()
  async getAllCategories(@Query('scope') scope?: string) {
    const resolved = PRODUCT_SCOPES.includes(scope as ProductScope)
      ? (scope as ProductScope)
      : undefined;
    return this.categoriesService.getAllCategoriesWithSubcategories(resolved);
  }

  @Get(':slug')
  async getCategoryBySlug(@Param('slug') slug: string) {
    return this.categoriesService.getCategoryBySlug(slug);
  }
}
