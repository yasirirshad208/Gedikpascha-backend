import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

interface CreateReviewDto {
  productId: string;
  rating: number;
  title?: string;
  comment?: string;
  qualityRating?: number;
  valueRating?: number;
}

interface UpdateReviewDto {
  rating?: number;
  title?: string;
  comment?: string;
  qualityRating?: number;
  valueRating?: number;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Create a new review for a product
   */
  async createReview(userId: string, dto: CreateReviewDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Validate rating
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Check if product exists and is active
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .select('id, status')
      .eq('id', dto.productId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Product not found');
    }

    // Check if user has already reviewed this product
    const { data: existingReview } = await serviceClient
      .from('wholesale_product_reviews')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', dto.productId)
      .single();

    if (existingReview) {
      throw new ConflictException('You have already reviewed this product');
    }

    // Check if user has purchased this product (for verified purchase badge)
    const { data: orderItem } = await serviceClient
      .from('wholesale_order_items')
      .select(`
        id,
        order:wholesale_orders!inner (
          id,
          user_id,
          status
        )
      `)
      .eq('product_id', dto.productId)
      .eq('order.user_id', userId)
      .in('order.status', ['completed', 'delivered'])
      .limit(1)
      .single();

    const isVerifiedPurchase = !!orderItem;

    // Create the review
    const { data: review, error } = await serviceClient
      .from('wholesale_product_reviews')
      .insert({
        product_id: dto.productId,
        user_id: userId,
        rating: dto.rating,
        title: dto.title || null,
        comment: dto.comment || null,
        quality_rating: dto.qualityRating || null,
        value_rating: dto.valueRating || null,
        is_verified_purchase: isVerifiedPurchase,
        is_approved: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw new BadRequestException(`Failed to create review: ${error.message}`);
    }

    // Get user info for response
    const { data: user } = await serviceClient
      .from('users')
      .select('id, name, email')
      .eq('id', userId)
      .single();

    return {
      id: review.id,
      productId: review.product_id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      qualityRating: review.quality_rating,
      valueRating: review.value_rating,
      isVerifiedPurchase: review.is_verified_purchase,
      createdAt: review.created_at,
      user: {
        id: user?.id,
        name: user?.name || 'Anonymous',
      },
      message: 'Review submitted successfully',
    };
  }

  /**
   * Get reviews for a product with pagination
   */
  async getProductReviews(productId: string, page = 1, limit = 10) {
    const serviceClient = this.supabaseService.getServiceClient();
    const offset = (page - 1) * limit;

    // Get total count
    const { count, error: countError } = await serviceClient
      .from('wholesale_product_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('is_approved', true);

    if (countError) {
      throw new BadRequestException(`Failed to count reviews: ${countError.message}`);
    }

    // Get reviews
    const { data: reviews, error } = await serviceClient
      .from('wholesale_product_reviews')
      .select('*')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new BadRequestException(`Failed to fetch reviews: ${error.message}`);
    }

    // Get user info for reviews
    const userIds = [...new Set((reviews || []).map((r: any) => r.user_id))];
    let usersMap = new Map<string, any>();

    if (userIds.length > 0) {
      const { data: users } = await serviceClient
        .from('users')
        .select('id, name, email')
        .in('id', userIds);

      (users || []).forEach((u: any) => {
        usersMap.set(u.id, u);
      });
    }

    // Calculate rating distribution
    const { data: ratingStats } = await serviceClient
      .from('wholesale_product_reviews')
      .select('rating')
      .eq('product_id', productId)
      .eq('is_approved', true);

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;

    (ratingStats || []).forEach((r: any) => {
      ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
      totalRating += r.rating;
    });

    const averageRating = ratingStats?.length ? totalRating / ratingStats.length : 0;

    // Format reviews
    const formattedReviews = (reviews || []).map((review: any) => {
      const user = usersMap.get(review.user_id);
      return {
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        qualityRating: review.quality_rating,
        valueRating: review.value_rating,
        isVerifiedPurchase: review.is_verified_purchase,
        helpfulCount: review.helpful_count,
        createdAt: review.created_at,
        user: {
          id: user?.id || review.user_id,
          name: user?.name || user?.email?.split('@')[0] || 'Anonymous',
        },
      };
    });

    return {
      reviews: formattedReviews,
      stats: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: count || 0,
        ratingDistribution,
      },
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Check if user has already reviewed a product
   */
  async hasUserReviewed(userId: string, productId: string): Promise<boolean> {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data } = await serviceClient
      .from('wholesale_product_reviews')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();

    return !!data;
  }

  /**
   * Get user's review for a product
   */
  async getUserReviewForProduct(userId: string, productId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: review } = await serviceClient
      .from('wholesale_product_reviews')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();

    if (!review) {
      return null;
    }

    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      qualityRating: review.quality_rating,
      valueRating: review.value_rating,
      isVerifiedPurchase: review.is_verified_purchase,
      createdAt: review.created_at,
    };
  }

  /**
   * Update user's review
   */
  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify ownership
    const { data: existingReview, error: findError } = await serviceClient
      .from('wholesale_product_reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .single();

    if (findError || !existingReview) {
      throw new NotFoundException('Review not found');
    }

    if (existingReview.user_id !== userId) {
      throw new BadRequestException('You can only update your own reviews');
    }

    // Validate rating if provided
    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const updateData: any = {};
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.comment !== undefined) updateData.comment = dto.comment;
    if (dto.qualityRating !== undefined) updateData.quality_rating = dto.qualityRating;
    if (dto.valueRating !== undefined) updateData.value_rating = dto.valueRating;

    const { data: review, error } = await serviceClient
      .from('wholesale_product_reviews')
      .update(updateData)
      .eq('id', reviewId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update review: ${error.message}`);
    }

    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      qualityRating: review.quality_rating,
      valueRating: review.value_rating,
      message: 'Review updated successfully',
    };
  }

  /**
   * Delete user's review
   */
  async deleteReview(userId: string, reviewId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify ownership
    const { data: existingReview, error: findError } = await serviceClient
      .from('wholesale_product_reviews')
      .select('id, user_id')
      .eq('id', reviewId)
      .single();

    if (findError || !existingReview) {
      throw new NotFoundException('Review not found');
    }

    if (existingReview.user_id !== userId) {
      throw new BadRequestException('You can only delete your own reviews');
    }

    const { error } = await serviceClient
      .from('wholesale_product_reviews')
      .delete()
      .eq('id', reviewId);

    if (error) {
      throw new BadRequestException(`Failed to delete review: ${error.message}`);
    }

    return { message: 'Review deleted successfully' };
  }

  /**
   * Mark a review as helpful
   */
  async markHelpful(reviewId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: review, error } = await serviceClient
      .from('wholesale_product_reviews')
      .update({ helpful_count: serviceClient.rpc('increment', { x: 1 }) })
      .eq('id', reviewId)
      .select('helpful_count')
      .single();

    // Fallback: manually increment if rpc doesn't work
    if (error) {
      const { data: current } = await serviceClient
        .from('wholesale_product_reviews')
        .select('helpful_count')
        .eq('id', reviewId)
        .single();

      if (current) {
        await serviceClient
          .from('wholesale_product_reviews')
          .update({ helpful_count: (current.helpful_count || 0) + 1 })
          .eq('id', reviewId);
      }
    }

    return { message: 'Marked as helpful' };
  }
}
