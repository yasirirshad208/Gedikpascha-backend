import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class FavouritesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Add a product to user's favourites
   */
  async addFavourite(userId: string, productId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if product exists and is active
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .select('id, status')
      .eq('id', productId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Product not found');
    }

    // Add to favourites (unique constraint will prevent duplicates)
    const { data, error } = await serviceClient
      .from('wholesale_favourites')
      .insert({
        user_id: userId,
        product_id: productId,
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate entry gracefully
      if (error.code === '23505') {
        return { message: 'Product already in favourites', isFavourited: true };
      }
      throw new BadRequestException(`Failed to add favourite: ${error.message}`);
    }

    return {
      id: data.id,
      productId: data.product_id,
      message: 'Product added to favourites',
      isFavourited: true,
    };
  }

  /**
   * Remove a product from user's favourites
   */
  async removeFavourite(userId: string, productId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { error } = await serviceClient
      .from('wholesale_favourites')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);

    if (error) {
      throw new BadRequestException(`Failed to remove favourite: ${error.message}`);
    }

    return {
      productId,
      message: 'Product removed from favourites',
      isFavourited: false,
    };
  }

  /**
   * Toggle favourite status (add if not exists, remove if exists)
   */
  async toggleFavourite(userId: string, productId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if already favourited
    const { data: existing } = await serviceClient
      .from('wholesale_favourites')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();

    if (existing) {
      return this.removeFavourite(userId, productId);
    } else {
      return this.addFavourite(userId, productId);
    }
  }

  /**
   * Check if a single product is favourited by user
   */
  async isFavourited(userId: string, productId: string): Promise<boolean> {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data } = await serviceClient
      .from('wholesale_favourites')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();

    return !!data;
  }

  /**
   * Check favourite status for multiple products at once (optimized batch query)
   * Returns a Set of favourited product IDs for O(1) lookup
   */
  async getFavouritedProductIds(userId: string, productIds: string[]): Promise<Set<string>> {
    if (!productIds.length) return new Set();

    const serviceClient = this.supabaseService.getServiceClient();

    const { data, error } = await serviceClient
      .from('wholesale_favourites')
      .select('product_id')
      .eq('user_id', userId)
      .in('product_id', productIds);

    if (error) {
      console.error('Error fetching favourite status:', error);
      return new Set();
    }

    return new Set(data?.map(f => f.product_id) || []);
  }

  /**
   * Get all favourited products for a user with pagination
   */
  async getUserFavourites(userId: string, page = 1, limit = 20) {
    const serviceClient = this.supabaseService.getServiceClient();
    const offset = (page - 1) * limit;

    // Get total count
    const { count, error: countError } = await serviceClient
      .from('wholesale_favourites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      throw new BadRequestException(`Failed to count favourites: ${countError.message}`);
    }

    // Get favourites with product details
    const { data: favourites, error } = await serviceClient
      .from('wholesale_favourites')
      .select(`
        id,
        created_at,
        product:wholesale_products (
          id,
          name,
          slug,
          description,
          wholesale_price,
          sale_percentage,
          min_order_quantity,
          status,
          rating,
          review_count,
          favourites_count,
          wholesale_brand_id
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new BadRequestException(`Failed to fetch favourites: ${error.message}`);
    }

    // Get product IDs to fetch images and brand info
    const productIds = favourites
      ?.map((f: any) => f.product?.id)
      .filter(Boolean) || [];

    const brandIds = favourites
      ?.map((f: any) => f.product?.wholesale_brand_id)
      .filter(Boolean) || [];

    // Fetch images and brands in parallel
    const [imagesResult, brandsResult] = await Promise.all([
      productIds.length > 0
        ? serviceClient
            .from('wholesale_product_images')
            .select('product_id, image_url, is_primary, display_order')
            .in('product_id', productIds)
            .order('display_order', { ascending: true })
        : { data: [] },
      brandIds.length > 0
        ? serviceClient
            .from('wholesale_brands')
            .select('id, brand_name, display_name')
            .in('id', brandIds)
        : { data: [] },
    ]);

    // Create lookup maps for O(1) access
    const imagesByProduct = new Map<string, any[]>();
    (imagesResult.data || []).forEach((img: any) => {
      if (!imagesByProduct.has(img.product_id)) {
        imagesByProduct.set(img.product_id, []);
      }
      imagesByProduct.get(img.product_id)!.push(img);
    });

    const brandsById = new Map<string, any>();
    (brandsResult.data || []).forEach((brand: any) => {
      brandsById.set(brand.id, brand);
    });

    // Format the response
    const formattedFavourites = (favourites || [])
      .filter((f: any) => f.product && f.product.status === 'active')
      .map((favourite: any) => {
        const product = favourite.product;
        const images = imagesByProduct.get(product.id) || [];
        const brand = brandsById.get(product.wholesale_brand_id);
        const primaryImage = images.find((img: any) => img.is_primary) || images[0];

        return {
          id: favourite.id,
          favouritedAt: favourite.created_at,
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            wholesalePrice: product.wholesale_price ? parseFloat(product.wholesale_price) : 0,
            salePercentage: product.sale_percentage || 0,
            minOrderQuantity: product.min_order_quantity,
            rating: product.rating ? parseFloat(product.rating) : 0,
            reviewCount: product.review_count || 0,
            favouritesCount: product.favourites_count || 0,
            imageUrl: primaryImage?.image_url || null,
            brandName: brand?.display_name || brand?.brand_name || 'Unknown Brand',
          },
          isFavourited: true,
        };
      });

    return {
      favourites: formattedFavourites,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get favourites count for a user
   */
  async getFavouritesCount(userId: string): Promise<number> {
    const serviceClient = this.supabaseService.getServiceClient();

    const { count, error } = await serviceClient
      .from('wholesale_favourites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      return 0;
    }

    return count || 0;
  }

  /**
   * Clear all favourites for a user
   */
  async clearAllFavourites(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { error } = await serviceClient
      .from('wholesale_favourites')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(`Failed to clear favourites: ${error.message}`);
    }

    return { message: 'All favourites cleared' };
  }
}
