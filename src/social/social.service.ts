import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type FeedMode = 'all' | 'posts' | 'reels' | 'closet';
type ListingType = 'shop' | 'closet';

interface RankedCursor {
  score: number;
  createdAt: string;
  id: string;
}

interface FeedCursor {
  createdAt: string;
}

interface ProductSearchOptions {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  subSubcategoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  limit?: number;
  cursor?: string;
}

interface UserProfileRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  following_count: number | null;
  swaps_completed: number | null;
  sales_count: number | null;
  rating_avg: number | null;
  response_rate: number | null;
  seller_reputation: number | null;
  bio: string | null;
}

interface NormalizedVariationColorOption {
  label: string;
  value: string;
}

interface NormalizedProductVariation {
  variation_name: string;
  variation_type: 'text' | 'color';
  variation_values: string[];
  variation_options: NormalizedVariationColorOption[];
  display_order: number;
}

export interface ProductDetailItem {
  key: string;
  value: string;
}

interface NormalizedProductAttributes {
  shippingInfo: string | null;
  shippingMethod: string | null;
  shippingCost: number | null;
  handlingTimeDays: number | null;
  returnPolicy: string | null;
  additionalDetails: ProductDetailItem[];
}

@Injectable()
export class SocialService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private get serviceClient() {
    return this.supabaseService.getServiceClient();
  }

  private sanitizeLimit(
    limitValue: number | string | undefined,
    fallback = 20,
    max = 50,
  ): number {
    const limit = Number(limitValue);
    if (!Number.isFinite(limit) || limit <= 0) {
      return fallback;
    }
    return Math.min(max, Math.floor(limit));
  }

  private asNumber(value: number | string | undefined): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return parsed;
  }

  private slugifyText(value: string | undefined | null): string {
    if (!value) return '';
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private resolveProductSlug(
    rawSlug: string | undefined,
    title: string,
  ): string {
    const provided = this.slugifyText(rawSlug);
    if (provided) return provided;
    const fromTitle = this.slugifyText(title);
    if (fromTitle) return fromTitle;
    return `item-${Date.now()}`;
  }

  private sanitizeUsername(value: string | undefined | null): string {
    const normalized = String(value ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized.slice(0, 40);
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const typed = error as { code?: string; message?: string };
    return typed.code === '23505' || Boolean(typed.message?.includes('duplicate key'));
  }

  private async ensureSocialProfile(userId: string) {
    const { data: existing, error: existingError } = await this.serviceClient
      .from('social_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) {
      throw new BadRequestException(
        `Failed to fetch social profile: ${existingError.message}`,
      );
    }
    if (existing) return existing;

    const { data: userRow, error: userError } = await this.serviceClient
      .from('users')
      .select('id, email, full_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (userError) {
      throw new BadRequestException(
        `Failed to resolve user for profile bootstrap: ${userError.message}`,
      );
    }
    if (!userRow) return null;

    const emailBase = String(userRow.email ?? '').split('@')[0];
    const fullNameBase = String(userRow.full_name ?? '')
      .trim()
      .replace(/\s+/g, '_');
    const base =
      this.sanitizeUsername(emailBase) ||
      this.sanitizeUsername(fullNameBase) ||
      `user_${userId.slice(0, 8)}`;
    const fallback = `${base}_${userId.slice(0, 8)}`;
    const usernameCandidates = Array.from(new Set([base, fallback]));

    let inserted: any = null;
    for (const candidate of usernameCandidates) {
      const { data: insertedRow, error: insertError } = await this.serviceClient
        .from('social_profiles')
        .insert({
          user_id: userId,
          username: candidate,
          display_name: userRow.full_name ?? candidate,
          avatar_url: userRow.avatar_url ?? null,
        })
        .select('*')
        .maybeSingle();

      if (!insertError && insertedRow) {
        inserted = insertedRow;
        break;
      }
      if (!this.isUniqueViolation(insertError)) {
        throw new BadRequestException(
          `Failed to bootstrap social profile: ${insertError?.message}`,
        );
      }
    }

    if (inserted) return inserted;

    const { data: afterInsert, error: afterInsertError } = await this.serviceClient
      .from('social_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (afterInsertError) {
      throw new BadRequestException(
        `Failed to fetch bootstrapped social profile: ${afterInsertError.message}`,
      );
    }
    return afterInsert ?? null;
  }

  private normalizeStatusMediaType(value: unknown): 'image' | 'video' {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      throw new BadRequestException('Status mediaType is required');
    }

    if (normalized === 'image' || normalized === 'video') {
      return normalized;
    }

    if (normalized.startsWith('image/')) {
      return 'image';
    }
    if (normalized.startsWith('video/')) {
      return 'video';
    }

    throw new BadRequestException('Status mediaType must be image or video');
  }

  private normalizeStatusDuration(
    mediaType: 'image' | 'video',
    value: unknown,
  ): number | null {
    const numeric = this.asNumber(value as any);
    if (numeric === undefined) {
      return mediaType === 'video' ? null : 5;
    }

    if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 60) {
      throw new BadRequestException(
        'Status durationSeconds must be an integer between 1 and 60',
      );
    }

    return numeric;
  }

  private normalizeProductVariations(
    rawVariations: unknown,
  ): NormalizedProductVariation[] {
    if (!Array.isArray(rawVariations)) return [];

    const normalized: NormalizedProductVariation[] = [];
    const usedNames = new Set<string>();

    for (let index = 0; index < rawVariations.length; index += 1) {
      const item = rawVariations[index] as
        | {
            name?: unknown;
            variationName?: unknown;
            type?: unknown;
            variationType?: unknown;
            values?: unknown;
            variationValues?: unknown;
            options?: unknown;
          }
        | undefined;

      const name = String(item?.name ?? item?.variationName ?? '').trim();
      if (!name) continue;

      const rawType = String(item?.type ?? item?.variationType ?? 'text')
        .toLowerCase()
        .trim();
      const variationType: 'text' | 'color' =
        rawType === 'color' ? 'color' : 'text';

      const rawValues =
        Array.isArray(item?.values) && variationType === 'text'
          ? item.values
          : Array.isArray(item?.variationValues)
            ? item.variationValues
            : typeof item?.values === 'string'
              ? item.values.split(',')
              : [];

      const values = rawValues
        .map((entry: unknown) => String(entry ?? '').trim())
        .filter(Boolean);

      const rawOptions = Array.isArray(item?.options) ? item.options : [];
      const colorOptions: NormalizedVariationColorOption[] = rawOptions
        .map((option): NormalizedVariationColorOption | null => {
          if (!option || typeof option !== 'object') return null;
          const objectOption = option as { label?: unknown; value?: unknown };
          const label = String(objectOption.label ?? '').trim();
          const value = String(objectOption.value ?? '')
            .trim()
            .toLowerCase();
          if (!label || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) {
            return null;
          }
          return { label, value };
        })
        .filter(
          (option): option is NormalizedVariationColorOption => option !== null,
        );

      const finalValues =
        variationType === 'color'
          ? colorOptions.map((option) => option.value)
          : values;

      if (!finalValues.length) {
        throw new BadRequestException(
          `Variation "${name}" must contain at least one value`,
        );
      }

      const nameKey = name.toLowerCase();
      if (usedNames.has(nameKey)) {
        throw new BadRequestException(`Duplicate variation name "${name}"`);
      }
      usedNames.add(nameKey);

      normalized.push({
        variation_name: name,
        variation_type: variationType,
        variation_values: Array.from(new Set(finalValues)),
        variation_options:
          variationType === 'color'
            ? colorOptions
            : Array.from(new Set(finalValues)).map((value) => ({
                label: value,
                value,
              })),
        display_order: index,
      });
    }

    return normalized;
  }

  private async replaceProductVariations(
    productId: string,
    variations: unknown[] | undefined,
  ) {
    if (!Array.isArray(variations)) return;

    const { error: clearError } = await this.serviceClient
      .from('social_product_variations')
      .delete()
      .eq('product_id', productId);
    if (clearError) {
      throw new BadRequestException(
        `Failed to reset product variations: ${clearError.message}`,
      );
    }

    const normalized = this.normalizeProductVariations(variations);
    if (!normalized.length) return;

    const rows = normalized.map((variation) => ({
      product_id: productId,
      variation_name: variation.variation_name,
      variation_type: variation.variation_type,
      variation_values: variation.variation_values,
      variation_options: variation.variation_options,
      display_order: variation.display_order,
    }));

    const { error: variationError } = await this.serviceClient
      .from('social_product_variations')
      .insert(rows);
    if (variationError) {
      throw new BadRequestException(
        `Failed to save product variations: ${variationError.message}`,
      );
    }
  }

  private hasProductAttributesPayload(payload: any): boolean {
    if (!payload || typeof payload !== 'object') return false;
    return (
      payload.shippingInfo !== undefined ||
      payload.shippingMethod !== undefined ||
      payload.shippingCost !== undefined ||
      payload.handlingTimeDays !== undefined ||
      payload.returnPolicy !== undefined ||
      payload.additionalDetails !== undefined ||
      payload.productDetails !== undefined
    );
  }

  private normalizeProductAttributes(payload: any): NormalizedProductAttributes {
    const shippingInfo =
      String(payload?.shippingInfo ?? '')
        .trim()
        .slice(0, 2000) || null;
    const shippingMethod =
      String(payload?.shippingMethod ?? '')
        .trim()
        .slice(0, 120) || null;
    const returnPolicy =
      String(payload?.returnPolicy ?? '')
        .trim()
        .slice(0, 4000) || null;

    const shippingCostValue = this.asNumber(payload?.shippingCost);
    if (shippingCostValue !== undefined && shippingCostValue < 0) {
      throw new BadRequestException('shippingCost cannot be negative');
    }

    const handlingTimeValue = this.asNumber(payload?.handlingTimeDays);
    if (
      handlingTimeValue !== undefined &&
      (!Number.isInteger(handlingTimeValue) || handlingTimeValue < 0)
    ) {
      throw new BadRequestException(
        'handlingTimeDays must be a non-negative integer',
      );
    }

    const rawDetails = Array.isArray(payload?.additionalDetails)
      ? payload.additionalDetails
      : Array.isArray(payload?.productDetails)
        ? payload.productDetails
        : [];

    const deduped = new Map<string, ProductDetailItem>();
    for (const entry of rawDetails) {
      if (!entry || typeof entry !== 'object') continue;
      const source = entry as {
        key?: unknown;
        label?: unknown;
        name?: unknown;
        value?: unknown;
      };
      const key = String(source.key ?? source.label ?? source.name ?? '')
        .trim()
        .slice(0, 80);
      const value = String(source.value ?? '').trim().slice(0, 1000);
      if (!key || !value) continue;
      deduped.set(key.toLowerCase(), { key, value });
      if (deduped.size >= 50) break;
    }

    return {
      shippingInfo,
      shippingMethod,
      shippingCost: shippingCostValue ?? null,
      handlingTimeDays: handlingTimeValue ?? null,
      returnPolicy,
      additionalDetails: Array.from(deduped.values()),
    };
  }

  private async replaceProductAttributes(productId: string, payload: any) {
    const normalized = this.normalizeProductAttributes(payload);

    const { error: clearError } = await this.serviceClient
      .from('social_product_attributes')
      .delete()
      .eq('product_id', productId);
    if (clearError) {
      throw new BadRequestException(
        `Failed to reset product attributes: ${clearError.message}`,
      );
    }

    const rows: Array<{ product_id: string; key: string; value: string }> = [];

    if (normalized.shippingInfo) {
      rows.push({
        product_id: productId,
        key: 'shipping_info',
        value: normalized.shippingInfo,
      });
    }
    if (normalized.shippingMethod) {
      rows.push({
        product_id: productId,
        key: 'shipping_method',
        value: normalized.shippingMethod,
      });
    }
    if (normalized.shippingCost !== null) {
      rows.push({
        product_id: productId,
        key: 'shipping_cost',
        value: String(normalized.shippingCost),
      });
    }
    if (normalized.handlingTimeDays !== null) {
      rows.push({
        product_id: productId,
        key: 'handling_time_days',
        value: String(normalized.handlingTimeDays),
      });
    }
    if (normalized.returnPolicy) {
      rows.push({
        product_id: productId,
        key: 'return_policy',
        value: normalized.returnPolicy,
      });
    }
    if (normalized.additionalDetails.length) {
      rows.push({
        product_id: productId,
        key: 'additional_details_json',
        value: JSON.stringify(normalized.additionalDetails),
      });
    }

    if (!rows.length) return;

    const { error: insertError } = await this.serviceClient
      .from('social_product_attributes')
      .insert(rows);
    if (insertError) {
      throw new BadRequestException(
        `Failed to save product attributes: ${insertError.message}`,
      );
    }
  }

  private parseRankedCursor(cursor?: string | null): RankedCursor | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as RankedCursor;
      if (!decoded || !decoded.id || !decoded.createdAt) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  private buildRankedCursor(cursor: RankedCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  private parseFeedCursor(cursor?: string | null): FeedCursor | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as FeedCursor;
      if (!decoded || !decoded.createdAt) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  private buildFeedCursor(cursor: FeedCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  private async getProfilesMap(
    userIds: string[],
  ): Promise<Map<string, UserProfileRow>> {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (!ids.length) return new Map();

    const { data, error } = await this.serviceClient
      .from('social_profiles')
      .select(
        'user_id, username, display_name, avatar_url, followers_count, following_count, swaps_completed, sales_count, rating_avg, response_rate, seller_reputation, bio',
      )
      .in('user_id', ids);

    if (error) {
      throw new BadRequestException(
        `Failed to load social profiles: ${error.message}`,
      );
    }

    const map = new Map<string, UserProfileRow>();
    for (const row of data ?? []) {
      map.set(row.user_id, row as UserProfileRow);
    }
    return map;
  }

  private async getCategoryMap(
    table: 'categories' | 'subcategories' | 'sub_subcategories',
    ids: string[],
  ) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length)
      return new Map<string, { id: string; name: string }>();

    const { data, error } = await this.serviceClient
      .from(table)
      .select('id, name')
      .in('id', uniqueIds);
    if (error) {
      throw new BadRequestException(
        `Failed to load ${table}: ${error.message}`,
      );
    }
    const map = new Map<string, { id: string; name: string }>();
    for (const row of data ?? []) {
      map.set(row.id, row);
    }
    return map;
  }

  private async getProductMediaMap(productIds: string[]) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    const map = new Map<string, any[]>();
    if (!uniqueIds.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_product_media')
      .select(
        'id, product_id, media_url, media_type, display_order, is_primary',
      )
      .in('product_id', uniqueIds)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(
        `Failed to load product media: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (!map.has(row.product_id)) map.set(row.product_id, []);
      map.get(row.product_id)?.push({
        id: row.id,
        media_url: row.media_url,
        media_type: row.media_type,
        display_order: row.display_order,
        is_primary: row.is_primary,
      });
    }
    return map;
  }

  private async getProductVariationsMap(productIds: string[]) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    const map = new Map<string, any[]>();
    if (!uniqueIds.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_product_variations')
      .select(
        'id, product_id, variation_name, variation_type, variation_values, variation_options, display_order',
      )
      .in('product_id', uniqueIds)
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(
        `Failed to load product variations: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (!map.has(row.product_id)) map.set(row.product_id, []);
      map.get(row.product_id)?.push({
        id: row.id,
        variation_name: row.variation_name,
        variation_type: row.variation_type === 'color' ? 'color' : 'text',
        variation_values: row.variation_values ?? [],
        variation_options: Array.isArray(row.variation_options)
          ? row.variation_options
          : [],
        display_order: row.display_order ?? 0,
      });
    }

    return map;
  }

  private async getProductAttributesMap(productIds: string[]) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    const map = new Map<string, Record<string, string>>();
    if (!uniqueIds.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_product_attributes')
      .select('product_id, key, value')
      .in('product_id', uniqueIds);

    if (error) {
      throw new BadRequestException(
        `Failed to load product attributes: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (!map.has(row.product_id)) {
        map.set(row.product_id, {});
      }
      const productAttributes = map.get(row.product_id);
      if (productAttributes) {
        productAttributes[row.key] = row.value ?? '';
      }
    }

    return map;
  }

  private async getPostMediaMap(postIds: string[]) {
    const uniqueIds = Array.from(new Set(postIds.filter(Boolean)));
    const map = new Map<string, any[]>();
    if (!uniqueIds.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_post_media')
      .select(
        'id, post_id, media_url, media_type, display_order, thumbnail_url, width, height, duration_seconds',
      )
      .in('post_id', uniqueIds)
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(
        `Failed to load post media: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (!map.has(row.post_id)) map.set(row.post_id, []);
      map.get(row.post_id)?.push({
        id: row.id,
        media_url: row.media_url,
        media_type: row.media_type,
        display_order: row.display_order,
        thumbnail_url: row.thumbnail_url,
        width: row.width,
        height: row.height,
        duration_seconds: row.duration_seconds,
      });
    }
    return map;
  }

  private async getReelMediaMap(reelIds: string[]) {
    const uniqueIds = Array.from(new Set(reelIds.filter(Boolean)));
    const map = new Map<string, any[]>();
    if (!uniqueIds.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_reel_media')
      .select(
        'id, reel_id, reel_url, thumbnail_url, duration_seconds, width, height',
      )
      .in('reel_id', uniqueIds);

    if (error) {
      throw new BadRequestException(
        `Failed to load reel media: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      if (!map.has(row.reel_id)) map.set(row.reel_id, []);
      map.get(row.reel_id)?.push(row);
    }
    return map;
  }

  private mapPosts(
    postRows: any[],
    profiles: Map<string, UserProfileRow>,
    mediaMap: Map<string, any[]>,
  ) {
    return postRows.map((post) => {
      const profile = profiles.get(post.user_id);
      const media = mediaMap.get(post.id) ?? [];
      return {
        id: post.id,
        type: 'post',
        user_id: post.user_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        caption: post.caption,
        created_at: post.created_at,
        reactions_count: post.reactions_count,
        comments_count: post.comments_count,
        saves_count: post.saves_count,
        views_count: post.views_count,
        shares_count: post.shares_count,
        status: post.status,
        location_text: post.location_text,
        hashtags: post.hashtags ?? [],
        social_post_media: media,
      };
    });
  }

  private mapReels(
    reelRows: any[],
    profiles: Map<string, UserProfileRow>,
    mediaMap: Map<string, any[]>,
  ) {
    return reelRows.map((reel) => {
      const profile = profiles.get(reel.user_id);
      const media = mediaMap.get(reel.id) ?? [];
      const primary = media[0];
      return {
        id: reel.id,
        type: 'reel',
        user_id: reel.user_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        caption: reel.caption,
        created_at: reel.created_at,
        category_id: reel.category_id,
        views_count: reel.views_count,
        likes_count: reel.likes_count,
        comments_count: reel.comments_count,
        saves_count: reel.saves_count,
        shares_count: reel.shares_count,
        engagement_rate: reel.engagement_rate,
        watch_completion_avg: reel.watch_completion_avg,
        product_click_through: reel.product_click_through,
        quality_score: reel.quality_score,
        reel_url: primary?.reel_url ?? null,
        thumbnail_url: reel.thumbnail_url ?? primary?.thumbnail_url ?? null,
        social_reel_media: media,
      };
    });
  }

  private mapProducts(
    productRows: any[],
    profiles: Map<string, UserProfileRow>,
    mediaMap: Map<string, any[]>,
    variationMap: Map<string, any[]>,
    attributeMap: Map<string, Record<string, string>>,
    categoryMap: Map<string, { id: string; name: string }>,
    subcategoryMap: Map<string, { id: string; name: string }>,
    subSubcategoryMap: Map<string, { id: string; name: string }>,
  ) {
    return productRows.map((product) => {
      const sellerProfile = profiles.get(product.seller_id);
      const attributes = attributeMap.get(product.id) ?? {};
      let additionalDetails: ProductDetailItem[] = [];
      try {
        const parsed = JSON.parse(attributes.additional_details_json ?? '[]');
        if (Array.isArray(parsed)) {
          additionalDetails = parsed
            .map((entry) => {
              if (!entry || typeof entry !== 'object') return null;
              const typedEntry = entry as { key?: unknown; value?: unknown };
              const key = String(typedEntry.key ?? '').trim();
              const value = String(typedEntry.value ?? '').trim();
              if (!key || !value) return null;
              return { key, value };
            })
            .filter((entry): entry is ProductDetailItem => entry !== null);
        }
      } catch {
        additionalDetails = [];
      }

      return {
        id: product.id,
        type: 'product',
        user_id: product.seller_id,
        username: sellerProfile?.username ?? null,
        display_name: sellerProfile?.display_name ?? null,
        avatar_url: sellerProfile?.avatar_url ?? null,
        title: product.title,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        condition: product.condition,
        size: product.size,
        color: product.color,
        category_id: product.category_id,
        subcategory_id: product.subcategory_id,
        sub_subcategory_id: product.sub_subcategory_id,
        category: product.category_id
          ? categoryMap.get(product.category_id)?.name
          : null,
        subcategory: product.subcategory_id
          ? subcategoryMap.get(product.subcategory_id)?.name
          : null,
        sub_subcategory: product.sub_subcategory_id
          ? subSubcategoryMap.get(product.sub_subcategory_id)?.name
          : null,
        listing_type: product.listing_type,
        source_type: product.source_type,
        status: product.status,
        price: Number(product.price),
        currency: product.currency,
        quantity: product.quantity,
        available_quantity: product.available_quantity,
        city: product.city,
        country: product.country,
        shipping_info: attributes.shipping_info ?? null,
        shipping_method: attributes.shipping_method ?? null,
        shipping_cost:
          this.asNumber(attributes.shipping_cost ?? undefined) ?? null,
        handling_time_days:
          this.asNumber(attributes.handling_time_days ?? undefined) ?? null,
        return_policy: attributes.return_policy ?? null,
        additional_details: additionalDetails,
        views_count: product.views_count,
        likes_count: product.likes_count,
        saves_count: product.saves_count,
        shares_count: product.shares_count,
        is_exchangeable: product.is_exchangeable,
        allow_offers: product.allow_offers,
        created_at: product.created_at,
        social_product_media: mediaMap.get(product.id) ?? [],
        social_product_variations: variationMap.get(product.id) ?? [],
      };
    });
  }

  private async fetchProductsByIds(productIds: string[]) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (!uniqueIds.length) return [];

    const { data, error } = await this.serviceClient
      .from('social_products')
      .select('*')
      .in('id', uniqueIds);
    if (error) {
      throw new BadRequestException(
        `Failed to fetch products: ${error.message}`,
      );
    }
    return data ?? [];
  }

  private async fetchPostsByIds(postIds: string[]) {
    const uniqueIds = Array.from(new Set(postIds.filter(Boolean)));
    if (!uniqueIds.length) return [];

    const { data, error } = await this.serviceClient
      .from('social_posts')
      .select('*')
      .in('id', uniqueIds);
    if (error) {
      throw new BadRequestException(`Failed to fetch posts: ${error.message}`);
    }
    return data ?? [];
  }

  private async fetchReelsByIds(reelIds: string[]) {
    const uniqueIds = Array.from(new Set(reelIds.filter(Boolean)));
    if (!uniqueIds.length) return [];

    const { data, error } = await this.serviceClient
      .from('social_reels')
      .select('*')
      .in('id', uniqueIds);
    if (error) {
      throw new BadRequestException(`Failed to fetch reels: ${error.message}`);
    }
    return data ?? [];
  }

  private async enrichProducts(productRows: any[]) {
    const sellerIds = productRows.map((row) => row.seller_id);
    const categoryIds = productRows.map((row) => row.category_id);
    const subcategoryIds = productRows.map((row) => row.subcategory_id);
    const subSubcategoryIds = productRows.map((row) => row.sub_subcategory_id);
    const productIds = productRows.map((row) => row.id);

    const [
      profiles,
      mediaMap,
      variationMap,
      attributeMap,
      categoryMap,
      subcategoryMap,
      subSubcategoryMap,
    ] = await Promise.all([
      this.getProfilesMap(sellerIds),
      this.getProductMediaMap(productIds),
      this.getProductVariationsMap(productIds),
      this.getProductAttributesMap(productIds),
      this.getCategoryMap('categories', categoryIds),
      this.getCategoryMap('subcategories', subcategoryIds),
      this.getCategoryMap('sub_subcategories', subSubcategoryIds),
    ]);

    return this.mapProducts(
      productRows,
      profiles,
      mediaMap,
      variationMap,
      attributeMap,
      categoryMap,
      subcategoryMap,
      subSubcategoryMap,
    );
  }

  private async enrichPosts(postRows: any[]) {
    const userIds = postRows.map((row) => row.user_id);
    const postIds = postRows.map((row) => row.id);
    const [profiles, mediaMap] = await Promise.all([
      this.getProfilesMap(userIds),
      this.getPostMediaMap(postIds),
    ]);
    return this.mapPosts(postRows, profiles, mediaMap);
  }

  private async enrichReels(reelRows: any[]) {
    const userIds = reelRows.map((row) => row.user_id);
    const reelIds = reelRows.map((row) => row.id);
    const [profiles, mediaMap] = await Promise.all([
      this.getProfilesMap(userIds),
      this.getReelMediaMap(reelIds),
    ]);
    return this.mapReels(reelRows, profiles, mediaMap);
  }

  async getFeed(
    mode: FeedMode,
    userId?: string | null,
    limitValue?: string | number,
    cursor?: string,
  ) {
    const limit = this.sanitizeLimit(limitValue, 20, 40);
    const safeMode: FeedMode = ['all', 'posts', 'reels', 'closet'].includes(
      mode,
    )
      ? mode
      : 'all';

    if (safeMode === 'posts') {
      const feedCursor = this.parseFeedCursor(cursor);
      let query = this.serviceClient
        .from('social_posts')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (feedCursor?.createdAt) {
        query = query.lt('created_at', feedCursor.createdAt);
      }
      const { data, error } = await query;
      if (error) {
        throw new BadRequestException(
          `Failed to fetch posts feed: ${error.message}`,
        );
      }
      const posts = await this.enrichPosts(data ?? []);
      const last = posts[posts.length - 1];
      return {
        mode: safeMode,
        userId: userId ?? null,
        posts,
        reels: [],
        closet: [],
        nextCursor: last
          ? this.buildFeedCursor({ createdAt: last.created_at })
          : null,
      };
    }

    if (safeMode === 'reels') {
      const rankedCursor = this.parseRankedCursor(cursor);
      const { data: ranked, error } = await this.serviceClient.rpc(
        'social_reels_ranked',
        {
          p_user_id: userId ?? null,
          p_limit: limit,
          p_cursor_score: rankedCursor?.score ?? null,
          p_cursor_created_at: rankedCursor?.createdAt ?? null,
          p_cursor_id: rankedCursor?.id ?? null,
        },
      );
      if (error) {
        throw new BadRequestException(
          `Failed to fetch reels feed ranking: ${error.message}`,
        );
      }
      const reelIds = (ranked ?? []).map((row: any) => row.reel_id);
      const reelsRaw = await this.fetchReelsByIds(reelIds);
      const reels = await this.enrichReels(reelsRaw);
      const map = new Map(reels.map((reel) => [reel.id, reel]));
      const ordered = reelIds.map((id: string) => map.get(id)).filter(Boolean);
      const last = (ranked ?? [])[Math.max(0, (ranked ?? []).length - 1)];
      return {
        mode: safeMode,
        userId: userId ?? null,
        posts: [],
        reels: ordered,
        closet: [],
        nextCursor: last
          ? this.buildRankedCursor({
              score: Number(last.score),
              createdAt: last.created_at,
              id: last.reel_id,
            })
          : null,
      };
    }

    if (safeMode === 'closet') {
      const rankedCursor = this.parseRankedCursor(cursor);
      const { data: ranked, error } = await this.serviceClient.rpc(
        'social_products_ranked',
        {
          p_user_id: userId ?? null,
          p_query: null,
          p_listing_type: 'closet',
          p_category_id: null,
          p_subcategory_id: null,
          p_sub_subcategory_id: null,
          p_min_price: null,
          p_max_price: null,
          p_radius_km: null,
          p_user_lat: null,
          p_user_lng: null,
          p_limit: limit,
          p_cursor_score: rankedCursor?.score ?? null,
          p_cursor_created_at: rankedCursor?.createdAt ?? null,
          p_cursor_id: rankedCursor?.id ?? null,
        },
      );
      if (error) {
        throw new BadRequestException(
          `Failed to fetch closet feed ranking: ${error.message}`,
        );
      }
      const productIds = (ranked ?? []).map((row: any) => row.product_id);
      const productsRaw = await this.fetchProductsByIds(productIds);
      const products = await this.enrichProducts(productsRaw);
      const map = new Map(products.map((product) => [product.id, product]));
      const ordered = productIds
        .map((id: string) => map.get(id))
        .filter(Boolean);
      const last = (ranked ?? [])[Math.max(0, (ranked ?? []).length - 1)];
      return {
        mode: safeMode,
        userId: userId ?? null,
        posts: [],
        reels: [],
        closet: ordered,
        nextCursor: last
          ? this.buildRankedCursor({
              score: Number(last.score),
              createdAt: last.created_at,
              id: last.product_id,
            })
          : null,
      };
    }

    const allCursor = this.parseFeedCursor(cursor);
    const { data: rankedFeed, error: rankedFeedError } =
      await this.serviceClient.rpc('social_home_feed_ranked', {
        p_user_id: userId ?? null,
        p_limit: limit,
        p_cursor_created_at: allCursor?.createdAt ?? null,
      });
    if (rankedFeedError) {
      throw new BadRequestException(
        `Failed to fetch home feed ranking: ${rankedFeedError.message}`,
      );
    }

    const postIds = (rankedFeed ?? [])
      .filter((row: any) => row.content_type === 'post')
      .map((row: any) => row.content_id);
    const reelIds = (rankedFeed ?? [])
      .filter((row: any) => row.content_type === 'reel')
      .map((row: any) => row.content_id);
    const productIds = (rankedFeed ?? [])
      .filter((row: any) => row.content_type === 'product')
      .map((row: any) => row.content_id);

    const [postsRaw, reelsRaw, productsRaw] = await Promise.all([
      this.fetchPostsByIds(postIds),
      this.fetchReelsByIds(reelIds),
      this.fetchProductsByIds(productIds),
    ]);
    const [posts, reels, products] = await Promise.all([
      this.enrichPosts(postsRaw),
      this.enrichReels(reelsRaw),
      this.enrichProducts(productsRaw),
    ]);
    const lastRow = (rankedFeed ?? [])[
      Math.max(0, (rankedFeed ?? []).length - 1)
    ];
    return {
      mode: safeMode,
      userId: userId ?? null,
      posts,
      reels,
      closet: products,
      ranked: rankedFeed ?? [],
      nextCursor: lastRow
        ? this.buildFeedCursor({ createdAt: lastRow.created_at })
        : null,
    };
  }

  async getExplore(userId?: string | null) {
    const [reelsRanked, productsRanked, sellers] = await Promise.all([
      this.serviceClient.rpc('social_reels_ranked', {
        p_user_id: userId ?? null,
        p_limit: 12,
        p_cursor_score: null,
        p_cursor_created_at: null,
        p_cursor_id: null,
      }),
      this.serviceClient.rpc('social_products_ranked', {
        p_user_id: userId ?? null,
        p_query: null,
        p_listing_type: null,
        p_category_id: null,
        p_subcategory_id: null,
        p_sub_subcategory_id: null,
        p_min_price: null,
        p_max_price: null,
        p_radius_km: null,
        p_user_lat: null,
        p_user_lng: null,
        p_limit: 12,
        p_cursor_score: null,
        p_cursor_created_at: null,
        p_cursor_id: null,
      }),
      this.serviceClient
        .from('social_profiles')
        .select(
          'user_id, username, display_name, avatar_url, followers_count, seller_reputation',
        )
        .order('followers_count', { ascending: false })
        .order('seller_reputation', { ascending: false })
        .limit(10),
    ]);

    if (reelsRanked.error) {
      throw new BadRequestException(
        `Failed to fetch explore reels: ${reelsRanked.error.message}`,
      );
    }
    if (productsRanked.error) {
      throw new BadRequestException(
        `Failed to fetch explore products: ${productsRanked.error.message}`,
      );
    }
    if (sellers.error) {
      throw new BadRequestException(
        `Failed to fetch top sellers: ${sellers.error.message}`,
      );
    }

    const reelIds = (reelsRanked.data ?? []).map((row: any) => row.reel_id);
    const productIds = (productsRanked.data ?? []).map(
      (row: any) => row.product_id,
    );
    const [reelsRaw, productsRaw] = await Promise.all([
      this.fetchReelsByIds(reelIds),
      this.fetchProductsByIds(productIds),
    ]);
    const [topReels, trendingProducts] = await Promise.all([
      this.enrichReels(reelsRaw),
      this.enrichProducts(productsRaw),
    ]);

    return {
      topReels,
      trendingProducts,
      topSellers: sellers.data ?? [],
    };
  }

  async getReels(
    userId?: string | null,
    limitValue?: string | number,
    cursor?: string,
  ) {
    const limit = this.sanitizeLimit(limitValue, 20, 40);
    const rankedCursor = this.parseRankedCursor(cursor);
    const { data: ranked, error } = await this.serviceClient.rpc(
      'social_reels_ranked',
      {
        p_user_id: userId ?? null,
        p_limit: limit,
        p_cursor_score: rankedCursor?.score ?? null,
        p_cursor_created_at: rankedCursor?.createdAt ?? null,
        p_cursor_id: rankedCursor?.id ?? null,
      },
    );
    if (error) {
      throw new BadRequestException(
        `Failed to fetch reels ranking: ${error.message}`,
      );
    }

    const ids = (ranked ?? []).map((item: any) => item.reel_id);
    const reelRows = await this.fetchReelsByIds(ids);
    const reels = await this.enrichReels(reelRows);
    const map = new Map(reels.map((item) => [item.id, item]));
    const ordered = ids.map((id: string) => map.get(id)).filter(Boolean);
    const last = (ranked ?? [])[Math.max(0, (ranked ?? []).length - 1)];
    return {
      reels: ordered,
      nextCursor: last
        ? this.buildRankedCursor({
            score: Number(last.score),
            createdAt: last.created_at,
            id: last.reel_id,
          })
        : null,
    };
  }

  async getStatuses(viewerUserId?: string | null) {
    if (!viewerUserId) {
      return [];
    }

    const { data: followRows, error: followError } = await this.serviceClient
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', viewerUserId);

    if (followError) {
      throw new BadRequestException(
        `Failed to resolve follow graph: ${followError.message}`,
      );
    }

    const visibleUserIds = Array.from(
      new Set([
        viewerUserId,
        ...(followRows ?? [])
          .map((row) => row.following_id)
          .filter((value): value is string => Boolean(value)),
      ]),
    );
    if (!visibleUserIds.length) {
      return [];
    }

    const nowIso = new Date().toISOString();

    const { data: rows, error } = await this.serviceClient
      .from('social_statuses')
      .select(
        'id, user_id, media_url, media_type, thumbnail_url, caption, duration_seconds, views_count, created_at, expires_at',
      )
      .in('user_id', visibleUserIds)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });

    if (error) {
      throw new BadRequestException(
        `Failed to fetch statuses: ${error.message}`,
      );
    }

    const statuses = rows ?? [];
    if (!statuses.length) return [];

    const userIds = statuses.map((status) => status.user_id);
    const profiles = await this.getProfilesMap(userIds);

    let viewedIds = new Set<string>();
    if (viewerUserId) {
      const { data: viewedRows, error: viewedError } = await this.serviceClient
        .from('social_status_views')
        .select('status_id')
        .eq('viewer_id', viewerUserId)
        .in(
          'status_id',
          statuses.map((status) => status.id),
        );

      if (viewedError) {
        throw new BadRequestException(
          `Failed to load status views: ${viewedError.message}`,
        );
      }

      viewedIds = new Set((viewedRows ?? []).map((row) => row.status_id));
    }

    const grouped = new Map<
      string,
      {
        user_id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
        statuses: Array<{
          id: string;
          media_url: string;
          media_type: 'image' | 'video';
          thumbnail_url: string | null;
          caption: string | null;
          duration_seconds: number | null;
          views_count: number;
          created_at: string;
          expires_at: string;
          is_viewed: boolean;
        }>;
        latest_created_at: string;
      }
    >();

    for (const status of statuses) {
      const profile = profiles.get(status.user_id);
      const existing = grouped.get(status.user_id);
      const mediaType: 'image' | 'video' =
        status.media_type === 'video' ? 'video' : 'image';
      const serializedStatus = {
        id: status.id,
        media_url: status.media_url,
        media_type: mediaType,
        thumbnail_url: status.thumbnail_url ?? null,
        caption: status.caption ?? null,
        duration_seconds: status.duration_seconds ?? null,
        views_count: Number(status.views_count ?? 0),
        created_at: status.created_at,
        expires_at: status.expires_at,
        is_viewed: viewedIds.has(status.id),
      };

      if (!existing) {
        grouped.set(status.user_id, {
          user_id: status.user_id,
          username: profile?.username ?? null,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          statuses: [serializedStatus],
          latest_created_at: status.created_at,
        });
        continue;
      }

      existing.statuses.push(serializedStatus);
      if (status.created_at > existing.latest_created_at) {
        existing.latest_created_at = status.created_at;
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.latest_created_at.localeCompare(a.latest_created_at))
      .map(({ latest_created_at, ...item }) => item);
  }

  async createStatuses(userId: string, payload: any) {
    const rawStatuses = Array.isArray(payload?.statuses)
      ? payload.statuses
      : payload?.mediaUrl
        ? [payload]
        : [];

    if (!rawStatuses.length) {
      throw new BadRequestException('At least one status is required');
    }
    if (rawStatuses.length > 20) {
      throw new BadRequestException('You can publish up to 20 statuses at once');
    }

    const rows = rawStatuses.map((entry: any) => {
      const mediaUrl = String(entry?.mediaUrl ?? entry?.url ?? '').trim();
      if (!mediaUrl) {
        throw new BadRequestException('Status mediaUrl is required');
      }
      if (mediaUrl.startsWith('data:')) {
        throw new BadRequestException(
          'Status media must be uploaded via storage endpoint first',
        );
      }

      const mediaType = this.normalizeStatusMediaType(
        entry?.mediaType ?? entry?.type,
      );
      const thumbnailUrl = String(
        entry?.thumbnailUrl ?? entry?.thumbnail_url ?? '',
      ).trim();
      if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
        throw new BadRequestException(
          'Status thumbnail must be uploaded via storage endpoint first',
        );
      }

      const caption = String(entry?.caption ?? '').trim();

      return {
        user_id: userId,
        media_url: mediaUrl,
        media_type: mediaType,
        thumbnail_url: thumbnailUrl || null,
        caption: caption || null,
        duration_seconds: this.normalizeStatusDuration(
          mediaType,
          entry?.durationSeconds,
        ),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    });

    const { data, error } = await this.serviceClient
      .from('social_statuses')
      .insert(rows)
      .select(
        'id, user_id, media_url, media_type, thumbnail_url, caption, duration_seconds, views_count, created_at, expires_at',
      )
      .order('created_at', { ascending: true });

    if (error) {
      throw new BadRequestException(
        `Failed to create statuses: ${error.message}`,
      );
    }

    return {
      statuses: data ?? [],
    };
  }

  async markStatusesViewed(
    viewerUserId: string,
    payload: { statusIds?: string[]; statusId?: string },
  ) {
    const incomingIds = Array.isArray(payload?.statusIds)
      ? payload.statusIds
      : payload?.statusId
        ? [payload.statusId]
        : [];
    const statusIds = Array.from(
      new Set(
        incomingIds
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      ),
    );

    if (!statusIds.length) {
      return { success: true, viewedCount: 0 };
    }

    const { data: activeRows, error: activeError } = await this.serviceClient
      .from('social_statuses')
      .select('id')
      .in('id', statusIds)
      .gt('expires_at', new Date().toISOString());

    if (activeError) {
      throw new BadRequestException(
        `Failed to validate statuses: ${activeError.message}`,
      );
    }

    const activeStatusIds = (activeRows ?? []).map((row) => row.id);
    if (!activeStatusIds.length) {
      return { success: true, viewedCount: 0 };
    }

    const { error } = await this.serviceClient.from('social_status_views').upsert(
      activeStatusIds.map((statusId) => ({
        status_id: statusId,
        viewer_id: viewerUserId,
      })),
      {
        onConflict: 'status_id,viewer_id',
        ignoreDuplicates: true,
      },
    );

    if (error) {
      throw new BadRequestException(
        `Failed to mark statuses viewed: ${error.message}`,
      );
    }

    return { success: true, viewedCount: activeStatusIds.length };
  }

  async getStatusViewers(ownerUserId: string, statusId: string) {
    const normalizedStatusId = String(statusId ?? '').trim();
    if (!normalizedStatusId) {
      throw new BadRequestException('statusId is required');
    }

    const { data: statusRow, error: statusError } = await this.serviceClient
      .from('social_statuses')
      .select('id, user_id')
      .eq('id', normalizedStatusId)
      .maybeSingle();

    if (statusError) {
      throw new BadRequestException(
        `Failed to fetch status: ${statusError.message}`,
      );
    }
    if (!statusRow) {
      throw new NotFoundException('Status not found');
    }
    if (statusRow.user_id !== ownerUserId) {
      throw new ForbiddenException('You can only view viewers of your own status');
    }

    const { data: viewerRows, error: viewersError } = await this.serviceClient
      .from('social_status_views')
      .select('viewer_id, created_at')
      .eq('status_id', normalizedStatusId)
      .order('created_at', { ascending: false });

    if (viewersError) {
      throw new BadRequestException(
        `Failed to fetch status viewers: ${viewersError.message}`,
      );
    }

    const rows = viewerRows ?? [];
    if (!rows.length) {
      return [];
    }

    const viewerIds = rows.map((row) => row.viewer_id);
    const profiles = await this.getProfilesMap(viewerIds);

    return rows.map((row) => {
      const profile = profiles.get(row.viewer_id);
      return {
        user_id: row.viewer_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        viewed_at: row.created_at,
      };
    });
  }

  private async productSearch(
    listingType: ListingType | null,
    userId?: string | null,
    options?: ProductSearchOptions,
  ) {
    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const rankedCursor = this.parseRankedCursor(options?.cursor ?? null);
    const { data: ranked, error } = await this.serviceClient.rpc(
      'social_products_ranked',
      {
        p_user_id: userId ?? null,
        p_query: options?.q ?? null,
        p_listing_type: listingType,
        p_category_id: options?.categoryId ?? null,
        p_subcategory_id: options?.subcategoryId ?? null,
        p_sub_subcategory_id: options?.subSubcategoryId ?? null,
        p_min_price: options?.minPrice ?? null,
        p_max_price: options?.maxPrice ?? null,
        p_radius_km: options?.radiusKm ?? null,
        p_user_lat: options?.lat ?? null,
        p_user_lng: options?.lng ?? null,
        p_limit: limit,
        p_cursor_score: rankedCursor?.score ?? null,
        p_cursor_created_at: rankedCursor?.createdAt ?? null,
        p_cursor_id: rankedCursor?.id ?? null,
      },
    );

    if (error) {
      throw new BadRequestException(
        `Failed to search social products: ${error.message}`,
      );
    }

    const ids = (ranked ?? []).map((row: any) => row.product_id);
    const productsRaw = await this.fetchProductsByIds(ids);
    const products = await this.enrichProducts(productsRaw);
    const map = new Map(products.map((item) => [item.id, item]));
    const ordered = ids.map((id: string) => map.get(id)).filter(Boolean);
    const last = (ranked ?? [])[Math.max(0, (ranked ?? []).length - 1)];
    return {
      results: ordered,
      nextCursor: last
        ? this.buildRankedCursor({
            score: Number(last.score),
            createdAt: last.created_at,
            id: last.product_id,
          })
        : null,
    };
  }

  async getShopSearch(
    userId: string | null | undefined,
    options?: ProductSearchOptions,
  ) {
    return this.productSearch('shop', userId ?? null, options);
  }

  async getClosetSearch(
    userId: string | null | undefined,
    options?: ProductSearchOptions,
  ) {
    return this.productSearch('closet', userId ?? null, options);
  }

  async getProfileByUsername(username: string) {
    const normalized = username?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Username is required');
    }

    const { data: profile, error } = await this.serviceClient
      .from('social_profiles')
      .select('*')
      .eq('username', normalized)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to fetch profile: ${error.message}`,
      );
    }
    if (!profile) {
      return { profile: null, products: [], reels: [], posts: [] };
    }
    return this.getProfileByUserId(profile.user_id);
  }

  async getProfileByUserId(userId: string) {
    const profile = await this.ensureSocialProfile(userId);
    if (!profile) {
      return { profile: null, products: [], reels: [], posts: [] };
    }

    const [productsRaw, reelsRaw, postsRaw] = await Promise.all([
      this.serviceClient
        .from('social_products')
        .select('*')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false })
        .limit(24),
      this.serviceClient
        .from('social_reels')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(24),
      this.serviceClient
        .from('social_posts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(24),
    ]);

    if (productsRaw.error)
      throw new BadRequestException(productsRaw.error.message);
    if (reelsRaw.error) throw new BadRequestException(reelsRaw.error.message);
    if (postsRaw.error) throw new BadRequestException(postsRaw.error.message);

    const [products, reels, posts] = await Promise.all([
      this.enrichProducts(productsRaw.data ?? []),
      this.enrichReels(reelsRaw.data ?? []),
      this.enrichPosts(postsRaw.data ?? []),
    ]);

    return {
      profile: {
        user_id: profile.user_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        is_private: profile.is_private,
        followers_count: profile.followers_count,
        following_count: profile.following_count,
        swaps_completed: profile.swaps_completed,
        sales_count: profile.sales_count,
        rating_avg: profile.rating_avg,
        response_rate: profile.response_rate,
        response_time_minutes:
          profile.avg_reply_seconds === null ||
          profile.avg_reply_seconds === undefined
            ? null
            : Math.round(Number(profile.avg_reply_seconds) / 60),
        seller_reputation: profile.seller_reputation,
      },
      products,
      reels,
      posts,
    };
  }

  async updateMyProfile(
    userId: string,
    payload: {
      username?: string;
      displayName?: string | null;
      bio?: string | null;
      avatarUrl?: string | null;
      isPrivate?: boolean;
    },
  ) {
    const profile = await this.ensureSocialProfile(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const updateData: Record<string, unknown> = {};

    if (payload.username !== undefined) {
      const normalized = this.sanitizeUsername(payload.username);
      if (!normalized || normalized.length < 3 || normalized.length > 30) {
        throw new BadRequestException(
          'Username must be 3-30 chars and contain only letters, numbers, underscores',
        );
      }
      updateData.username = normalized;
    }

    if (payload.displayName !== undefined) {
      const displayName = String(payload.displayName ?? '')
        .trim()
        .slice(0, 120);
      updateData.display_name = displayName || null;
    }

    if (payload.bio !== undefined) {
      const bio = String(payload.bio ?? '').trim().slice(0, 600);
      updateData.bio = bio || null;
    }

    if (payload.avatarUrl !== undefined) {
      const avatarUrl = String(payload.avatarUrl ?? '').trim();
      updateData.avatar_url = avatarUrl || null;
    }

    if (payload.isPrivate !== undefined) {
      updateData.is_private = Boolean(payload.isPrivate);
    }

    if (!Object.keys(updateData).length) {
      return this.getProfileByUserId(userId);
    }

    const { error: updateError } = await this.serviceClient
      .from('social_profiles')
      .update(updateData)
      .eq('user_id', userId);
    if (updateError) {
      if (this.isUniqueViolation(updateError)) {
        throw new BadRequestException('Username is already taken');
      }
      throw new BadRequestException(
        `Failed to update profile: ${updateError.message}`,
      );
    }

    const userPatch: Record<string, unknown> = {};
    if (updateData.display_name !== undefined) {
      userPatch.full_name = updateData.display_name;
    }
    if (updateData.avatar_url !== undefined) {
      userPatch.avatar_url = updateData.avatar_url;
    }
    if (updateData.bio !== undefined) {
      userPatch.bio = updateData.bio;
    }
    if (Object.keys(userPatch).length) {
      const { error: userPatchError } = await this.serviceClient
        .from('users')
        .update(userPatch)
        .eq('id', userId);
      if (userPatchError) {
        throw new BadRequestException(
          `Profile updated but failed to sync user profile: ${userPatchError.message}`,
        );
      }
    }

    return this.getProfileByUserId(userId);
  }

  async getProductById(productId: string, viewerUserId?: string | null) {
    const { data: product, error } = await this.serviceClient
      .from('social_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to fetch product: ${error.message}`,
      );
    }
    if (!product) {
      return null;
    }

    const isOwner = viewerUserId && product.seller_id === viewerUserId;
    if (product.status !== 'active' && !isOwner) {
      throw new NotFoundException('Product not found');
    }

    const mapped = (await this.enrichProducts([product]))[0];
    const { data: similarRows, error: similarError } = await this.serviceClient
      .from('social_products')
      .select('*')
      .eq('status', 'active')
      .eq('category_id', product.category_id)
      .neq('id', product.id)
      .order('created_at', { ascending: false })
      .limit(8);
    if (similarError) {
      throw new BadRequestException(
        `Failed to fetch similar products: ${similarError.message}`,
      );
    }

    return {
      product: mapped,
      similarProducts: (await this.enrichProducts(similarRows ?? [])).slice(
        0,
        4,
      ),
    };
  }

  async getMyProducts(userId: string) {
    const { data, error } = await this.serviceClient
      .from('social_products')
      .select('*')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      throw new BadRequestException(
        `Failed to fetch my products: ${error.message}`,
      );
    }
    return this.enrichProducts(data ?? []);
  }

  async createProduct(userId: string, payload: any) {
    if (!payload?.title?.trim())
      throw new BadRequestException('title is required');
    if (!payload?.categoryId)
      throw new BadRequestException('categoryId is required');
    if (payload?.price === undefined || payload?.price === null) {
      throw new BadRequestException('price is required');
    }

    const quantity =
      payload.quantity && Number(payload.quantity) > 0
        ? Math.floor(Number(payload.quantity))
        : 1;
    const { data: inserted, error } = await this.serviceClient
      .from('social_products')
      .insert({
        seller_id: userId,
        title: payload.title.trim(),
        slug: this.resolveProductSlug(payload.slug, payload.title.trim()),
        description: payload.description?.trim() ?? null,
        brand: payload.brand?.trim() ?? null,
        condition: payload.condition?.trim() ?? 'good',
        size: payload.size?.trim() ?? null,
        color: payload.color?.trim() ?? null,
        category_id: payload.categoryId,
        subcategory_id: payload.subcategoryId ?? null,
        sub_subcategory_id: payload.subSubcategoryId ?? null,
        listing_type: payload.listingType ?? 'shop',
        source_type: 'manual',
        status: payload.status === 'active' ? 'active' : 'draft',
        price: Number(payload.price),
        compare_at_price: payload.compareAtPrice ?? null,
        currency: payload.currency ?? 'USD',
        quantity,
        available_quantity: quantity,
        is_exchangeable: payload.isExchangeable ?? true,
        allow_offers: payload.allowOffers ?? true,
        city: payload.city ?? null,
        country: payload.country ?? null,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        published_at:
          payload.status === 'active' ? new Date().toISOString() : null,
      })
      .select('*')
      .single();
    if (error || !inserted) {
      throw new BadRequestException(
        `Failed to create social product: ${error?.message ?? 'Unknown error'}`,
      );
    }

    if (Array.isArray(payload.media) && payload.media.length) {
      const mediaRows = payload.media.map((media: any, index: number) => ({
        product_id: inserted.id,
        media_url: media.mediaUrl,
        media_type: media.mediaType ?? 'image',
        display_order: media.displayOrder ?? index,
        is_primary: media.isPrimary ?? index === 0,
      }));
      const { error: mediaError } = await this.serviceClient
        .from('social_product_media')
        .insert(mediaRows);
      if (mediaError) {
        throw new BadRequestException(
          `Product created but media insert failed: ${mediaError.message}`,
        );
      }
    }

    await this.replaceProductVariations(inserted.id, payload.variations);
    await this.replaceProductAttributes(inserted.id, payload);

    const full = await this.getProductById(inserted.id, userId);
    return full?.product ?? null;
  }

  async updateProduct(userId: string, productId: string, payload: any) {
    const { data: existing, error: fetchError } = await this.serviceClient
      .from('social_products')
      .select('*')
      .eq('id', productId)
      .eq('seller_id', userId)
      .maybeSingle();
    if (fetchError)
      throw new BadRequestException(
        `Failed to load product: ${fetchError.message}`,
      );
    if (!existing) throw new NotFoundException('Social product not found');

    const updateData: Record<string, unknown> = {};
    if (payload.title !== undefined) updateData.title = payload.title?.trim();
    if (payload.slug !== undefined)
      updateData.slug = this.slugifyText(payload.slug) || '';
    if (payload.description !== undefined)
      updateData.description = payload.description?.trim() ?? null;
    if (payload.brand !== undefined)
      updateData.brand = payload.brand?.trim() ?? null;
    if (payload.condition !== undefined)
      updateData.condition = payload.condition?.trim() ?? 'good';
    if (payload.size !== undefined)
      updateData.size = payload.size?.trim() ?? null;
    if (payload.color !== undefined)
      updateData.color = payload.color?.trim() ?? null;
    if (payload.categoryId !== undefined)
      updateData.category_id = payload.categoryId;
    if (payload.subcategoryId !== undefined)
      updateData.subcategory_id = payload.subcategoryId;
    if (payload.subSubcategoryId !== undefined)
      updateData.sub_subcategory_id = payload.subSubcategoryId;
    if (payload.listingType !== undefined)
      updateData.listing_type = payload.listingType;
    if (payload.price !== undefined) updateData.price = Number(payload.price);
    if (payload.compareAtPrice !== undefined)
      updateData.compare_at_price = payload.compareAtPrice;
    if (payload.currency !== undefined)
      updateData.currency = payload.currency ?? 'USD';
    if (payload.quantity !== undefined)
      updateData.quantity = Math.max(0, Math.floor(Number(payload.quantity)));
    if (payload.isExchangeable !== undefined)
      updateData.is_exchangeable = payload.isExchangeable;
    if (payload.allowOffers !== undefined)
      updateData.allow_offers = payload.allowOffers;
    if (payload.city !== undefined) updateData.city = payload.city ?? null;
    if (payload.country !== undefined)
      updateData.country = payload.country ?? null;
    if (payload.latitude !== undefined)
      updateData.latitude = payload.latitude ?? null;
    if (payload.longitude !== undefined)
      updateData.longitude = payload.longitude ?? null;

    if (Object.keys(updateData).length) {
      const { error: updateError } = await this.serviceClient
        .from('social_products')
        .update(updateData)
        .eq('id', productId)
        .eq('seller_id', userId);
      if (updateError) {
        throw new BadRequestException(
          `Failed to update social product: ${updateError.message}`,
        );
      }
    }

    if (Array.isArray(payload.media)) {
      const { error: clearError } = await this.serviceClient
        .from('social_product_media')
        .delete()
        .eq('product_id', productId);
      if (clearError) {
        throw new BadRequestException(
          `Failed to reset product media: ${clearError.message}`,
        );
      }
      if (payload.media.length) {
        const rows = payload.media.map((media: any, index: number) => ({
          product_id: productId,
          media_url: media.mediaUrl,
          media_type: media.mediaType ?? 'image',
          display_order: media.displayOrder ?? index,
          is_primary: media.isPrimary ?? index === 0,
        }));
        const { error: mediaError } = await this.serviceClient
          .from('social_product_media')
          .insert(rows);
        if (mediaError) {
          throw new BadRequestException(
            `Failed to update product media: ${mediaError.message}`,
          );
        }
      }
    }

    await this.replaceProductVariations(productId, payload.variations);
    if (this.hasProductAttributesPayload(payload)) {
      await this.replaceProductAttributes(productId, payload);
    }

    const full = await this.getProductById(productId, userId);
    return full?.product ?? null;
  }

  async publishProduct(userId: string, productId: string) {
    const { data, error } = await this.serviceClient
      .from('social_products')
      .update({
        status: 'active',
        published_at: new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('seller_id', userId)
      .select('*')
      .maybeSingle();
    if (error)
      throw new BadRequestException(
        `Failed to publish product: ${error.message}`,
      );
    if (!data) throw new NotFoundException('Social product not found');
    const full = await this.getProductById(productId, userId);
    return full?.product ?? null;
  }

  async markProductSold(userId: string, productId: string) {
    const { data, error } = await this.serviceClient
      .from('social_products')
      .update({
        status: 'sold',
        sold_at: new Date().toISOString(),
        available_quantity: 0,
      })
      .eq('id', productId)
      .eq('seller_id', userId)
      .select('*')
      .maybeSingle();
    if (error)
      throw new BadRequestException(
        `Failed to mark product sold: ${error.message}`,
      );
    if (!data) throw new NotFoundException('Social product not found');
    const full = await this.getProductById(productId, userId);
    return full?.product ?? null;
  }

  async getImportableRetail(userId: string) {
    const { data: orderItems, error } = await this.serviceClient
      .from('retail_order_items')
      .select(
        'id, order_id, quantity, unit_price, product_name, brand_name, product_image, product_id, retail_orders!inner(id, user_id, order_number, status)',
      )
      .eq('retail_orders.user_id', userId)
      .in('retail_orders.status', ['delivered', 'completed'])
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Failed to load importable retail items: ${error.message}`,
      );
    }

    const itemIds = (orderItems ?? []).map((item: any) => item.id);
    const { data: imports, error: importError } = await this.serviceClient
      .from('social_retail_imports')
      .select('retail_order_item_id, imported_quantity')
      .eq('user_id', userId)
      .in('retail_order_item_id', itemIds);
    if (importError) {
      throw new BadRequestException(
        `Failed to load import ledger: ${importError.message}`,
      );
    }

    const importedMap = new Map<string, number>();
    for (const row of imports ?? []) {
      importedMap.set(
        row.retail_order_item_id,
        (importedMap.get(row.retail_order_item_id) ?? 0) +
          Number(row.imported_quantity ?? 0),
      );
    }

    const items = (orderItems ?? [])
      .map((item: any) => {
        const purchasedQty = Number(item.quantity ?? 0);
        const importedQty = importedMap.get(item.id) ?? 0;
        return {
          orderItemId: item.id,
          orderId: item.order_id,
          orderNumber: item.retail_orders?.order_number ?? null,
          orderStatus: item.retail_orders?.status ?? null,
          productId: item.product_id ?? null,
          productName: item.product_name,
          brandName: item.brand_name,
          productImage: item.product_image,
          purchasedQuantity: purchasedQty,
          importedQuantity: importedQty,
          remainingQuantity: Math.max(0, purchasedQty - importedQty),
          unitPrice: Number(item.unit_price ?? 0),
        };
      })
      .filter((item) => item.remainingQuantity > 0);

    return { items };
  }

  async importRetailProduct(userId: string, payload: any) {
    const retailOrderItemId = payload?.retailOrderItemId;
    const importQuantity = Math.floor(Number(payload?.importQuantity ?? 0));
    if (!retailOrderItemId)
      throw new BadRequestException('retailOrderItemId is required');
    if (importQuantity <= 0)
      throw new BadRequestException('importQuantity must be greater than 0');

    const { data: orderItem, error: orderItemError } = await this.serviceClient
      .from('retail_order_items')
      .select(
        'id, order_id, product_id, product_name, brand_name, product_image, quantity, unit_price, variation_details, retail_orders!inner(id, user_id, order_number, status)',
      )
      .eq('id', retailOrderItemId)
      .eq('retail_orders.user_id', userId)
      .in('retail_orders.status', ['delivered', 'completed'])
      .maybeSingle();
    if (orderItemError) throw new BadRequestException(orderItemError.message);
    if (!orderItem)
      throw new BadRequestException(
        'Retail order item is not eligible for import',
      );
    const retailOrder = Array.isArray(orderItem.retail_orders)
      ? orderItem.retail_orders[0]
      : orderItem.retail_orders;

    const { data: remainingQty, error: remainingError } =
      await this.serviceClient.rpc('social_retail_import_remaining_qty', {
        p_user_id: userId,
        p_retail_order_item_id: retailOrderItemId,
      });
    if (remainingError) throw new BadRequestException(remainingError.message);
    if (Number(remainingQty ?? 0) < importQuantity) {
      throw new BadRequestException(
        'Import quantity exceeds remaining quantity',
      );
    }

    const { data: retailProduct } = await this.serviceClient
      .from('retail_products')
      .select('id, category_id, subcategory_id, sub_subcategory_id')
      .eq('id', orderItem.product_id)
      .maybeSingle();

    if (!retailProduct?.category_id) {
      throw new BadRequestException(
        'Retail product has no valid category mapping',
      );
    }

    const { data: createdProduct, error: createError } =
      await this.serviceClient
        .from('social_products')
        .insert({
          seller_id: userId,
          title: payload.title?.trim() || orderItem.product_name,
          description:
            payload.description ??
            `Imported from retail order ${retailOrder?.order_number ?? ''}`.trim(),
          brand: orderItem.brand_name ?? null,
          condition: payload.condition ?? 'good',
          category_id: retailProduct.category_id,
          subcategory_id: retailProduct.subcategory_id ?? null,
          sub_subcategory_id: retailProduct.sub_subcategory_id ?? null,
          listing_type: payload.listingType ?? 'closet',
          source_type: 'retail_import',
          status: 'draft',
          price: Number(payload.price ?? orderItem.unit_price ?? 0),
          quantity: importQuantity,
          available_quantity: importQuantity,
          is_exchangeable: payload.isExchangeable ?? true,
          allow_offers: payload.allowOffers ?? true,
        })
        .select('*')
        .single();
    if (createError || !createdProduct) {
      throw new BadRequestException(
        `Failed to create imported social product: ${createError?.message}`,
      );
    }

    if (orderItem.product_image) {
      await this.serviceClient.from('social_product_media').insert({
        product_id: createdProduct.id,
        media_url: orderItem.product_image,
        media_type: 'image',
        display_order: 0,
        is_primary: true,
      });
    }

    if (this.hasProductAttributesPayload(payload)) {
      await this.replaceProductAttributes(createdProduct.id, payload);
    }

    const snapshot = {
      retail_order_id: orderItem.order_id,
      retail_order_item_id: orderItem.id,
      retail_product_id: orderItem.product_id,
      order_number: retailOrder?.order_number,
      product_name: orderItem.product_name,
      brand_name: orderItem.brand_name,
      product_image: orderItem.product_image,
      quantity: orderItem.quantity,
      unit_price: orderItem.unit_price,
      variation_details: orderItem.variation_details,
      imported_at: new Date().toISOString(),
    };

    const { data: existingImport } = await this.serviceClient
      .from('social_retail_imports')
      .select('*')
      .eq('user_id', userId)
      .eq('retail_order_item_id', orderItem.id)
      .maybeSingle();

    if (existingImport) {
      await this.serviceClient
        .from('social_retail_imports')
        .update({
          imported_quantity:
            Number(existingImport.imported_quantity ?? 0) + importQuantity,
          social_product_id: createdProduct.id,
          source_snapshot: snapshot,
          status:
            Number(existingImport.imported_quantity ?? 0) + importQuantity >=
            Number(existingImport.purchased_quantity ?? 0)
              ? 'closed'
              : 'active',
        })
        .eq('id', existingImport.id);
      await this.serviceClient.from('social_retail_import_events').insert({
        import_id: existingImport.id,
        event_type: 'imported',
        quantity: importQuantity,
        metadata: { social_product_id: createdProduct.id },
      });
    } else {
      const { data: importRow, error: insertImportError } =
        await this.serviceClient
          .from('social_retail_imports')
          .insert({
            user_id: userId,
            retail_order_id: orderItem.order_id,
            retail_order_item_id: orderItem.id,
            retail_product_id: orderItem.product_id,
            social_product_id: createdProduct.id,
            purchased_quantity: orderItem.quantity,
            imported_quantity: importQuantity,
            source_snapshot: snapshot,
            status:
              importQuantity >= Number(orderItem.quantity)
                ? 'closed'
                : 'active',
          })
          .select('*')
          .single();
      if (insertImportError || !importRow) {
        throw new BadRequestException(
          `Product created but ledger insert failed: ${insertImportError?.message}`,
        );
      }
      await this.serviceClient.from('social_retail_import_events').insert({
        import_id: importRow.id,
        event_type: 'imported',
        quantity: importQuantity,
        metadata: { social_product_id: createdProduct.id },
      });
    }

    const full = await this.getProductById(createdProduct.id, userId);
    return full?.product ?? null;
  }

  private async validateTaggedProductsOwnership(
    userId: string,
    productIds: string[],
  ) {
    if (!productIds.length) return [];
    const uniqueIds = Array.from(new Set(productIds));
    const { data, error } = await this.serviceClient
      .from('social_products')
      .select('id')
      .eq('seller_id', userId)
      .in('id', uniqueIds);
    if (error) {
      throw new BadRequestException(
        `Failed to validate tagged products: ${error.message}`,
      );
    }
    return (data ?? []).map((row) => row.id);
  }

  async createPost(userId: string, payload: any) {
    if (!Array.isArray(payload?.media) || payload.media.length === 0) {
      throw new BadRequestException('media is required for post');
    }
    for (const media of payload.media) {
      const mediaUrl = String(media?.url ?? '').trim();
      if (!mediaUrl) {
        throw new BadRequestException('Post media url is required');
      }
      if (mediaUrl.startsWith('data:')) {
        throw new BadRequestException(
          'Post media must be uploaded via storage endpoint first',
        );
      }
    }

    const status = payload.status === 'published' ? 'published' : 'draft';
    const hashtags = Array.isArray(payload.hashtags)
      ? payload.hashtags
          .map((tag: string) => String(tag).trim())
          .filter(Boolean)
      : [];

    const { data: post, error } = await this.serviceClient
      .from('social_posts')
      .insert({
        user_id: userId,
        caption: payload.caption ?? null,
        location_text: payload.locationText ?? null,
        hashtags,
        category_id: payload.categoryId ?? null,
        status,
        is_comments_enabled: payload.isCommentsEnabled ?? true,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .select('*')
      .single();
    if (error || !post) {
      throw new BadRequestException(`Failed to create post: ${error?.message}`);
    }

    const mediaRows = payload.media.map((media: any, index: number) => ({
      post_id: post.id,
      media_url: media.url,
      media_type: media.type ?? 'image',
      thumbnail_url: media.thumbnailUrl ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      duration_seconds: media.durationSeconds ?? null,
      display_order: index,
    }));
    const { error: mediaError } = await this.serviceClient
      .from('social_post_media')
      .insert(mediaRows);
    if (mediaError) {
      throw new BadRequestException(
        `Post created but media insert failed: ${mediaError.message}`,
      );
    }

    const taggedIds = await this.validateTaggedProductsOwnership(
      userId,
      payload.taggedProductIds ?? [],
    );
    if (taggedIds.length) {
      const rows = taggedIds.map((productId) => ({
        content_type: 'post',
        content_id: post.id,
        product_id: productId,
        tagger_user_id: userId,
      }));
      const { error: tagsError } = await this.serviceClient
        .from('social_content_product_tags')
        .insert(rows);
      if (tagsError) {
        throw new BadRequestException(
          `Post created but product tagging failed: ${tagsError.message}`,
        );
      }
    }

    return this.getPostById(post.id, userId);
  }

  async updatePost(userId: string, postId: string, payload: any) {
    const { data: existing } = await this.serviceClient
      .from('social_posts')
      .select('id')
      .eq('id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) throw new NotFoundException('Post not found');

    const updateData: Record<string, unknown> = {};
    if (payload.caption !== undefined)
      updateData.caption = payload.caption ?? null;
    if (payload.locationText !== undefined)
      updateData.location_text = payload.locationText ?? null;
    if (payload.hashtags !== undefined)
      updateData.hashtags = payload.hashtags ?? [];
    if (payload.categoryId !== undefined)
      updateData.category_id = payload.categoryId ?? null;
    if (payload.isCommentsEnabled !== undefined)
      updateData.is_comments_enabled = payload.isCommentsEnabled;
    if (payload.status !== undefined) {
      updateData.status = payload.status;
      if (payload.status === 'published') {
        updateData.published_at = new Date().toISOString();
      }
    }
    if (Object.keys(updateData).length) {
      const { error: updateError } = await this.serviceClient
        .from('social_posts')
        .update(updateData)
        .eq('id', postId)
        .eq('user_id', userId);
      if (updateError) throw new BadRequestException(updateError.message);
    }

    if (Array.isArray(payload.media)) {
      for (const media of payload.media) {
        const mediaUrl = String(media?.url ?? '').trim();
        if (!mediaUrl) {
          throw new BadRequestException('Post media url is required');
        }
        if (mediaUrl.startsWith('data:')) {
          throw new BadRequestException(
            'Post media must be uploaded via storage endpoint first',
          );
        }
      }
      await this.serviceClient
        .from('social_post_media')
        .delete()
        .eq('post_id', postId);
      if (payload.media.length) {
        const mediaRows = payload.media.map((media: any, index: number) => ({
          post_id: postId,
          media_url: media.url,
          media_type: media.type ?? 'image',
          thumbnail_url: media.thumbnailUrl ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
          duration_seconds: media.durationSeconds ?? null,
          display_order: index,
        }));
        await this.serviceClient.from('social_post_media').insert(mediaRows);
      }
    }

    if (Array.isArray(payload.taggedProductIds)) {
      await this.serviceClient
        .from('social_content_product_tags')
        .delete()
        .eq('content_type', 'post')
        .eq('content_id', postId);
      const taggedIds = await this.validateTaggedProductsOwnership(
        userId,
        payload.taggedProductIds,
      );
      if (taggedIds.length) {
        const rows = taggedIds.map((productId) => ({
          content_type: 'post',
          content_id: postId,
          product_id: productId,
          tagger_user_id: userId,
        }));
        await this.serviceClient
          .from('social_content_product_tags')
          .insert(rows);
      }
    }

    return this.getPostById(postId, userId);
  }

  async publishPost(userId: string, postId: string) {
    const { data } = await this.serviceClient
      .from('social_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (!data) throw new NotFoundException('Post not found');
    return this.getPostById(postId, userId);
  }

  async getPostById(postId: string, viewerUserId?: string | null) {
    const { data: post } = await this.serviceClient
      .from('social_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();
    if (!post) throw new NotFoundException('Post not found');
    if (post.status !== 'published' && post.user_id !== viewerUserId)
      throw new NotFoundException('Post not found');
    const [mapped] = await this.enrichPosts([post]);
    const { data: tags } = await this.serviceClient
      .from('social_content_product_tags')
      .select('product_id')
      .eq('content_type', 'post')
      .eq('content_id', postId);
    return {
      ...mapped,
      tagged_product_ids: (tags ?? []).map((tag) => tag.product_id),
    };
  }

  async createReel(userId: string, payload: any) {
    if (!Array.isArray(payload?.media) || payload.media.length === 0) {
      throw new BadRequestException('media is required for reel');
    }
    for (const media of payload.media) {
      const reelUrl = String(media?.reelUrl ?? '').trim();
      if (!reelUrl) {
        throw new BadRequestException('Reel media url is required');
      }
      if (reelUrl.startsWith('data:')) {
        throw new BadRequestException(
          'Reel media must be uploaded via storage endpoint first',
        );
      }
      const thumbnailUrl = String(media?.thumbnailUrl ?? '').trim();
      if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
        throw new BadRequestException(
          'Reel thumbnail must be uploaded via storage endpoint first',
        );
      }
    }

    const firstMedia = payload.media[0];
    const reelThumbnail =
      firstMedia?.thumbnailUrl ?? firstMedia?.reelUrl ?? null;
    const status = payload.status === 'published' ? 'published' : 'draft';
    const { data: reel, error } = await this.serviceClient
      .from('social_reels')
      .insert({
        user_id: userId,
        caption: payload.caption ?? null,
        category_id: payload.categoryId ?? null,
        thumbnail_url: reelThumbnail,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .select('*')
      .single();
    if (error || !reel)
      throw new BadRequestException(`Failed to create reel: ${error?.message}`);

    const mediaRows = payload.media.map((media: any) => ({
      reel_id: reel.id,
      reel_url: media.reelUrl,
      thumbnail_url: media.thumbnailUrl ?? null,
      duration_seconds: media.durationSeconds ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
    }));
    const { error: mediaError } = await this.serviceClient
      .from('social_reel_media')
      .insert(mediaRows);
    if (mediaError)
      throw new BadRequestException(
        `Reel created but media insert failed: ${mediaError.message}`,
      );

    const taggedIds = await this.validateTaggedProductsOwnership(
      userId,
      payload.taggedProductIds ?? [],
    );
    if (taggedIds.length) {
      const rows = taggedIds.map((productId) => ({
        content_type: 'reel',
        content_id: reel.id,
        product_id: productId,
        tagger_user_id: userId,
      }));
      await this.serviceClient.from('social_content_product_tags').insert(rows);
    }

    return this.getReelById(reel.id, userId);
  }

  async updateReel(userId: string, reelId: string, payload: any) {
    const { data: existing } = await this.serviceClient
      .from('social_reels')
      .select('id')
      .eq('id', reelId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) throw new NotFoundException('Reel not found');

    const updateData: Record<string, unknown> = {};
    if (payload.caption !== undefined)
      updateData.caption = payload.caption ?? null;
    if (payload.categoryId !== undefined)
      updateData.category_id = payload.categoryId ?? null;
    if (payload.status !== undefined) {
      updateData.status = payload.status;
      if (payload.status === 'published')
        updateData.published_at = new Date().toISOString();
    }
    if (Object.keys(updateData).length) {
      await this.serviceClient
        .from('social_reels')
        .update(updateData)
        .eq('id', reelId)
        .eq('user_id', userId);
    }

    if (Array.isArray(payload.media)) {
      for (const media of payload.media) {
        const reelUrl = String(media?.reelUrl ?? '').trim();
        if (!reelUrl) {
          throw new BadRequestException('Reel media url is required');
        }
        if (reelUrl.startsWith('data:')) {
          throw new BadRequestException(
            'Reel media must be uploaded via storage endpoint first',
          );
        }
        const thumbnailUrl = String(media?.thumbnailUrl ?? '').trim();
        if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
          throw new BadRequestException(
            'Reel thumbnail must be uploaded via storage endpoint first',
          );
        }
      }

      await this.serviceClient
        .from('social_reel_media')
        .delete()
        .eq('reel_id', reelId);
      if (payload.media.length) {
        const rows = payload.media.map((media: any) => ({
          reel_id: reelId,
          reel_url: media.reelUrl,
          thumbnail_url: media.thumbnailUrl ?? null,
          duration_seconds: media.durationSeconds ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
        }));
        await this.serviceClient.from('social_reel_media').insert(rows);
      }
      const nextThumbnail =
        payload.media[0]?.thumbnailUrl ?? payload.media[0]?.reelUrl ?? null;
      await this.serviceClient
        .from('social_reels')
        .update({ thumbnail_url: nextThumbnail })
        .eq('id', reelId)
        .eq('user_id', userId);
    }

    if (Array.isArray(payload.taggedProductIds)) {
      await this.serviceClient
        .from('social_content_product_tags')
        .delete()
        .eq('content_type', 'reel')
        .eq('content_id', reelId);
      const taggedIds = await this.validateTaggedProductsOwnership(
        userId,
        payload.taggedProductIds,
      );
      if (taggedIds.length) {
        const rows = taggedIds.map((productId) => ({
          content_type: 'reel',
          content_id: reelId,
          product_id: productId,
          tagger_user_id: userId,
        }));
        await this.serviceClient
          .from('social_content_product_tags')
          .insert(rows);
      }
    }

    return this.getReelById(reelId, userId);
  }

  async publishReel(userId: string, reelId: string) {
    const { data } = await this.serviceClient
      .from('social_reels')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', reelId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (!data) throw new NotFoundException('Reel not found');
    return this.getReelById(reelId, userId);
  }

  async getReelById(reelId: string, viewerUserId?: string | null) {
    const { data: reel } = await this.serviceClient
      .from('social_reels')
      .select('*')
      .eq('id', reelId)
      .maybeSingle();
    if (!reel) throw new NotFoundException('Reel not found');
    if (reel.status !== 'published' && reel.user_id !== viewerUserId)
      throw new NotFoundException('Reel not found');
    const [mapped] = await this.enrichReels([reel]);
    const { data: tags } = await this.serviceClient
      .from('social_content_product_tags')
      .select('product_id')
      .eq('content_type', 'reel')
      .eq('content_id', reelId);
    return {
      ...mapped,
      tagged_product_ids: (tags ?? []).map((tag) => tag.product_id),
    };
  }

  private async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
  ) {
    const { error } = await this.serviceClient
      .from('social_notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body,
        metadata: metadata ?? {},
      });
    if (error) {
      throw new BadRequestException(
        `Failed to create notification: ${error.message}`,
      );
    }
  }

  async getExchangeListings() {
    const { data: listings, error } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .in('status', ['open', 'accepted', 'closed'])
      .order('created_at', { ascending: false });
    if (error)
      throw new BadRequestException(
        `Failed to fetch exchange listings: ${error.message}`,
      );

    const offeredProductIds = (listings ?? [])
      .map((listing) => listing.offered_product_id)
      .filter(Boolean);
    const ownerIds = (listings ?? []).map((listing) => listing.owner_id);
    const [productsRaw, profiles] = await Promise.all([
      this.fetchProductsByIds(offeredProductIds as string[]),
      this.getProfilesMap(ownerIds),
    ]);
    const products = await this.enrichProducts(productsRaw);
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    return (listings ?? []).map((listing) => ({
      ...listing,
      owner_username: profiles.get(listing.owner_id)?.username ?? null,
      owner_display_name: profiles.get(listing.owner_id)?.display_name ?? null,
      owner_avatar_url: profiles.get(listing.owner_id)?.avatar_url ?? null,
      social_products: listing.offered_product_id
        ? (productMap.get(listing.offered_product_id) ?? null)
        : null,
    }));
  }

  async getExchangeListingById(listingId: string) {
    const { data: listing, error } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!listing) throw new NotFoundException('Exchange listing not found');

    const [mappedListing] = (await this.getExchangeListings()).filter(
      (row) => row.id === listingId,
    );
    const { data: proposals } = await this.serviceClient
      .from('social_swap_proposals')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false });

    const { data: transaction } = await this.serviceClient
      .from('social_swap_transactions')
      .select('id')
      .eq('listing_id', listingId)
      .maybeSingle();
    let timeline: any[] = [];
    if (transaction?.id) {
      const { data: rows } = await this.serviceClient
        .from('social_swap_timeline')
        .select('*')
        .eq('transaction_id', transaction.id)
        .order('created_at', { ascending: true });
      timeline = rows ?? [];
    }

    return {
      listing: mappedListing ?? listing,
      proposals: proposals ?? [],
      timeline,
    };
  }

  async createSwapListing(userId: string, payload: any) {
    if (!payload?.title?.trim())
      throw new BadRequestException('title is required');
    const { data: listing, error } = await this.serviceClient
      .from('social_swap_listings')
      .insert({
        owner_id: userId,
        offered_product_id: payload.offeredProductId ?? null,
        title: payload.title.trim(),
        description: payload.description ?? null,
        wanted_category_id: payload.wantedCategoryId ?? null,
        wanted_subcategory_id: payload.wantedSubcategoryId ?? null,
        wanted_sub_subcategory_id: payload.wantedSubSubcategoryId ?? null,
        wanted_description: payload.wantedDescription ?? null,
        wanted_min_value: payload.wantedMinValue ?? null,
        wanted_max_value: payload.wantedMaxValue ?? null,
        offered_value: payload.offeredValue ?? null,
        is_cash_top_up_allowed: payload.isCashTopUpAllowed ?? true,
        expires_at: payload.expiresAt ?? null,
      })
      .select('*')
      .single();
    if (error || !listing)
      throw new BadRequestException(
        `Failed to create swap listing: ${error?.message}`,
      );
    return this.getExchangeListingById(listing.id);
  }

  async createSwapProposal(userId: string, listingId: string, payload: any) {
    const { data: listing } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();
    if (!listing) throw new NotFoundException('Swap listing not found');
    if (listing.owner_id === userId)
      throw new BadRequestException('Cannot propose on own listing');

    const { data: proposal, error } = await this.serviceClient
      .from('social_swap_proposals')
      .insert({
        listing_id: listingId,
        proposer_id: userId,
        offered_product_id: payload.offeredProductId ?? null,
        offered_value: payload.offeredValue ?? null,
        cash_top_up: payload.cashTopUp ?? 0,
        message: payload.message ?? null,
      })
      .select('*')
      .single();
    if (error || !proposal)
      throw new BadRequestException(
        `Failed to create swap proposal: ${error?.message}`,
      );

    await this.createNotification(
      listing.owner_id,
      'proposal_received',
      'New swap proposal',
      'You received a new proposal on your listing.',
      { listingId, proposalId: proposal.id },
    );
    return proposal;
  }

  async acceptSwapProposal(userId: string, proposalId: string) {
    const { data: proposal } = await this.serviceClient
      .from('social_swap_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();
    if (!proposal) throw new NotFoundException('Proposal not found');

    const { data: listing } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', proposal.listing_id)
      .maybeSingle();
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.owner_id !== userId)
      throw new ForbiddenException('Only listing owner can accept');

    await this.serviceClient
      .from('social_swap_proposals')
      .update({ status: 'accepted' })
      .eq('id', proposalId);
    await this.serviceClient
      .from('social_swap_proposals')
      .update({ status: 'declined' })
      .eq('listing_id', listing.id)
      .eq('status', 'pending')
      .neq('id', proposalId);
    await this.serviceClient
      .from('social_swap_listings')
      .update({ status: 'accepted' })
      .eq('id', listing.id);

    const { data: transaction, error: transactionError } =
      await this.serviceClient
        .from('social_swap_transactions')
        .insert({
          listing_id: listing.id,
          accepted_proposal_id: proposal.id,
          owner_id: listing.owner_id,
          proposer_id: proposal.proposer_id,
          status: 'accepted',
        })
        .select('*')
        .single();
    if (transactionError || !transaction) {
      throw new BadRequestException(
        `Failed to create transaction: ${transactionError?.message}`,
      );
    }

    await this.serviceClient.from('social_swap_timeline').insert({
      transaction_id: transaction.id,
      event_type: 'swap_accepted',
      actor_id: userId,
      payload: { proposal_id: proposal.id, listing_id: listing.id },
    });

    const { data: thread } = await this.serviceClient
      .from('social_threads')
      .insert({
        title: listing.title,
        related_swap_listing_id: listing.id,
        related_swap_transaction_id: transaction.id,
        created_by: userId,
      })
      .select('*')
      .single();
    if (thread) {
      await this.serviceClient.from('social_thread_participants').insert([
        { thread_id: thread.id, user_id: listing.owner_id },
        { thread_id: thread.id, user_id: proposal.proposer_id },
      ]);
      await this.serviceClient.from('social_messages').insert({
        thread_id: thread.id,
        sender_id: listing.owner_id,
        message_type: 'system',
        body: 'Swap accepted. Coordinate shipment details here.',
        metadata: { transaction_id: transaction.id },
      });
    }

    await this.createNotification(
      proposal.proposer_id,
      'proposal_accepted',
      'Proposal accepted',
      'Your swap proposal was accepted.',
      {
        listingId: listing.id,
        proposalId: proposal.id,
        transactionId: transaction.id,
      },
    );

    return { transactionId: transaction.id, threadId: thread?.id ?? null };
  }

  async declineSwapProposal(userId: string, proposalId: string) {
    const { data: proposal } = await this.serviceClient
      .from('social_swap_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();
    if (!proposal) throw new NotFoundException('Proposal not found');
    const { data: listing } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', proposal.listing_id)
      .maybeSingle();
    if (!listing || listing.owner_id !== userId)
      throw new ForbiddenException('Only listing owner can decline');
    await this.serviceClient
      .from('social_swap_proposals')
      .update({ status: 'declined' })
      .eq('id', proposal.id);
    await this.createNotification(
      proposal.proposer_id,
      'proposal_declined',
      'Proposal declined',
      'Your swap proposal was declined.',
      { listingId: listing.id, proposalId: proposal.id },
    );
    return { success: true };
  }

  private async assertThreadParticipant(userId: string, threadId: string) {
    const { data: participant } = await this.serviceClient
      .from('social_thread_participants')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!participant)
      throw new ForbiddenException('You are not a participant in this thread');
    return participant;
  }

  async getThreads(userId: string) {
    const { data: participants, error } = await this.serviceClient
      .from('social_thread_participants')
      .select('thread_id, last_read_at, is_muted')
      .eq('user_id', userId);
    if (error)
      throw new BadRequestException(`Failed to load threads: ${error.message}`);
    const threadIds = Array.from(
      new Set((participants ?? []).map((row) => row.thread_id)),
    );
    if (!threadIds.length) return [];

    const { data: allParticipants, error: allParticipantsError } =
      await this.serviceClient
        .from('social_thread_participants')
        .select('thread_id, user_id')
        .in('thread_id', threadIds);
    if (allParticipantsError) {
      throw new BadRequestException(
        `Failed to fetch thread participants: ${allParticipantsError.message}`,
      );
    }

    const { data: threads, error: threadsError } = await this.serviceClient
      .from('social_threads')
      .select('*')
      .in('id', threadIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });
    if (threadsError)
      throw new BadRequestException(
        `Failed to fetch thread rows: ${threadsError.message}`,
      );

    const ownParticipantMap = new Map(
      (participants ?? []).map((row) => [row.thread_id, row]),
    );
    const participantsByThread = new Map<string, string[]>();
    for (const row of allParticipants ?? []) {
      if (!participantsByThread.has(row.thread_id)) {
        participantsByThread.set(row.thread_id, []);
      }
      participantsByThread.get(row.thread_id)?.push(row.user_id);
    }

    const otherUserIds = Array.from(
      new Set(
        (allParticipants ?? [])
          .filter((row) => row.user_id !== userId)
          .map((row) => row.user_id)
          .filter(Boolean),
      ),
    );
    const profiles = await this.getProfilesMap(otherUserIds);

    const unreadCountByThread = new Map<string, number>();
    await Promise.all(
      threadIds.map(async (threadId) => {
        const lastReadAt = ownParticipantMap.get(threadId)?.last_read_at;
        let unreadQuery = this.serviceClient
          .from('social_messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', threadId)
          .neq('sender_id', userId);
        if (lastReadAt) {
          unreadQuery = unreadQuery.gt('created_at', lastReadAt);
        }
        const { count } = await unreadQuery;
        unreadCountByThread.set(threadId, count ?? 0);
      }),
    );

    return (threads ?? []).map((thread) => {
      const participantIds = participantsByThread.get(thread.id) ?? [];
      const counterpartUserId =
        participantIds.find((participantId) => participantId !== userId) ??
        null;
      const counterpartProfile = counterpartUserId
        ? profiles.get(counterpartUserId)
        : null;

      return {
        ...thread,
        is_muted: ownParticipantMap.get(thread.id)?.is_muted ?? false,
        last_read_at: ownParticipantMap.get(thread.id)?.last_read_at ?? null,
        unread_count: unreadCountByThread.get(thread.id) ?? 0,
        counterpart_user_id: counterpartUserId,
        counterpart_username: counterpartProfile?.username ?? null,
        counterpart_display_name: counterpartProfile?.display_name ?? null,
        counterpart_avatar_url: counterpartProfile?.avatar_url ?? null,
      };
    });
  }

  async createThread(userId: string, payload: any) {
    const participantIds = Array.from(
      new Set([
        userId,
        ...((payload?.participantIds ?? []) as string[]).filter(Boolean),
      ]),
    );
    if (participantIds.length < 2)
      throw new BadRequestException('At least 2 participants required');

    const { data: thread, error } = await this.serviceClient
      .from('social_threads')
      .insert({
        title: payload.title ?? null,
        related_swap_listing_id: payload.relatedSwapListingId ?? null,
        related_swap_transaction_id: payload.relatedSwapTransactionId ?? null,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error || !thread)
      throw new BadRequestException(
        `Failed to create thread: ${error?.message}`,
      );

    await this.serviceClient.from('social_thread_participants').insert(
      participantIds.map((participantId) => ({
        thread_id: thread.id,
        user_id: participantId,
      })),
    );
    return thread;
  }

  async getThreadMessages(userId: string, threadId: string) {
    await this.assertThreadParticipant(userId, threadId);
    const { data: messages, error } = await this.serviceClient
      .from('social_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error)
      throw new BadRequestException(
        `Failed to fetch messages: ${error.message}`,
      );

    const messageIds = (messages ?? []).map((message) => message.id);
    const senderIds = (messages ?? []).map((message) => message.sender_id);
    const [attachmentsResult, profiles] = await Promise.all([
      this.serviceClient
        .from('social_message_attachments')
        .select('*')
        .in('message_id', messageIds),
      this.getProfilesMap(senderIds),
    ]);
    if (attachmentsResult.error) {
      throw new BadRequestException(
        `Failed to fetch attachments: ${attachmentsResult.error.message}`,
      );
    }
    const attachmentsMap = new Map<string, any[]>();
    for (const attachment of attachmentsResult.data ?? []) {
      if (!attachmentsMap.has(attachment.message_id))
        attachmentsMap.set(attachment.message_id, []);
      attachmentsMap.get(attachment.message_id)?.push(attachment);
    }

    return (messages ?? []).map((message) => {
      const profile = profiles.get(message.sender_id);
      return {
        id: message.id,
        thread_id: message.thread_id,
        sender_id: message.sender_id,
        sender_username: profile?.username ?? null,
        sender_display_name: profile?.display_name ?? null,
        sender_avatar_url: profile?.avatar_url ?? null,
        message_type: message.message_type,
        body: message.body,
        message: message.body,
        metadata: message.metadata,
        created_at: message.created_at,
        attachments: attachmentsMap.get(message.id) ?? [],
      };
    });
  }

  async sendThreadMessage(userId: string, threadId: string, payload: any) {
    await this.assertThreadParticipant(userId, threadId);
    const messageType = payload?.messageType ?? 'text';
    if (messageType === 'text' && !payload?.body?.trim()) {
      throw new BadRequestException('Message body is required');
    }

    const { data: message, error } = await this.serviceClient
      .from('social_messages')
      .insert({
        thread_id: threadId,
        sender_id: userId,
        message_type: messageType,
        body: payload.body ?? null,
        metadata: payload.metadata ?? null,
      })
      .select('*')
      .single();
    if (error || !message)
      throw new BadRequestException(
        `Failed to send message: ${error?.message}`,
      );

    if (Array.isArray(payload.attachments) && payload.attachments.length) {
      await this.serviceClient.from('social_message_attachments').insert(
        payload.attachments.map((attachment: any) => ({
          message_id: message.id,
          attachment_type: attachment.attachmentType ?? 'image',
          file_url: attachment.fileUrl,
          metadata: attachment.metadata ?? null,
        })),
      );
    }

    await this.serviceClient
      .from('social_thread_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('user_id', userId);

    const { data: participants } = await this.serviceClient
      .from('social_thread_participants')
      .select('user_id')
      .eq('thread_id', threadId);
    for (const participant of participants ?? []) {
      if (participant.user_id !== userId) {
        await this.createNotification(
          participant.user_id,
          'message',
          'New message',
          payload.body?.slice(0, 200) || 'You received a new message.',
          { threadId, messageId: message.id, senderId: userId },
        );
      }
    }

    const messages = await this.getThreadMessages(userId, threadId);
    return messages.find((candidate) => candidate.id === message.id) ?? null;
  }

  async markThreadRead(userId: string, threadId: string) {
    await this.assertThreadParticipant(userId, threadId);
    await this.serviceClient
      .from('social_thread_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .eq('user_id', userId);
    return { success: true };
  }

  async getNotifications(
    userId: string,
    filter: 'all' | 'unread' = 'all',
    limitValue?: string | number,
  ) {
    const limit = this.sanitizeLimit(limitValue, 50, 100);
    let query = this.serviceClient
      .from('social_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (filter === 'unread') query = query.eq('is_read', false);
    const { data, error } = await query;
    if (error)
      throw new BadRequestException(
        `Failed to fetch notifications: ${error.message}`,
      );
    return data ?? [];
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const { data, error } = await this.serviceClient.rpc(
      'social_mark_notification_read',
      {
        p_notification_id: notificationId,
        p_user_id: userId,
      },
    );
    if (error)
      throw new BadRequestException(
        `Failed to mark notification read: ${error.message}`,
      );
    return { success: Boolean(data) };
  }

  async markAllNotificationsRead(userId: string) {
    const { error } = await this.serviceClient
      .from('social_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error)
      throw new BadRequestException(
        `Failed to mark all notifications as read: ${error.message}`,
      );
    return { success: true };
  }

  async listSalesOrders(userId: string) {
    const { data: orders, error } = await this.serviceClient
      .from('social_sales_orders')
      .select('*')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (error)
      throw new BadRequestException(
        `Failed to fetch social orders: ${error.message}`,
      );
    return orders ?? [];
  }

  async getSalesOrderById(userId: string, orderId: string) {
    const { data: order, error } = await this.serviceClient
      .from('social_sales_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (error)
      throw new BadRequestException(
        `Failed to fetch social order: ${error.message}`,
      );
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    const [itemsResult, shipmentsResult, eventsResult] = await Promise.all([
      this.serviceClient
        .from('social_sales_order_items')
        .select('*')
        .eq('order_id', orderId),
      this.serviceClient
        .from('social_sales_shipments')
        .select('*')
        .eq('order_id', orderId),
      this.serviceClient
        .from('social_sales_events')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
    ]);

    if (itemsResult.error)
      throw new BadRequestException(itemsResult.error.message);
    if (shipmentsResult.error)
      throw new BadRequestException(shipmentsResult.error.message);
    if (eventsResult.error)
      throw new BadRequestException(eventsResult.error.message);

    return {
      order,
      items: itemsResult.data ?? [],
      shipments: shipmentsResult.data ?? [],
      events: eventsResult.data ?? [],
    };
  }

  async createSalesOrder(
    buyerId: string,
    payload: {
      items?: Array<{ productId: string; quantity: number }>;
      shippingAddress?: Record<string, unknown>;
      notes?: string;
    },
  ) {
    const items = (payload?.items ?? []).filter(
      (item) => item?.productId && item?.quantity > 0,
    );
    if (!items.length) {
      throw new BadRequestException('At least one order item is required');
    }

    const productIds = Array.from(new Set(items.map((item) => item.productId)));
    const { data: products, error: productsError } = await this.serviceClient
      .from('social_products')
      .select('*')
      .in('id', productIds);
    if (productsError) {
      throw new BadRequestException(
        `Failed to validate products: ${productsError.message}`,
      );
    }
    const productsMap = new Map(
      (products ?? []).map((product) => [product.id, product]),
    );
    if (productsMap.size !== productIds.length) {
      throw new BadRequestException('One or more products were not found');
    }

    const sellerIds = new Set<string>();
    let subtotal = 0;
    const orderItems: Array<{
      product_id: string;
      product_snapshot: Record<string, unknown>;
      quantity: number;
      unit_price: number;
      total_price: number;
    }> = [];

    for (const item of items) {
      const product = productsMap.get(item.productId);
      if (!product) throw new BadRequestException('Invalid product in order');
      if (product.status !== 'active') {
        throw new BadRequestException(
          `Product is not active: ${product.title}`,
        );
      }
      if ((product.available_quantity ?? 0) < item.quantity) {
        throw new BadRequestException(
          `Insufficient quantity for ${product.title}`,
        );
      }
      sellerIds.add(product.seller_id);
      const unitPrice = Number(product.price ?? 0);
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;
      orderItems.push({
        product_id: product.id,
        product_snapshot: {
          id: product.id,
          title: product.title,
          slug: product.slug,
          price: unitPrice,
          seller_id: product.seller_id,
          category_id: product.category_id,
          subcategory_id: product.subcategory_id,
          sub_subcategory_id: product.sub_subcategory_id,
          condition: product.condition,
          image: null,
        },
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      });
    }

    if (sellerIds.size !== 1) {
      throw new BadRequestException('Single-seller order is required for now');
    }
    const sellerId = Array.from(sellerIds)[0];
    if (sellerId === buyerId) {
      throw new BadRequestException('Cannot create order for own products');
    }

    const shippingCost = 0;
    const totalAmount = subtotal + shippingCost;

    const { data: order, error: orderError } = await this.serviceClient
      .from('social_sales_orders')
      .insert({
        order_number: '',
        buyer_id: buyerId,
        seller_id: sellerId,
        status: 'pending',
        subtotal,
        shipping_cost: shippingCost,
        total_amount: totalAmount,
        currency: 'USD',
        shipping_address: payload?.shippingAddress ?? null,
        notes: payload?.notes ?? null,
      })
      .select('*')
      .single();
    if (orderError || !order) {
      throw new BadRequestException(
        `Failed to create social order: ${orderError?.message}`,
      );
    }

    const { error: itemInsertError } = await this.serviceClient
      .from('social_sales_order_items')
      .insert(
        orderItems.map((item) => ({
          order_id: order.id,
          ...item,
        })),
      );
    if (itemInsertError) {
      throw new BadRequestException(
        `Failed to create social order items: ${itemInsertError.message}`,
      );
    }

    for (const item of items) {
      const product = productsMap.get(item.productId);
      if (!product) continue;
      const nextAvailable = Math.max(
        0,
        Number(product.available_quantity ?? 0) - item.quantity,
      );
      const nextStatus = nextAvailable === 0 ? 'sold' : product.status;
      await this.serviceClient
        .from('social_products')
        .update({
          available_quantity: nextAvailable,
          sales_count: Number(product.sales_count ?? 0) + item.quantity,
          status: nextStatus,
          sold_at:
            nextStatus === 'sold' ? new Date().toISOString() : product.sold_at,
        })
        .eq('id', product.id);
    }

    await this.serviceClient.from('social_sales_events').insert({
      order_id: order.id,
      event_type: 'order_created',
      actor_id: buyerId,
      payload: {
        item_count: items.length,
        subtotal,
        total_amount: totalAmount,
      },
    });

    await this.createNotification(
      sellerId,
      'social_order_created',
      'New social order',
      'You received a new social order.',
      { orderId: order.id, orderNumber: order.order_number },
    );

    return this.getSalesOrderById(buyerId, order.id);
  }

  async updateSalesOrderStatus(
    userId: string,
    orderId: string,
    payload: { status?: string; shipment?: Record<string, unknown> },
  ) {
    const allowedStatuses = [
      'pending',
      'accepted',
      'packing',
      'shipped',
      'delivered',
      'completed',
      'cancelled',
      'refunded',
    ];
    const nextStatus = payload?.status?.toLowerCase();
    if (!nextStatus || !allowedStatuses.includes(nextStatus)) {
      throw new BadRequestException('Invalid status');
    }

    const { data: order, error: orderError } = await this.serviceClient
      .from('social_sales_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) throw new BadRequestException(orderError.message);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    if (
      nextStatus === 'accepted' ||
      nextStatus === 'packing' ||
      nextStatus === 'shipped'
    ) {
      if (order.seller_id !== userId) {
        throw new ForbiddenException('Only seller can set this status');
      }
    }
    if (nextStatus === 'completed') {
      if (order.buyer_id !== userId) {
        throw new ForbiddenException('Only buyer can complete order');
      }
    }
    if (nextStatus === 'cancelled') {
      if (order.status !== 'pending' && order.status !== 'accepted') {
        throw new BadRequestException(
          'Order cannot be cancelled in current state',
        );
      }
    }

    const updatePayload: Record<string, unknown> = { status: nextStatus };
    const now = new Date().toISOString();
    if (nextStatus === 'shipped') updatePayload.shipped_at = now;
    if (nextStatus === 'delivered') updatePayload.delivered_at = now;
    if (nextStatus === 'completed') updatePayload.completed_at = now;
    if (nextStatus === 'cancelled') updatePayload.cancelled_at = now;

    const { data: updatedOrder, error: updateError } = await this.serviceClient
      .from('social_sales_orders')
      .update(updatePayload)
      .eq('id', order.id)
      .select('*')
      .single();
    if (updateError || !updatedOrder) {
      throw new BadRequestException(
        `Failed to update order status: ${updateError?.message}`,
      );
    }

    if (nextStatus === 'shipped' && payload?.shipment) {
      await this.serviceClient.from('social_sales_shipments').insert({
        order_id: order.id,
        shipper_id: userId,
        carrier: (payload.shipment as any).carrier ?? null,
        tracking_number: (payload.shipment as any).trackingNumber ?? null,
        status: 'in_transit',
        metadata: payload.shipment,
      });
    }

    await this.serviceClient.from('social_sales_events').insert({
      order_id: order.id,
      event_type: `status_${nextStatus}`,
      actor_id: userId,
      payload: {
        previous_status: order.status,
        next_status: nextStatus,
      },
    });

    const notifyUserId =
      userId === order.buyer_id ? order.seller_id : order.buyer_id;
    await this.createNotification(
      notifyUserId,
      'social_order_status',
      'Order status updated',
      `Order ${order.order_number} is now ${nextStatus}.`,
      { orderId: order.id, status: nextStatus },
    );

    return this.getSalesOrderById(userId, order.id);
  }

  async getTaxonomy() {
    const [categoriesResult, subcategoriesResult, subSubcategoriesResult] =
      await Promise.all([
        this.serviceClient
          .from('categories')
          .select('id, name, slug, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true }),
        this.serviceClient
          .from('subcategories')
          .select('id, category_id, name, slug, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true }),
        this.serviceClient
          .from('sub_subcategories')
          .select('id, subcategory_id, name, slug, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true }),
      ]);

    if (categoriesResult.error)
      throw new BadRequestException(categoriesResult.error.message);
    if (subcategoriesResult.error)
      throw new BadRequestException(subcategoriesResult.error.message);
    if (subSubcategoriesResult.error)
      throw new BadRequestException(subSubcategoriesResult.error.message);

    const subSubMap = new Map<string, any[]>();
    for (const row of subSubcategoriesResult.data ?? []) {
      if (!subSubMap.has(row.subcategory_id))
        subSubMap.set(row.subcategory_id, []);
      subSubMap.get(row.subcategory_id)?.push(row);
    }

    const subMap = new Map<string, any[]>();
    for (const row of subcategoriesResult.data ?? []) {
      if (!subMap.has(row.category_id)) subMap.set(row.category_id, []);
      subMap.get(row.category_id)?.push({
        ...row,
        subSubcategories: subSubMap.get(row.id) ?? [],
      });
    }

    return (categoriesResult.data ?? []).map((category) => ({
      ...category,
      subcategories: subMap.get(category.id) ?? [],
    }));
  }
}
