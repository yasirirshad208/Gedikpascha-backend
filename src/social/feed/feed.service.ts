import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

type FeedMode = 'all' | 'posts' | 'reels' | 'closet';

@Injectable()
export class FeedService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getFeed(userId: string | undefined, mode: FeedMode = 'all', limit = 20, cursor?: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const baseLimit = Math.max(1, Math.min(limit, 50));

    const fetchPosts = async () => {
      let query = serviceClient
        .from('social_posts')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(baseLimit);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data } = await query;
      return data || [];
    };

    const fetchReels = async () => {
      let query = serviceClient
        .from('social_reels')
        .select('*')
        .eq('is_published', true)
        .eq('is_live', false)
        .order('created_at', { ascending: false })
        .limit(baseLimit);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data } = await query;
      return data || [];
    };

    const fetchCloset = async () => {
      let query = serviceClient
        .from('social_products')
        .select('*')
        .eq('is_published', true)
        .eq('listing_type', 'closet')
        .in('status', ['active', 'reserved'])
        .order('created_at', { ascending: false })
        .limit(baseLimit);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data } = await query;
      return data || [];
    };

    const [posts, reels, closet] = await Promise.all([
      mode === 'all' || mode === 'posts' ? fetchPosts() : Promise.resolve([]),
      mode === 'all' || mode === 'reels' ? fetchReels() : Promise.resolve([]),
      mode === 'all' || mode === 'closet' ? fetchCloset() : Promise.resolve([]),
    ]);

    return {
      mode,
      userId: userId || null,
      posts,
      reels,
      closet,
      nextCursor:
        posts[posts.length - 1]?.created_at ||
        reels[reels.length - 1]?.created_at ||
        closet[closet.length - 1]?.created_at ||
        null,
    };
  }

  async getExplore(limit = 20) {
    const serviceClient = this.supabaseService.getServiceClient();
    const cappedLimit = Math.max(1, Math.min(limit, 50));

    const [trendingProductsResult, topReelsResult, topSellersResult] = await Promise.all([
      serviceClient
        .from('social_products')
        .select('*')
        .eq('is_published', true)
        .eq('status', 'active')
        .order('engagement_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(cappedLimit),
      serviceClient
        .from('social_reels')
        .select('*')
        .eq('is_published', true)
        .eq('is_live', false)
        .order('engagement_rate', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(cappedLimit),
      serviceClient
        .from('social_profiles')
        .select('*')
        .order('seller_reputation', { ascending: false })
        .order('followers_count', { ascending: false })
        .limit(cappedLimit),
    ]);

    return {
      trendingProducts: trendingProductsResult.data || [],
      topReels: topReelsResult.data || [],
      topSellers: topSellersResult.data || [],
    };
  }

  async createPost(userId: string, body: { caption: string; mediaUrls?: string[]; taggedProductIds?: string[] }) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: post, error } = await serviceClient
      .from('social_posts')
      .insert({
        user_id: userId,
        caption: body.caption,
        is_published: true,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create post: ${error.message}`);
    }

    if (body.mediaUrls?.length) {
      const mediaRows = body.mediaUrls.map((url, index) => ({
        post_id: post.id,
        media_url: url,
        media_type: 'image',
        display_order: index,
      }));
      await serviceClient.from('social_post_media').insert(mediaRows);
    }

    if (body.taggedProductIds?.length) {
      const tagRows = body.taggedProductIds.map((productId) => ({
        content_type: 'post',
        content_id: post.id,
        product_id: productId,
      }));
      await serviceClient.from('social_content_product_tags').insert(tagRows);
    }

    return post;
  }
}

