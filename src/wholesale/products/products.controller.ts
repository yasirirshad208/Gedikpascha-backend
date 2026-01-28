import {
  Controller,
  Post,
  Get,
  Put,
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
  UseInterceptors,
  UploadedFile,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { ProductsUploadService } from './products-upload.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SupabaseService } from '../../supabase/supabase.service';

@Controller('wholesale-products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsUploadService: ProductsUploadService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async getUserFromToken(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return userData.user;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true,
    forbidNonWhitelisted: false,
    transformOptions: {
      enableImplicitConversion: true, // Auto convert string to number, etc.
    },
  }))
  async createProduct(
    @Body() createProductDto: CreateProductDto,
    @Headers('authorization') authHeader?: string,
  ) {
    try {
      const user = await this.getUserFromToken(authHeader);
      return await this.productsService.createProduct(createProductDto, user.id);
    } catch (error) {
      console.error('Error in createProduct controller:', error);
      throw error; // Re-throw to let NestJS handle it
    }
  }

  @Get('my-products')
  async getMyProducts(
    @Headers('authorization') authHeader?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.productsService.getMyProducts(user.id, page, limit, search, categoryId, status);
  }

  // Public endpoints (no auth required)
  @Get('popular')
  async getPopularProducts(
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number = 24,
  ) {
    return this.productsService.getPopularProducts(limit);
  }

  @Get('new-arrivals')
  async getNewArrivals(
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number = 24,
  ) {
    return this.productsService.getNewArrivals(limit);
  }

  @Get('sale')
  async getSaleProducts(
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number = 24,
  ) {
    return this.productsService.getSaleProducts(limit);
  }

  @Get('search-suggestions')
  async getSearchSuggestions(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(8), ParseIntPipe) limit: number = 8,
  ) {
    if (!query || query.trim().length < 2) {
      return { suggestions: [] };
    }
    return this.productsService.getSearchSuggestions(query.trim(), limit);
  }

  @Get('categories')
  async getCategories() {
    // Public endpoint - no auth required
    const serviceClient = this.supabaseService.getServiceClient();
    
    const { data, error } = await serviceClient
      .from('categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to fetch categories: ${error.message || 'Unknown error'}`);
    }

    return (data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));
  }

  @Get('subcategories')
  async getSubcategories(
    @Query('categoryId') categoryId?: string,
  ) {
    // Public endpoint - no auth required
    const serviceClient = this.supabaseService.getServiceClient();
    
    let query = serviceClient
      .from('subcategories')
      .select('id, name, slug, category_id')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch subcategories: ${error.message || 'Unknown error'}`);
    }

    return (data || []).map((sub: any) => ({
      id: sub.id,
      name: sub.name,
      slug: sub.slug,
      categoryId: sub.category_id,
    }));
  }

  @Get('category-filters')
  async getCategoryFilters(
    @Query('categoryId') categoryId?: string,
  ) {
    // Public endpoint - no auth required
    // Returns filter configuration for a specific category
    const serviceClient = this.supabaseService.getServiceClient();
    
    if (!categoryId || categoryId === 'all') {
      return [];
    }

    const { data, error } = await serviceClient
      .from('category_filter_config')
      .select('*')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching category filters:', error);
      return [];
    }

    return (data || []).map((filter: any) => ({
      key: filter.filter_key,
      label: filter.filter_label,
      type: filter.filter_type,
      dataSource: filter.data_source,
      dataPath: filter.data_path,
      options: filter.options,
      isRequired: filter.is_required,
    }));
  }

  @Get('brands')
  async getBrands() {
    // Public endpoint - returns all approved brands for filtering
    const serviceClient = this.supabaseService.getServiceClient();
    
    const { data, error } = await serviceClient
      .from('wholesale_brands')
      .select('id, brand_name, display_name, logo_url')
      .eq('status', 'approved')
      .order('display_name', { ascending: true });

    if (error) {
      throw new BadRequestException(`Failed to fetch brands: ${error.message || 'Unknown error'}`);
    }

    return (data || []).map((brand: any) => ({
      id: brand.id,
      name: brand.display_name || brand.brand_name,
      slug: brand.brand_name,
      logoUrl: brand.logo_url,
    }));
  }

  @Get('slug/:slug')
  async getProductBySlug(
    @Param('slug') slug: string,
    @Headers('authorization') authHeader?: string,
  ) {
    try {
      const user = authHeader ? await this.getUserFromToken(authHeader) : null;
      return await this.productsService.getProductBySlug(slug, user?.id);
    } catch (error) {
      console.error('Error in getProductBySlug controller:', error);
      throw error;
    }
  }

  @Get(':id')
  async getProduct(
    @Param('id') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.productsService.getProductById(productId, user.id);
  }

  @Get()
  async getAllProducts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number = 24,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('filter') filter?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('minOrder') minOrder?: string,
    @Query('brandIds') brandIds?: string,
    @Query('rating') rating?: string,
    @Query('inStock') inStock?: string,
    @Query('freeShipping') freeShipping?: string,
    @Query('colors') colors?: string,
    @Query('sizes') sizes?: string,
    @Query('materials') materials?: string,
    @Query('gender') gender?: string,
    @Query('productType') productType?: string,
    @Query('style') style?: string,
    @Query('features') features?: string,
    // Dynamic filters - can be any category-specific filter
    @Query('filters') dynamicFilters?: string,
  ) {
    const priceMinNum = priceMin ? parseFloat(priceMin) : undefined;
    const priceMaxNum = priceMax ? parseFloat(priceMax) : undefined;
    const minOrderNum = minOrder ? parseInt(minOrder, 10) : undefined;
    const ratingNum = rating ? parseFloat(rating) : undefined;
    const inStockBool = inStock === 'true' ? true : inStock === 'false' ? false : undefined;
    const freeShippingBool = freeShipping === 'true' ? true : undefined;
    
    // Parse comma-separated arrays
    const brandIdArray = brandIds ? brandIds.split(',').filter(Boolean) : undefined;
    const colorArray = colors ? colors.split(',').filter(Boolean) : undefined;
    const sizeArray = sizes ? sizes.split(',').filter(Boolean) : undefined;
    const materialArray = materials ? materials.split(',').filter(Boolean) : undefined;
    const genderArray = gender ? gender.split(',').filter(Boolean) : undefined;
    const productTypeArray = productType ? productType.split(',').filter(Boolean) : undefined;
    const styleArray = style ? style.split(',').filter(Boolean) : undefined;
    const featuresArray = features ? features.split(',').filter(Boolean) : undefined;
    
    // Parse dynamic filters JSON
    let parsedDynamicFilters: Record<string, string[]> | undefined;
    if (dynamicFilters) {
      try {
        parsedDynamicFilters = JSON.parse(dynamicFilters);
      } catch (e) {
        console.error('Failed to parse dynamic filters:', e);
      }
    }
    
    return this.productsService.getAllProducts(
      page, 
      limit, 
      search, 
      categoryId, 
      subcategoryId,
      sortBy, 
      filter,
      priceMinNum,
      priceMaxNum,
      minOrderNum,
      brandIdArray,
      ratingNum,
      inStockBool,
      freeShippingBool,
      colorArray,
      sizeArray,
      materialArray,
      genderArray,
      productTypeArray,
      styleArray,
      featuresArray,
      parsedDynamicFilters,
    );
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateProduct(
    @Param('id') productId: string,
    @Body() updateProductDto: UpdateProductDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.productsService.updateProduct(productId, updateProductDto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteProduct(
    @Param('id') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.productsService.deleteProduct(productId, user.id);
  }

  @Post(':id/upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
  }))
  async uploadProductImage(
    @Param('id') productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('authorization') authHeader?: string,
    @Query('displayOrder', new DefaultValuePipe(0), ParseIntPipe) displayOrder: number = 0,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided. Please select an image file.');
    }

    const user = await this.getUserFromToken(authHeader);

    // Verify product exists and user owns it
    try {
      await this.productsService.getProductById(productId, user.id);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Product not found or you do not have permission.');
    }

    const imageUrl = await this.productsUploadService.uploadImage(
      user.id,
      productId,
      file,
      displayOrder,
    );

    // Create image record in database
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: existingImages } = await serviceClient
      .from('wholesale_product_images')
      .select('id')
      .eq('product_id', productId);

    const isPrimary = !existingImages || existingImages.length === 0;

    const { error: imageRecordError } = await serviceClient
      .from('wholesale_product_images')
      .insert({
        product_id: productId,
        image_url: imageUrl,
        display_order: displayOrder,
        alt_text: file.originalname || null,
        is_primary: isPrimary,
      });

    if (imageRecordError) {
      console.error('Failed to create image record:', imageRecordError);
      // Still return the URL even if record creation fails
    }

    return {
      url: imageUrl,
      message: 'Image uploaded successfully',
    };
  }
}

