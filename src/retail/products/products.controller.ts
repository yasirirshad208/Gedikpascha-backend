import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { RetailProductsService } from './products.service';
import { SupabaseService } from '../../supabase/supabase.service';

@Controller('retail-products')
export class RetailProductsController {
  constructor(
    private readonly productsService: RetailProductsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  async getPublicProducts(
    @Query('brandId') brandId?: string,
    @Query('sortBy') sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular',
    @Query('priceRange') priceRange?: 'under_50' | '50_100' | '100_200' | 'over_200',
    @Query('search') search?: string,
    @Query('filter') filter?: 'all' | 'sale' | 'best-products' | 'recent',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number = 24,
  ) {
    return this.productsService.getPublicProducts(brandId, sortBy, priceRange, search, page, limit, filter);
  }

  @Get('slug/:slug')
  async getProductBySlug(@Param('slug') slug: string) {
    return this.productsService.getProductBySlug(slug);
  }

  @Get('my-products')
  async getMyProducts(
    @Headers('authorization') authHeader?: string,
    @Query('status') status?: 'draft' | 'active' | 'inactive' | 'out_of_stock',
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.productsService.getMyProducts(userData.user.id, status, search, page, limit);
  }

  @Get('my-products/:id')
  async getProductById(
    @Param('id') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.productsService.getProductById(productId, userData.user.id);
  }

  @Get('my-products/:id/inventory')
  async getProductInventory(
    @Param('id') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required');
    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user) throw new UnauthorizedException('Invalid or expired token');
    return this.productsService.getProductInventory(productId, userData.user.id);
  }

  @Put('my-products/:id')
  async updateProduct(
    @Param('id') productId: string,
    @Headers('authorization') authHeader: string,
    @Body() updateData: {
      name?: string;
      description?: string;
      shortDescription?: string;
      retailPrice?: number;
      salePercentage?: number;
      status?: 'draft' | 'active' | 'inactive';
      metaTitle?: string;
      metaDescription?: string;
      lowStockThreshold?: number;
    },
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.productsService.updateProduct(
      productId,
      userData.user.id,
      updateData,
    );
  }

  @Put('my-products/:id/inventory')
  async updateProductInventoryPreserved(
    @Param('id') productId: string,
    @Headers('authorization') authHeader: string,
    @Body() updates: { updates: { id: string; preservedQuantity: number }[] },
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required');
    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user) throw new UnauthorizedException('Invalid or expired token');
    return this.productsService.updateInventoryPreservedQuantities(
      productId,
      userData.user.id,
      updates.updates,
    );
  }
}
