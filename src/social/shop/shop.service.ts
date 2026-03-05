import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SocialShopSearchDto } from '../common/dto/social-shop-search.dto';

@Injectable()
export class ShopService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async search(query: SocialShopSearchDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const limit = Math.max(1, Math.min(query.limit || 24, 50));

    let dbQuery = serviceClient
      .from('social_products')
      .select('*')
      .eq('is_published', true)
      .eq('status', 'active')
      .in('listing_type', ['shop', 'closet'])
      .order('created_at', { ascending: false })
      .limit(Math.max(100, limit * 4));

    if (query.cursor) {
      dbQuery = dbQuery.lt('created_at', query.cursor);
    }

    if (query.category) {
      dbQuery = dbQuery.eq('category', query.category);
    }
    if (query.sourceType && query.sourceType !== 'all') {
      dbQuery = dbQuery.eq('source_type', query.sourceType);
    }
    if (query.minPrice !== undefined) {
      dbQuery = dbQuery.gte('price', query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      dbQuery = dbQuery.lte('price', query.maxPrice);
    }

    const { data } = await dbQuery;
    const products = data || [];
    const normalizedQ = (query.q || '').trim().toLowerCase();

    const scored = products.map((item: any) => {
      const searchable = `${item.title || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
      const textRelevance = normalizedQ ? (searchable.includes(normalizedQ) ? 1 : 0) : 0.5;
      const priceCompetitiveness =
        item.reference_price && Number(item.reference_price) > 0
          ? Math.min(1, Number(item.reference_price) / Math.max(1, Number(item.price)))
          : 0.5;
      const freshness = Math.exp(
        -Math.max(1, (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60)) / 96,
      );

      const score =
        0.24 * textRelevance +
        0.2 * Number(item.context_ctr || 0) +
        0.16 * Number(item.conversion_rate || 0) +
        0.14 * Number(item.inventory_health || 0.5) +
        0.12 * priceCompetitiveness +
        0.08 * Number(item.seller_reputation || 0.5) +
        0.06 * freshness;

      return {
        ...item,
        score,
      };
    });

    scored.sort((a, b) => {
      switch (query.sortBy) {
        case 'price_asc':
          return Number(a.price) - Number(b.price);
        case 'price_desc':
          return Number(b.price) - Number(a.price);
        case 'recent':
          return b.created_at.localeCompare(a.created_at);
        default:
          return b.score - a.score || b.created_at.localeCompare(a.created_at);
      }
    });

    const dedupedBySeller = new Map<string, number>();
    const cappedPerSeller = Math.max(1, Math.floor(limit * 0.3));
    const finalItems: any[] = [];

    for (const item of scored) {
      if (finalItems.length >= limit) {
        break;
      }
      const count = dedupedBySeller.get(item.user_id) || 0;
      if (count >= cappedPerSeller) {
        continue;
      }
      dedupedBySeller.set(item.user_id, count + 1);
      finalItems.push(item);
    }

    return {
      results: finalItems,
      nextCursor: finalItems[finalItems.length - 1]?.created_at || null,
    };
  }
}

