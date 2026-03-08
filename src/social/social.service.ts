import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type FeedMode = 'all' | 'posts' | 'reels' | 'closet';
type ExploreFeedTab = 'all' | 'posts' | 'reels' | 'shop';
type ListingType = 'shop' | 'closet';
type SocialContentType = 'post' | 'reel' | 'product';

interface RankedCursor {
  score: number;
  createdAt: string;
  id: string;
}

interface FeedCursor {
  createdAt: string;
  score?: number;
  contentType?: SocialContentType;
  id?: string;
}

interface FollowListCursor {
  createdAt: string;
  id: string;
}

interface UserSearchCursor {
  score?: number;
  createdAt: string;
  userId: string;
}

interface CommentCursor {
  createdAt: string;
  id: string;
}

interface ProductSearchOptions {
  q?: string;
  categoryId?: string;
  subcategoryId?: string;
  subSubcategoryId?: string;
  condition?: string;
  brand?: string;
  size?: string;
  color?: string;
  dynamicFilters?: Record<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  limit?: number;
  cursor?: string;
}

interface ProductsRankedRpcArgs {
  p_user_id: string | null;
  p_query: string | null;
  p_listing_type: ListingType | null;
  p_category_id: string | null;
  p_subcategory_id: string | null;
  p_sub_subcategory_id: string | null;
  p_min_price: number | null;
  p_max_price: number | null;
  p_radius_km: number | null;
  p_user_lat: number | null;
  p_user_lng: number | null;
  p_limit: number;
  p_cursor_score: number | null;
  p_cursor_created_at: string | null;
  p_cursor_id: string | null;
  p_condition?: string | null;
  p_brand?: string | null;
  p_size?: string | null;
  p_color?: string | null;
  p_dynamic_filters?: Record<string, string[]> | null;
}

interface ProfileFollowListOptions {
  q?: string;
  limit?: number;
  cursor?: string;
}

interface UserSearchOptions {
  q?: string;
  limit?: number;
  cursor?: string;
}

interface RankedUserSearchOptions extends UserSearchOptions {
  excludeFollowed?: boolean;
}

interface RankedUserRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number | null;
  following_count: number | null;
  seller_reputation: number | null;
  created_at: string;
}

interface RankedUserScored {
  row: RankedUserRow;
  score: number;
  ranking_meta: {
    profile_completeness: number;
    activity: number;
    trust: number;
    text_relevance?: number;
  };
}

interface ContentControlsListOptions {
  limit?: number;
  cursor?: string;
  contentType?: string;
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
  sku: string | null;
  productDetails: Record<string, string | string[]>;
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

  private isProductsRankedSignatureMismatch(
    error: {
      message?: string;
      details?: string;
      hint?: string;
    } | null,
  ): boolean {
    if (!error) return false;
    const source =
      `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
    if (!source.includes('social_products_ranked')) return false;
    return (
      source.includes('does not exist') ||
      source.includes('p_condition') ||
      source.includes('p_brand') ||
      source.includes('p_size') ||
      source.includes('p_color') ||
      source.includes('p_dynamic_filters') ||
      source.includes('no function matches') ||
      source.includes('could not choose the best candidate function') ||
      source.includes('is not unique')
    );
  }

  private async fetchProductsRankedWithCompatibility(
    args: ProductsRankedRpcArgs,
    errorContext: string,
  ) {
    const legacyArgs = {
      p_user_id: args.p_user_id,
      p_query: args.p_query,
      p_listing_type: args.p_listing_type,
      p_category_id: args.p_category_id,
      p_subcategory_id: args.p_subcategory_id,
      p_sub_subcategory_id: args.p_sub_subcategory_id,
      p_min_price: args.p_min_price,
      p_max_price: args.p_max_price,
      p_radius_km: args.p_radius_km,
      p_user_lat: args.p_user_lat,
      p_user_lng: args.p_user_lng,
      p_limit: args.p_limit,
      p_cursor_score: args.p_cursor_score,
      p_cursor_created_at: args.p_cursor_created_at,
      p_cursor_id: args.p_cursor_id,
    };

    const v026Args = {
      ...legacyArgs,
      p_condition: args.p_condition ?? null,
      p_brand: args.p_brand ?? null,
      p_size: args.p_size ?? null,
      p_color: args.p_color ?? null,
    };

    const v027Args = {
      ...v026Args,
      p_dynamic_filters: args.p_dynamic_filters ?? null,
    };

    let { data: ranked, error } = await this.serviceClient.rpc(
      'social_products_ranked',
      v027Args,
    );

    if (error && this.isProductsRankedSignatureMismatch(error)) {
      const fallbackV026 = await this.serviceClient.rpc(
        'social_products_ranked',
        v026Args,
      );
      ranked = fallbackV026.data;
      error = fallbackV026.error;
    }

    if (error && this.isProductsRankedSignatureMismatch(error)) {
      const fallbackLegacy = await this.serviceClient.rpc(
        'social_products_ranked',
        legacyArgs,
      );
      ranked = fallbackLegacy.data;
      error = fallbackLegacy.error;
    }

    if (error) {
      throw new BadRequestException(`${errorContext}: ${error.message}`);
    }

    return ranked ?? [];
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
    return (
      typed.code === '23505' ||
      Boolean(typed.message?.includes('duplicate key'))
    );
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

    const { data: afterInsert, error: afterInsertError } =
      await this.serviceClient
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
      payload.sku !== undefined ||
      payload.additionalDetails !== undefined ||
      payload.productDetails !== undefined
    );
  }

  private normalizeProductAttributes(
    payload: any,
  ): NormalizedProductAttributes {
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
    const sku =
      String(payload?.sku ?? '')
        .trim()
        .slice(0, 120) || null;

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
      const value = String(source.value ?? '')
        .trim()
        .slice(0, 1000);
      if (!key || !value) continue;
      deduped.set(key.toLowerCase(), { key, value });
      if (deduped.size >= 50) break;
    }

    const productDetails: Record<string, string | string[]> = {};
    const sourceProductDetails =
      payload?.productDetails &&
      typeof payload.productDetails === 'object' &&
      !Array.isArray(payload.productDetails)
        ? (payload.productDetails as Record<string, unknown>)
        : null;

    if (sourceProductDetails) {
      for (const [key, value] of Object.entries(sourceProductDetails)) {
        const normalizedKey = String(key ?? '')
          .trim()
          .slice(0, 80);
        if (!normalizedKey) continue;

        if (Array.isArray(value)) {
          const normalizedValues = Array.from(
            new Set(
              value
                .map((entry) =>
                  String(entry ?? '')
                    .trim()
                    .slice(0, 120),
                )
                .filter(Boolean),
            ),
          ).slice(0, 50);
          if (normalizedValues.length) {
            productDetails[normalizedKey] = normalizedValues;
          }
          continue;
        }

        const normalizedValue = String(value ?? '')
          .trim()
          .slice(0, 1000);
        if (normalizedValue) {
          productDetails[normalizedKey] = normalizedValue;
        }
      }
    }

    return {
      shippingInfo,
      shippingMethod,
      shippingCost: shippingCostValue ?? null,
      handlingTimeDays: handlingTimeValue ?? null,
      returnPolicy,
      sku,
      productDetails,
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
    if (normalized.sku) {
      rows.push({
        product_id: productId,
        key: 'sku',
        value: normalized.sku,
      });
    }
    if (Object.keys(normalized.productDetails).length) {
      rows.push({
        product_id: productId,
        key: 'product_details_json',
        value: JSON.stringify(normalized.productDetails),
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
      if (decoded.contentType) {
        this.normalizeContentType(decoded.contentType);
      }
      return decoded;
    } catch {
      return null;
    }
  }

  private buildFeedCursor(cursor: FeedCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  private parseCommentCursor(cursor?: string | null): CommentCursor | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as CommentCursor;
      if (!decoded || !decoded.id || !decoded.createdAt) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  private buildCommentCursor(cursor: CommentCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  private parseFollowListCursor(
    cursor?: string | null,
  ): FollowListCursor | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as FollowListCursor;
      if (!decoded || !decoded.id || !decoded.createdAt) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  private buildFollowListCursor(cursor: FollowListCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  private parseUserSearchCursor(
    cursor?: string | null,
  ): UserSearchCursor | null {
    if (!cursor) return null;
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as UserSearchCursor;
      if (!decoded || !decoded.userId || !decoded.createdAt) return null;
      if (
        decoded.score !== undefined &&
        decoded.score !== null &&
        !Number.isFinite(Number(decoded.score))
      ) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  private buildUserSearchCursor(cursor: UserSearchCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  private sanitizeSearchTerm(value: unknown): string {
    return String(value ?? '')
      .replace(/[,%]/g, ' ')
      .trim();
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  private parseTimestampMs(value?: string | null): number {
    if (!value) return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private sanitizeExploreTab(value?: string | null): ExploreFeedTab {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (
      normalized === 'all' ||
      normalized === 'posts' ||
      normalized === 'reels' ||
      normalized === 'shop'
    ) {
      return normalized;
    }
    return 'all';
  }

  private async getHiddenContentSet(
    viewerUserId: string | null | undefined,
    contentType: SocialContentType,
  ): Promise<Set<string>> {
    if (!viewerUserId) return new Set<string>();

    const { data, error } = await this.serviceClient
      .from('social_content_hides')
      .select('content_id, expires_at')
      .eq('user_id', viewerUserId)
      .eq('content_type', contentType);

    if (error) {
      throw new BadRequestException(
        `Failed to resolve hidden content: ${error.message}`,
      );
    }

    const nowMs = Date.now();
    const hidden = new Set<string>();
    for (const row of data ?? []) {
      const contentId = String(row.content_id ?? '').trim();
      if (!contentId) continue;
      const expiresAt = row.expires_at
        ? new Date(row.expires_at).getTime()
        : null;
      if (
        expiresAt !== null &&
        Number.isFinite(expiresAt) &&
        expiresAt <= nowMs
      ) {
        continue;
      }
      hidden.add(contentId);
    }
    return hidden;
  }

  private computeProfileCompletenessScore(row: RankedUserRow): number {
    const usernameScore = row.username ? 1 : 0;
    const displayNameScore = row.display_name ? 1 : 0;
    const avatarScore = row.avatar_url ? 1 : 0;
    const bioLength = String(row.bio ?? '').trim().length;
    const bioScore =
      bioLength >= 80 ? 1 : bioLength >= 20 ? 0.75 : bioLength > 0 ? 0.45 : 0;

    return this.clamp01(
      usernameScore * 0.2 +
        displayNameScore * 0.2 +
        avatarScore * 0.4 +
        bioScore * 0.2,
    );
  }

  private computeTrustScore(row: RankedUserRow): number {
    const followers = Number(row.followers_count ?? 0);
    const sellerReputation = Number(row.seller_reputation ?? 0);
    const followersScore = this.clamp01(followers / 5000);
    const reputationScore = this.clamp01(sellerReputation / 100);
    return this.clamp01(followersScore * 0.65 + reputationScore * 0.35);
  }

  private computeTextRelevanceScore(row: RankedUserRow, q: string): number {
    const query = String(q ?? '')
      .trim()
      .toLowerCase();
    if (!query) return 0;

    const username = String(row.username ?? '').toLowerCase();
    const displayName = String(row.display_name ?? '').toLowerCase();

    let score = 0;
    if (username === query) score = Math.max(score, 1);
    else if (username.startsWith(query)) score = Math.max(score, 0.9);
    else if (username.includes(query)) score = Math.max(score, 0.75);

    if (displayName === query) score = Math.max(score, 0.85);
    else if (displayName.startsWith(query)) score = Math.max(score, 0.7);
    else if (displayName.includes(query)) score = Math.max(score, 0.55);

    return this.clamp01(score);
  }

  private compareRankedUsers(a: RankedUserScored, b: RankedUserScored): number {
    if (a.score !== b.score) return b.score - a.score;

    const aCreatedAt = this.parseTimestampMs(a.row.created_at);
    const bCreatedAt = this.parseTimestampMs(b.row.created_at);
    if (aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt;

    return String(b.row.user_id).localeCompare(String(a.row.user_id));
  }

  private isRankedUserAfterCursor(
    row: RankedUserScored,
    cursor: UserSearchCursor,
  ): boolean {
    const cursorCreatedAtMs = this.parseTimestampMs(cursor.createdAt);
    const rowCreatedAtMs = this.parseTimestampMs(row.row.created_at);
    const cursorScore = cursor.score;

    if (Number.isFinite(Number(cursorScore))) {
      const normalizedCursorScore = Number(cursorScore);
      if (row.score !== normalizedCursorScore) {
        return row.score < normalizedCursorScore;
      }
      if (rowCreatedAtMs !== cursorCreatedAtMs) {
        return rowCreatedAtMs < cursorCreatedAtMs;
      }
      return String(row.row.user_id).localeCompare(String(cursor.userId)) < 0;
    }

    if (rowCreatedAtMs !== cursorCreatedAtMs) {
      return rowCreatedAtMs < cursorCreatedAtMs;
    }
    return String(row.row.user_id).localeCompare(String(cursor.userId)) < 0;
  }

  private async getRecentUserActivityScores(
    userIds: string[],
  ): Promise<Map<string, { activity: number }>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    const output = new Map<string, { activity: number }>();
    if (!uniqueUserIds.length) return output;

    const nowMs = Date.now();
    const since = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [postsResult, reelsResult, productsResult] = await Promise.all([
      this.serviceClient
        .from('social_posts')
        .select('user_id, created_at')
        .eq('status', 'published')
        .in('user_id', uniqueUserIds)
        .gte('created_at', since),
      this.serviceClient
        .from('social_reels')
        .select('user_id, created_at')
        .eq('status', 'published')
        .in('user_id', uniqueUserIds)
        .gte('created_at', since),
      this.serviceClient
        .from('social_products')
        .select('seller_id, created_at')
        .eq('status', 'active')
        .in('seller_id', uniqueUserIds)
        .gte('created_at', since),
    ]);

    if (postsResult.error) {
      throw new BadRequestException(
        `Failed to rank users (posts activity): ${postsResult.error.message}`,
      );
    }
    if (reelsResult.error) {
      throw new BadRequestException(
        `Failed to rank users (reels activity): ${reelsResult.error.message}`,
      );
    }
    if (productsResult.error) {
      throw new BadRequestException(
        `Failed to rank users (products activity): ${productsResult.error.message}`,
      );
    }

    const counts = new Map<
      string,
      { posts: number; reels: number; products: number; latestMs: number }
    >();
    for (const userId of uniqueUserIds) {
      counts.set(userId, { posts: 0, reels: 0, products: 0, latestMs: 0 });
    }

    for (const row of postsResult.data ?? []) {
      const userId = String((row as any).user_id ?? '');
      if (!userId || !counts.has(userId)) continue;
      const item = counts.get(userId)!;
      item.posts += 1;
      item.latestMs = Math.max(
        item.latestMs,
        this.parseTimestampMs((row as any).created_at),
      );
    }

    for (const row of reelsResult.data ?? []) {
      const userId = String((row as any).user_id ?? '');
      if (!userId || !counts.has(userId)) continue;
      const item = counts.get(userId)!;
      item.reels += 1;
      item.latestMs = Math.max(
        item.latestMs,
        this.parseTimestampMs((row as any).created_at),
      );
    }

    for (const row of productsResult.data ?? []) {
      const userId = String((row as any).seller_id ?? '');
      if (!userId || !counts.has(userId)) continue;
      const item = counts.get(userId)!;
      item.products += 1;
      item.latestMs = Math.max(
        item.latestMs,
        this.parseTimestampMs((row as any).created_at),
      );
    }

    for (const [userId, stats] of counts) {
      const weightedVolume = stats.posts + stats.reels + stats.products * 0.8;
      const volumeScore = this.clamp01(weightedVolume / 10);
      const recencyScore =
        stats.latestMs > 0
          ? this.clamp01(
              1 - (nowMs - stats.latestMs) / (30 * 24 * 60 * 60 * 1000),
            )
          : 0;
      output.set(userId, {
        activity: this.clamp01(volumeScore * 0.7 + recencyScore * 0.3),
      });
    }

    return output;
  }

  private rebalanceHomeFeedRows(rows: any[], limit: number) {
    const grouped: Record<SocialContentType, any[]> = {
      post: [],
      reel: [],
      product: [],
    };

    for (const row of rows ?? []) {
      const type = String(row?.content_type ?? '').trim();
      if (type === 'post' || type === 'reel' || type === 'product') {
        grouped[type].push(row);
      }
    }

    const available: Record<SocialContentType, number> = {
      post: grouped.post.length,
      reel: grouped.reel.length,
      product: grouped.product.length,
    };

    const target: Record<SocialContentType, number> = {
      post: Math.max(1, Math.round(limit * 0.4)),
      reel: Math.max(1, Math.round(limit * 0.35)),
      product: Math.max(
        1,
        limit - Math.round(limit * 0.4) - Math.round(limit * 0.35),
      ),
    };

    const quota: Record<SocialContentType, number> = {
      post: Math.min(target.post, available.post),
      reel: Math.min(target.reel, available.reel),
      product: Math.min(target.product, available.product),
    };

    let planned = quota.post + quota.reel + quota.product;
    const maxPlanned = Math.min(limit, rows.length);
    while (planned < maxPlanned) {
      const candidate = (['post', 'reel', 'product'] as SocialContentType[])
        .map((type) => ({
          type,
          remaining: available[type] - quota[type],
        }))
        .filter((entry) => entry.remaining > 0)
        .sort(
          (a, b) => b.remaining - a.remaining || a.type.localeCompare(b.type),
        )[0];

      if (!candidate) break;
      quota[candidate.type] += 1;
      planned += 1;
    }

    const order: SocialContentType[] = [];
    const used: Record<SocialContentType, number> = {
      post: 0,
      reel: 0,
      product: 0,
    };

    while (order.length < maxPlanned) {
      const candidates = (['post', 'reel', 'product'] as SocialContentType[])
        .filter((type) => used[type] < quota[type])
        .sort((a, b) => {
          const remainingA = quota[a] - used[a];
          const remainingB = quota[b] - used[b];
          return remainingB - remainingA || a.localeCompare(b);
        });

      if (!candidates.length) break;

      let picked: SocialContentType | null = null;
      for (const type of candidates) {
        const last = order[order.length - 1];
        const secondLast = order[order.length - 2];
        const createsLongStreak = last === type && secondLast === type;
        const hasAlternative = candidates.some(
          (candidate) => candidate !== type,
        );
        if (createsLongStreak && hasAlternative) continue;
        picked = type;
        break;
      }

      if (!picked) {
        picked = candidates[0];
      }

      order.push(picked);
      used[picked] += 1;
    }

    const blended: any[] = [];
    for (const type of order) {
      const row = grouped[type].shift();
      if (row) blended.push(row);
    }

    if (blended.length < maxPlanned) {
      const usedIds = new Set(
        blended.map((row) => `${row.content_type}:${row.content_id}`),
      );
      for (const row of rows) {
        const key = `${row.content_type}:${row.content_id}`;
        if (usedIds.has(key)) continue;
        blended.push(row);
        usedIds.add(key);
        if (blended.length >= maxPlanned) break;
      }
    }

    return blended;
  }

  private async getHomeFeedRowsFallback(
    limit: number,
    userId?: string | null,
    cursorCreatedAt?: string | null,
  ) {
    const postsLimit = Math.max(1, Math.round(limit * 0.4)) * 3;
    const reelsLimit = Math.max(1, Math.round(limit * 0.35)) * 3;
    const productsLimit =
      Math.max(1, limit - Math.round(limit * 0.4) - Math.round(limit * 0.35)) *
      3;

    let postsQuery = this.serviceClient
      .from('social_posts')
      .select('id, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(postsLimit);
    let reelsQuery = this.serviceClient
      .from('social_reels')
      .select('id, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(reelsLimit);
    let productsQuery = this.serviceClient
      .from('social_products')
      .select('id, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(productsLimit);

    if (cursorCreatedAt) {
      postsQuery = postsQuery.lt('created_at', cursorCreatedAt);
      reelsQuery = reelsQuery.lt('created_at', cursorCreatedAt);
      productsQuery = productsQuery.lt('created_at', cursorCreatedAt);
    }

    const [postsResult, reelsResult, productsResult] = await Promise.all([
      postsQuery,
      reelsQuery,
      productsQuery,
    ]);

    const fallbackErrors = [
      postsResult.error,
      reelsResult.error,
      productsResult.error,
    ]
      .filter(Boolean)
      .map((error) => error?.message ?? 'unknown error');
    if (fallbackErrors.length) {
      throw new BadRequestException(
        `Failed to fetch fallback home feed rows: ${fallbackErrors.join('; ')}`,
      );
    }

    const rows = [
      ...(postsResult.data ?? []).map((row: any) => ({
        content_type: 'post',
        content_id: row.id,
        score: 0,
        created_at: row.created_at,
      })),
      ...(reelsResult.data ?? []).map((row: any) => ({
        content_type: 'reel',
        content_id: row.id,
        score: 0,
        created_at: row.created_at,
      })),
      ...(productsResult.data ?? []).map((row: any) => ({
        content_type: 'product',
        content_id: row.id,
        score: 0,
        created_at: row.created_at,
      })),
    ].sort((a, b) => {
      const aTs = new Date(a.created_at).getTime();
      const bTs = new Date(b.created_at).getTime();
      if (aTs !== bTs) return bTs - aTs;
      if (a.content_type !== b.content_type) {
        return a.content_type.localeCompare(b.content_type);
      }
      return String(b.content_id).localeCompare(String(a.content_id));
    });

    if (!userId) return rows;

    try {
      const now = Date.now();
      const { data: hides } = await this.serviceClient
        .from('social_content_hides')
        .select('content_type, content_id, expires_at')
        .eq('user_id', userId);

      if (!(hides ?? []).length) return rows;

      const hiddenSet = new Set(
        (hides ?? [])
          .filter((hide: any) => {
            if (!hide.expires_at) return true;
            const expiresTs = new Date(hide.expires_at).getTime();
            return Number.isFinite(expiresTs) && expiresTs > now;
          })
          .map((hide: any) => `${hide.content_type}:${hide.content_id}`),
      );

      return rows.filter(
        (row) => !hiddenSet.has(`${row.content_type}:${row.content_id}`),
      );
    } catch {
      return rows;
    }
  }

  private normalizeContentType(value: unknown): SocialContentType {
    const normalized = String(value ?? '')
      .toLowerCase()
      .trim();
    if (
      normalized === 'post' ||
      normalized === 'reel' ||
      normalized === 'product'
    ) {
      return normalized;
    }
    throw new BadRequestException('Invalid content type');
  }

  private buildContentLinkPath(
    contentType: SocialContentType,
    contentId: string,
  ): string {
    if (contentType === 'product') return `/social/product/${contentId}`;
    if (contentType === 'reel') return `/social/reels?reel=${contentId}`;
    return `/social?post=${contentId}`;
  }

  private isLegacyListingConstraintError(
    error: { message?: string } | null | undefined,
    table: string,
  ): boolean {
    if (!error?.message) return false;
    const message = String(error.message).toLowerCase();
    return (
      message.includes(`${table}_content_type_check`) ||
      (message.includes('content_type') && message.includes('check constraint'))
    );
  }

  private getContentSource(contentType: SocialContentType): {
    table: 'social_posts' | 'social_reels' | 'social_products';
    ownerColumn: 'user_id' | 'seller_id';
    activeStatus: string;
    supportsCommentsToggle: boolean;
  } {
    if (contentType === 'post') {
      return {
        table: 'social_posts',
        ownerColumn: 'user_id',
        activeStatus: 'published',
        supportsCommentsToggle: true,
      };
    }
    if (contentType === 'reel') {
      return {
        table: 'social_reels',
        ownerColumn: 'user_id',
        activeStatus: 'published',
        supportsCommentsToggle: false,
      };
    }
    return {
      table: 'social_products',
      ownerColumn: 'seller_id',
      activeStatus: 'active',
      supportsCommentsToggle: false,
    };
  }

  private normalizeShareChannel(
    value: unknown,
  ): 'copy_link' | 'direct_message' | 'native' {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'direct_message') return 'direct_message';
    if (normalized === 'native') return 'native';
    return 'copy_link';
  }

  private async getContentRecord(
    contentType: SocialContentType,
    contentId: string,
  ): Promise<{
    id: string;
    ownerId: string;
    status: string | null;
    isCommentsEnabled: boolean | null;
  }> {
    const source = this.getContentSource(contentType);
    let selectFields = `id, ${source.ownerColumn}, status`;
    if (source.supportsCommentsToggle) {
      selectFields += ', is_comments_enabled';
    }

    const { data, error } = await this.serviceClient
      .from(source.table)
      .select(selectFields)
      .eq('id', contentId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(
        `Failed to fetch ${contentType}: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException(`${contentType} not found`);
    }

