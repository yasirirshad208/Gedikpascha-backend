import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Controller('admin/categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async verifyAdmin(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Check if user is admin
    const userMetadata = userData.user.user_metadata || {};
    const isAdmin =
      userMetadata.role === 'admin' ||
      userMetadata.isAdmin === true ||
      userMetadata.isAdmin === 'true';

    if (!isAdmin) {
      throw new UnauthorizedException('Admin access required');
    }

    return userData.user;
  }

  @Get()
  async getAllCategories(
    @Query('includeInactive') includeInactive?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    const includeInactiveFlag = includeInactive === 'true';
    return this.categoriesService.getAllCategories(includeInactiveFlag);
  }

  @Get(':id')
  async getCategoryById(
    @Param('id') categoryId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.getCategoryById(categoryId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createCategory(
    @Body() createCategoryDto: CreateCategoryDto,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.createCategory(createCategoryDto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateCategory(
    @Param('id') categoryId: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.updateCategory(categoryId, updateCategoryDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteCategory(
    @Param('id') categoryId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.deleteCategory(categoryId);
  }

  // Subcategory endpoints
  @Post('subcategories')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createSubcategory(
    @Body() createSubcategoryDto: CreateSubcategoryDto,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.createSubcategory(createSubcategoryDto);
  }

  @Get('subcategories/category/:categoryId')
  async getSubcategoriesByCategory(
    @Param('categoryId') categoryId: string,
    @Query('includeInactive') includeInactive?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    const includeInactiveFlag = includeInactive === 'true';
    return this.categoriesService.getSubcategoriesByCategory(categoryId, includeInactiveFlag);
  }

  @Put('subcategories/:id')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateSubcategory(
    @Param('id') subcategoryId: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.updateSubcategory(subcategoryId, updateSubcategoryDto);
  }

  @Delete('subcategories/:id')
  @HttpCode(HttpStatus.OK)
  async deleteSubcategory(
    @Param('id') subcategoryId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    await this.verifyAdmin(authHeader);
    return this.categoriesService.deleteSubcategory(subcategoryId);
  }
}
