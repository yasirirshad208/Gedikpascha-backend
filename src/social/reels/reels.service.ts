import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateSocialReelDto } from './dto/create-social-reel.dto';

@Injectable()
export class ReelsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getReelsFeed(userId: string | undefined, limit = 20, cursor?: string, category?: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const cappedLimit = Math.max(1, Math.min(limit, 50));

    let query = serviceClient
      .from('social_reels')
      .select('*')
      .eq('is_published', true)
      .eq('is_live', false)
      .order('created_at', { ascending: false })
      .limit(Math.max(cappedLimit * 3, 60));

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: reels } = await query;
    const allReels = reels || [];

    const scored = allReels.map((reel: any) => {
      const ageHours = Math.max(
        1,
        (Date.now() - new Date(reel.created_at).getTime()) / (1000 * 60 * 60),
      );
      const freshness = Math.exp(-ageHours / 72);

      const score =
        0.3 * Number(reel.watch_completion || 0) +
        0.22 * Number(reel.engagement_rate || 0) +
        0.16 * freshness +
        0.12 * Number(reel.creator_affinity || 0) +
        0.1 * Number(reel.product_click_through || 0) +
        0.06 * Number(reel.quality_score || 0) +
        0.04 * Number(reel.seller_trust || 0);

      return {
        ...reel,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));

    const categoryLimits = new Map<string, number>();
    const creatorLimits = new Map<string, number>();
    const diversityApplied: any[] = [];

    for (const reel of scored) {
      if (diversityApplied.length >= cappedLimit) {
        break;
      }

      const categoryKey = reel.category || 'uncategorized';
      const categoryCount = categoryLimits.get(categoryKey) || 0;
      const creatorCount = creatorLimits.get(reel.user_id) || 0;
      const categoryCap = Math.ceil(cappedLimit * 0.35);

      if (creatorCount >= 2) {
        continue;
      }
      if (categoryCount >= categoryCap) {
        continue;
      }

      categoryLimits.set(categoryKey, categoryCount + 1);
      creatorLimits.set(reel.user_id, creatorCount + 1);
      diversityApplied.push(reel);
    }

    const remaining = scored.filter((reel) => !diversityApplied.find((x) => x.id === reel.id));
    while (diversityApplied.length < cappedLimit && remaining.length) {
      const next = remaining.shift();
      if (next) {
        diversityApplied.push(next);
      }
    }

    return {
      userId: userId || null,
      reels: diversityApplied,
      nextCursor: diversityApplied[diversityApplied.length - 1]?.created_at || null,
    };
  }

  async createReel(userId: string, dto: CreateSocialReelDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: reel, error } = await serviceClient
      .from('social_reels')
      .insert({
        user_id: userId,
        caption: dto.caption,
        reel_url: dto.reelUrl,
        thumbnail_url: dto.thumbnailUrl || null,
        category: dto.category || null,
        is_published: true,
        is_live: false,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create reel: ${error.message}`);
    }

    if (dto.taggedProductIds?.length) {
      const tagRows = dto.taggedProductIds.map((productId) => ({
        content_type: 'reel',
        content_id: reel.id,
        product_id: productId,
      }));
      await serviceClient.from('social_content_product_tags').insert(tagRows);
    }

    return reel;
  }
}

