import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { BrandsService } from './brands.service';
import { BrandsUploadService } from './brands-upload.service';
import { RegisterBrandDto } from './dto/register-brand';
import { UpdateBrandDto } from './dto/update-brand';
import { SupabaseService } from '../../supabase/supabase.service';
import { AdminOnly } from '../../admin/decorators/admin-only.decorator';

@Controller('wholesale-brands')
export class BrandsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly brandsUploadService: BrandsUploadService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerBrand(@Body() registerBrandDto: RegisterBrandDto, @Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    // Get user ID from token
    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.brandsService.registerBrand(registerBrandDto, userData.user.id);
  }

  @Get('my-brand')
  async getMyBrand(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const brand = await this.brandsService.getMyBrand(userData.user.id);
    return brand || { message: 'No brand registration found' };
  }

  @Put('my-brand')
  @HttpCode(HttpStatus.OK)
  async updateMyBrand(@Body() updateBrandDto: UpdateBrandDto, @Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.brandsService.updateBrand(userData.user.id, updateBrandDto);
  }

  // Public endpoint for approved brands (no auth required)
  @Get('approved')
  async getApprovedBrands(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('search') search?: string,
  ) {
    return this.brandsService.getAllBrands('approved', page, limit, search);
  }

  // Public endpoint to get brand by ID (only approved brands)
  @Get('profile/:id')
  async getBrandById(@Param('id') id: string) {
    return this.brandsService.getBrandById(id);
  }

  // Public endpoint to get brand by brand_name (only approved brands)
  @Get('name/:brandName')
  async getBrandByName(@Param('brandName') brandName: string) {
    return this.brandsService.getBrandByName(brandName);
  }

  // Public endpoint to get brand products by brand_name (only for approved brands)
  @Get('name/:brandName/products')
  async getBrandProductsByName(
    @Param('brandName') brandName: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    // First get the brand to get its ID
    const brand = await this.brandsService.getBrandByName(brandName);
    return this.brandsService.getBrandProducts(brand.id, page, limit);
  }

  // Public endpoint to get brand products (only for approved brands)
  @Get('profile/:id/products')
  async getBrandProducts(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.brandsService.getBrandProducts(id, page, limit);
  }

  // Admin endpoints for brand management
  @Get('admin/all')
  @AdminOnly()
  async getAllBrands(
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number = 12,
  ) {
    return this.brandsService.getAllBrands(status, page, limit, search);
  }

  @Get('admin/pending')
  @AdminOnly()
  async getPendingBrands(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number = 12,
  ) {
    return this.brandsService.getAllBrands('pending', page, limit, search);
  }

  @Patch('admin/:id/status')
  @HttpCode(HttpStatus.OK)
  @AdminOnly()
  async updateBrandStatus(
    @Param('id') brandId: string,
    @Body() body: { status: 'approved' | 'rejected' },
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    const supabase = this.supabaseService.getClient();
    const { data: userData } = await supabase.auth.getUser(token || '');
    
    return this.brandsService.updateBrandStatus(brandId, body.status, userData?.user?.id || '');
  }

  @Get('categories')
  async getCategories(
    @Query('includeInactive') includeInactive?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    // Allow authenticated users to fetch categories
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const includeInactiveFlag = includeInactive === 'true';
    const serviceClient = this.supabaseService.getServiceClient();

    let query = serviceClient
      .from('categories')
      .select('id, name, slug, description, image_url, is_active, display_order, created_at, updated_at')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactiveFlag) {
      query = query.eq('is_active', true);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      throw new BadRequestException(`Failed to fetch categories: ${fetchError.message || 'Unknown error'}`);
    }

    return (data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.image_url,
      isActive: cat.is_active,
      displayOrder: cat.display_order,
      createdAt: cat.created_at,
      updatedAt: cat.updated_at,
    }));
  }

  @Post('my-brand/upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit to handle larger images
    },
  }))
  async uploadBrandImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('authorization') authHeader?: string,
    @Req() req?: Request,
  ) {
    console.log('=== UPLOAD DEBUG ===');
    console.log('File received:', file ? { 
      name: file.originalname, 
      size: file.size, 
      mimetype: file.mimetype,
      fieldname: file.fieldname 
    } : 'NO FILE');
    console.log('Request body:', req?.body);
    console.log('Request headers content-type:', req?.headers?.['content-type']);
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    console.log('===================');
    
    if (!file) {
      console.error('File is undefined. Request body:', req?.body);
      console.error('Request headers:', req?.headers);
      throw new BadRequestException('No file provided. Please select an image file and try again. File field name must be "image".');
    }

    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Get imageType from FormData body (parsed by multer)
    const imageType: 'logo' | 'cover' = req?.body?.imageType === 'cover' ? 'cover' : 'logo';
    
    const imageUrl = await this.brandsUploadService.uploadImage(userData.user.id, file, imageType);

    return {
      url: imageUrl,
      message: 'Image uploaded successfully',
    };
  }
}

