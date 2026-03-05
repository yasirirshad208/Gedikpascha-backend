import { Body, Controller, Get, Headers, Param, Patch, Post, ValidationPipe } from '@nestjs/common';
import { SocialAuthService } from '../common/social-auth.service';
import { CreateSocialProductDto } from './dto/create-social-product.dto';
import { ImportRetailProductDto } from './dto/import-retail-product.dto';
import { UpdateSocialProductDto } from './dto/update-social-product.dto';
import { SocialProductsService } from './products.service';

@Controller('social/products')
export class SocialProductsController {
  constructor(
    private readonly productsService: SocialProductsService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Post()
  async createProduct(
    @Body(new ValidationPipe({ transform: true })) dto: CreateSocialProductDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.createProduct(user.id, dto);
  }

  @Get('my')
  async getMyProducts(@Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.getMyProducts(user.id);
  }

  @Get('importable-retail')
  async getImportableRetail(@Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.getImportableRetail(user.id);
  }

  @Post('import-retail')
  async importRetailProduct(
    @Body(new ValidationPipe({ transform: true })) dto: ImportRetailProductDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.importRetailProduct(user.id, dto);
  }

  @Patch(':id')
  async updateProduct(
    @Param('id') productId: string,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateSocialProductDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.updateProduct(user.id, productId, dto);
  }

  @Post(':id/publish')
  async publishProduct(@Param('id') productId: string, @Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.publishProduct(user.id, productId);
  }

  @Post(':id/mark-sold')
  async markSold(@Param('id') productId: string, @Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.productsService.markSold(user.id, productId);
  }
}