    const row = data as unknown as Record<string, unknown>;

    return {
      id: row.id as string,
      ownerId: row[source.ownerColumn] as string,
      status: (row.status as string | null) ?? null,
      isCommentsEnabled: source.supportsCommentsToggle
        ? Boolean(row.is_comments_enabled)
        : null,
    };
  }

  private assertContentVisible(
    contentType: SocialContentType,
    content: { ownerId: string; status: string | null },
    viewerUserId?: string | null,
  ) {
    const source = this.getContentSource(contentType);
    const isOwner = Boolean(viewerUserId) && viewerUserId === content.ownerId;
    if (!isOwner && content.status !== source.activeStatus) {
      throw new NotFoundException(`${contentType} not found`);
    }
  }

  private async getContentCounters(
    contentType: SocialContentType,
    contentId: string,
  ): Promise<{
    likesCount: number;
    savesCount: number;
    sharesCount: number;
    commentsCount: number;
  }> {
    const source = this.getContentSource(contentType);

    const baseSelect =
      contentType === 'post'
        ? 'likes_count:reactions_count, saves_count, shares_count, comments_count'
        : contentType === 'reel'
          ? 'likes_count, saves_count, shares_count, comments_count'
          : 'likes_count, saves_count, shares_count';
    const { data: countersRow, error: countersError } = await this.serviceClient
      .from(source.table)
      .select(baseSelect)
      .eq('id', contentId)
      .maybeSingle();

    if (countersError) {
      throw new BadRequestException(
        `Failed to fetch ${contentType} counters: ${countersError.message}`,
      );
    }

    let commentsCount = 0;
    if (contentType === 'post' || contentType === 'reel') {
      commentsCount = Number((countersRow as any)?.comments_count ?? 0);
    } else {
      const { count, error: commentsError } = await this.serviceClient
        .from('social_comments')
        .select('id', { head: true, count: 'exact' })
        .eq('content_type', 'product')
        .eq('content_id', contentId);
      if (commentsError) {
        throw new BadRequestException(
          `Failed to fetch product comments count: ${commentsError.message}`,
        );
      }
      commentsCount = Number(count ?? 0);
    }

    return {
      likesCount: Number((countersRow as any)?.likes_count ?? 0),
      savesCount: Number((countersRow as any)?.saves_count ?? 0),
      sharesCount: Number((countersRow as any)?.shares_count ?? 0),
      commentsCount,
    };
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
        'id, product_id, media_url, media_type, display_order, is_primary, created_at',
      )
      .in('product_id', uniqueIds)
      .order('is_primary', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

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
        sort_order: row.display_order,
        display_order: row.display_order,
        is_primary: row.is_primary,
        created_at: row.created_at,
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

  private async getFollowingSetForViewer(
    viewerUserId?: string | null,
    candidateUserIds: string[] = [],
  ): Promise<Set<string>> {
    if (!viewerUserId || !candidateUserIds.length) {
      return new Set<string>();
    }

    const uniqueIds = Array.from(
      new Set(
        candidateUserIds.filter((value): value is string => Boolean(value)),
      ),
    ).filter((id) => id !== viewerUserId);

    if (!uniqueIds.length) {
      return new Set<string>();
    }

    const { data, error } = await this.serviceClient
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', viewerUserId)
      .in('following_id', uniqueIds);

    if (error) {
      throw new BadRequestException(
        `Failed to resolve following state: ${error.message}`,
      );
    }

    return new Set(
      (data ?? [])
        .map((row) => row.following_id)
        .filter((value): value is string => Boolean(value)),
    );
  }

  private mapPosts(
    postRows: any[],
    profiles: Map<string, UserProfileRow>,
    mediaMap: Map<string, any[]>,
    likedSet: Set<string> = new Set(),
    savedSet: Set<string> = new Set(),
    commentsPreviewMap: Map<string, any[]> = new Map(),
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
        comment_count: post.comments_count,
        saves_count: post.saves_count,
        views_count: post.views_count,
        shares_count: post.shares_count,
        share_count: post.shares_count,
        viewer_has_liked: likedSet.has(post.id),
        viewer_has_saved: savedSet.has(post.id),
        status: post.status,
        is_comments_enabled: post.is_comments_enabled,
        location_text: post.location_text,
        hashtags: post.hashtags ?? [],
        comments_preview: commentsPreviewMap.get(post.id) ?? [],
        social_post_media: media,
      };
    });
  }

  private mapReels(
    reelRows: any[],
    profiles: Map<string, UserProfileRow>,
    mediaMap: Map<string, any[]>,
    likedSet: Set<string> = new Set(),
    savedSet: Set<string> = new Set(),
    commentsPreviewMap: Map<string, any[]> = new Map(),
    followingSet: Set<string> = new Set(),
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
        comment_count: reel.comments_count,
        saves_count: reel.saves_count,
        shares_count: reel.shares_count,
        share_count: reel.shares_count,
        is_following: followingSet.has(reel.user_id),
        viewer_has_liked: likedSet.has(reel.id),
        viewer_has_saved: savedSet.has(reel.id),
        engagement_rate: reel.engagement_rate,
        watch_completion_avg: reel.watch_completion_avg,
        product_click_through: reel.product_click_through,
        quality_score: reel.quality_score,
        reel_url: primary?.reel_url ?? null,
        thumbnail_url: reel.thumbnail_url ?? primary?.thumbnail_url ?? null,
        comments_preview: commentsPreviewMap.get(reel.id) ?? [],
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
    likedSet: Set<string> = new Set(),
    savedSet: Set<string> = new Set(),
    productCommentCountMap: Map<string, number> = new Map(),
  ) {
    return productRows.map((product) => {
      const sellerProfile = profiles.get(product.seller_id);
      const attributes = attributeMap.get(product.id) ?? {};
      let additionalDetails: ProductDetailItem[] = [];
      let productDetails: Record<string, string | string[]> = {};
      try {
        const parsed = JSON.parse(attributes.product_details_json ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(
            parsed as Record<string, unknown>,
          )) {
            const normalizedKey = String(key ?? '').trim();
            if (!normalizedKey) continue;

            if (Array.isArray(value)) {
              const values = Array.from(
                new Set(
                  value
                    .map((entry) => String(entry ?? '').trim())
                    .filter(Boolean),
                ),
              );
              if (values.length) {
                productDetails[normalizedKey] = values;
              }
              continue;
            }

            const normalizedValue = String(value ?? '').trim();
            if (normalizedValue) {
              productDetails[normalizedKey] = normalizedValue;
            }
          }
        }
      } catch {
        productDetails = {};
      }
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
        followers_count: sellerProfile?.followers_count ?? 0,
        following_count: sellerProfile?.following_count ?? 0,
        title: product.title,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        sku: attributes.sku ?? null,
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
        product_details: productDetails,
        additional_details: additionalDetails,
        views_count: product.views_count,
        likes_count: product.likes_count,
        saves_count: product.saves_count,
        shares_count: product.shares_count,
        comment_count: productCommentCountMap.get(product.id) ?? 0,
        share_count: product.shares_count,
        viewer_has_liked: likedSet.has(product.id),
        viewer_has_saved: savedSet.has(product.id),
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

  private async getViewerEngagementSets(
    viewerUserId: string | null | undefined,
    contentType: SocialContentType,
    contentIds: string[],
  ): Promise<{ liked: Set<string>; saved: Set<string> }> {
    const ids = Array.from(new Set(contentIds.filter(Boolean)));
    if (!viewerUserId || !ids.length) {
      return { liked: new Set(), saved: new Set() };
    }

    let likesQuery = this.serviceClient
      .from('social_likes')
      .select('content_id')
      .eq('user_id', viewerUserId)
      .in('content_id', ids);

    let savesQuery = this.serviceClient
      .from('social_saves')
      .select('content_id')
      .eq('user_id', viewerUserId)
      .in('content_id', ids);

    if (contentType === 'product') {
      likesQuery = likesQuery.in('content_type', ['product', 'listing']);
      savesQuery = savesQuery.in('content_type', ['product', 'listing']);
    } else {
      likesQuery = likesQuery.eq('content_type', contentType);
      savesQuery = savesQuery.eq('content_type', contentType);
    }

    const [likesResult, savesResult] = await Promise.all([
      likesQuery,
      savesQuery,
    ]);

    if (likesResult.error) {
      throw new BadRequestException(
        `Failed to load like state: ${likesResult.error.message}`,
      );
    }
    if (savesResult.error) {
      throw new BadRequestException(
        `Failed to load save state: ${savesResult.error.message}`,
      );
    }

    return {
      liked: new Set((likesResult.data ?? []).map((row) => row.content_id)),
      saved: new Set((savesResult.data ?? []).map((row) => row.content_id)),
    };
  }

  private async getCommentsPreviewMap(
    contentType: SocialContentType,
    contentIds: string[],
    viewerUserId?: string | null,
    previewLimit = 2,
  ): Promise<Map<string, any[]>> {
    const ids = Array.from(new Set(contentIds.filter(Boolean)));
    const previewMap = new Map<string, any[]>();
    if (!ids.length || previewLimit <= 0) return previewMap;

    const fetchLimit = Math.max(previewLimit * ids.length, 20);
    const { data: rows, error } = await this.serviceClient
      .from('social_comments')
      .select(
        'id, parent_comment_id, user_id, content_id, body, likes_count, created_at, updated_at',
      )
      .eq('content_type', contentType)
      .is('parent_comment_id', null)
      .in('content_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(fetchLimit);

    if (error) {
      throw new BadRequestException(
        `Failed to load comments preview: ${error.message}`,
      );
    }

    const userIds = Array.from(
      new Set((rows ?? []).map((row) => row.user_id).filter(Boolean)),
    );
    const profiles = await this.getProfilesMap(userIds);

    for (const row of rows ?? []) {
      const list = previewMap.get(row.content_id) ?? [];
      if (list.length >= previewLimit) continue;
      const profile = profiles.get(row.user_id);
      list.push({
        id: row.id,
        parent_comment_id: row.parent_comment_id,
        content_type: contentType,
        content_id: row.content_id,
        user_id: row.user_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        body: row.body,
        likes_count: row.likes_count ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
        reply_count: 0,
        replies: [],
        can_edit: Boolean(viewerUserId) && viewerUserId === row.user_id,
        can_delete: Boolean(viewerUserId) && viewerUserId === row.user_id,
      });
      previewMap.set(row.content_id, list);
    }

    return previewMap;
  }

  private async getProductCommentCountMap(
    productIds: string[],
  ): Promise<Map<string, number>> {
    const ids = Array.from(new Set(productIds.filter(Boolean)));
    const map = new Map<string, number>();
    if (!ids.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_comments')
      .select('content_id')
      .eq('content_type', 'product')
      .in('content_id', ids);

    if (error) {
      throw new BadRequestException(
        `Failed to load product comment counts: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      const key = row.content_id as string;
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return map;
  }

  private async enrichProducts(
    productRows: any[],
    viewerUserId?: string | null,
  ) {
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
      engagement,
      productCommentCountMap,
    ] = await Promise.all([
      this.getProfilesMap(sellerIds),
      this.getProductMediaMap(productIds),
      this.getProductVariationsMap(productIds),
      this.getProductAttributesMap(productIds),
      this.getCategoryMap('categories', categoryIds),
      this.getCategoryMap('subcategories', subcategoryIds),
      this.getCategoryMap('sub_subcategories', subSubcategoryIds),
      this.getViewerEngagementSets(viewerUserId ?? null, 'product', productIds),
      this.getProductCommentCountMap(productIds),
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
      engagement.liked,
      engagement.saved,
      productCommentCountMap,
    );
  }

  private async enrichPosts(postRows: any[], viewerUserId?: string | null) {
    const userIds = postRows.map((row) => row.user_id);
    const postIds = postRows.map((row) => row.id);
    const [profiles, mediaMap, engagement, commentsPreviewMap] =
      await Promise.all([
        this.getProfilesMap(userIds),
        this.getPostMediaMap(postIds),
        this.getViewerEngagementSets(viewerUserId ?? null, 'post', postIds),
        this.getCommentsPreviewMap('post', postIds, viewerUserId ?? null, 2),
      ]);
    return this.mapPosts(
      postRows,
      profiles,
      mediaMap,
      engagement.liked,
      engagement.saved,
      commentsPreviewMap,
    );
  }

  private async enrichReels(reelRows: any[], viewerUserId?: string | null) {
    const userIds = reelRows.map((row) => row.user_id);
    const reelIds = reelRows.map((row) => row.id);
    const [profiles, mediaMap, engagement, commentsPreviewMap, followingSet] =
      await Promise.all([
        this.getProfilesMap(userIds),
        this.getReelMediaMap(reelIds),
        this.getViewerEngagementSets(viewerUserId ?? null, 'reel', reelIds),
        this.getCommentsPreviewMap('reel', reelIds, viewerUserId ?? null, 2),
        this.getFollowingSetForViewer(viewerUserId ?? null, userIds),
      ]);
    return this.mapReels(
      reelRows,
      profiles,
      mediaMap,
      engagement.liked,
      engagement.saved,
      commentsPreviewMap,
      followingSet,
    );
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
      const posts = await this.enrichPosts(data ?? [], userId ?? null);
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
      const reels = await this.enrichReels(reelsRaw, userId ?? null);
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
      const ranked = await this.fetchProductsRankedWithCompatibility(
        {
          p_user_id: userId ?? null,
          p_query: null,
          p_listing_type: 'closet',
          p_category_id: null,
          p_subcategory_id: null,
          p_sub_subcategory_id: null,
          p_condition: null,
          p_brand: null,
          p_size: null,
          p_color: null,
          p_dynamic_filters: null,
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
        'Failed to fetch closet feed ranking',
      );
      const productIds = (ranked ?? []).map((row: any) => row.product_id);
      const productsRaw = await this.fetchProductsByIds(productIds);
      const products = await this.enrichProducts(productsRaw, userId ?? null);
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

    let rawRankedFeed: any[] = [];
    const rankingErrors: string[] = [];
    const v2Ranking = await this.serviceClient.rpc('social_home_feed_ranked', {
      p_user_id: userId ?? null,
      p_limit: limit,
      p_cursor_score: allCursor?.score ?? null,
      p_cursor_created_at: allCursor?.createdAt ?? null,
      p_cursor_content_type: allCursor?.contentType ?? null,
      p_cursor_content_id: allCursor?.id ?? null,
    });

    if (!v2Ranking.error) {
      rawRankedFeed = v2Ranking.data ?? [];
    } else {
      const v2ErrorMessage = String(v2Ranking.error.message ?? 'unknown error');
      rankingErrors.push(`v2: ${v2ErrorMessage}`);

      const legacyRanking = await this.serviceClient.rpc(
        'social_home_feed_ranked',
        {
          p_user_id: userId ?? null,
          p_limit: limit,
          p_cursor_created_at: allCursor?.createdAt ?? null,
        },
      );

      if (legacyRanking.error) {
        rankingErrors.push(
          `legacy: ${String(legacyRanking.error.message ?? 'unknown error')}`,
        );
      } else {
        rawRankedFeed = legacyRanking.data ?? [];
      }
    }

    if (!rawRankedFeed.length) {
      try {
        rawRankedFeed = await this.getHomeFeedRowsFallback(
          limit,
          userId ?? null,
          allCursor?.createdAt ?? null,
        );
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : 'unknown fallback error';
        rankingErrors.push(`fallback: ${fallbackMessage}`);
        throw new BadRequestException(
          `Failed to fetch home feed ranking: ${rankingErrors.join(' | ')}`,
        );
      }
    }

    const rankedFeed = this.rebalanceHomeFeedRows(rawRankedFeed ?? [], limit);

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
      this.enrichPosts(postsRaw, userId ?? null),
      this.enrichReels(reelsRaw, userId ?? null),
      this.enrichProducts(productsRaw, userId ?? null),
    ]);
    const lastRow = (rawRankedFeed ?? [])[
      Math.max(0, (rawRankedFeed ?? []).length - 1)
    ];
    return {
      mode: safeMode,
      userId: userId ?? null,
      posts,
      reels,
      closet: products,
      ranked: rankedFeed ?? [],
      nextCursor: lastRow
        ? this.buildFeedCursor({
            createdAt: lastRow.created_at,
            score: Number(lastRow.score),
            contentType: lastRow.content_type,
            id: lastRow.content_id,
          })
        : null,
    };
  }

  async getExploreFeed(
    tabValue?: string,
    userId?: string | null,
    limitValue?: string | number,
    cursor?: string,
    q?: string,
  ) {
    const tab = this.sanitizeExploreTab(tabValue);
    const limit = this.sanitizeLimit(limitValue, 20, 40);
    const searchTerm = this.sanitizeSearchTerm(q);
    const searchQuery = searchTerm || null;

    const toItems = (
      rows: any[],
      posts: any[],
      reels: any[],
      products: any[],
    ) => {
      const postMap = new Map(posts.map((item) => [item.id, item]));
      const reelMap = new Map(reels.map((item) => [item.id, item]));
      const productMap = new Map(products.map((item) => [item.id, item]));

      return (rows ?? [])
        .map((row) => {
          const contentType = this.normalizeContentType(row.content_type);
          const contentId = String(row.content_id ?? '').trim();
          if (!contentId) return null;

          if (contentType === 'post') {
            const post = postMap.get(contentId);
            if (!post) return null;
            return {
              content_type: 'post' as const,
              content_id: contentId,
              score: row.score !== undefined ? Number(row.score) : null,
              created_at: row.created_at ?? null,
              post,
              reel: null,
              product: null,
            };
          }

          if (contentType === 'reel') {
            const reel = reelMap.get(contentId);
            if (!reel) return null;
            return {
              content_type: 'reel' as const,
              content_id: contentId,
              score: row.score !== undefined ? Number(row.score) : null,
              created_at: row.created_at ?? null,
              post: null,
              reel,
              product: null,
            };
          }

          const product = productMap.get(contentId);
          if (!product) return null;
          return {
            content_type: 'product' as const,
            content_id: contentId,
            score: row.score !== undefined ? Number(row.score) : null,
            created_at: row.created_at ?? null,
            post: null,
            reel: null,
            product,
          };
        })
        .filter(Boolean);
    };

    if (tab === 'posts') {
      const rankedCursor = this.parseRankedCursor(cursor);
      const { data: ranked, error } = await this.serviceClient.rpc(
        'social_posts_ranked',
        {
          p_user_id: userId ?? null,
          p_query: searchQuery,
          p_limit: limit,
          p_cursor_score: rankedCursor?.score ?? null,
          p_cursor_created_at: rankedCursor?.createdAt ?? null,
          p_cursor_id: rankedCursor?.id ?? null,
        },
      );
      if (error) {
        throw new BadRequestException(
          `Failed to fetch explore posts: ${error.message}`,
        );
      }

      const hiddenPostIds = await this.getHiddenContentSet(
        userId ?? null,
        'post',
      );
      const rows = (ranked ?? [])
        .map((row: any) => ({
          ...row,
          content_type: 'post',
          content_id: row.post_id,
        }))
        .filter((row: any) => !hiddenPostIds.has(String(row.content_id ?? '')));
      const postIds = rows.map((row: any) => row.content_id);
      const postsRaw = await this.fetchPostsByIds(postIds);
      const posts = await this.enrichPosts(postsRaw, userId ?? null);
      const items = toItems(rows, posts, [], []);
      const last = rows[Math.max(0, rows.length - 1)];

      return {
        tab,
        userId: userId ?? null,
        items,
        nextCursor: last
          ? this.buildRankedCursor({
              score: Number(last.score),
              createdAt: last.created_at,
              id: String(last.post_id ?? last.content_id),
            })
          : null,
      };
    }

    if (tab === 'reels') {
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
          `Failed to fetch explore reels: ${error.message}`,
        );
      }

      const hiddenReelIds = await this.getHiddenContentSet(
        userId ?? null,
        'reel',
      );
      const rows = (ranked ?? [])
        .map((row: any) => ({
          ...row,
          content_type: 'reel',
          content_id: row.reel_id,
        }))
        .filter((row: any) => !hiddenReelIds.has(String(row.content_id ?? '')));
      const reelIds = rows.map((row: any) => row.content_id);
      const reelsRaw = await this.fetchReelsByIds(reelIds);
      const reels = await this.enrichReels(reelsRaw, userId ?? null);
      const items = toItems(rows, [], reels, []);
      const last = rows[Math.max(0, rows.length - 1)];

      return {
        tab,
        userId: userId ?? null,
        items,
        nextCursor: last
          ? this.buildRankedCursor({
              score: Number(last.score),
              createdAt: last.created_at,
              id: String(last.reel_id ?? last.content_id),
            })
          : null,
      };
    }

    if (tab === 'shop') {
      const rankedCursor = this.parseRankedCursor(cursor);
      const ranked = await this.fetchProductsRankedWithCompatibility(
        {
          p_user_id: userId ?? null,
          p_query: searchQuery,
          p_listing_type: 'shop',
          p_category_id: null,
          p_subcategory_id: null,
          p_sub_subcategory_id: null,
          p_condition: null,
          p_brand: null,
          p_size: null,
          p_color: null,
          p_dynamic_filters: null,
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
        'Failed to fetch explore shop',
      );

      const hiddenProductIds = await this.getHiddenContentSet(
        userId ?? null,
        'product',
      );
      const rows = (ranked ?? [])
        .map((row: any) => ({
          ...row,
          content_type: 'product',
          content_id: row.product_id,
        }))
        .filter(
          (row: any) => !hiddenProductIds.has(String(row.content_id ?? '')),
        );
      const productIds = rows.map((row: any) => row.content_id);
      const productsRaw = await this.fetchProductsByIds(productIds);
      const products = await this.enrichProducts(productsRaw, userId ?? null);
      const items = toItems(rows, [], [], products);
      const last = rows[Math.max(0, rows.length - 1)];

      return {
        tab,
        userId: userId ?? null,
        items,
        nextCursor: last
          ? this.buildRankedCursor({
              score: Number(last.score),
              createdAt: last.created_at,
              id: String(last.product_id ?? last.content_id),
            })
          : null,
      };
    }

    const allCursor = this.parseFeedCursor(cursor);
    const { data: ranked, error } = await this.serviceClient.rpc(
      'social_explore_feed_ranked',
      {
        p_user_id: userId ?? null,
        p_query: searchQuery,
        p_limit: limit,
        p_cursor_score: allCursor?.score ?? null,
        p_cursor_created_at: allCursor?.createdAt ?? null,
        p_cursor_content_type: allCursor?.contentType ?? null,
        p_cursor_content_id: allCursor?.id ?? null,
      },
    );
    if (error) {
      throw new BadRequestException(
        `Failed to fetch explore feed: ${error.message}`,
      );
    }

    const rows = ranked ?? [];
    const postIds = rows
      .filter((row: any) => row.content_type === 'post')
      .map((row: any) => row.content_id);
    const reelIds = rows
      .filter((row: any) => row.content_type === 'reel')
      .map((row: any) => row.content_id);
    const productIds = rows
      .filter((row: any) => row.content_type === 'product')
      .map((row: any) => row.content_id);

    const [postsRaw, reelsRaw, productsRaw] = await Promise.all([
      this.fetchPostsByIds(postIds),
      this.fetchReelsByIds(reelIds),
      this.fetchProductsByIds(productIds),
    ]);
    const [posts, reels, products] = await Promise.all([
      this.enrichPosts(postsRaw, userId ?? null),
      this.enrichReels(reelsRaw, userId ?? null),
      this.enrichProducts(productsRaw, userId ?? null),
    ]);

    const items = toItems(rows, posts, reels, products);
    const lastRow = rows[Math.max(0, rows.length - 1)];
    return {
      tab,
      userId: userId ?? null,
      items,
      nextCursor: lastRow
        ? this.buildFeedCursor({
            createdAt: lastRow.created_at,
            score: Number(lastRow.score),
            contentType: this.normalizeContentType(lastRow.content_type),
            id: String(lastRow.content_id),
          })
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
      this.fetchProductsRankedWithCompatibility(
        {
        p_user_id: userId ?? null,
        p_query: null,
        p_listing_type: null,
        p_category_id: null,
        p_subcategory_id: null,
        p_sub_subcategory_id: null,
        p_condition: null,
        p_brand: null,
        p_size: null,
        p_color: null,
        p_dynamic_filters: null,
        p_min_price: null,
        p_max_price: null,
        p_radius_km: null,
        p_user_lat: null,
        p_user_lng: null,
        p_limit: 12,
        p_cursor_score: null,
        p_cursor_created_at: null,
        p_cursor_id: null,
        },
        'Failed to fetch explore products',
      ),
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
    if (sellers.error) {
      throw new BadRequestException(
        `Failed to fetch top sellers: ${sellers.error.message}`,
      );
    }

    const reelIds = (reelsRanked.data ?? []).map((row: any) => row.reel_id);
    const productIds = (productsRanked ?? []).map((row: any) => row.product_id);
    const [reelsRaw, productsRaw] = await Promise.all([
      this.fetchReelsByIds(reelIds),
      this.fetchProductsByIds(productIds),
    ]);
    const [topReels, trendingProducts] = await Promise.all([
      this.enrichReels(reelsRaw, userId ?? null),
      this.enrichProducts(productsRaw, userId ?? null),
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
    const reels = await this.enrichReels(reelRows, userId ?? null);
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
      throw new BadRequestException(
        'You can publish up to 20 statuses at once',
      );
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
        incomingIds.map((value) => String(value ?? '').trim()).filter(Boolean),
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

    const { error } = await this.serviceClient
      .from('social_status_views')
      .upsert(
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
      throw new ForbiddenException(
        'You can only view viewers of your own status',
      );
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
    const ranked = await this.fetchProductsRankedWithCompatibility(
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
        p_condition: options?.condition ?? null,
        p_brand: options?.brand ?? null,
        p_size: options?.size ?? null,
        p_color: options?.color ?? null,
        p_dynamic_filters:
          options?.dynamicFilters &&
          Object.keys(options.dynamicFilters).length > 0
            ? options.dynamicFilters
            : null,
      },
      'Failed to search social products',
    );

    const ids = (ranked ?? []).map((row: any) => row.product_id);
    const productsRaw = await this.fetchProductsByIds(ids);
    const products = await this.enrichProducts(productsRaw, userId ?? null);
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

  private async resolveProfileByUsername(username: string) {
    const normalized = String(username ?? '')
      .trim()
      .toLowerCase();
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
    return profile ?? null;
  }

  private async getViewerRelationship(
    viewerUserId: string | null | undefined,
    profileUserId: string,
  ) {
    const isSelf = Boolean(viewerUserId) && viewerUserId === profileUserId;
    if (!viewerUserId || isSelf) {
      return {
        isSelf,
        isFollowing: false,
        isFollowedBy: false,
      };
    }

    const [followingRow, followedByRow] = await Promise.all([
      this.serviceClient
        .from('social_follows')
        .select('id')
        .eq('follower_id', viewerUserId)
        .eq('following_id', profileUserId)
        .maybeSingle(),
      this.serviceClient
        .from('social_follows')
        .select('id')
        .eq('follower_id', profileUserId)
        .eq('following_id', viewerUserId)
        .maybeSingle(),
    ]);

    if (followingRow.error) {
      throw new BadRequestException(
        `Failed to resolve follow relationship: ${followingRow.error.message}`,
      );
    }
    if (followedByRow.error) {
      throw new BadRequestException(
        `Failed to resolve reverse follow relationship: ${followedByRow.error.message}`,
      );
    }

    return {
      isSelf: false,
      isFollowing: Boolean(followingRow.data),
      isFollowedBy: Boolean(followedByRow.data),
    };
  }

  private async getProfileContentCounts(
    profileUserId: string,
    isOwnerView: boolean,
  ) {
    const postsQuery = this.serviceClient
      .from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileUserId)
      .eq('status', 'published');

    const reelsQuery = this.serviceClient
      .from('social_reels')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileUserId)
      .eq('status', 'published');

    let productsQuery = this.serviceClient
      .from('social_products')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', profileUserId);
    if (!isOwnerView) {
      productsQuery = productsQuery.eq('status', 'active');
    }

    const [postsResult, reelsResult, productsResult] = await Promise.all([
      postsQuery,
      reelsQuery,
      productsQuery,
    ]);

    if (postsResult.error) {
      throw new BadRequestException(
        `Failed to count posts: ${postsResult.error.message}`,
      );
    }
    if (reelsResult.error) {
      throw new BadRequestException(
        `Failed to count reels: ${reelsResult.error.message}`,
      );
    }
    if (productsResult.error) {
      throw new BadRequestException(
        `Failed to count products: ${productsResult.error.message}`,
      );
    }

    return {
      posts: Number(postsResult.count ?? 0),
      reels: Number(reelsResult.count ?? 0),
      products: Number(productsResult.count ?? 0),
    };
  }

  async getProfileByUsername(username: string, viewerUserId?: string | null) {
    const profile = await this.resolveProfileByUsername(username);
    if (!profile) {
      return { profile: null, products: [], reels: [], posts: [] };
    }
    return this.getProfileByUserId(profile.user_id, viewerUserId ?? null);
  }

  async getProfileByUserId(userId: string, viewerUserId?: string | null) {
    const profile = await this.ensureSocialProfile(userId);
    if (!profile) {
      return { profile: null, products: [], reels: [], posts: [] };
    }

    const isOwnerView = Boolean(viewerUserId) && viewerUserId === userId;
    let productsQuery = this.serviceClient
      .from('social_products')
      .select('*')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
      .limit(24);
    if (!isOwnerView) {
      productsQuery = productsQuery.eq('status', 'active');
    }

    const [productsRaw, reelsRaw, postsRaw, counts, viewerRelationship] =
      await Promise.all([
        productsQuery,
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
        this.getProfileContentCounts(userId, isOwnerView),
        this.getViewerRelationship(viewerUserId ?? null, userId),
      ]);

    if (productsRaw.error)
      throw new BadRequestException(productsRaw.error.message);
    if (reelsRaw.error) throw new BadRequestException(reelsRaw.error.message);
    if (postsRaw.error) throw new BadRequestException(postsRaw.error.message);

    const [products, reels, posts] = await Promise.all([
      this.enrichProducts(productsRaw.data ?? [], viewerUserId ?? null),
      this.enrichReels(reelsRaw.data ?? [], viewerUserId ?? null),
      this.enrichPosts(postsRaw.data ?? [], viewerUserId ?? null),
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
        counts: {
          posts: counts.posts,
          reels: counts.reels,
          products: counts.products,
          followers: Number(profile.followers_count ?? 0),
          following: Number(profile.following_count ?? 0),
        },
        viewerRelationship: viewerRelationship,
      },
      products,
      reels,
      posts,
    };
  }

  private async listProfileFollowUsers(
    targetUserId: string,
    viewerUserId: string | null | undefined,
    mode: 'followers' | 'following',
    options?: ProfileFollowListOptions,
  ) {
    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const cursor = this.parseFollowListCursor(options?.cursor ?? null);
    const searchTerm = this.sanitizeSearchTerm(options?.q);

    const actorColumn = mode === 'followers' ? 'follower_id' : 'following_id';
    const fixedColumn = mode === 'followers' ? 'following_id' : 'follower_id';

    let matchingUserIds: string[] | null = null;
    if (searchTerm) {
      const { data: matchedProfiles, error: matchError } =
        await this.serviceClient
          .from('social_profiles')
          .select('user_id')
          .or(
            `username.ilike.*${searchTerm}*,display_name.ilike.*${searchTerm}*`,
          )
          .limit(1000);
      if (matchError) {
        throw new BadRequestException(
          `Failed to search profiles: ${matchError.message}`,
        );
      }
      matchingUserIds = (matchedProfiles ?? [])
        .map((row) => row.user_id)
        .filter(Boolean);
      if (!matchingUserIds.length) {
        return { items: [], nextCursor: null };
      }
    }

    let query = this.serviceClient
      .from('social_follows')
      .select('id, follower_id, following_id, created_at')
      .eq(fixedColumn, targetUserId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (matchingUserIds) {
      query = query.in(actorColumn, matchingUserIds);
    }
    if (cursor) {
      query = query.lt('created_at', cursor.createdAt);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new BadRequestException(
        `Failed to fetch ${mode}: ${error.message}`,
      );
    }

    const hasMore = (rows ?? []).length > limit;
    const pageRows = hasMore ? (rows ?? []).slice(0, limit) : (rows ?? []);
    const actorIds = pageRows
      .map((row: any) =>
        mode === 'followers' ? row.follower_id : row.following_id,
      )
      .filter(Boolean);
    const profiles = await this.getProfilesMap(actorIds);

    let followingSet = new Set<string>();
    if (viewerUserId && actorIds.length) {
      const { data: followingRows, error: followingError } =
        await this.serviceClient
          .from('social_follows')
          .select('following_id')
          .eq('follower_id', viewerUserId)
          .in('following_id', actorIds);
      if (followingError) {
        throw new BadRequestException(
          `Failed to resolve viewer follows: ${followingError.message}`,
        );
      }
      followingSet = new Set(
        (followingRows ?? [])
          .map((row) => row.following_id)
          .filter((value): value is string => Boolean(value)),
      );
    }

    const items = pageRows
      .map((row: any) => {
        const actorId =
          mode === 'followers' ? row.follower_id : row.following_id;
        const profile = profiles.get(actorId);
        if (!profile) return null;
        return {
          user_id: actorId,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          followers_count: profile.followers_count,
          following_count: profile.following_count,
          followed_at: row.created_at,
          is_self: Boolean(viewerUserId) && viewerUserId === actorId,
          is_following: followingSet.has(actorId),
        };
      })
      .filter(Boolean);

    const last = pageRows[pageRows.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last
          ? this.buildFollowListCursor({
              createdAt: last.created_at,
              id: last.id,
            })
          : null,
    };
  }

  async getProfileFollowers(
    username: string,
    viewerUserId: string | null | undefined,
    options?: ProfileFollowListOptions,
  ) {
    const profile = await this.resolveProfileByUsername(username);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.listProfileFollowUsers(
      profile.user_id,
      viewerUserId,
      'followers',
      options,
    );
  }

  async getProfileFollowing(
    username: string,
    viewerUserId: string | null | undefined,
    options?: ProfileFollowListOptions,
  ) {
    const profile = await this.resolveProfileByUsername(username);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.listProfileFollowUsers(
      profile.user_id,
      viewerUserId,
      'following',
      options,
    );
  }

  async followProfileByUsername(viewerUserId: string, username: string) {
    const [viewerProfile, targetProfile] = await Promise.all([
      this.ensureSocialProfile(viewerUserId),
      this.resolveProfileByUsername(username),
    ]);
    if (!viewerProfile) {
      throw new NotFoundException('Viewer profile not found');
    }
    if (!targetProfile) {
      throw new NotFoundException('Profile not found');
    }
    if (targetProfile.user_id === viewerUserId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const { data: existingFollow, error: existingError } =
      await this.serviceClient
        .from('social_follows')
        .select('id')
        .eq('follower_id', viewerUserId)
        .eq('following_id', targetProfile.user_id)
        .maybeSingle();
    if (existingError) {
      throw new BadRequestException(
        `Failed to check follow relationship: ${existingError.message}`,
      );
    }

    if (!existingFollow) {
      const { error: insertError } = await this.serviceClient
        .from('social_follows')
        .insert({
          follower_id: viewerUserId,
          following_id: targetProfile.user_id,
        });
      if (insertError && !this.isUniqueViolation(insertError)) {
        throw new BadRequestException(
          `Failed to follow profile: ${insertError.message}`,
        );
      }
      if (!insertError) {
        await this.createNotification(
          targetProfile.user_id,
          'follow',
          'New follower',
          `${viewerProfile.display_name ?? viewerProfile.username} started following you.`,
          {
            actor: {
              user_id: viewerProfile.user_id,
              username: viewerProfile.username,
              display_name: viewerProfile.display_name,
              avatar_url: viewerProfile.avatar_url,
            },
          },
        );
      }
    }

    const [freshTargetProfile, viewerRelationship] = await Promise.all([
      this.ensureSocialProfile(targetProfile.user_id),
      this.getViewerRelationship(viewerUserId, targetProfile.user_id),
    ]);

    return {
      success: true,
      profileUserId: targetProfile.user_id,
      viewerRelationship,
      counts: {
        followers: Number(freshTargetProfile?.followers_count ?? 0),
        following: Number(freshTargetProfile?.following_count ?? 0),
      },
    };
  }

  async unfollowProfileByUsername(viewerUserId: string, username: string) {
    const targetProfile = await this.resolveProfileByUsername(username);
    if (!targetProfile) {
      throw new NotFoundException('Profile not found');
    }
    if (targetProfile.user_id === viewerUserId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }

    const { error } = await this.serviceClient
      .from('social_follows')
      .delete()
      .eq('follower_id', viewerUserId)
      .eq('following_id', targetProfile.user_id);
    if (error) {
      throw new BadRequestException(
        `Failed to unfollow profile: ${error.message}`,
      );
    }

    const [freshTargetProfile, viewerRelationship] = await Promise.all([
      this.ensureSocialProfile(targetProfile.user_id),
      this.getViewerRelationship(viewerUserId, targetProfile.user_id),
    ]);

    return {
      success: true,
      profileUserId: targetProfile.user_id,
      viewerRelationship,
      counts: {
        followers: Number(freshTargetProfile?.followers_count ?? 0),
        following: Number(freshTargetProfile?.following_count ?? 0),
      },
    };
  }

  async getSuggestedUsers(
    viewerUserId: string | null | undefined,
    options?: UserSearchOptions,
  ) {
    return this.getRankedUsers(viewerUserId, {
      q: '',
      limit: options?.limit,
      cursor: options?.cursor,
      excludeFollowed: true,
    });
  }

  async searchUsers(
    viewerUserId: string | null | undefined,
    options?: UserSearchOptions,
  ) {
    return this.getRankedUsers(viewerUserId, {
      q: options?.q,
      limit: options?.limit,
      cursor: options?.cursor,
      excludeFollowed: false,
    });
  }

  private async getRankedUsers(
    viewerUserId: string | null | undefined,
    options?: RankedUserSearchOptions,
  ) {
    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const cursor = this.parseUserSearchCursor(options?.cursor ?? null);
    const searchTerm = this.sanitizeSearchTerm(options?.q);
    const excludeFollowed = Boolean(options?.excludeFollowed);

    let query = this.serviceClient
      .from('social_profiles')
      .select(
        'user_id, username, display_name, avatar_url, bio, followers_count, following_count, seller_reputation, created_at',
      )
      .order('created_at', { ascending: false })
      .order('user_id', { ascending: false })
      .limit(5000);

    if (viewerUserId) {
      query = query.neq('user_id', viewerUserId);
    }
    if (searchTerm) {
      query = query.or(
        `username.ilike.*${searchTerm}*,display_name.ilike.*${searchTerm}*`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(`Failed to search users: ${error.message}`);
    }

    const rows = ((data ?? []) as RankedUserRow[]).filter((row) =>
      Boolean(row.user_id),
    );
    const rowUserIds = rows.map((row) => row.user_id);

    let followingSet = new Set<string>();
    if (viewerUserId && rowUserIds.length > 0) {
      const { data: follows, error: followsError } = await this.serviceClient
        .from('social_follows')
        .select('following_id')
        .eq('follower_id', viewerUserId)
        .in('following_id', rowUserIds);
      if (followsError) {
        throw new BadRequestException(
          `Failed to resolve follow state: ${followsError.message}`,
        );
      }
      followingSet = new Set(
        (follows ?? [])
          .map((row) => row.following_id)
          .filter((value): value is string => Boolean(value)),
      );
    }

    const candidateRows = excludeFollowed
      ? rows.filter((row) => !followingSet.has(row.user_id))
      : rows;

    const activityMap = await this.getRecentUserActivityScores(
      candidateRows.map((row) => row.user_id),
    );
    const nowMs = Date.now();

    const rankedRows: RankedUserScored[] = candidateRows.map((row) => {
      const profileCompleteness = this.computeProfileCompletenessScore(row);
      const trust = this.computeTrustScore(row);
      const activity = activityMap.get(row.user_id)?.activity ?? 0;
      const accountAgeDays =
        (nowMs - this.parseTimestampMs(row.created_at)) / (24 * 60 * 60 * 1000);
      const recencyBoost = this.clamp01(1 - accountAgeDays / 180) * 0.05;
      const discoveryBoost =
        viewerUserId && !followingSet.has(row.user_id) ? 0.02 : 0;
      const discoveryScore = this.clamp01(
        profileCompleteness * 0.45 +
          activity * 0.3 +
          trust * 0.2 +
          recencyBoost +
          discoveryBoost,
      );
      const textRelevance = searchTerm
        ? this.computeTextRelevanceScore(row, searchTerm)
        : 0;
      const score = searchTerm
        ? this.clamp01(textRelevance * 0.6 + discoveryScore * 0.4)
        : discoveryScore;

      return {
        row,
        score: Number(score.toFixed(6)),
        ranking_meta: {
          profile_completeness: Number(profileCompleteness.toFixed(6)),
          activity: Number(activity.toFixed(6)),
          trust: Number(trust.toFixed(6)),
          ...(searchTerm
            ? { text_relevance: Number(textRelevance.toFixed(6)) }
            : {}),
        },
      };
    });

    rankedRows.sort((a, b) => this.compareRankedUsers(a, b));

    const afterCursor = cursor
      ? rankedRows.filter((row) => this.isRankedUserAfterCursor(row, cursor))
      : rankedRows;

    const hasMore = afterCursor.length > limit;
    const pageRows = hasMore ? afterCursor.slice(0, limit) : afterCursor;

    const items = pageRows.map((entry) => ({
      user_id: entry.row.user_id,
      username: entry.row.username,
      display_name: entry.row.display_name,
      avatar_url: entry.row.avatar_url,
      followers_count: entry.row.followers_count,
      following_count: entry.row.following_count,
      is_self: Boolean(viewerUserId) && viewerUserId === entry.row.user_id,
      is_following: followingSet.has(entry.row.user_id),
      ranking_meta: entry.ranking_meta,
    }));

    const last = pageRows[pageRows.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last
          ? this.buildUserSearchCursor({
              score: last.score,
              createdAt: last.row.created_at,
              userId: last.row.user_id,
            })
          : null,
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
      const bio = String(payload.bio ?? '')
        .trim()
        .slice(0, 600);
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
      return this.getProfileByUserId(userId, userId);
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

    return this.getProfileByUserId(userId, userId);
  }

  async getProductById(productId: string, viewerUserId?: string | null) {
    const identifier = String(productId ?? '').trim();
    if (!identifier) {
      throw new BadRequestException('Product identifier is required');
    }

    const isUuidIdentifier =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        identifier,
      );

    let product: any = null;
    if (isUuidIdentifier) {
      const { data: byId, error: byIdError } = await this.serviceClient
        .from('social_products')
        .select('*')
        .eq('id', identifier)
        .maybeSingle();
      if (byIdError) {
        throw new BadRequestException(
          `Failed to fetch product: ${byIdError.message}`,
        );
      }
      product = byId;
    }

    if (!product) {
      const { data: bySlugRows, error: bySlugError } = await this.serviceClient
        .from('social_products')
        .select('*')
        .eq('slug', identifier)
        .order('created_at', { ascending: false })
        .limit(1);
      if (bySlugError) {
        throw new BadRequestException(
          `Failed to fetch product: ${bySlugError.message}`,
        );
      }
      product = (bySlugRows ?? [])[0] ?? null;
    }
    if (!product) return null;

    const isOwner = viewerUserId && product.seller_id === viewerUserId;
    if (product.status !== 'active' && !isOwner) {
      throw new NotFoundException('Product not found');
    }

    // Track product detail impressions for non-owners.
    if (!isOwner) {
      const nextViews = Number(product.views_count ?? 0) + 1;
      const { data: updatedProduct, error: updateViewError } =
        await this.serviceClient
          .from('social_products')
          .update({ views_count: nextViews })
          .eq('id', product.id)
          .select('*')
          .maybeSingle();

      if (!updateViewError && updatedProduct) {
        product = updatedProduct;
      }
    }

    const mapped = (
      await this.enrichProducts([product], viewerUserId ?? null)
    )[0];
    const similarById = new Map<string, any>();
    const appendSimilar = (rows: any[] | null | undefined) => {
      for (const row of rows ?? []) {
        if (!row?.id || row.id === product.id) continue;
        if (!similarById.has(row.id)) {
          similarById.set(row.id, row);
        }
      }
    };

    if (product.category_id) {
      const { data: sameCategoryRows, error: sameCategoryError } =
        await this.serviceClient
          .from('social_products')
          .select('*')
          .eq('status', 'active')
          .eq('category_id', product.category_id)
          .eq('listing_type', product.listing_type)
          .neq('id', product.id)
          .order('created_at', { ascending: false })
          .limit(12);
      if (sameCategoryError) {
        throw new BadRequestException(
          `Failed to fetch similar products: ${sameCategoryError.message}`,
        );
      }
      appendSimilar(sameCategoryRows);
    }

    if (similarById.size < 8) {
      const { data: sameListingRows, error: sameListingError } =
        await this.serviceClient
          .from('social_products')
          .select('*')
          .eq('status', 'active')
          .eq('listing_type', product.listing_type)
          .neq('id', product.id)
          .order('created_at', { ascending: false })
          .limit(16);
      if (sameListingError) {
        throw new BadRequestException(
          `Failed to fetch similar products: ${sameListingError.message}`,
        );
      }
      appendSimilar(sameListingRows);
    }

    if (similarById.size < 8) {
      const { data: anyActiveRows, error: anyActiveError } =
        await this.serviceClient
          .from('social_products')
          .select('*')
          .eq('status', 'active')
          .neq('id', product.id)
          .order('created_at', { ascending: false })
          .limit(16);
      if (anyActiveError) {
        throw new BadRequestException(
          `Failed to fetch similar products: ${anyActiveError.message}`,
        );
      }
      appendSimilar(anyActiveRows);
    }

    return {
      product: mapped,
      similarProducts: (
        await this.enrichProducts(
          Array.from(similarById.values()).slice(0, 8),
          viewerUserId ?? null,
        )
      ).slice(0, 4),
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
    return this.enrichProducts(data ?? [], userId);
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
    const [mapped] = await this.enrichPosts([post], viewerUserId ?? null);
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
    const [mapped] = await this.enrichReels([reel], viewerUserId ?? null);
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

  async likeContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const content = await this.getContentRecord(contentType, contentId);
    this.assertContentVisible(contentType, content, userId);

    const { error } = await this.serviceClient.from('social_likes').upsert(
      {
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
      },
      {
        onConflict: 'user_id,content_type,content_id',
        ignoreDuplicates: true,
      },
    );

    if (error) {
      throw new BadRequestException(
        `Failed to like ${contentType}: ${error.message}`,
      );
    }

    const counters = await this.getContentCounters(contentType, contentId);
    return {
      success: true,
      contentType,
      contentId,
      liked: true,
      likesCount: counters.likesCount,
    };
  }

  async unlikeContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const { error } = await this.serviceClient
      .from('social_likes')
      .delete()
      .eq('user_id', userId)
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    if (error) {
      throw new BadRequestException(
        `Failed to unlike ${contentType}: ${error.message}`,
      );
    }

    const counters = await this.getContentCounters(contentType, contentId);
    return {
      success: true,
      contentType,
      contentId,
      liked: false,
      likesCount: counters.likesCount,
    };
  }

  async saveContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const content = await this.getContentRecord(contentType, contentId);
    this.assertContentVisible(contentType, content, userId);

    let { error } = await this.serviceClient.from('social_saves').upsert(
      {
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
      },
      {
        onConflict: 'user_id,content_type,content_id',
        ignoreDuplicates: true,
      },
    );

    if (
      error &&
      contentType === 'product' &&
      this.isLegacyListingConstraintError(error, 'social_saves')
    ) {
      const fallback = await this.serviceClient.from('social_saves').upsert(
        {
          user_id: userId,
          content_type: 'listing',
          content_id: contentId,
        },
        {
          onConflict: 'user_id,content_type,content_id',
          ignoreDuplicates: true,
        },
      );
      error = fallback.error;
    }

    if (error) {
      throw new BadRequestException(
        `Failed to save ${contentType}: ${error.message}`,
      );
    }

    const counters = await this.getContentCounters(contentType, contentId);
    return {
      success: true,
      contentType,
      contentId,
      saved: true,
      savesCount: counters.savesCount,
    };
  }

  async unsaveContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    let query = this.serviceClient
      .from('social_saves')
      .delete()
      .eq('user_id', userId)
      .eq('content_id', contentId);

    if (contentType === 'product') {
      query = query.in('content_type', ['product', 'listing']);
    } else {
      query = query.eq('content_type', contentType);
    }

    const { error } = await query;
    if (error) {
      throw new BadRequestException(
        `Failed to unsave ${contentType}: ${error.message}`,
      );
    }

    const counters = await this.getContentCounters(contentType, contentId);
    return {
      success: true,
      contentType,
      contentId,
      saved: false,
      savesCount: counters.savesCount,
    };
  }

  async shareContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
    payload?: { channel?: string },
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const content = await this.getContentRecord(contentType, contentId);
    this.assertContentVisible(contentType, content, userId);

    const channel = this.normalizeShareChannel(payload?.channel);

    const { error } = await this.serviceClient.from('social_shares').insert({
      user_id: userId,
      content_type: contentType,
      content_id: contentId,
      channel,
    });
    if (error) {
      throw new BadRequestException(
        `Failed to share ${contentType}: ${error.message}`,
      );
    }

    if (content.ownerId !== userId) {
      await this.createNotification(
        content.ownerId,
        'share',
        'Your content was shared',
        `Someone shared your ${contentType}.`,
        {
          actor: { user_id: userId },
          contentType,
          contentId,
          channel,
        },
      );
    }

    const counters = await this.getContentCounters(contentType, contentId);
    return {
      success: true,
      contentType,
      contentId,
      channel,
      sharesCount: counters.sharesCount,
    };
  }

  async listComments(
    viewerUserId: string | null | undefined,
    contentTypeValue: unknown,
    contentId: string,
    options?: { cursor?: string; limit?: number },
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const content = await this.getContentRecord(contentType, contentId);
    this.assertContentVisible(contentType, content, viewerUserId ?? null);

    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const cursor = this.parseCommentCursor(options?.cursor ?? null);

    let query = this.serviceClient
      .from('social_comments')
      .select(
        'id, parent_comment_id, user_id, content_type, content_id, body, likes_count, created_at, updated_at',
      )
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (cursor?.createdAt) {
      query = query.lt('created_at', cursor.createdAt);
    }

    const { data: parentRows, error: parentError } = await query;
    if (parentError) {
      throw new BadRequestException(
        `Failed to fetch comments: ${parentError.message}`,
      );
    }

    const hasMore = (parentRows ?? []).length > limit;
    const pageRows = hasMore
      ? (parentRows ?? []).slice(0, limit)
      : (parentRows ?? []);
    const parentIds = pageRows.map((row) => row.id);

    let replyRows: any[] = [];
    if (parentIds.length) {
      const { data, error } = await this.serviceClient
        .from('social_comments')
        .select(
          'id, parent_comment_id, user_id, content_type, content_id, body, likes_count, created_at, updated_at',
        )
        .in('parent_comment_id', parentIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) {
        throw new BadRequestException(
          `Failed to fetch comment replies: ${error.message}`,
        );
      }
      replyRows = data ?? [];
    }

    const profiles = await this.getProfilesMap([
      ...pageRows.map((row) => row.user_id),
      ...replyRows.map((row) => row.user_id),
    ]);

    const repliesByParent = new Map<string, any[]>();
    for (const reply of replyRows) {
      const list = repliesByParent.get(reply.parent_comment_id) ?? [];
      const profile = profiles.get(reply.user_id);
      list.push({
        id: reply.id,
        parent_comment_id: reply.parent_comment_id,
        content_type: reply.content_type,
        content_id: reply.content_id,
        user_id: reply.user_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        body: reply.body,
        likes_count: reply.likes_count ?? 0,
        created_at: reply.created_at,
        updated_at: reply.updated_at,
        reply_count: 0,
        can_edit: Boolean(viewerUserId) && viewerUserId === reply.user_id,
        can_delete: Boolean(viewerUserId) && viewerUserId === reply.user_id,
      });
      repliesByParent.set(reply.parent_comment_id, list);
    }

    const items = pageRows.map((row) => {
      const profile = profiles.get(row.user_id);
      const replies = repliesByParent.get(row.id) ?? [];
      return {
        id: row.id,
        parent_comment_id: row.parent_comment_id,
        content_type: row.content_type,
        content_id: row.content_id,
        user_id: row.user_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        body: row.body,
        likes_count: row.likes_count ?? 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
        reply_count: replies.length,
        replies,
        can_edit: Boolean(viewerUserId) && viewerUserId === row.user_id,
        can_delete: Boolean(viewerUserId) && viewerUserId === row.user_id,
      };
    });

    const last = pageRows[pageRows.length - 1];
    const counters = await this.getContentCounters(contentType, contentId);
    return {
      items,
      totalCount: counters.commentsCount,
      nextCursor:
        hasMore && last
          ? this.buildCommentCursor({
              createdAt: last.created_at,
              id: last.id,
            })
          : null,
    };
  }

  async createComment(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
    payload?: { body?: string; parentCommentId?: string },
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const content = await this.getContentRecord(contentType, contentId);
    this.assertContentVisible(contentType, content, userId);

    const body = String(payload?.body ?? '').trim();
    if (!body) {
      throw new BadRequestException('Comment body is required');
    }
    if (body.length > 5000) {
      throw new BadRequestException('Comment body must be 5000 chars or less');
    }

    if (contentType === 'post' && content.isCommentsEnabled === false) {
      throw new BadRequestException('Comments are disabled for this post');
    }

    const parentCommentId =
      String(payload?.parentCommentId ?? '').trim() || null;
    let parentCommentOwnerId: string | null = null;
    if (parentCommentId) {
      const { data: parentComment, error: parentError } =
        await this.serviceClient
          .from('social_comments')
          .select('id, parent_comment_id, user_id, content_type, content_id')
          .eq('id', parentCommentId)
          .maybeSingle();
      if (parentError) {
        throw new BadRequestException(
          `Failed to validate parent comment: ${parentError.message}`,
        );
      }
      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }
      if (
        parentComment.content_type !== contentType ||
        parentComment.content_id !== contentId
      ) {
        throw new BadRequestException(
          'Parent comment does not belong to this content',
        );
      }
      if (parentComment.parent_comment_id) {
        throw new BadRequestException('Only one-level replies are supported');
      }
      parentCommentOwnerId = parentComment.user_id;
    }

    const { data: comment, error } = await this.serviceClient
      .from('social_comments')
      .insert({
        parent_comment_id: parentCommentId,
        user_id: userId,
        content_type: contentType,
        content_id: contentId,
        body,
      })
      .select('*')
      .single();
    if (error || !comment) {
      throw new BadRequestException(
        `Failed to create comment: ${error?.message}`,
      );
    }

    if (content.ownerId !== userId) {
      await this.createNotification(
        content.ownerId,
        'comment',
        'New comment',
        `Someone commented on your ${contentType}.`,
        {
          actor: { user_id: userId },
          contentType,
          contentId,
          commentId: comment.id,
        },
      );
    }
    if (
      parentCommentOwnerId &&
      parentCommentOwnerId !== userId &&
      parentCommentOwnerId !== content.ownerId
    ) {
      await this.createNotification(
        parentCommentOwnerId,
        'comment_reply',
        'New reply',
        'Someone replied to your comment.',
        {
          actor: { user_id: userId },
          contentType,
          contentId,
          commentId: comment.id,
          parentCommentId,
        },
      );
    }

    const profile = (await this.getProfilesMap([userId])).get(userId);
    const counters = await this.getContentCounters(contentType, contentId);
    return {
      comment: {
        id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        content_type: comment.content_type,
        content_id: comment.content_id,
        user_id: comment.user_id,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        body: comment.body,
        likes_count: comment.likes_count ?? 0,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        reply_count: 0,
        replies: [],
        can_edit: true,
        can_delete: true,
      },
      commentsCount: counters.commentsCount,
    };
  }

  async updateComment(
    userId: string,
    commentId: string,
    payload?: { body?: string },
  ) {
    const body = String(payload?.body ?? '').trim();
    if (!body) {
      throw new BadRequestException('Comment body is required');
    }
    if (body.length > 5000) {
      throw new BadRequestException('Comment body must be 5000 chars or less');
    }

    const { data: existing, error: existingError } = await this.serviceClient
      .from('social_comments')
      .select('*')
      .eq('id', commentId)
      .maybeSingle();
    if (existingError) {
      throw new BadRequestException(
        `Failed to fetch comment: ${existingError.message}`,
      );
    }
    if (!existing) {
      throw new NotFoundException('Comment not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const { data: updated, error: updateError } = await this.serviceClient
      .from('social_comments')
      .update({ body })
      .eq('id', commentId)
      .select('*')
      .single();
    if (updateError || !updated) {
      throw new BadRequestException(
        `Failed to update comment: ${updateError?.message}`,
      );
    }

    const profile = (await this.getProfilesMap([userId])).get(userId);
    return {
      id: updated.id,
      parent_comment_id: updated.parent_comment_id,
      content_type: updated.content_type,
      content_id: updated.content_id,
      user_id: updated.user_id,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      body: updated.body,
      likes_count: updated.likes_count ?? 0,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      can_edit: true,
      can_delete: true,
    };
  }

  async deleteComment(userId: string, commentId: string) {
    const { data: existing, error: existingError } = await this.serviceClient
      .from('social_comments')
      .select('id, user_id, content_type, content_id')
      .eq('id', commentId)
      .maybeSingle();
    if (existingError) {
      throw new BadRequestException(
        `Failed to fetch comment: ${existingError.message}`,
      );
    }
    if (!existing) {
      throw new NotFoundException('Comment not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const { error } = await this.serviceClient
      .from('social_comments')
      .delete()
      .eq('id', commentId);
    if (error) {
      throw new BadRequestException(
        `Failed to delete comment: ${error.message}`,
      );
    }

    const counters = await this.getContentCounters(
      this.normalizeContentType(existing.content_type),
      existing.content_id,
    );

    return {
      success: true,
      commentId,
      commentsCount: counters.commentsCount,
    };
  }

  async reportContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
    payload?: { reason?: string; details?: string },
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const reason =
      String(payload?.reason ?? '')
        .trim()
        .toLowerCase() || 'other';
    const details = String(payload?.details ?? '').trim() || null;

    await this.getContentRecord(contentType, contentId);

    const { error } = await this.serviceClient
      .from('social_content_reports')
      .upsert(
        {
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          reason,
          details,
          status: 'open',
        },
        {
          onConflict: 'user_id,content_type,content_id',
        },
      );
    if (error) {
      throw new BadRequestException(
        `Failed to report ${contentType}: ${error.message}`,
      );
    }

    return {
      success: true,
      contentType,
      contentId,
      reported: true,
    };
  }

  async hideContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
    payload?: { reason?: 'hide' | 'not_interested'; expiresAt?: string | null },
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const reason =
      payload?.reason === 'not_interested' ? 'not_interested' : 'hide';
    await this.getContentRecord(contentType, contentId);

    let expiresAt: string | null = null;
    if (reason === 'not_interested') {
      if (payload?.expiresAt) {
        const parsed = new Date(payload.expiresAt);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException('Invalid expiresAt value');
        }
        expiresAt = parsed.toISOString();
      } else {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        expiresAt = date.toISOString();
      }
    }

    const { error } = await this.serviceClient
      .from('social_content_hides')
      .upsert(
        {
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          reason,
          expires_at: expiresAt,
        },
        {
          onConflict: 'user_id,content_type,content_id',
        },
      );
    if (error) {
      throw new BadRequestException(`Failed to hide content: ${error.message}`);
    }

    return {
      success: true,
      contentType,
      contentId,
      hidden: true,
      reason,
      expiresAt,
    };
  }

  async unhideContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const { error } = await this.serviceClient
      .from('social_content_hides')
      .delete()
      .eq('user_id', userId)
      .eq('content_type', contentType)
      .eq('content_id', contentId);

    if (error) {
      throw new BadRequestException(
        `Failed to unhide content: ${error.message}`,
      );
    }

    return {
      success: true,
      contentType,
      contentId,
      hidden: false,
    };
  }

  async getHiddenContent(userId: string, options?: ContentControlsListOptions) {
    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const cursor = this.parseFollowListCursor(options?.cursor ?? null);
    const contentType = options?.contentType
      ? this.normalizeContentType(options.contentType)
      : null;

    let query = this.serviceClient
      .from('social_content_hides')
      .select(
        'id, content_type, content_id, reason, expires_at, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (contentType) {
      query = query.eq('content_type', contentType);
    }
    if (cursor) {
      query = query.lt('created_at', cursor.createdAt);
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(
        `Failed to fetch hidden content: ${error.message}`,
      );
    }

    const hasMore = (data ?? []).length > limit;
    const pageRows = hasMore ? (data ?? []).slice(0, limit) : (data ?? []);
    const last = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((row: any) => {
        const type = this.normalizeContentType(row.content_type);
        return {
          id: row.id,
          content_type: type,
          content_id: row.content_id,
          reason: row.reason,
          expires_at: row.expires_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          link_path: this.buildContentLinkPath(type, row.content_id),
        };
      }),
      nextCursor:
        hasMore && last
          ? this.buildFollowListCursor({
              createdAt: last.created_at,
              id: last.id,
            })
          : null,
    };
  }

  async getReportedContent(
    userId: string,
    options?: ContentControlsListOptions,
  ) {
    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const cursor = this.parseFollowListCursor(options?.cursor ?? null);
    const contentType = options?.contentType
      ? this.normalizeContentType(options.contentType)
      : null;

    let query = this.serviceClient
      .from('social_content_reports')
      .select(
        'id, content_type, content_id, reason, details, status, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (contentType) {
      query = query.eq('content_type', contentType);
    }
    if (cursor) {
      query = query.lt('created_at', cursor.createdAt);
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(
        `Failed to fetch reports: ${error.message}`,
      );
    }

    const hasMore = (data ?? []).length > limit;
    const pageRows = hasMore ? (data ?? []).slice(0, limit) : (data ?? []);
    const last = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((row: any) => {
        const type = this.normalizeContentType(row.content_type);
        return {
          id: row.id,
          content_type: type,
          content_id: row.content_id,
          reason: row.reason,
          details: row.details,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          link_path: this.buildContentLinkPath(type, row.content_id),
        };
      }),
      nextCursor:
        hasMore && last
          ? this.buildFollowListCursor({
              createdAt: last.created_at,
              id: last.id,
            })
          : null,
    };
  }

  async updateContentStatus(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
    payload?: { status?: string },
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const source = this.getContentSource(contentType);
    const content = await this.getContentRecord(contentType, contentId);
    if (content.ownerId !== userId) {
      throw new ForbiddenException(
        `You can only update your own ${contentType}`,
      );
    }

    const status = String(payload?.status ?? '')
      .trim()
      .toLowerCase();

    const allowed =
      contentType === 'product'
        ? new Set(['draft', 'active', 'inactive', 'sold', 'archived'])
        : new Set(['draft', 'published', 'archived']);

    if (!allowed.has(status)) {
      throw new BadRequestException(`Invalid status for ${contentType}`);
    }

    const patch: Record<string, unknown> = { status };
    if (
      (contentType === 'post' || contentType === 'reel') &&
      status === 'published'
    ) {
      patch.published_at = new Date().toISOString();
    }
    if (contentType === 'product') {
      if (status === 'sold') {
        patch.sold_at = new Date().toISOString();
      }
      if (status === 'active' && content.status === 'sold') {
        patch.sold_at = null;
      }
    }

    const { data, error } = await this.serviceClient
      .from(source.table)
      .update(patch)
      .eq('id', contentId)
      .eq(source.ownerColumn, userId)
      .select('id, status')
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to update status: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException(`${contentType} not found`);
    }

    return {
      success: true,
      contentType,
      contentId,
      status: data.status,
    };
  }

  async setPostCommentsEnabled(
    userId: string,
    postId: string,
    isEnabled: boolean,
  ) {
    const post = await this.getContentRecord('post', postId);
    if (post.ownerId !== userId) {
      throw new ForbiddenException('You can only update your own post');
    }

    const { data, error } = await this.serviceClient
      .from('social_posts')
      .update({ is_comments_enabled: Boolean(isEnabled) })
      .eq('id', postId)
      .eq('user_id', userId)
      .select('id, is_comments_enabled')
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to update comment settings: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException('Post not found');
    }

    return {
      success: true,
      contentType: 'post',
      contentId: postId,
      isCommentsEnabled: Boolean((data as any).is_comments_enabled),
    };
  }

  async deleteContent(
    userId: string,
    contentTypeValue: unknown,
    contentId: string,
  ) {
    const contentType = this.normalizeContentType(contentTypeValue);
    const source = this.getContentSource(contentType);
    const content = await this.getContentRecord(contentType, contentId);
    if (content.ownerId !== userId) {
      throw new ForbiddenException(
        `You can only delete your own ${contentType}`,
      );
    }

    const { data, error } = await this.serviceClient
      .from(source.table)
      .delete()
      .eq('id', contentId)
      .eq(source.ownerColumn, userId)
      .select('id')
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to delete ${contentType}: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException(`${contentType} not found`);
    }

    return {
      success: true,
      contentType,
      contentId,
      deleted: true,
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

  private normalizeSwapAmount(
    value: unknown,
    fieldName: string,
    options?: { required?: boolean; allowZero?: boolean },
  ): number | null {
    const required = Boolean(options?.required);
    const allowZero = options?.allowZero !== false;
    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`${fieldName} is required`);
      }
      return null;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new BadRequestException(`${fieldName} must be a valid number`);
    }
    if (numeric < 0 || (!allowZero && numeric <= 0)) {
      throw new BadRequestException(
        `${fieldName} must be ${allowZero ? '>= 0' : '> 0'}`,
      );
    }
    return Number(numeric.toFixed(2));
  }

  private normalizeSwapQuantity(
    value: unknown,
    fieldName: string,
    options?: { required?: boolean; defaultValue?: number },
  ): number {
    const required = Boolean(options?.required);
    const defaultValue = Math.max(1, Math.floor(options?.defaultValue ?? 1));

    if (value === undefined || value === null || value === '') {
      if (required) {
        throw new BadRequestException(`${fieldName} is required`);
      }
      return defaultValue;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }

    return numeric;
  }

  private normalizeSwapDate(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expiresAt must be a valid date');
    }
    return date.toISOString();
  }

  private normalizeSwapNotificationType(type: string): string {
    const trimmed = String(type ?? '')
      .trim()
      .toLowerCase();
    if (!trimmed) return 'swap_update';
    return trimmed.startsWith('swap_') ? trimmed : `swap_${trimmed}`;
  }

  private isSwapLifecycleRpcMissing(
    error: { message?: string; details?: string; hint?: string } | null,
  ): boolean {
    if (!error) return false;
    const source =
      `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
    const mentionsLifecycleRpc =
      source.includes('social_update_swap_transaction_state') ||
      source.includes('social_accept_swap_proposal_atomic');
    if (!mentionsLifecycleRpc) return false;
    return (
      source.includes('does not exist') ||
      source.includes('no function matches') ||
      source.includes('undefined function')
    );
  }

  private isSwapOfferedQuantityColumnMissing(
    error: { message?: string; details?: string; hint?: string } | null,
  ): boolean {
    if (!error) return false;
    const source =
      `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
    if (!source.includes('offered_quantity')) return false;
    return source.includes('does not exist') || source.includes('column');
  }

  private async createSwapNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.createNotification(
      userId,
      this.normalizeSwapNotificationType(type),
      title,
      body,
      metadata,
    );
  }

  private async getSwapListingByIdOrThrow(listingId: string) {
    const { data: listing, error } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to fetch swap listing: ${error.message}`,
      );
    }
    if (!listing) {
      throw new NotFoundException('Swap listing not found');
    }
    return listing;
  }

  private async getSwapProposalByIdOrThrow(proposalId: string) {
    const { data: proposal, error } = await this.serviceClient
      .from('social_swap_proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to fetch swap proposal: ${error.message}`,
      );
    }
    if (!proposal) {
      throw new NotFoundException('Swap proposal not found');
    }
    return proposal;
  }

  private async getSwapTransactionByIdOrThrow(transactionId: string) {
    const { data: transaction, error } = await this.serviceClient
      .from('social_swap_transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to fetch swap transaction: ${error.message}`,
      );
    }
    if (!transaction) {
      throw new NotFoundException('Swap transaction not found');
    }
    return transaction;
  }

  private async assertSwapProductOwnedAndActive(
    userId: string,
    productId: string,
    fieldName: string,
    requiredQuantity = 1,
  ) {
    const { data: product, error } = await this.serviceClient
      .from('social_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to validate ${fieldName}: ${error.message}`,
      );
    }
    if (!product) {
      throw new NotFoundException(`${fieldName} not found`);
    }
    if (product.seller_id !== userId) {
      throw new ForbiddenException(`You do not own this ${fieldName}`);
    }
    if (product.status !== 'active') {
      throw new BadRequestException(`${fieldName} must be active`);
    }
    if (!product.is_exchangeable) {
      throw new BadRequestException(`${fieldName} is not exchangeable`);
    }
    if (Number(product.available_quantity ?? 0) < requiredQuantity) {
      throw new BadRequestException(
        `${fieldName} has only ${Number(product.available_quantity ?? 0)} item(s) available`,
      );
    }
    return product;
  }

  private resolveSwapPreviewImageUrl(product: any): string | null {
    const mediaRows = Array.isArray(product?.social_product_media)
      ? [...product.social_product_media]
      : [];
    const sorted = mediaRows
      .filter((row) => String(row?.media_url ?? '').trim().length > 0)
      .sort((a, b) => {
        const aPrimary = Boolean(a?.is_primary) ? 0 : 1;
        const bPrimary = Boolean(b?.is_primary) ? 0 : 1;
        if (aPrimary !== bPrimary) return aPrimary - bPrimary;

        const aSortRaw = a?.sort_order ?? a?.display_order;
        const bSortRaw = b?.sort_order ?? b?.display_order;
        const aSort = Number.isFinite(Number(aSortRaw))
          ? Number(aSortRaw)
          : Number.MAX_SAFE_INTEGER;
        const bSort = Number.isFinite(Number(bSortRaw))
          ? Number(bSortRaw)
          : Number.MAX_SAFE_INTEGER;
        if (aSort !== bSort) return aSort - bSort;

        const aCreated = Date.parse(String(a?.created_at ?? ''));
        const bCreated = Date.parse(String(b?.created_at ?? ''));
        const aTime = Number.isNaN(aCreated) ? Number.MAX_SAFE_INTEGER : aCreated;
        const bTime = Number.isNaN(bCreated) ? Number.MAX_SAFE_INTEGER : bCreated;
        return aTime - bTime;
      });

    const first = sorted[0];
    if (!first) return null;
    const mediaUrl = String(first.media_url ?? '').trim();
    return mediaUrl || null;
  }

  private toSwapProductPreview(
    product: any,
    offeredQuantity?: unknown,
  ): Record<string, unknown> | null {
    if (!product) return null;
    const productId = String(product.id ?? '').trim();
    if (!productId) return null;

    const quantityRaw = Number(offeredQuantity ?? 1);
    const safeQuantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0
        ? Math.floor(quantityRaw)
        : 1;
    const availableRaw = Number(product.available_quantity ?? product.quantity ?? 0);
    const availableQuantity = Number.isFinite(availableRaw)
      ? Math.max(0, Math.floor(availableRaw))
      : 0;

    return {
      product_id: productId,
      title: String(product.title ?? '').trim() || 'Untitled product',
      primary_image_url: this.resolveSwapPreviewImageUrl(product),
      price: this.asNumber(product.price ?? null),
      offered_quantity: safeQuantity,
      available_quantity: availableQuantity,
      condition: String(product.condition ?? '').trim() || null,
      owner_id: String(product.user_id ?? product.seller_id ?? '').trim() || null,
    };
  }

  private async hydrateSwapListings(
    listings: any[],
    viewerUserId?: string | null,
  ): Promise<any[]> {
    if (!listings.length) return [];

    const ownerIds = Array.from(
      new Set(
        listings
          .map((listing) => listing.owner_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const offeredProductIds = Array.from(
      new Set(
        listings
          .map((listing) => listing.offered_product_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const wantedCategoryIds = listings
      .map((listing) => listing.wanted_category_id)
      .filter(Boolean);
    const wantedSubcategoryIds = listings
      .map((listing) => listing.wanted_subcategory_id)
      .filter(Boolean);
    const wantedSubSubcategoryIds = listings
      .map((listing) => listing.wanted_sub_subcategory_id)
      .filter(Boolean);

    const [
      profiles,
      productsRaw,
      wantedCategoryMap,
      wantedSubcategoryMap,
      wantedSubSubcategoryMap,
    ] = await Promise.all([
      this.getProfilesMap(ownerIds),
      this.fetchProductsByIds(offeredProductIds),
      this.getCategoryMap('categories', wantedCategoryIds),
      this.getCategoryMap('subcategories', wantedSubcategoryIds),
      this.getCategoryMap('sub_subcategories', wantedSubSubcategoryIds),
    ]);

    const products = await this.enrichProducts(productsRaw, viewerUserId ?? null);
    const productMap = new Map(
      products.map((product) => [product.id as string, product]),
    );

    return listings.map((listing) => {
      const ownerProfile = profiles.get(listing.owner_id);
      const offeredProduct = listing.offered_product_id
        ? (productMap.get(listing.offered_product_id) ?? null)
        : null;
      return {
        ...listing,
        owner_username: ownerProfile?.username ?? null,
        owner_display_name: ownerProfile?.display_name ?? null,
        owner_avatar_url: ownerProfile?.avatar_url ?? null,
        wanted_category:
          listing.wanted_category_id &&
          wantedCategoryMap.get(listing.wanted_category_id)
            ? wantedCategoryMap.get(listing.wanted_category_id)?.name
            : null,
        wanted_subcategory:
          listing.wanted_subcategory_id &&
          wantedSubcategoryMap.get(listing.wanted_subcategory_id)
            ? wantedSubcategoryMap.get(listing.wanted_subcategory_id)?.name
            : null,
        wanted_sub_subcategory:
          listing.wanted_sub_subcategory_id &&
          wantedSubSubcategoryMap.get(listing.wanted_sub_subcategory_id)
            ? wantedSubSubcategoryMap.get(listing.wanted_sub_subcategory_id)
                ?.name
            : null,
        social_products: offeredProduct,
        offered_product_preview: this.toSwapProductPreview(
          offeredProduct,
          listing.offered_quantity,
        ),
        can_manage: Boolean(viewerUserId) && listing.owner_id === viewerUserId,
      };
    });
  }

  private async hydrateSwapProposals(
    proposals: any[],
    viewerUserId?: string | null,
  ): Promise<any[]> {
    if (!proposals.length) return [];

    const proposerIds = Array.from(
      new Set(
        proposals
          .map((proposal) => proposal.proposer_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const offeredProductIds = Array.from(
      new Set(
        proposals
          .map((proposal) => proposal.offered_product_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [profiles, productsRaw] = await Promise.all([
      this.getProfilesMap(proposerIds),
      this.fetchProductsByIds(offeredProductIds),
    ]);
    const products = await this.enrichProducts(productsRaw, viewerUserId ?? null);
    const productMap = new Map(
      products.map((product) => [product.id as string, product]),
    );

    return proposals.map((proposal) => {
      const proposerProfile = profiles.get(proposal.proposer_id);
      const offeredProduct = proposal.offered_product_id
        ? (productMap.get(proposal.offered_product_id) ?? null)
        : null;
      return {
        ...proposal,
        proposer_username: proposerProfile?.username ?? null,
        proposer_display_name: proposerProfile?.display_name ?? null,
        proposer_avatar_url: proposerProfile?.avatar_url ?? null,
        offered_product: offeredProduct,
        offered_product_preview: this.toSwapProductPreview(
          offeredProduct,
          proposal.offered_quantity,
        ),
      };
    });
  }

  private async reconcileSwapTransactionInventory(transactionId: string) {
    const transaction = await this.getSwapTransactionByIdOrThrow(transactionId);
    const listing = await this.getSwapListingByIdOrThrow(transaction.listing_id);
    const proposal = await this.getSwapProposalByIdOrThrow(
      transaction.accepted_proposal_id,
    );

    const listingQuantity = this.normalizeSwapQuantity(
      listing.offered_quantity,
      'listing.offered_quantity',
      { defaultValue: 1 },
    );
    const proposalQuantity = this.normalizeSwapQuantity(
      proposal.offered_quantity,
      'proposal.offered_quantity',
      { defaultValue: 1 },
    );

    const productIds = Array.from(
      new Set(
        [listing.offered_product_id, proposal.offered_product_id].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );
    if (!productIds.length) return;

    const { data: products, error: productsError } = await this.serviceClient
      .from('social_products')
      .select('*')
      .in('id', productIds);
    if (productsError) {
      throw new BadRequestException(
        `Failed to reconcile swap inventory: ${productsError.message}`,
      );
    }

    const requiredByProductId = new Map<string, number>();
    if (listing.offered_product_id) {
      requiredByProductId.set(listing.offered_product_id, listingQuantity);
    }
    if (proposal.offered_product_id) {
      requiredByProductId.set(proposal.offered_product_id, proposalQuantity);
    }

    for (const product of products ?? []) {
      const available = Number(product.available_quantity ?? 0);
      const reserved = Number(product.reserved_quantity ?? 0);
      const requiredQuantity = Math.max(
        1,
        requiredByProductId.get(product.id) ?? 1,
      );

      if (
        [
          'accepted',
          'shipping_pending',
          'in_transit',
          'delivered',
          'inspection',
          'disputed',
        ].includes(transaction.status)
      ) {
        if (reserved < requiredQuantity && available > 0) {
          const delta = Math.min(requiredQuantity - reserved, available);
          const nextAvailable = Math.max(0, available - delta);
          const nextReserved = reserved + delta;
          const nextStatus = nextAvailable === 0 ? 'inactive' : product.status;
          await this.serviceClient
            .from('social_products')
            .update({
              available_quantity: nextAvailable,
              reserved_quantity: nextReserved,
              status: nextStatus,
            })
            .eq('id', product.id);
        }
        continue;
      }

      if (transaction.status === 'cancelled') {
        if (reserved > 0) {
          const delta = Math.min(requiredQuantity, reserved);
          await this.serviceClient
            .from('social_products')
            .update({
              available_quantity: available + delta,
              reserved_quantity: reserved - delta,
              status: 'active',
            })
            .eq('id', product.id);
        }
        continue;
      }

      if (transaction.status === 'completed') {
        if (reserved > 0) {
          const delta = Math.min(requiredQuantity, reserved);
          const nextReserved = reserved - delta;
          const nextStatus =
            available <= 0 && nextReserved <= 0 ? 'sold' : product.status;
          await this.serviceClient
            .from('social_products')
            .update({
              reserved_quantity: nextReserved,
              status: nextStatus,
              sold_at:
                nextStatus === 'sold'
                  ? new Date().toISOString()
                  : product.sold_at ?? null,
            })
            .eq('id', product.id);
        }
      }
    }
  }

  private async syncSwapTransactionState(
    transactionId: string,
    userId: string,
  ) {
    const { error } = await this.serviceClient.rpc(
      'social_update_swap_transaction_state',
      {
        p_transaction_id: transactionId,
        p_actor_id: userId,
        p_action: 'sync',
        p_payload: {},
      },
    );
    if (this.isSwapLifecycleRpcMissing(error)) {
      // Compatibility mode for environments that have not applied migration 028 yet.
      return;
    }
    if (error) {
      throw new BadRequestException(
        `Failed to sync swap transaction: ${error.message}`,
      );
    }
    await this.reconcileSwapTransactionInventory(transactionId);
  }

  private async runSwapTransactionAction(
    transactionId: string,
    userId: string,
    action:
      | 'set_address'
      | 'mark_shipped'
      | 'confirm_delivered'
      | 'open_dispute'
      | 'complete'
      | 'cancel'
      | 'sync',
    payload: Record<string, unknown> = {},
  ) {
    const { error } = await this.serviceClient.rpc(
      'social_update_swap_transaction_state',
      {
        p_transaction_id: transactionId,
        p_actor_id: userId,
        p_action: action,
        p_payload: payload,
      },
    );
    if (this.isSwapLifecycleRpcMissing(error)) {
      throw new BadRequestException(
        'Exchange lifecycle migration is not applied. Please run migration 028 first.',
      );
    }
    if (error) {
      throw new BadRequestException(
        `Failed to update swap transaction: ${error.message}`,
      );
    }
    await this.reconcileSwapTransactionInventory(transactionId);
  }

  private async hydrateSwapTransactions(
    transactions: any[],
    viewerUserId: string,
    includeDetails = false,
  ): Promise<any[]> {
    if (!transactions.length) return [];

    const transactionIds = transactions.map((transaction) => transaction.id);
    const listingIds = Array.from(
      new Set(
        transactions
          .map((transaction) => transaction.listing_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const acceptedProposalIds = Array.from(
      new Set(
        transactions
          .map((transaction) => transaction.accepted_proposal_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const listingRowsPromise = listingIds.length
      ? this.serviceClient
          .from('social_swap_listings')
          .select('*')
          .in('id', listingIds)
      : Promise.resolve({ data: [], error: null } as any);
    const proposalRowsPromise = acceptedProposalIds.length
      ? this.serviceClient
          .from('social_swap_proposals')
          .select('*')
          .in('id', acceptedProposalIds)
      : Promise.resolve({ data: [], error: null } as any);

    const [listingRowsResult, proposalRowsResult, shipmentsResult, disputesResult] =
      await Promise.all([
        listingRowsPromise,
        proposalRowsPromise,
        this.serviceClient
          .from('social_swap_shipments')
          .select('*')
          .in('transaction_id', transactionIds),
        this.serviceClient
          .from('social_swap_disputes')
          .select('*')
          .in('transaction_id', transactionIds)
          .order('created_at', { ascending: false }),
      ]);

    if (listingRowsResult.error) {
      throw new BadRequestException(
        `Failed to load swap transaction listings: ${listingRowsResult.error.message}`,
      );
    }
    if (proposalRowsResult.error) {
      throw new BadRequestException(
        `Failed to load swap transaction proposals: ${proposalRowsResult.error.message}`,
      );
    }
    if (shipmentsResult.error) {
      throw new BadRequestException(
        `Failed to load swap shipments: ${shipmentsResult.error.message}`,
      );
    }
    if (disputesResult.error) {
      throw new BadRequestException(
        `Failed to load swap disputes: ${disputesResult.error.message}`,
      );
    }

    const [mappedListings, mappedProposals] = await Promise.all([
      this.hydrateSwapListings(listingRowsResult.data ?? [], viewerUserId),
      this.hydrateSwapProposals(proposalRowsResult.data ?? [], viewerUserId),
    ]);
    const listingMap = new Map(
      mappedListings.map((listing) => [listing.id as string, listing]),
    );
    const proposalMap = new Map(
      mappedProposals.map((proposal) => [proposal.id as string, proposal]),
    );

    const shipmentsByTransaction = new Map<string, any[]>();
    for (const row of shipmentsResult.data ?? []) {
      if (!shipmentsByTransaction.has(row.transaction_id)) {
        shipmentsByTransaction.set(row.transaction_id, []);
      }
      shipmentsByTransaction.get(row.transaction_id)?.push(row);
    }

    const disputesByTransaction = new Map<string, any[]>();
    for (const row of disputesResult.data ?? []) {
      if (!disputesByTransaction.has(row.transaction_id)) {
        disputesByTransaction.set(row.transaction_id, []);
      }
      disputesByTransaction.get(row.transaction_id)?.push(row);
    }

    let timelineByTransaction = new Map<string, any[]>();
    if (includeDetails) {
      const { data: timelineRows, error: timelineError } = await this.serviceClient
        .from('social_swap_timeline')
        .select('*')
        .in('transaction_id', transactionIds)
        .order('created_at', { ascending: true });
      if (timelineError) {
        throw new BadRequestException(
          `Failed to load swap timeline: ${timelineError.message}`,
        );
      }
      timelineByTransaction = new Map<string, any[]>();
      for (const row of timelineRows ?? []) {
        if (!timelineByTransaction.has(row.transaction_id)) {
          timelineByTransaction.set(row.transaction_id, []);
        }
        timelineByTransaction.get(row.transaction_id)?.push(row);
      }
    }

    return transactions.map((transaction) => {
      const listing = listingMap.get(transaction.listing_id) ?? null;
      const acceptedProposal =
        proposalMap.get(transaction.accepted_proposal_id) ?? null;
      const myRole =
        transaction.owner_id === viewerUserId
          ? 'owner'
          : transaction.proposer_id === viewerUserId
            ? 'proposer'
            : null;
      const myItem =
        myRole === 'owner'
          ? listing?.social_products ?? null
          : acceptedProposal?.offered_product ?? null;
      const theirItem =
        myRole === 'owner'
          ? acceptedProposal?.offered_product ?? null
          : listing?.social_products ?? null;
      const counterpartId =
        myRole === 'owner' ? transaction.proposer_id : transaction.owner_id;
      const counterpartProfile = listing
        ? myRole === 'owner'
          ? {
              user_id: transaction.proposer_id,
              username: acceptedProposal?.proposer_username ?? null,
              display_name: acceptedProposal?.proposer_display_name ?? null,
              avatar_url: acceptedProposal?.proposer_avatar_url ?? null,
            }
          : {
              user_id: transaction.owner_id,
              username: listing.owner_username ?? null,
              display_name: listing.owner_display_name ?? null,
              avatar_url: listing.owner_avatar_url ?? null,
            }
        : {
            user_id: counterpartId,
            username: null,
            display_name: null,
            avatar_url: null,
          };

      return {
        ...transaction,
        listing,
        accepted_proposal: acceptedProposal,
        my_role: myRole,
        my_item: myItem,
        their_item: theirItem,
        counterpart: counterpartProfile,
        shipments: shipmentsByTransaction.get(transaction.id) ?? [],
        disputes: disputesByTransaction.get(transaction.id) ?? [],
        timeline: timelineByTransaction.get(transaction.id) ?? [],
      };
    });
  }

  async getExchangeListings(viewerUserId: string | null = null) {
    const { data: listings, error } = await this.serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (error) {
      throw new BadRequestException(
        `Failed to fetch exchange listings: ${error.message}`,
      );
    }
    const openListings = (listings ?? []).filter((listing) => {
      if (!listing.expires_at) return true;
      const expiresAt = new Date(String(listing.expires_at));
      if (Number.isNaN(expiresAt.getTime())) return true;
      return expiresAt.getTime() > Date.now();
    });
    return this.hydrateSwapListings(openListings, viewerUserId);
  }

  async getExchangeListingById(listingId: string, viewerUserId?: string | null) {
    const listing = await this.getSwapListingByIdOrThrow(listingId);
    const isOwner = Boolean(viewerUserId) && listing.owner_id === viewerUserId;

    let viewerProposal: any = null;
    if (!isOwner && viewerUserId) {
      const { data: ownProposal, error: ownProposalError } =
        await this.serviceClient
          .from('social_swap_proposals')
          .select('*')
          .eq('listing_id', listingId)
          .eq('proposer_id', viewerUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
      if (ownProposalError) {
        throw new BadRequestException(
          `Failed to check listing proposal access: ${ownProposalError.message}`,
        );
      }
      viewerProposal = ownProposal;
    }

    if (listing.status !== 'open' && !isOwner && !viewerProposal) {
      throw new NotFoundException('Exchange listing not found');
    }

    if (!isOwner) {
      await this.serviceClient
        .from('social_swap_listings')
        .update({ views_count: Number(listing.views_count ?? 0) + 1 })
        .eq('id', listing.id);
    }

    const [mappedListing] = await this.hydrateSwapListings(
      [listing],
      viewerUserId ?? null,
    );

    const proposalsResult = isOwner
      ? await this.serviceClient
          .from('social_swap_proposals')
          .select('*')
          .eq('listing_id', listingId)
          .order('created_at', { ascending: false })
      : viewerUserId
        ? await this.serviceClient
            .from('social_swap_proposals')
            .select('*')
            .eq('listing_id', listingId)
            .eq('proposer_id', viewerUserId)
            .order('created_at', { ascending: false })
        : ({ data: [], error: null } as any);

    if (proposalsResult.error) {
      throw new BadRequestException(
        `Failed to load swap proposals: ${proposalsResult.error.message}`,
      );
    }

    const mappedProposals = await this.hydrateSwapProposals(
      proposalsResult.data ?? [],
      viewerUserId ?? null,
    );

    const { data: transaction, error: transactionError } = await this.serviceClient
      .from('social_swap_transactions')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (transactionError) {
      throw new BadRequestException(
        `Failed to load swap transaction: ${transactionError.message}`,
      );
    }

    let mappedTransaction: any = null;
    let timeline: any[] = [];
    if (
      transaction &&
      viewerUserId &&
      (transaction.owner_id === viewerUserId ||
        transaction.proposer_id === viewerUserId)
    ) {
      await this.syncSwapTransactionState(transaction.id, viewerUserId);
      const latest = await this.getSwapTransactionByIdOrThrow(transaction.id);
      const [mapped] = await this.hydrateSwapTransactions(
        [latest],
        viewerUserId,
        true,
      );
      mappedTransaction = mapped ?? null;
      timeline = mapped?.timeline ?? [];
    }

    return {
      listing: mappedListing ?? listing,
      proposals: mappedProposals,
      transaction: mappedTransaction,
      timeline,
      viewerScope: {
        isOwner: Boolean(isOwner),
        isProposer: Boolean(viewerProposal),
      },
    };
  }

  async createSwapListing(userId: string, payload: any) {
    const title = String(payload?.title ?? '').trim();
    if (!title) throw new BadRequestException('title is required');

    const offeredProductId = String(payload?.offeredProductId ?? '').trim() || null;
    if (!offeredProductId) {
      throw new BadRequestException('offeredProductId is required');
    }
    const offeredQuantity = this.normalizeSwapQuantity(
      payload?.offeredQuantity,
      'offeredQuantity',
      { defaultValue: 1 },
    );
    await this.assertSwapProductOwnedAndActive(
      userId,
      offeredProductId,
      'offeredProduct',
      offeredQuantity,
    );

    const wantedMinValue = this.normalizeSwapAmount(
      payload?.wantedMinValue,
      'wantedMinValue',
    );
    const wantedMaxValue = this.normalizeSwapAmount(
      payload?.wantedMaxValue,
      'wantedMaxValue',
    );
    if (
      wantedMinValue !== null &&
      wantedMaxValue !== null &&
      wantedMaxValue < wantedMinValue
    ) {
      throw new BadRequestException(
        'wantedMaxValue must be greater than or equal to wantedMinValue',
      );
    }

    const offeredValue = this.normalizeSwapAmount(
      payload?.offeredValue,
      'offeredValue',
    );
    const expiresAt = this.normalizeSwapDate(payload?.expiresAt);
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    const { data: listing, error } = await this.serviceClient
      .from('social_swap_listings')
      .insert({
        owner_id: userId,
        offered_product_id: offeredProductId,
        offered_quantity: offeredQuantity,
        title,
        description: String(payload?.description ?? '').trim() || null,
        wanted_category_id: payload.wantedCategoryId ?? null,
        wanted_subcategory_id: payload.wantedSubcategoryId ?? null,
        wanted_sub_subcategory_id: payload.wantedSubSubcategoryId ?? null,
        wanted_description: String(payload?.wantedDescription ?? '').trim() || null,
        wanted_min_value: wantedMinValue,
        wanted_max_value: wantedMaxValue,
        offered_value: offeredValue,
        is_cash_top_up_allowed: payload.isCashTopUpAllowed ?? true,
        expires_at: expiresAt,
        status: 'open',
      })
      .select('*')
      .single();
    if (error || !listing) {
      if (this.isSwapOfferedQuantityColumnMissing(error)) {
        throw new BadRequestException(
          'Exchange quantity migration is not applied. Please run migration 029 first.',
        );
      }
      throw new BadRequestException(
        `Failed to create swap listing: ${error?.message}`,
      );
    }
    return this.getExchangeListingById(listing.id, userId);
  }

  async updateSwapListing(userId: string, listingId: string, payload: any) {
    const listing = await this.getSwapListingByIdOrThrow(listingId);
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('Only listing owner can update this listing');
    }

    const action = String(payload?.action ?? '')
      .trim()
      .toLowerCase();
    if (action) {
      let nextStatus: string | null = null;
      if (action === 'close') nextStatus = 'closed';
      if (action === 'cancel') nextStatus = 'cancelled';
      if (action === 'reopen') nextStatus = 'open';
      if (!nextStatus) {
        throw new BadRequestException('Invalid listing action');
      }

      if (action === 'reopen' && listing.status === 'accepted') {
        throw new BadRequestException(
          'Accepted listing cannot be reopened to open state',
        );
      }

      const { data: updated, error: updateError } = await this.serviceClient
        .from('social_swap_listings')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', listing.id)
        .select('*')
        .single();
      if (updateError || !updated) {
        throw new BadRequestException(
          `Failed to update swap listing: ${updateError?.message}`,
        );
      }
      return this.getExchangeListingById(updated.id, userId);
    }

    if (listing.status !== 'open') {
      throw new BadRequestException('Only open listings can be edited');
    }

    const updateData: Record<string, unknown> = {};
    let nextOfferedProductId = String(listing.offered_product_id ?? '').trim();
    let nextOfferedQuantity = this.normalizeSwapQuantity(
      listing.offered_quantity,
      'offeredQuantity',
      { defaultValue: 1 },
    );

    if (payload?.title !== undefined) {
      const title = String(payload.title ?? '').trim();
      if (!title) throw new BadRequestException('title cannot be empty');
      updateData.title = title;
    }
    if (payload?.description !== undefined) {
      updateData.description = String(payload.description ?? '').trim() || null;
    }
    if (payload?.offeredProductId !== undefined) {
      const offeredProductId = String(payload.offeredProductId ?? '').trim();
      if (!offeredProductId) {
        throw new BadRequestException('offeredProductId cannot be empty');
      }
      nextOfferedProductId = offeredProductId;
      updateData.offered_product_id = offeredProductId;
    }
    if (payload?.offeredQuantity !== undefined) {
      nextOfferedQuantity = this.normalizeSwapQuantity(
        payload.offeredQuantity,
        'offeredQuantity',
        { defaultValue: 1 },
      );
      updateData.offered_quantity = nextOfferedQuantity;
    }
    if (
      payload?.offeredProductId !== undefined ||
      payload?.offeredQuantity !== undefined
    ) {
      await this.assertSwapProductOwnedAndActive(
        userId,
        nextOfferedProductId,
        'offeredProduct',
        nextOfferedQuantity,
      );
    }
    if (payload?.wantedCategoryId !== undefined)
      updateData.wanted_category_id = payload.wantedCategoryId || null;
    if (payload?.wantedSubcategoryId !== undefined)
      updateData.wanted_subcategory_id = payload.wantedSubcategoryId || null;
    if (payload?.wantedSubSubcategoryId !== undefined)
      updateData.wanted_sub_subcategory_id =
        payload.wantedSubSubcategoryId || null;
    if (payload?.wantedDescription !== undefined)
      updateData.wanted_description =
        String(payload.wantedDescription ?? '').trim() || null;
    if (payload?.wantedMinValue !== undefined) {
      updateData.wanted_min_value = this.normalizeSwapAmount(
        payload.wantedMinValue,
        'wantedMinValue',
      );
    }
    if (payload?.wantedMaxValue !== undefined) {
      updateData.wanted_max_value = this.normalizeSwapAmount(
        payload.wantedMaxValue,
        'wantedMaxValue',
      );
    }
    if (
      updateData.wanted_min_value !== undefined ||
      updateData.wanted_max_value !== undefined
    ) {
      const minValue = Number(
        updateData.wanted_min_value ?? listing.wanted_min_value ?? 0,
      );
      const maxValue = Number(
        updateData.wanted_max_value ?? listing.wanted_max_value ?? 0,
      );
      if (
        (updateData.wanted_min_value ?? listing.wanted_min_value) !== null &&
        (updateData.wanted_max_value ?? listing.wanted_max_value) !== null &&
        maxValue < minValue
      ) {
        throw new BadRequestException(
          'wantedMaxValue must be greater than or equal to wantedMinValue',
        );
      }
    }
    if (payload?.offeredValue !== undefined) {
      updateData.offered_value = this.normalizeSwapAmount(
        payload.offeredValue,
        'offeredValue',
      );
    }
    if (payload?.isCashTopUpAllowed !== undefined) {
      updateData.is_cash_top_up_allowed = Boolean(payload.isCashTopUpAllowed);
    }
    if (payload?.expiresAt !== undefined) {
      const expiresAt = this.normalizeSwapDate(payload.expiresAt);
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
      updateData.expires_at = expiresAt;
    }
    if (!Object.keys(updateData).length) {
      return this.getExchangeListingById(listing.id, userId);
    }

    const { data: updatedListing, error: updateError } = await this.serviceClient
      .from('social_swap_listings')
      .update(updateData)
      .eq('id', listing.id)
      .select('*')
      .single();
    if (updateError || !updatedListing) {
      if (this.isSwapOfferedQuantityColumnMissing(updateError)) {
        throw new BadRequestException(
          'Exchange quantity migration is not applied. Please run migration 029 first.',
        );
      }
      throw new BadRequestException(
        `Failed to update swap listing: ${updateError?.message}`,
      );
    }

    return this.getExchangeListingById(updatedListing.id, userId);
  }

  async createSwapProposal(userId: string, listingId: string, payload: any) {
    const listing = await this.getSwapListingByIdOrThrow(listingId);
    if (listing.owner_id === userId) {
      throw new BadRequestException('Cannot propose on your own listing');
    }
    if (listing.status !== 'open') {
      throw new BadRequestException('Listing is not open for proposals');
    }
    if (listing.expires_at && new Date(listing.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('Listing is expired');
    }

    const offeredProductId = String(payload?.offeredProductId ?? '').trim();
    if (!offeredProductId) {
      throw new BadRequestException('offeredProductId is required');
    }
    const offeredQuantity = this.normalizeSwapQuantity(
      payload?.offeredQuantity,
      'offeredQuantity',
      { defaultValue: 1 },
    );
    if (offeredProductId === listing.offered_product_id) {
      throw new BadRequestException('Cannot offer the exact listing product');
    }
    await this.assertSwapProductOwnedAndActive(
      userId,
      offeredProductId,
      'offeredProduct',
      offeredQuantity,
    );

    const { data: existingActiveProposal, error: existingActiveProposalError } =
      await this.serviceClient
        .from('social_swap_proposals')
        .select('id')
        .eq('listing_id', listingId)
        .eq('proposer_id', userId)
        .in('status', ['pending', 'accepted'])
        .limit(1)
        .maybeSingle();
    if (existingActiveProposalError) {
      throw new BadRequestException(
        `Failed to validate existing proposals: ${existingActiveProposalError.message}`,
      );
    }
    if (existingActiveProposal) {
      throw new BadRequestException(
        'You already have an active proposal on this listing',
      );
    }

    const offeredValue = this.normalizeSwapAmount(
      payload?.offeredValue,
      'offeredValue',
    );
    const cashTopUp = this.normalizeSwapAmount(payload?.cashTopUp, 'cashTopUp');

    const { data: proposal, error } = await this.serviceClient
      .from('social_swap_proposals')
      .insert({
        listing_id: listingId,
        proposer_id: userId,
        offered_product_id: offeredProductId,
        offered_quantity: offeredQuantity,
        offered_value: offeredValue,
        cash_top_up: cashTopUp ?? 0,
        message: String(payload?.message ?? '').trim() || null,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error || !proposal) {
      if (this.isSwapOfferedQuantityColumnMissing(error)) {
        throw new BadRequestException(
          'Exchange quantity migration is not applied. Please run migration 029 first.',
        );
      }
      throw new BadRequestException(
        `Failed to create swap proposal: ${error?.message}`,
      );
    }

    await this.createSwapNotification(
      listing.owner_id,
      'swap_proposal_received',
      'New swap proposal',
      'You received a new swap proposal.',
      { listingId, proposalId: proposal.id },
    );

    const [mappedProposal] = await this.hydrateSwapProposals([proposal], userId);
    return mappedProposal ?? proposal;
  }

  async acceptSwapProposal(userId: string, proposalId: string) {
    const proposal = await this.getSwapProposalByIdOrThrow(proposalId);
    const listing = await this.getSwapListingByIdOrThrow(proposal.listing_id);
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('Only listing owner can accept proposals');
    }
    if (listing.status !== 'open') {
      throw new BadRequestException('Listing is not open');
    }
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Proposal is not pending');
    }

    const { data: acceptedRows, error: acceptError } = await this.serviceClient.rpc(
      'social_accept_swap_proposal_atomic',
      {
        p_listing_id: listing.id,
        p_proposal_id: proposal.id,
        p_actor_id: userId,
      },
    );
    if (acceptError) {
      throw new BadRequestException(
        `Failed to accept swap proposal: ${acceptError.message}`,
      );
    }
    const acceptedRow = Array.isArray(acceptedRows)
      ? acceptedRows[0]
      : acceptedRows;
    const transactionId = acceptedRow?.transaction_id;
    if (!transactionId) {
      throw new BadRequestException(
        'Swap proposal accepted but transaction id was not returned',
      );
    }

    await this.reconcileSwapTransactionInventory(transactionId);

    const { data: declinedProposals } = await this.serviceClient
      .from('social_swap_proposals')
      .select('id, proposer_id')
      .eq('listing_id', listing.id)
      .eq('status', 'declined')
      .neq('id', proposal.id);

    await this.createSwapNotification(
      proposal.proposer_id,
      'swap_proposal_accepted',
      'Proposal accepted',
      'Your swap proposal was accepted.',
      { listingId: listing.id, proposalId: proposal.id, transactionId },
    );

    for (const declined of declinedProposals ?? []) {
      if (!declined?.proposer_id) continue;
      await this.createSwapNotification(
        declined.proposer_id,
        'swap_proposal_declined',
        'Proposal declined',
        'Another proposal was accepted for this listing.',
        {
          listingId: listing.id,
          proposalId: declined.id,
          acceptedProposalId: proposal.id,
        },
      );
    }

    let threadId: string | null = null;
    const { data: existingThread } = await this.serviceClient
      .from('social_threads')
      .select('id')
      .eq('related_swap_transaction_id', transactionId)
      .limit(1)
      .maybeSingle();

    if (existingThread?.id) {
      threadId = existingThread.id;
    } else {
      const { data: thread, error: threadError } = await this.serviceClient
        .from('social_threads')
        .insert({
          title: listing.title,
          related_swap_listing_id: listing.id,
          related_swap_transaction_id: transactionId,
          created_by: userId,
        })
        .select('id')
        .single();
      if (threadError) {
        throw new BadRequestException(
          `Swap accepted but failed to create thread: ${threadError.message}`,
        );
      }

      threadId = thread.id;
      await this.serviceClient.from('social_thread_participants').insert([
        { thread_id: thread.id, user_id: listing.owner_id },
        { thread_id: thread.id, user_id: proposal.proposer_id },
      ]);
      await this.serviceClient.from('social_messages').insert({
        thread_id: thread.id,
        sender_id: listing.owner_id,
        message_type: 'system',
        body: 'Swap accepted. Coordinate shipment details here.',
        metadata: { transaction_id: transactionId },
      });
    }

    return {
      success: true,
      action: 'accept',
      transactionId,
      threadId,
    };
  }

  async declineSwapProposal(userId: string, proposalId: string) {
    const proposal = await this.getSwapProposalByIdOrThrow(proposalId);
    const listing = await this.getSwapListingByIdOrThrow(proposal.listing_id);
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('Only listing owner can decline proposals');
    }
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Proposal is not pending');
    }

    const { error: updateError } = await this.serviceClient
      .from('social_swap_proposals')
      .update({ status: 'declined' })
      .eq('id', proposal.id)
      .eq('status', 'pending');
    if (updateError) {
      throw new BadRequestException(
        `Failed to decline proposal: ${updateError.message}`,
      );
    }

    await this.createSwapNotification(
      proposal.proposer_id,
      'swap_proposal_declined',
      'Proposal declined',
      'Your swap proposal was declined.',
      { listingId: listing.id, proposalId: proposal.id },
    );
    return { success: true, action: 'decline', proposalId: proposal.id };
  }

  async updateSwapProposalAction(
    userId: string,
    proposalId: string,
    action: 'accept' | 'decline' | 'withdraw',
  ) {
    if (action === 'accept') {
      return this.acceptSwapProposal(userId, proposalId);
    }
    if (action === 'decline') {
      return this.declineSwapProposal(userId, proposalId);
    }
    if (action !== 'withdraw') {
      throw new BadRequestException('Invalid proposal action');
    }

    const proposal = await this.getSwapProposalByIdOrThrow(proposalId);
    if (proposal.proposer_id !== userId) {
      throw new ForbiddenException('Only proposer can withdraw this proposal');
    }
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Only pending proposal can be withdrawn');
    }

    const { error: updateError } = await this.serviceClient
      .from('social_swap_proposals')
      .update({ status: 'withdrawn' })
      .eq('id', proposal.id)
      .eq('status', 'pending');
    if (updateError) {
      throw new BadRequestException(
        `Failed to withdraw proposal: ${updateError.message}`,
      );
    }

    const listing = await this.getSwapListingByIdOrThrow(proposal.listing_id);
    await this.createSwapNotification(
      listing.owner_id,
      'swap_proposal_withdrawn',
      'Proposal withdrawn',
      'A swap proposal on your listing has been withdrawn.',
      { listingId: listing.id, proposalId: proposal.id },
    );

    return { success: true, action: 'withdraw', proposalId: proposal.id };
  }

  async listSwapTransactions(userId: string) {
    const { data: transactions, error } = await this.serviceClient
      .from('social_swap_transactions')
      .select('*')
      .or(`owner_id.eq.${userId},proposer_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    if (error) {
      throw new BadRequestException(
        `Failed to fetch swap transactions: ${error.message}`,
      );
    }

    await Promise.all(
      (transactions ?? []).map((transaction) =>
        this.syncSwapTransactionState(transaction.id, userId),
      ),
    );
    const refreshed = await Promise.all(
      (transactions ?? []).map((transaction) =>
        this.getSwapTransactionByIdOrThrow(transaction.id),
      ),
    );
    return this.hydrateSwapTransactions(refreshed, userId, false);
  }

  async getSwapTransactionById(userId: string, transactionId: string) {
    const transaction = await this.getSwapTransactionByIdOrThrow(transactionId);
    if (transaction.owner_id !== userId && transaction.proposer_id !== userId) {
      throw new ForbiddenException('You do not have access to this transaction');
    }

    await this.syncSwapTransactionState(transaction.id, userId);
    const refreshed = await this.getSwapTransactionByIdOrThrow(transaction.id);
    const [mapped] = await this.hydrateSwapTransactions([refreshed], userId, true);
    return mapped ?? null;
  }

  async setSwapTransactionAddress(
    userId: string,
    transactionId: string,
    payload: { addressId?: string },
  ) {
    const addressId = String(payload?.addressId ?? '').trim();
    if (!addressId) throw new BadRequestException('addressId is required');

    await this.runSwapTransactionAction(transactionId, userId, 'set_address', {
      address_id: addressId,
    });
    const transaction = await this.getSwapTransactionById(userId, transactionId);
    const counterpartId =
      transaction?.owner_id === userId
        ? transaction?.proposer_id
        : transaction?.owner_id;
    if (counterpartId) {
      await this.createSwapNotification(
        counterpartId,
        'swap_address_set',
        'Address updated',
        'Your swap partner updated their shipment address.',
        { transactionId },
      );
    }
    return transaction;
  }

  async addSwapShipment(
    userId: string,
    transactionId: string,
    payload: { carrier?: string; trackingNumber?: string },
  ) {
    await this.runSwapTransactionAction(transactionId, userId, 'mark_shipped', {
      carrier: String(payload?.carrier ?? '').trim() || null,
      tracking_number: String(payload?.trackingNumber ?? '').trim() || null,
    });
    const transaction = await this.getSwapTransactionById(userId, transactionId);
    const counterpartId =
      transaction?.owner_id === userId
        ? transaction?.proposer_id
        : transaction?.owner_id;
    if (counterpartId) {
      await this.createSwapNotification(
        counterpartId,
        'swap_shipped',
        'Item shipped',
        'Your swap partner has marked their item as shipped.',
        { transactionId },
      );
    }
    return transaction;
  }

  async confirmSwapDelivery(
    userId: string,
    transactionId: string,
    payload: { notes?: string },
  ) {
    await this.runSwapTransactionAction(
      transactionId,
      userId,
      'confirm_delivered',
      {
        notes: String(payload?.notes ?? '').trim() || null,
      },
    );
    const transaction = await this.getSwapTransactionById(userId, transactionId);
    const counterpartId =
      transaction?.owner_id === userId
        ? transaction?.proposer_id
        : transaction?.owner_id;
    if (counterpartId) {
      const status = String(transaction?.status ?? '');
      await this.createSwapNotification(
        counterpartId,
        status === 'inspection'
          ? 'swap_inspection_started'
          : 'swap_delivered_confirmed',
        status === 'inspection'
          ? 'Inspection window started'
          : 'Delivery confirmed',
        status === 'inspection'
          ? 'Both deliveries are confirmed. Inspection window is now active.'
          : 'Your swap partner confirmed delivery.',
        { transactionId, status },
      );
    }
    return transaction;
  }

  async openSwapDispute(
    userId: string,
    transactionId: string,
    payload: { reason?: string; details?: string },
  ) {
    const reason = String(payload?.reason ?? '').trim();
    if (!reason) throw new BadRequestException('reason is required');

    await this.runSwapTransactionAction(transactionId, userId, 'open_dispute', {
      reason,
      details: String(payload?.details ?? '').trim() || null,
    });
    const transaction = await this.getSwapTransactionById(userId, transactionId);
    const counterpartId =
      transaction?.owner_id === userId
        ? transaction?.proposer_id
        : transaction?.owner_id;
    if (counterpartId) {
      await this.createSwapNotification(
        counterpartId,
        'swap_dispute_opened',
        'Dispute opened',
        'A dispute has been opened on your swap transaction.',
        { transactionId, reason },
      );
    }
    return transaction;
  }

  async getSwapAddresses(userId: string) {
    const { data, error } = await this.serviceClient
      .from('social_swap_addresses')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    const source = `${error?.message ?? ''}`.toLowerCase();
    if (
      error &&
      source.includes('social_swap_addresses') &&
      source.includes('does not exist')
    ) {
      // Compatibility mode for environments that have not applied migration 028 yet.
      return [];
    }
    if (error) {
      throw new BadRequestException(
        `Failed to fetch swap addresses: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async createSwapAddress(userId: string, payload: any) {
    const fullName = String(payload?.fullName ?? '').trim();
    const addressLine1 = String(payload?.addressLine1 ?? '').trim();
    const city = String(payload?.city ?? '').trim();
    const country = String(payload?.country ?? '').trim() || 'United States';

    if (!fullName) throw new BadRequestException('fullName is required');
    if (!addressLine1) throw new BadRequestException('addressLine1 is required');
    if (!city) throw new BadRequestException('city is required');

    const { data: existingAddresses, error: existingError } = await this.serviceClient
      .from('social_swap_addresses')
      .select('id, is_default')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (existingError) {
      throw new BadRequestException(
        `Failed to validate existing addresses: ${existingError.message}`,
      );
    }

    const shouldBeDefault =
      Boolean(payload?.isDefault) || (existingAddresses ?? []).length === 0;
    if (shouldBeDefault) {
      await this.serviceClient
        .from('social_swap_addresses')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_active', true);
    }

    const { data, error } = await this.serviceClient
      .from('social_swap_addresses')
      .insert({
        user_id: userId,
        label: String(payload?.label ?? '').trim() || null,
        full_name: fullName,
        phone: String(payload?.phone ?? '').trim() || null,
        address_line1: addressLine1,
        address_line2: String(payload?.addressLine2 ?? '').trim() || null,
        city,
        state: String(payload?.state ?? '').trim() || null,
        postal_code: String(payload?.postalCode ?? '').trim() || null,
        country,
        is_default: shouldBeDefault,
        is_active: true,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        `Failed to create swap address: ${error?.message}`,
      );
    }
    return data;
  }

  async updateSwapAddress(userId: string, addressId: string, payload: any) {
    const { data: existing, error: existingError } = await this.serviceClient
      .from('social_swap_addresses')
      .select('*')
      .eq('id', addressId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) {
      throw new BadRequestException(
        `Failed to fetch swap address: ${existingError.message}`,
      );
    }
    if (!existing || !existing.is_active) {
      throw new NotFoundException('Swap address not found');
    }

    const updateData: Record<string, unknown> = {};
    if (payload?.label !== undefined)
      updateData.label = String(payload.label ?? '').trim() || null;
    if (payload?.fullName !== undefined) {
      const fullName = String(payload.fullName ?? '').trim();
      if (!fullName) throw new BadRequestException('fullName cannot be empty');
      updateData.full_name = fullName;
    }
    if (payload?.phone !== undefined)
      updateData.phone = String(payload.phone ?? '').trim() || null;
    if (payload?.addressLine1 !== undefined) {
      const addressLine1 = String(payload.addressLine1 ?? '').trim();
      if (!addressLine1)
        throw new BadRequestException('addressLine1 cannot be empty');
      updateData.address_line1 = addressLine1;
    }
    if (payload?.addressLine2 !== undefined)
      updateData.address_line2 = String(payload.addressLine2 ?? '').trim() || null;
    if (payload?.city !== undefined) {
      const city = String(payload.city ?? '').trim();
      if (!city) throw new BadRequestException('city cannot be empty');
      updateData.city = city;
    }
    if (payload?.state !== undefined)
      updateData.state = String(payload.state ?? '').trim() || null;
    if (payload?.postalCode !== undefined)
      updateData.postal_code = String(payload.postalCode ?? '').trim() || null;
    if (payload?.country !== undefined) {
      const country = String(payload.country ?? '').trim();
      if (!country) throw new BadRequestException('country cannot be empty');
      updateData.country = country;
    }

    const setDefault = payload?.isDefault === true;
    if (setDefault) {
      await this.serviceClient
        .from('social_swap_addresses')
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_active', true);
      updateData.is_default = true;
    } else if (payload?.isDefault === false) {
      updateData.is_default = false;
    }

    if (!Object.keys(updateData).length) return existing;

    const { data: updated, error: updateError } = await this.serviceClient
      .from('social_swap_addresses')
      .update(updateData)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updateError || !updated) {
      throw new BadRequestException(
        `Failed to update swap address: ${updateError?.message}`,
      );
    }
    return updated;
  }

  async deleteSwapAddress(userId: string, addressId: string) {
    const { data: existing, error: existingError } = await this.serviceClient
      .from('social_swap_addresses')
      .select('*')
      .eq('id', addressId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) {
      throw new BadRequestException(
        `Failed to fetch swap address: ${existingError.message}`,
      );
    }
    if (!existing || !existing.is_active) {
      throw new NotFoundException('Swap address not found');
    }

    const { error: deleteError } = await this.serviceClient
      .from('social_swap_addresses')
      .update({ is_active: false, is_default: false })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (deleteError) {
      throw new BadRequestException(
        `Failed to delete swap address: ${deleteError.message}`,
      );
    }

    if (existing.is_default) {
      const { data: nextDefault } = await this.serviceClient
        .from('social_swap_addresses')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nextDefault?.id) {
        await this.serviceClient
          .from('social_swap_addresses')
          .update({ is_default: true })
          .eq('id', nextDefault.id)
          .eq('user_id', userId);
      }
    }

    return { success: true };
  }

  async getMyExchangeManager(userId: string) {
    const [myListingsResult, myProposalsResult] = await Promise.all([
      this.serviceClient
        .from('social_swap_listings')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false }),
      this.serviceClient
        .from('social_swap_proposals')
        .select('*')
        .eq('proposer_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    if (myListingsResult.error) {
      throw new BadRequestException(
        `Failed to fetch own swap listings: ${myListingsResult.error.message}`,
      );
    }
    if (myProposalsResult.error) {
      throw new BadRequestException(
        `Failed to fetch own swap proposals: ${myProposalsResult.error.message}`,
      );
    }

    const myListingIds = Array.from(
      new Set(
        (myListingsResult.data ?? [])
          .map((listing) => listing.id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const incomingProposalsResult = myListingIds.length
      ? await this.serviceClient
          .from('social_swap_proposals')
          .select('*')
          .in('listing_id', myListingIds)
          .order('created_at', { ascending: false })
      : ({ data: [], error: null } as any);

    if (incomingProposalsResult.error) {
      throw new BadRequestException(
        `Failed to fetch incoming swap proposals: ${incomingProposalsResult.error.message}`,
      );
    }

    const proposalsById = new Map<string, any>();
    for (const proposal of [
      ...(myProposalsResult.data ?? []),
      ...(incomingProposalsResult.data ?? []),
    ]) {
      proposalsById.set(proposal.id, proposal);
    }
    const managerProposals = Array.from(proposalsById.values()).sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );

    const { data: transactions, error: transactionsError } =
      await this.serviceClient
        .from('social_swap_transactions')
        .select('*')
        .or(`owner_id.eq.${userId},proposer_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
    if (transactionsError) {
      throw new BadRequestException(
        `Failed to fetch swap transactions: ${transactionsError.message}`,
      );
    }

    await Promise.all(
      (transactions ?? []).map((transaction) =>
        this.syncSwapTransactionState(transaction.id, userId),
      ),
    );

    const refreshedTransactions = await Promise.all(
      (transactions ?? []).map((transaction) =>
        this.getSwapTransactionByIdOrThrow(transaction.id),
      ),
    );

    const proposalListingIds = Array.from(
      new Set(
        managerProposals
          .map((proposal) => proposal.listing_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const proposalListingsResult = proposalListingIds.length
      ? await this.serviceClient
          .from('social_swap_listings')
          .select('*')
          .in('id', proposalListingIds)
      : ({ data: [], error: null } as any);
    if (proposalListingsResult.error) {
      throw new BadRequestException(
        `Failed to fetch proposal listings: ${proposalListingsResult.error.message}`,
      );
    }

    const [mappedListings, mappedProposals, mappedProposalListings, mappedTransactions] =
      await Promise.all([
        this.hydrateSwapListings(myListingsResult.data ?? [], userId),
        this.hydrateSwapProposals(managerProposals, userId),
        this.hydrateSwapListings(proposalListingsResult.data ?? [], userId),
        this.hydrateSwapTransactions(refreshedTransactions, userId, false),
      ]);
    const proposalListingMap = new Map(
      mappedProposalListings.map((listing) => [listing.id as string, listing]),
    );
    const enrichedProposals = mappedProposals.map((proposal) => {
      const listing = proposalListingMap.get(proposal.listing_id) ?? null;
      return {
        ...proposal,
        listing,
        can_accept:
          Boolean(listing) &&
          listing.owner_id === userId &&
          proposal.status === 'pending',
        can_decline:
          Boolean(listing) &&
          listing.owner_id === userId &&
          proposal.status === 'pending',
        can_withdraw:
          proposal.proposer_id === userId && proposal.status === 'pending',
      };
    });

    return {
      listings: mappedListings,
      proposals: enrichedProposals,
      transactions: mappedTransactions,
      viewerUserId: userId,
      counts: {
        listings: mappedListings.length,
        proposals: enrichedProposals.length,
        transactions: mappedTransactions.length,
      },
    };
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

  async getOrCreateDirectThread(
    userId: string,
    payload: { username?: string; userId?: string },
  ) {
    const targetUserIdFromPayload = String(payload?.userId ?? '').trim();
    const targetUsername = String(payload?.username ?? '')
      .trim()
      .toLowerCase();

    let targetUserId: string | null = targetUserIdFromPayload || null;
    if (!targetUserId && targetUsername) {
      const targetProfile = await this.resolveProfileByUsername(targetUsername);
      if (!targetProfile) {
        throw new NotFoundException('User not found');
      }
      targetUserId = targetProfile.user_id;
    }

    if (!targetUserId) {
      throw new BadRequestException('username or userId is required');
    }
    if (targetUserId === userId) {
      throw new BadRequestException(
        'Cannot create direct thread with yourself',
      );
    }

    const { data: ownRows, error: ownRowsError } = await this.serviceClient
      .from('social_thread_participants')
      .select('thread_id')
      .eq('user_id', userId);
    if (ownRowsError) {
      throw new BadRequestException(
        `Failed to load participant threads: ${ownRowsError.message}`,
      );
    }

    const threadIds = Array.from(
      new Set((ownRows ?? []).map((row) => row.thread_id).filter(Boolean)),
    );

    if (threadIds.length) {
      const { data: participants, error: participantsError } =
        await this.serviceClient
          .from('social_thread_participants')
          .select('thread_id, user_id')
          .in('thread_id', threadIds);
      if (participantsError) {
        throw new BadRequestException(
          `Failed to load thread participants: ${participantsError.message}`,
        );
      }

      const participantsByThread = new Map<string, Set<string>>();
      for (const row of participants ?? []) {
        if (!participantsByThread.has(row.thread_id)) {
          participantsByThread.set(row.thread_id, new Set<string>());
        }
        participantsByThread.get(row.thread_id)?.add(row.user_id);
      }

      const existingThreadId = threadIds.find((threadId) => {
        const members = participantsByThread.get(threadId);
        if (!members) return false;
        return (
          members.size === 2 && members.has(userId) && members.has(targetUserId)
        );
      });

      if (existingThreadId) {
        return {
          threadId: existingThreadId,
          created: false,
        };
      }
    }

    const thread = await this.createThread(userId, {
      participantIds: [targetUserId],
    });

    return {
      threadId: thread.id,
      created: true,
    };
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

  async getCategoryFilters(categoryId?: string) {
    const normalizedCategoryId = String(categoryId ?? '').trim();
    if (!normalizedCategoryId || normalizedCategoryId === 'all') {
      return [];
    }

    const { data, error } = await this.serviceClient
      .from('category_filter_config')
      .select(
        'filter_key, filter_label, filter_type, data_path, options, is_required, display_order',
      )
      .eq('category_id', normalizedCategoryId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      throw new BadRequestException(
        `Failed to fetch category filters: ${error.message}`,
      );
    }

    return (data ?? []).map((row: any) => {
      const options = Array.isArray(row.options)
        ? row.options
            .map((entry: unknown) => String(entry ?? '').trim())
            .filter(Boolean)
        : [];

      return {
        key: String(row.filter_key ?? '').trim(),
        label: String(row.filter_label ?? '').trim(),
        type: String(row.filter_type ?? '').trim(),
        dataPath:
          String(row.data_path ?? '').trim() ||
          String(row.filter_key ?? '').trim(),
        options,
        isRequired: Boolean(row.is_required),
      };
    });
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
