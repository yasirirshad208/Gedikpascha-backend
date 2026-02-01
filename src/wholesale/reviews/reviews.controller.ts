import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { ReviewsService } from './reviews.service';
import { SupabaseService } from '../../supabase/supabase.service';

@Controller('wholesale/reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
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

  private async getOptionalUserId(authHeader?: string): Promise<string | null> {
    if (!authHeader) return null;

    try {
      const token = authHeader.replace('Bearer ', '');
      const supabase = this.supabaseService.getClient();
      const { data: userData, error } = await supabase.auth.getUser(token);

      if (error || !userData.user) return null;
      return userData.user.id;
    } catch {
      return null;
    }
  }

  /**
   * Create a new review
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @Body()
    body: {
      productId: string;
      rating: number;
      title?: string;
      comment?: string;
      qualityRating?: number;
      valueRating?: number;
    },
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.reviewsService.createReview(userId, body);
  }

  /**
   * Get reviews for a product (public)
   */
  @Get('product/:productId')
  async getProductReviews(
    @Param('productId') productId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.reviewsService.getProductReviews(productId, page, limit);
  }

  /**
   * Check if current user has reviewed a product
   */
  @Get('check/:productId')
  async checkUserReview(
    @Param('productId') productId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getOptionalUserId(authHeader);

    if (!userId) {
      return { hasReviewed: false, review: null };
    }

    const review = await this.reviewsService.getUserReviewForProduct(
      userId,
      productId,
    );
    return {
      hasReviewed: !!review,
      review,
    };
  }

  /**
   * Update a review
   */
  @Put(':reviewId')
  @HttpCode(HttpStatus.OK)
  async updateReview(
    @Param('reviewId') reviewId: string,
    @Body()
    body: {
      rating?: number;
      title?: string;
      comment?: string;
      qualityRating?: number;
      valueRating?: number;
    },
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.reviewsService.updateReview(userId, reviewId, body);
  }

  /**
   * Delete a review
   */
  @Delete(':reviewId')
  @HttpCode(HttpStatus.OK)
  async deleteReview(
    @Param('reviewId') reviewId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const userId = await this.getUserId(authHeader);
    return this.reviewsService.deleteReview(userId, reviewId);
  }

  /**
   * Mark a review as helpful
   */
  @Post(':reviewId/helpful')
  @HttpCode(HttpStatus.OK)
  async markHelpful(@Param('reviewId') reviewId: string) {
    return this.reviewsService.markHelpful(reviewId);
  }
}
