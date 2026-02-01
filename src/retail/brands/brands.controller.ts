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
  ParseIntPipe,
  DefaultValuePipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { RetailBrandsService } from './brands.service';
import { RetailBrandsUploadService } from './brands-upload.service';
import { RegisterRetailBrandDto } from './dto/register-brand';
import { UpdateRetailBrandDto } from './dto/update-brand';
import { SupabaseService } from '../../supabase/supabase.service';
import { AdminOnly } from '../../admin/decorators/admin-only.decorator';

@Controller('retail-brands')
export class RetailBrandsController {
  constructor(
    private readonly brandsService: RetailBrandsService,
    private readonly brandsUploadService: RetailBrandsUploadService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerBrand(@Body() registerBrandDto: RegisterRetailBrandDto, @Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

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
  async updateMyBrand(@Body() updateBrandDto: UpdateRetailBrandDto, @Headers('authorization') authHeader?: string) {
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

  // Public endpoint for approved brands
  @Get('approved')
  async getApprovedBrands(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('search') search?: string,
  ) {
    return this.brandsService.getAllBrands('approved', page, limit, search);
  }

  // Public endpoint to get brand by ID
  @Get('profile/:id')
  async getBrandById(@Param('id') id: string) {
    return this.brandsService.getBrandById(id);
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
    @Body() body: { status: 'approved' | 'rejected'; rejectionReason?: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const token = authHeader?.replace('Bearer ', '');
    const supabase = this.supabaseService.getClient();
    const { data: userData } = await supabase.auth.getUser(token || '');
    
    return this.brandsService.updateBrandStatus(brandId, body.status, userData?.user?.id || '', body.rejectionReason);
  }

  @Post('my-brand/upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
  }))
  async uploadBrandImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers('authorization') authHeader?: string,
    @Req() req?: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided. Please select an image file and try again.');
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

    // Update brand with new image URL
    const updateData = imageType === 'logo' ? { logoUrl: imageUrl } : { coverImageUrl: imageUrl };
    await this.brandsService.updateBrand(userData.user.id, updateData);

    return { url: imageUrl };
  }
}
