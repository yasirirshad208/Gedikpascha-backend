import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FavouritesService } from './favourites.service';
import { SupabaseService } from '../../supabase/supabase.service';

@Controller('wholesale/favourites')
export class FavouritesController {
  constructor(
    private readonly favouritesService: FavouritesService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async getUserId(authHeader?: string): Promise<string> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return userData.user.id;
  }

  /**
   * Add a product to favourites
   */
  @Post(':productId')
  @HttpCode(HttpStatus.CREATED)
  async addFavourite(
    @Param('productId') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.favouritesService.addFavourite(userId, productId);
  }

  /**
   * Remove a product from favourites
   */
  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  async removeFavourite(
    @Param('productId') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.favouritesService.removeFavourite(userId, productId);
  }

  /**
   * Toggle favourite status
   */
  @Post(':productId/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleFavourite(
    @Param('productId') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.favouritesService.toggleFavourite(userId, productId);
  }

  /**
   * Get user's favourites list with pagination
   */
  @Get()
  async getUserFavourites(
    @Headers('authorization') authHeader: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.favouritesService.getUserFavourites(userId, page, limit);
  }

  /**
   * Get favourites count
   */
  @Get('count')
  async getFavouritesCount(@Headers('authorization') authHeader?: string) {
    const userId = await this.getUserId(authHeader);
    const count = await this.favouritesService.getFavouritesCount(userId);
    return { count };
  }

  /**
   * Check if a single product is favourited
   */
  @Get('check/:productId')
  async checkFavourite(
    @Param('productId') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    const isFavourited = await this.favouritesService.isFavourited(userId, productId);
    return { productId, isFavourited };
  }

  /**
   * Check favourite status for multiple products (batch)
   * POST body: { productIds: string[] }
   * Returns: { favouritedIds: string[] }
   */
  @Post('check-batch')
  @HttpCode(HttpStatus.OK)
  async checkFavouriteBatch(
    @Body() body: { productIds: string[] },
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    const favouritedIds = await this.favouritesService.getFavouritedProductIds(
      userId,
      body.productIds || [],
    );
    return { favouritedIds: Array.from(favouritedIds) };
  }

  /**
   * Clear all favourites
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clearAllFavourites(@Headers('authorization') authHeader?: string) {
    const userId = await this.getUserId(authHeader);
    return this.favouritesService.clearAllFavourites(userId);
  }
}
