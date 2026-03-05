import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SocialClosetSearchDto } from '../common/dto/social-closet-search.dto';

@Injectable()
export class ClosetService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async searchCloset(query: SocialClosetSearchDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const limit = Math.max(1, Math.min(query.limit || 24, 50));

    let dbQuery = serviceClient
      .from('social_products')
      .select('*')
      .eq('is_published', true)
      .eq('listing_type', 'closet')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(Math.max(100, limit * 4));

    if (query.cursor) {
      dbQuery = dbQuery.lt('created_at', query.cursor);
    }

    if (query.category) {
      dbQuery = dbQuery.eq('category', query.category);
    }
    if (query.condition) {
      dbQuery = dbQuery.eq('condition', query.condition);
    }
    if (query.size) {
      dbQuery = dbQuery.eq('size', query.size);
    }
    if (query.color) {
      dbQuery = dbQuery.eq('color', query.color);
    }
    if (query.brand) {
      dbQuery = dbQuery.eq('brand', query.brand);
    }
    if (query.minPrice !== undefined) {
      dbQuery = dbQuery.gte('price', query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      dbQuery = dbQuery.lte('price', query.maxPrice);
    }

    const { data } = await dbQuery;
    const products = data || [];

    const filteredByDistance =
      query.lat !== undefined && query.lng !== undefined && query.radiusKm
        ? products.filter((item: any) => {
            if (item.latitude === null || item.longitude === null) {
              return false;
            }
            const distance = this.haversineKm(query.lat!, query.lng!, Number(item.latitude), Number(item.longitude));
            return distance <= query.radiusKm!;
          })
        : products;

    const scored = filteredByDistance.map((item: any) => {
      const distance =
        query.lat !== undefined && query.lng !== undefined && item.latitude !== null && item.longitude !== null
          ? this.haversineKm(query.lat, query.lng, Number(item.latitude), Number(item.longitude))
          : null;
      const distanceBoost = distance === null ? 0.5 : 1 / (1 + distance);
      const conditionScore = this.conditionScore(item.condition);
      const priceValueScore = item.reference_price && Number(item.reference_price) > 0
        ? Math.min(1, Number(item.reference_price) / Math.max(1, Number(item.price)))
        : 0.5;
      const freshness = Math.exp(
        -Math.max(1, (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60)) / 120,
      );
      const q = (query.q || '').trim().toLowerCase();
      const searchable = `${item.title || ''} ${item.description || ''}`.toLowerCase();
      const textRelevance = q ? (searchable.includes(q) ? 1 : 0) : 0.5;
      const engagement = Number(item.engagement_score || 0);

      const score =
        0.24 * textRelevance +
        0.2 * distanceBoost +
        0.16 * priceValueScore +
        0.14 * conditionScore +
        0.12 * Number(item.seller_reputation || 0.5) +
        0.08 * freshness +
        0.06 * engagement;

      return {
        ...item,
        distanceKm: distance,
        score,
      };
    });

    scored.sort((a, b) => {
      switch (query.sortBy) {
        case 'price_asc':
          return Number(a.price) - Number(b.price);
        case 'price_desc':
          return Number(b.price) - Number(a.price);
        case 'nearest':
          return (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER);
        case 'recent':
          return b.created_at.localeCompare(a.created_at);
        default:
          return b.score - a.score || b.created_at.localeCompare(a.created_at);
      }
    });

    const results = scored.slice(0, limit);

    return {
      results,
      nextCursor: results[results.length - 1]?.created_at || null,
    };
  }

  private conditionScore(condition: string | null | undefined) {
    switch ((condition || '').toLowerCase()) {
      case 'like_new':
      case 'like new':
        return 1;
      case 'good':
        return 0.8;
      case 'fair':
        return 0.6;
      default:
        return 0.5;
    }
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

