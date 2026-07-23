import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RetailProductsService } from './products.service';
import { RetailProductsUploadService } from './products-upload.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { ImportFromWholesaleDto } from './dto/import-from-wholesale.dto';

@Controller('retail-products')
export class RetailProductsController {
  constructor(
    private readonly productsService: RetailProductsService,
    private readonly productsUploadService: RetailProductsUploadService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  async getPublicProducts(
    @Query('brandId') brandId?: string,
    @Query('sortBy') sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular',
    @Query('priceRange')
    priceRange?: 'under_50' | '50_100' | '100_200' | 'over_200',
    @Query('search') search?: string,
    @Query('filter') filter?: 'all' | 'sale' | 'best-products' | 'recent',
    @Query('category') category?: string,
    @Query('subcategory') subcategory?: string,
    @Query('inStock') inStock?: string,
    @Query('colors') colors?: string,
    @Query('sizes') sizes?: string,
    @Query('dynamicFilters') dynamicFilters?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number = 24,
  ) {
    return this.productsService.getPublicProducts(
      brandId,
      sortBy,
      priceRange,
      search,
      page,
      limit,
      filter,
      category,
      subcategory,
      inStock,
      colors,
      sizes,
      dynamicFilters,
    );
  }

  @Get('brand-categories')
  async getBrandCategories(@Query('brandId') brandId: string) {
    if (!brandId) {
      return [];
    }
    return this.productsService.getBrandCategories(brandId);
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

    return this.productsService.getMyProducts(
      userData.user.id,
      status,
      search,
      page,
      limit,
    );
  }

  // List the user's own wholesale products available to import into retail.
  @Get('importable-wholesale')
  async getImportableWholesale(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.productsService.getImportableWholesaleProducts(
      userData.user.id,
    );
  }

  // Import one of the user's own wholesale products into their retail store.
  @Post('import-wholesale')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  async importFromWholesale(
    @Body() dto: ImportFromWholesaleDto,
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

    return this.productsService.importFromWholesale(userData.user.id, dto);
  }

  // Upload a retail product image; returns the public URL to attach via update.
  @Post('upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
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
    if (!file) {
      throw new BadRequestException('No file provided. Please select an image.');
    }
    const url = await this.productsUploadService.uploadImage(
      userData.user.id,
      file,
    );
    return { url };
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
    if (error || !userData.user)
      throw new UnauthorizedException('Invalid or expired token');
    return this.productsService.getProductInventory(
      productId,
      userData.user.id,
    );
  }

  @Put('my-products/:id')
  async updateProduct(
    @Param('id') productId: string,
    @Headers('authorization') authHeader: string,
    @Body()
    updateData: {
      name?: string;
      slug?: string;
      sku?: string;
      description?: string;
      shortDescription?: string;
      retailPrice?: number;
      compareAtPrice?: number | null;
      salePercentage?: number;
      status?: 'draft' | 'active' | 'inactive';
      categoryId?: string | null;
      subcategoryId?: string | null;
      metaTitle?: string;
      metaDescription?: string;
      metaKeywords?: string;
      lowStockThreshold?: number;
      productDetails?: Record<string, any> | null;
      images?: Array<{
        imageUrl: string;
        displayOrder?: number;
        altText?: string;
        isPrimary?: boolean;
      }>;
      variations?: Array<{
        variationType: string;
        name: string;
        value?: string;
        isAvailable?: boolean;
        displayOrder?: number;
      }>;
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
    @Body()
    body: { updates: { combinationKey: string; preservedQuantity: number }[] },
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required');
    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user)
      throw new UnauthorizedException('Invalid or expired token');
    return this.productsService.updateInventoryPreservedQuantities(
      productId,
      userData.user.id,
      body.updates,
    );
  }

  @Patch('my-products/bulk-status/exchangeable')
  async bulkToggleExchangeable(
    @Headers('authorization') authHeader: string,
    @Body() body: { isExchangeable: boolean },
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required');
    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user)
      throw new UnauthorizedException('Invalid or expired token');
    return this.productsService.setAllExchangeable(
      userData.user.id,
      body.isExchangeable,
    );
  }

  @Patch('my-products/:id/exchangeable')
  async toggleExchangeable(
    @Param('id') productId: string,
    @Headers('authorization') authHeader: string,
    @Body() body: { isExchangeable: boolean },
  ) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required');
    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user)
      throw new UnauthorizedException('Invalid or expired token');
    return this.productsService.toggleExchangeable(
      productId,
      userData.user.id,
      body.isExchangeable,
    );
  }
}
