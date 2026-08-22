import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SocialUploadService } from './social-upload.service';
import { SocialLiveProviderService } from './live-provider.service';
import { cached } from '../common/cache.util';

type FeedMode = 'all' | 'posts' | 'reels' | 'closet';
type HomeFeedSort = 'trending' | 'newest' | 'following' | 'price_low';
type ExploreFeedTab = 'all' | 'posts' | 'reels' | 'shop';
type ExploreFeedSort =
  | 'recommended'
  | 'newest'
  | 'price_low'
  | 'price_high'
  | 'most_liked';
type ProductSearchSort =
  | 'relevance'
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'most_liked'
  | 'trending';
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
  sort?: string;
  categoryId?: string;
  subcategoryId?: string;
  subSubcategoryId?: string;
  condition?: string;
  conditionValues?: string[];
  brand?: string;
  brandValues?: string[];
  size?: string;
  sizeValues?: string[];
  color?: string;
  colorValues?: string[];
  source?: string[];
  availability?: string[];
  rating?: string[];
  sellerType?: string[];
  seller?: string[];
  extras?: string[];
  location?: string;
  radius?: string;
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

type SocialSearchScope =
  | 'all'
  | 'users'
  | 'posts'
  | 'reels'
  | 'shop'
  | 'closet'
  | 'products'
  | 'exchange';

interface SocialGlobalSearchOptions {
  q?: string;
  scope?: string;
  cursor?: string;
  limit?: number;
  locale?: string;
}

interface SavedSearchPayload {
  query?: string;
  scope?: string;
  filters?: Record<string, unknown>;
}

interface SwapDisputeListOptions {
  status?: string;
  queue?: boolean;
  limit?: number;
  cursor?: string;
}

interface SwapDisputeActionPayload {
  action?: 'resolve' | 'escalate' | 'reopen';
  resolutionNotes?: string;
  priority?: string;
}

interface ExchangeListingsQueryOptions {
  q?: string;
  status?: string;
  sort?: string;
  give?: string;
  want?: string;
  value?: string;
  type?: string;
  condition?: string;
  seller?: string;
  limit?: number;
}

interface SwapDisputeMessagePayload {
  body?: string;
  isInternal?: boolean;
}

interface SwapDisputeEvidencePayload {
  fileUrl?: string;
  fileType?: string;
  note?: string;
  isInternal?: boolean;
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

interface SocialAnalyticsEventInput {
  name?: unknown;
  route?: unknown;
  action?: unknown;
  status?: unknown;
  correlationId?: unknown;
  retryable?: unknown;
  metadata?: unknown;
  occurredAt?: unknown;
}

@Injectable()
export class SocialService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly socialUploadService: SocialUploadService,
    private readonly socialLiveProviderService: SocialLiveProviderService,
  ) {}

  private readonly socialReadCache = new Map<
    string,
    { value: unknown; expiresAt: number }
  >();

  private get serviceClient() {
    return this.supabaseService.getServiceClient();
  }

  private get socialReadCacheTtlMs(): number {
    const configured = Number(process.env.SOCIAL_READ_CACHE_TTL_MS ?? 30_000);
    if (!Number.isFinite(configured) || configured <= 0) {
      return 30_000;
    }
    return Math.min(120_000, Math.floor(configured));
  }

  private readCacheKey(
    prefix: string,
    payload: Record<string, unknown>,
  ): string {
    return `${prefix}:${JSON.stringify(payload)}`;
  }

  private async getOrSetReadCache<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    // Route through the shared, memory-bounded cache (per-viewer safe: keys
    // already include userId; anonymous/bot traffic shares one entry). Short
    // TTL so new content still appears within seconds.
    return cached(`social:${key}`, this.socialReadCacheTtlMs, loader);
  }

  private normalizeLocale(locale?: string | null): string {
    const normalized = String(locale ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return 'en';
    const safe = normalized.replace(/[^a-z0-9-_]/g, '');
    return safe || 'en';
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

  private featureFlagKeys = [
    'social_exchange_managed_flow',
    'social_reels_enhanced_overlay',
    'social_messages_rich_share',
    'social_observability_tracking',
  ] as const;

  private readFeatureFlagSet(): Set<string> {
    const combined = [
      process.env.SOCIAL_FEATURE_FLAGS ?? '',
      process.env.NEXT_PUBLIC_SOCIAL_FLAGS ?? '',
    ]
      .join(',')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return new Set(combined);
  }

  private readSupportUserSet(): Set<string> {
    const merged = [
      process.env.SOCIAL_SWAP_SUPPORT_USERS ?? '',
      process.env.SOCIAL_SUPPORT_USER_IDS ?? '',
    ]
      .join(',')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return new Set(merged);
  }

  private isSupportUser(userId: string | null | undefined): boolean {
    if (!userId) return false;
    return this.readSupportUserSet().has(userId);
  }

  private sanitizeAnalyticsMetadata(value: unknown, depth = 0): unknown {
    if (depth > 4) return null;
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.slice(0, 500);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, 30)
        .map((entry) => this.sanitizeAnalyticsMetadata(entry, depth + 1));
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const [key, rawValue] of Object.entries(obj)) {
        const normalizedKey = String(key).toLowerCase();
        if (
          normalizedKey.includes('password') ||
          normalizedKey.includes('token') ||
          normalizedKey.includes('secret') ||
          normalizedKey.includes('email') ||
          normalizedKey.includes('phone')
        ) {
          sanitized[key] = '[redacted]';
          continue;
        }
        sanitized[key] = this.sanitizeAnalyticsMetadata(rawValue, depth + 1);
      }
      return sanitized;
    }
    return null;
  }

  private sanitizeAnalyticsEvent(input: SocialAnalyticsEventInput) {
    const name =
      String(input?.name ?? '')
        .trim()
        .slice(0, 120) || 'social.unknown';
    const route =
      String(input?.route ?? '')
        .trim()
        .slice(0, 500) || null;
    const action =
      String(input?.action ?? '')
        .trim()
        .slice(0, 120) || null;
    const status =
      String(input?.status ?? '')
        .trim()
        .slice(0, 32) || null;
    const correlationId =
      String(input?.correlationId ?? '')
        .trim()
        .slice(0, 120) || null;
    const retryable =
      typeof input?.retryable === 'boolean' ? input.retryable : null;

    const rawOccurredAt = String(input?.occurredAt ?? '').trim();
    const occurredAtDate = rawOccurredAt ? new Date(rawOccurredAt) : new Date();
    const occurredAt = Number.isNaN(occurredAtDate.getTime())
      ? new Date().toISOString()
      : occurredAtDate.toISOString();

    return {
      name,
      route,
      action,
      status,
      correlationId,
      retryable,
      metadata: this.sanitizeAnalyticsMetadata(input?.metadata ?? null),
      occurredAt,
    };
  }

  async getFeatureFlags() {
    const enabled = this.readFeatureFlagSet();
    const now = new Date().toISOString();
    const flags = Object.fromEntries(
      this.featureFlagKeys.map((key) => [
        key,
        {
          key,
          enabled: enabled.has(key),
          source: enabled.has(key) ? 'env' : 'default',
          updatedAt: now,
        },
      ]),
    );
    return { flags };
  }

  async getSummary(userId: string | null | undefined) {
    const [liveResult, notificationResult, threadResult] = await Promise.all([
      this.serviceClient
        .from('social_live_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'live'),
      userId
        ? this.serviceClient
            .from('social_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false)
        : Promise.resolve({ count: 0, error: null } as any),
      userId ? this.getThreads(userId) : Promise.resolve([]),
    ]);

    if (liveResult.error) {
      throw new BadRequestException(
        `Failed to fetch live summary count: ${liveResult.error.message}`,
      );
    }
    if (notificationResult?.error) {
      throw new BadRequestException(
        `Failed to fetch notification summary count: ${notificationResult.error.message}`,
      );
    }

    const messagesUnread = Array.isArray(threadResult)
      ? threadResult.reduce(
          (total, thread) => total + Number(thread?.unread_count ?? 0),
          0,
        )
      : 0;

    return {
      generated_at: new Date().toISOString(),
      live_now: Number(liveResult.count ?? 0),
      notifications_unread: Number(notificationResult?.count ?? 0),
      messages_unread: messagesUnread,
    };
  }

  async ingestAnalyticsEvents(
    userId: string | null,
    payload: { events?: unknown[] } | null | undefined,
  ) {
    const sourceEvents = Array.isArray(payload?.events) ? payload.events : [];
    const limitedEvents = sourceEvents.slice(0, 200);
    const sanitizedEvents = limitedEvents.map((entry) =>
      this.sanitizeAnalyticsEvent((entry ?? {}) as SocialAnalyticsEventInput),
    );

    if (!sanitizedEvents.length) {
      return { accepted: 0, dropped: sourceEvents.length };
    }

    const rows = sanitizedEvents.map((event) => ({
      user_id: userId,
      event_name: event.name,
      route: event.route,
      action: event.action,
      status: event.status,
      correlation_id: event.correlationId,
      retryable: event.retryable,
      metadata: event.metadata,
      occurred_at: event.occurredAt,
    }));

    const { error } = await this.serviceClient
      .from('social_analytics_events')
      .insert(rows);

    if (error) {
      const missingTable = String(error.message ?? '')
        .toLowerCase()
        .includes('social_analytics_events');
      if (!missingTable) {
        console.warn(`[social-analytics] insert failed: ${error.message}`);
      }
      return {
        accepted: sanitizedEvents.length,
        dropped: sourceEvents.length - sanitizedEvents.length,
      };
    }

    return {
      accepted: sanitizedEvents.length,
      dropped: sourceEvents.length - sanitizedEvents.length,
    };
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

  private sanitizeExploreSort(value?: string | null): ExploreFeedSort {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (normalized === 'newest' || normalized === 'latest') return 'newest';
    if (normalized === 'price_low') return 'price_low';
    if (normalized === 'price_high') return 'price_high';
    if (normalized === 'most_liked' || normalized === 'liked') {
      return 'most_liked';
    }
    return 'recommended';
  }

  private normalizeCategoryFilter(value?: string | null): string | null {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!normalized || normalized === 'all') return null;
    return normalized;
  }

  private parseExplorePriceBound(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  private getExploreItemTimestampMs(item: any): number {
    const contentType = this.normalizeContentType(item?.content_type);
    const source =
      contentType === 'post'
        ? (item?.post?.created_at ?? item?.created_at)
        : contentType === 'reel'
          ? (item?.reel?.created_at ?? item?.created_at)
          : (item?.product?.created_at ?? item?.created_at);
    return this.parseTimestampMs(source);
  }

  private getExploreItemLikes(item: any): number {
    const contentType = this.normalizeContentType(item?.content_type);
    if (contentType === 'post') {
      return Number(
        item?.post?.reactions_count ?? item?.post?.likes_count ?? 0,
      );
    }
    if (contentType === 'reel') {
      return Number(item?.reel?.likes_count ?? 0);
    }
    return Number(item?.product?.likes_count ?? 0);
  }

  private getExploreItemPrice(item: any): number | null {
    if (this.normalizeContentType(item?.content_type) !== 'product') {
      return null;
    }
    const parsed = Number(item?.product?.price);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  private getExploreItemCategory(item: any): string | null {
    if (this.normalizeContentType(item?.content_type) !== 'product') {
      return null;
    }
    const category = String(
      item?.product?.category ??
        item?.product?.subcategory ??
        item?.product?.sub_subcategory ??
        '',
    )
      .trim()
      .toLowerCase();
    return category || null;
  }

  private applyExploreItemFiltersAndSort(
    items: any[],
    options: {
      tab: ExploreFeedTab;
      sort: ExploreFeedSort;
      category: string | null;
      priceMin: number | null;
      priceMax: number | null;
    },
  ): any[] {
    const supportsProductFiltering =
      options.tab === 'all' || options.tab === 'shop';
    const hasProductFilters =
      supportsProductFiltering &&
      (options.category !== null ||
        options.priceMin !== null ||
        options.priceMax !== null);

    let filtered = items;
    if (hasProductFilters) {
      filtered = filtered.filter((item) => {
        if (this.normalizeContentType(item?.content_type) !== 'product') {
          return false;
        }

        const category = this.getExploreItemCategory(item);
        if (options.category !== null && category !== options.category) {
          return false;
        }

        const price = this.getExploreItemPrice(item);
        if (price === null) return false;
        if (options.priceMin !== null && price < options.priceMin) {
          return false;
        }
        if (options.priceMax !== null && price > options.priceMax) {
          return false;
        }
        return true;
      });
    }

    if (
      supportsProductFiltering &&
      (options.sort === 'price_low' || options.sort === 'price_high')
    ) {
      filtered = filtered.filter(
        (item) => this.normalizeContentType(item?.content_type) === 'product',
      );
    }

    if (options.sort === 'recommended') {
      return filtered;
    }

    const sorted = [...filtered];
    if (options.sort === 'newest') {
      sorted.sort(
        (left, right) =>
          this.getExploreItemTimestampMs(right) -
          this.getExploreItemTimestampMs(left),
      );
      return sorted;
    }

    if (options.sort === 'most_liked') {
      sorted.sort((left, right) => {
        const likeDiff =
          this.getExploreItemLikes(right) - this.getExploreItemLikes(left);
        if (likeDiff !== 0) return likeDiff;
        return (
          this.getExploreItemTimestampMs(right) -
          this.getExploreItemTimestampMs(left)
        );
      });
      return sorted;
    }

    if (options.sort === 'price_low' || options.sort === 'price_high') {
      sorted.sort((left, right) => {
        const leftPrice =
          this.getExploreItemPrice(left) ?? Number.POSITIVE_INFINITY;
        const rightPrice =
          this.getExploreItemPrice(right) ?? Number.POSITIVE_INFINITY;
        if (leftPrice !== rightPrice) {
          return options.sort === 'price_low'
            ? leftPrice - rightPrice
            : rightPrice - leftPrice;
        }
        return (
          this.getExploreItemTimestampMs(right) -
          this.getExploreItemTimestampMs(left)
        );
      });
      return sorted;
    }

    return sorted;
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

  private async getReelTaggedProductIdsMap(reelIds: string[]) {
    const uniqueIds = Array.from(new Set(reelIds.filter(Boolean)));
    const map = new Map<string, string[]>();
    if (!uniqueIds.length) return map;

    const { data, error } = await this.serviceClient
      .from('social_content_product_tags')
      .select('content_id, product_id')
      .eq('content_type', 'reel')
      .in('content_id', uniqueIds);

    if (error) {
      throw new BadRequestException(
        `Failed to load reel tagged products: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      const reelId = String(row.content_id ?? '').trim();
      const productId = String(row.product_id ?? '').trim();
      if (!reelId || !productId) continue;
      if (!map.has(reelId)) map.set(reelId, []);
      const existing = map.get(reelId)!;
      if (!existing.includes(productId)) {
        existing.push(productId);
      }
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
    taggedProductsMap: Map<string, string[]> = new Map(),
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
        tagged_product_ids: taggedProductsMap.get(reel.id) ?? [],
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
        rating_avg: sellerProfile?.rating_avg ?? null,
        seller_reputation: sellerProfile?.seller_reputation ?? null,
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
        compare_at_price:
          product.compare_at_price != null
            ? Number(product.compare_at_price)
            : null,
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
    const [
      profiles,
      mediaMap,
      engagement,
      commentsPreviewMap,
      followingSet,
      taggedProductsMap,
    ] = await Promise.all([
      this.getProfilesMap(userIds),
      this.getReelMediaMap(reelIds),
      this.getViewerEngagementSets(viewerUserId ?? null, 'reel', reelIds),
      this.getCommentsPreviewMap('reel', reelIds, viewerUserId ?? null, 2),
      this.getFollowingSetForViewer(viewerUserId ?? null, userIds),
      this.getReelTaggedProductIdsMap(reelIds),
    ]);
    return this.mapReels(
      reelRows,
      profiles,
      mediaMap,
      engagement.liked,
      engagement.saved,
      commentsPreviewMap,
      followingSet,
      taggedProductsMap,
    );
  }

  private sanitizeHomeFeedSort(sort?: string | null): HomeFeedSort {
    const normalized = String(sort ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (normalized === 'newest') return 'newest';
    if (normalized === 'following') return 'following';
    if (normalized === 'price_low' || normalized === 'price:low') {
      return 'price_low';
    }
    return 'trending';
  }

  async getCachedFeed(
    mode: FeedMode,
    userId?: string | null,
    limitValue?: string | number,
    cursor?: string,
    locale?: string,
    sort?: string | null,
  ) {
    const safeLocale = this.normalizeLocale(locale);
    const safeMode: FeedMode = ['all', 'posts', 'reels', 'closet'].includes(
      mode,
    )
      ? mode
      : 'all';
    const safeSort = this.sanitizeHomeFeedSort(sort);
    const key = this.readCacheKey('social:feed', {
      mode: safeMode,
      sort: safeSort,
      userId: userId ?? null,
      limit: String(limitValue ?? ''),
      cursor: cursor ?? null,
      locale: safeLocale,
    });

    return this.getOrSetReadCache(key, async () => {
      try {
        const data = await this.getFeed(
          safeMode,
          userId ?? null,
          limitValue,
          cursor,
          safeSort,
        );
        return { ...data, locale: safeLocale };
      } catch {
        return {
          mode: safeMode,
          sort: safeSort,
          locale: safeLocale,
          userId: userId ?? null,
          posts: [],
          reels: [],
          closet: [],
          nextCursor: null,
          status: 'error',
          message: 'Feed is temporarily unavailable.',
          retryable: true,
        };
      }
    });
  }

  async getFeed(
    mode: FeedMode,
    userId?: string | null,
    limitValue?: string | number,
    cursor?: string,
    sortValue?: string | null,
  ) {
    const limit = this.sanitizeLimit(limitValue, 20, 40);
    const safeMode: FeedMode = ['all', 'posts', 'reels', 'closet'].includes(
      mode,
    )
      ? mode
      : 'all';
    const safeSort = this.sanitizeHomeFeedSort(sortValue);

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
        sort: safeSort,
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
        sort: safeSort,
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
        sort: safeSort,
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
    if (safeSort === 'trending') {
      const rankingErrors: string[] = [];
      const v2Ranking = await this.serviceClient.rpc(
        'social_home_feed_ranked',
        {
          p_user_id: userId ?? null,
          p_limit: limit,
          p_cursor_score: allCursor?.score ?? null,
          p_cursor_created_at: allCursor?.createdAt ?? null,
          p_cursor_content_type: allCursor?.contentType ?? null,
          p_cursor_content_id: allCursor?.id ?? null,
        },
      );

      if (!v2Ranking.error) {
        rawRankedFeed = v2Ranking.data ?? [];
      } else {
        const v2ErrorMessage = String(
          v2Ranking.error.message ?? 'unknown error',
        );
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
    } else {
      rawRankedFeed = await this.getHomeFeedRowsFallback(
        limit,
        userId ?? null,
        allCursor?.createdAt ?? null,
      );
    }

    let rankedFeed = this.rebalanceHomeFeedRows(rawRankedFeed ?? [], limit);

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

    if (safeSort !== 'trending') {
      const postMeta = new Map(
        posts.map((row: any) => [
          row.id,
          { created_at: row.created_at, user_id: row.user_id, price: null },
        ]),
      );
      const reelMeta = new Map(
        reels.map((row: any) => [
          row.id,
          { created_at: row.created_at, user_id: row.user_id, price: null },
        ]),
      );
      const productMeta = new Map(
        products.map((row: any) => [
          row.id,
          {
            created_at: row.created_at,
            user_id: row.user_id,
            price: Number(row.price ?? 0),
          },
        ]),
      );

      if (safeSort === 'following' && userId) {
        const { data: followRows } = await this.serviceClient
          .from('social_follows')
          .select('following_id')
          .eq('follower_id', userId);
        const following = new Set<string>([
          userId,
          ...(followRows ?? [])
            .map((row: any) => row.following_id)
            .filter((value: string | null | undefined): value is string =>
              Boolean(value),
            ),
        ]);
        rankedFeed = rankedFeed.filter((row: any) => {
          const meta =
            row.content_type === 'post'
              ? postMeta.get(row.content_id)
              : row.content_type === 'reel'
                ? reelMeta.get(row.content_id)
                : productMeta.get(row.content_id);
          return meta ? following.has(meta.user_id) : false;
        });
      }

      if (safeSort === 'price_low') {
        rankedFeed = [
          ...rankedFeed.filter((row: any) => row.content_type === 'product'),
          ...rankedFeed.filter((row: any) => row.content_type !== 'product'),
        ].sort((left: any, right: any) => {
          if (
            left.content_type === 'product' &&
            right.content_type === 'product'
          ) {
            const leftMeta = productMeta.get(left.content_id);
            const rightMeta = productMeta.get(right.content_id);
            return Number(leftMeta?.price ?? 0) - Number(rightMeta?.price ?? 0);
          }
          if (left.content_type === 'product') return -1;
          if (right.content_type === 'product') return 1;
          const leftTs = new Date(
            (left.content_type === 'post'
              ? postMeta.get(left.content_id)?.created_at
              : reelMeta.get(left.content_id)?.created_at) ?? 0,
          ).getTime();
          const rightTs = new Date(
            (right.content_type === 'post'
              ? postMeta.get(right.content_id)?.created_at
              : reelMeta.get(right.content_id)?.created_at) ?? 0,
          ).getTime();
          return rightTs - leftTs;
        });
      } else if (safeSort === 'newest' || safeSort === 'following') {
        rankedFeed = rankedFeed.sort((left: any, right: any) => {
          const leftMeta =
            left.content_type === 'post'
              ? postMeta.get(left.content_id)
              : left.content_type === 'reel'
                ? reelMeta.get(left.content_id)
                : productMeta.get(left.content_id);
          const rightMeta =
            right.content_type === 'post'
              ? postMeta.get(right.content_id)
              : right.content_type === 'reel'
                ? reelMeta.get(right.content_id)
                : productMeta.get(right.content_id);
          const leftTs = new Date(String(leftMeta?.created_at ?? 0)).getTime();
          const rightTs = new Date(
            String(rightMeta?.created_at ?? 0),
          ).getTime();
          return rightTs - leftTs;
        });
      }
    }
    const lastRow = (rawRankedFeed ?? [])[
      Math.max(0, (rawRankedFeed ?? []).length - 1)
    ];
    return {
      mode: safeMode,
      sort: safeSort,
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
    sortValue?: string | null,
    categoryValue?: string | null,
    priceMinValue?: string | number | null,
    priceMaxValue?: string | number | null,
  ) {
    const tab = this.sanitizeExploreTab(tabValue);
    const limit = this.sanitizeLimit(limitValue, 20, 40);
    const fetchLimit = Math.min(limit * 4, 120);
    const searchTerm = this.sanitizeSearchTerm(q);
    const searchQuery = searchTerm || null;
    const sort = this.sanitizeExploreSort(sortValue);
    const categoryFilter = this.normalizeCategoryFilter(categoryValue);
    const priceMin = this.parseExplorePriceBound(priceMinValue);
    const priceMax = this.parseExplorePriceBound(priceMaxValue);
    const supportsProductFiltering = tab === 'all' || tab === 'shop';
    const hasProductFilters =
      supportsProductFiltering &&
      (categoryFilter !== null || priceMin !== null || priceMax !== null);
    const canUseCursor = sort === 'recommended' && !hasProductFilters;

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
      const rankedCursor = canUseCursor ? this.parseRankedCursor(cursor) : null;
      const { data: ranked, error } = await this.serviceClient.rpc(
        'social_posts_ranked',
        {
          p_user_id: userId ?? null,
          p_query: searchQuery,
          p_limit: canUseCursor ? limit : fetchLimit,
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
      const items = this.applyExploreItemFiltersAndSort(
        toItems(rows, posts, [], []),
        {
          tab,
          sort,
          category: categoryFilter,
          priceMin,
          priceMax,
        },
      ).slice(0, limit);
      const last = rows[Math.max(0, rows.length - 1)];

      return {
        tab,
        userId: userId ?? null,
        items,
        nextCursor:
          canUseCursor && last
            ? this.buildRankedCursor({
                score: Number(last.score),
                createdAt: last.created_at,
                id: String(last.post_id ?? last.content_id),
              })
            : null,
      };
    }

    if (tab === 'reels') {
      const rankedCursor = canUseCursor ? this.parseRankedCursor(cursor) : null;
      const { data: ranked, error } = await this.serviceClient.rpc(
        'social_reels_ranked',
        {
          p_user_id: userId ?? null,
          p_limit: canUseCursor ? limit : fetchLimit,
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
      const items = this.applyExploreItemFiltersAndSort(
        toItems(rows, [], reels, []),
        {
          tab,
          sort,
          category: categoryFilter,
          priceMin,
          priceMax,
        },
      ).slice(0, limit);
      const last = rows[Math.max(0, rows.length - 1)];

      return {
        tab,
        userId: userId ?? null,
        items,
        nextCursor:
          canUseCursor && last
            ? this.buildRankedCursor({
                score: Number(last.score),
                createdAt: last.created_at,
                id: String(last.reel_id ?? last.content_id),
              })
            : null,
      };
    }

    if (tab === 'shop') {
      const rankedCursor = canUseCursor ? this.parseRankedCursor(cursor) : null;
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
          p_min_price: priceMin,
          p_max_price: priceMax,
          p_radius_km: null,
          p_user_lat: null,
          p_user_lng: null,
          p_limit: canUseCursor ? limit : fetchLimit,
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
      const items = this.applyExploreItemFiltersAndSort(
        toItems(rows, [], [], products),
        {
          tab,
          sort,
          category: categoryFilter,
          priceMin,
          priceMax,
        },
      ).slice(0, limit);
      const last = rows[Math.max(0, rows.length - 1)];

      return {
        tab,
        userId: userId ?? null,
        items,
        nextCursor:
          canUseCursor && last
            ? this.buildRankedCursor({
                score: Number(last.score),
                createdAt: last.created_at,
                id: String(last.product_id ?? last.content_id),
              })
            : null,
      };
    }

    const allCursor = canUseCursor ? this.parseFeedCursor(cursor) : null;
    const { data: ranked, error } = await this.serviceClient.rpc(
      'social_explore_feed_ranked',
      {
        p_user_id: userId ?? null,
        p_query: searchQuery,
        p_limit: canUseCursor ? limit : fetchLimit,
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

    const items = this.applyExploreItemFiltersAndSort(
      toItems(rows, posts, reels, products),
      {
        tab,
        sort,
        category: categoryFilter,
        priceMin,
        priceMax,
      },
    ).slice(0, limit);
    const lastRow = rows[Math.max(0, rows.length - 1)];
    return {
      tab,
      userId: userId ?? null,
      items,
      nextCursor:
        canUseCursor && lastRow
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

  async getCachedExplore(userId?: string | null, locale?: string) {
    const safeLocale = this.normalizeLocale(locale);
    const key = this.readCacheKey('social:explore', {
      userId: userId ?? null,
      locale: safeLocale,
    });
    return this.getOrSetReadCache(key, async () => {
      try {
        const data = await this.getExplore(userId ?? null);
        return { ...data, locale: safeLocale };
      } catch {
        return {
          topReels: [],
          trendingProducts: [],
          topSellers: [],
          locale: safeLocale,
          status: 'error',
          message: 'Explore data is temporarily unavailable.',
          retryable: true,
        };
      }
    });
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

  private normalizeLiveStatus(
    value?: string | null,
  ): 'scheduled' | 'live' | 'ended' | null {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    if (
      normalized === 'scheduled' ||
      normalized === 'live' ||
      normalized === 'ended'
    ) {
      return normalized;
    }
    return null;
  }

  private isLiveReplayExpired(session: Record<string, any>): boolean {
    if (session.status !== 'ended') return false;
    const expiresRaw = String(session.replay_expires_at ?? '').trim();
    if (!expiresRaw) return false;
    const expiresAt = new Date(expiresRaw).getTime();
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt <= Date.now();
  }

  private async getLiveSessionOrThrow(sessionId: string) {
    const { data: session, error: sessionError } = await this.serviceClient
      .from('social_live_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) {
      throw new BadRequestException(
        `Failed to fetch live session: ${sessionError.message}`,
      );
    }
    if (!session) {
      throw new NotFoundException('Live session not found');
    }
    return session;
  }

  private async assertLiveSessionStatus(sessionId: string, expected: 'live') {
    const session = await this.getLiveSessionOrThrow(sessionId);
    if (session.status !== expected) {
      throw new BadRequestException(
        `Live session must be ${expected} to perform this action`,
      );
    }
    if (this.isLiveReplayExpired(session)) {
      throw new NotFoundException('Live replay expired');
    }
    return session;
  }

  private async getActiveViewerCounts(sessionIds: string[]) {
    const normalizedIds = Array.from(
      new Set(
        sessionIds.map((value) => String(value ?? '').trim()).filter(Boolean),
      ),
    );
    const counters = new Map<string, number>();
    normalizedIds.forEach((id) => counters.set(id, 0));

    if (!normalizedIds.length) {
      return counters;
    }

    const cutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await this.serviceClient
      .from('social_live_viewers')
      .select('session_id')
      .in('session_id', normalizedIds)
      .is('left_at', null)
      .gte('last_seen_at', cutoffIso);
    if (error) {
      throw new BadRequestException(
        `Failed to fetch active live viewers: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      const key = String(row.session_id ?? '').trim();
      if (!key) continue;
      counters.set(key, Number(counters.get(key) ?? 0) + 1);
    }
    return counters;
  }

  private async syncLiveViewerCount(sessionId: string): Promise<number> {
    const counts = await this.getActiveViewerCounts([sessionId]);
    const active = Number(counts.get(sessionId) ?? 0);
    const { error } = await this.serviceClient
      .from('social_live_sessions')
      .update({ viewer_count: active })
      .eq('id', sessionId);
    if (error) {
      throw new BadRequestException(
        `Failed to sync live viewer count: ${error.message}`,
      );
    }
    return active;
  }

  private serializeLiveSession(
    session: Record<string, any>,
    profile:
      | {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        }
      | undefined,
    viewerUserId: string | null | undefined,
    viewerCountActive: number,
  ) {
    const hasReplayExpired = this.isLiveReplayExpired(session);
    const replayUrl = hasReplayExpired ? null : (session.replay_url ?? null);
    const playbackHlsUrl = hasReplayExpired
      ? null
      : (session.playback_hls_url ?? session.playback_url ?? null);
    return {
      id: session.id,
      host_id: session.host_id,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      title: session.title,
      topic: session.topic,
      cover_image_url: session.cover_image_url,
      cover_media_path: session.cover_media_path ?? null,
      status: session.status,
      provider: session.provider ?? 'livekit',
      provider_room_id: session.provider_room_id ?? null,
      playback_hls_url: playbackHlsUrl,
      playback_url: playbackHlsUrl,
      replay_url: replayUrl,
      replay_expires_at: session.replay_expires_at ?? null,
      viewer_count: Number(session.viewer_count ?? viewerCountActive ?? 0),
      viewer_count_active: Number(viewerCountActive ?? 0),
      started_at: session.started_at,
      ended_at: session.ended_at,
      status_changed_at: session.status_changed_at ?? null,
      created_at: session.created_at,
      updated_at: session.updated_at,
      is_host: Boolean(viewerUserId) && session.host_id === viewerUserId,
    };
  }

  async getLiveSessions(
    viewerUserId?: string | null,
    status?: string,
    limitValue?: string | number,
  ) {
    const limit = this.sanitizeLimit(limitValue, 20, 60);
    const normalizedStatus = this.normalizeLiveStatus(status);

    let query = this.serviceClient
      .from('social_live_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (normalizedStatus) {
      query = query.eq('status', normalizedStatus);
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(
        `Failed to fetch live sessions: ${error.message}`,
      );
    }

    const rows = (data ?? []).filter((row) => !this.isLiveReplayExpired(row));
    const profiles = await this.getProfilesMap(rows.map((row) => row.host_id));
    const viewerCounts = await this.getActiveViewerCounts(
      rows.map((row) => row.id),
    );

    return rows.map((row) => {
      const profile = profiles.get(row.host_id);
      const viewerCountActive = Number(viewerCounts.get(row.id) ?? 0);
      return this.serializeLiveSession(
        row,
        profile,
        viewerUserId,
        viewerCountActive,
      );
    });
  }

  async getLiveSessionDetail(
    viewerUserId: string | null,
    sessionId: string,
    messageLimitValue?: string | number,
  ) {
    const session = await this.getLiveSessionOrThrow(sessionId);
    if (this.isLiveReplayExpired(session)) {
      throw new NotFoundException('Live replay expired');
    }

    const profiles = await this.getProfilesMap([session.host_id]);
    const hostProfile = profiles.get(session.host_id);

    const { data: pinnedRows, error: pinnedError } = await this.serviceClient
      .from('social_live_products')
      .select('product_id, pinned_at, position')
      .eq('session_id', sessionId)
      .order('position', { ascending: true })
      .order('pinned_at', { ascending: false });
    if (pinnedError) {
      throw new BadRequestException(
        `Failed to fetch live products: ${pinnedError.message}`,
      );
    }

    const pinned = pinnedRows ?? [];
    const productIds = pinned.map((row) => row.product_id);
    const productsRaw = await this.fetchProductsByIds(productIds);
    const products = await this.enrichProducts(productsRaw, viewerUserId);
    const productsMap = new Map(products.map((item) => [item.id, item]));
    const pinnedProducts = pinned
      .map((row) => productsMap.get(row.product_id))
      .filter(Boolean);

    const messageLimit = this.sanitizeLimit(messageLimitValue, 30, 100);
    const { data: messageRows, error: messageError } = await this.serviceClient
      .from('social_live_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(messageLimit);
    if (messageError) {
      throw new BadRequestException(
        `Failed to fetch live messages: ${messageError.message}`,
      );
    }

    const messagesRaw = messageRows ?? [];
    const messageUsers = await this.getProfilesMap(
      messagesRaw.map((row) => row.user_id),
    );
    const messages = messagesRaw
      .slice()
      .reverse()
      .map((row) => {
        const user = messageUsers.get(row.user_id);
        return {
          id: row.id,
          session_id: row.session_id,
          user_id: row.user_id,
          username: user?.username ?? null,
          display_name: user?.display_name ?? null,
          avatar_url: user?.avatar_url ?? null,
          body: row.body,
          created_at: row.created_at,
        };
      });

    const viewerCountActive = await this.syncLiveViewerCount(session.id);

    return {
      session: this.serializeLiveSession(
        session,
        hostProfile,
        viewerUserId,
        viewerCountActive,
      ),
      pinnedProducts,
      messages,
    };
  }

  async createLiveSession(userId: string, payload: any) {
    const title = String(payload?.title ?? '').trim();
    if (!title) {
      throw new BadRequestException('Live session title is required');
    }
    const topic = String(payload?.topic ?? '').trim() || null;
    const coverImageUrl = String(payload?.coverImageUrl ?? '').trim() || null;
    const coverMediaPath =
      String(
        payload?.coverMediaPath ?? payload?.cover_media_path ?? '',
      ).trim() || null;
    const playbackUrl =
      String(payload?.playbackUrl ?? payload?.playbackHlsUrl ?? '').trim() ||
      null;
    const provider = 'livekit';
    const nowIso = new Date().toISOString();

    const { data, error } = await this.serviceClient
      .from('social_live_sessions')
      .insert({
        host_id: userId,
        title,
        topic,
        cover_image_url: coverImageUrl,
        cover_media_path: coverMediaPath,
        provider,
        playback_url: playbackUrl,
        playback_hls_url: playbackUrl,
        status: 'scheduled',
        status_changed_at: nowIso,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        `Failed to create live session: ${error?.message}`,
      );
    }

    return this.getLiveSessionDetail(userId, data.id);
  }

  async uploadLiveCover(
    userId: string,
    sessionId: string,
    file: Express.Multer.File | undefined,
  ) {
    const session = await this.getLiveSessionOrThrow(sessionId);
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can update live cover');
    }

    const uploaded = await this.socialUploadService.uploadMedia(
      userId,
      file,
      'live_cover',
    );

    const { error } = await this.serviceClient
      .from('social_live_sessions')
      .update({
        cover_image_url: uploaded.url,
        cover_media_path: uploaded.path,
      })
      .eq('id', sessionId);
    if (error) {
      throw new BadRequestException(
        `Failed to update live cover: ${error.message}`,
      );
    }

    return {
      cover_image_url: uploaded.url,
      cover_media_path: uploaded.path,
      session: await this.getLiveSessionDetail(userId, sessionId),
    };
  }

  async goLiveSession(
    userId: string,
    sessionId: string,
    payload: { playbackUrl?: string; playbackHlsUrl?: string } = {},
  ) {
    const session = await this.getLiveSessionOrThrow(sessionId);
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can start this session');
    }
    if (session.status === 'ended') {
      throw new BadRequestException('Ended live sessions cannot be restarted');
    }

    const room = this.socialLiveProviderService.createRoom({
      sessionId,
      hostId: userId,
      title: String(session.title ?? 'Live session'),
    });
    const nowIso = new Date().toISOString();
    const playbackHlsUrl =
      String(payload?.playbackHlsUrl ?? '').trim() ||
      String(payload?.playbackUrl ?? '').trim() ||
      String(session.playback_hls_url ?? session.playback_url ?? '').trim() ||
      null;

    const { error } = await this.serviceClient
      .from('social_live_sessions')
      .update({
        status: 'live',
        provider: room.provider,
        provider_room_id: room.providerRoomId,
        playback_hls_url: playbackHlsUrl,
        playback_url: playbackHlsUrl,
        started_at: session.started_at ?? nowIso,
        ended_at: null,
        replay_url: null,
        replay_expires_at: null,
        status_changed_at: nowIso,
      })
      .eq('id', sessionId);
    if (error) {
      throw new BadRequestException(
        `Failed to start live session: ${error.message}`,
      );
    }

    const detail = await this.getLiveSessionDetail(userId, sessionId);
    return {
      ...detail,
      live_access: {
        provider: room.provider,
        provider_room_id: room.providerRoomId,
        host_token: room.hostToken,
        viewer_join_url: room.viewerJoinUrl,
      },
    };
  }

  async startLiveSession(userId: string, sessionId: string, payload: any) {
    return this.goLiveSession(userId, sessionId, payload ?? {});
  }

  async endLiveSession(userId: string, sessionId: string) {
    const session = await this.getLiveSessionOrThrow(sessionId);
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can end this session');
    }
    if (session.status === 'scheduled') {
      throw new BadRequestException(
        'Session must be live before it can be ended',
      );
    }
    if (session.status === 'ended') {
      return this.getLiveSessionDetail(userId, sessionId);
    }

    const nowIso = new Date().toISOString();
    const replayExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();
    if (session.provider_room_id) {
      this.socialLiveProviderService.endRoom(session.provider_room_id);
    }

    const { error: updateError } = await this.serviceClient
      .from('social_live_sessions')
      .update({
        status: 'ended',
        ended_at: nowIso,
        replay_expires_at: replayExpiresAt,
        replay_url:
          String(session.replay_url ?? '').trim() ||
          String(
            session.playback_hls_url ?? session.playback_url ?? '',
          ).trim() ||
          null,
        status_changed_at: nowIso,
        viewer_count: 0,
      })
      .eq('id', sessionId);
    if (updateError) {
      throw new BadRequestException(
        `Failed to end live session: ${updateError?.message}`,
      );
    }

    const { error: presenceError } = await this.serviceClient
      .from('social_live_viewers')
      .update({
        left_at: nowIso,
        last_seen_at: nowIso,
      })
      .eq('session_id', sessionId)
      .is('left_at', null);
    if (presenceError) {
      throw new BadRequestException(
        `Failed to close live presence: ${presenceError.message}`,
      );
    }

    return this.getLiveSessionDetail(userId, sessionId);
  }

  async joinLiveSession(userId: string, sessionId: string) {
    await this.assertLiveSessionStatus(sessionId, 'live');
    const nowIso = new Date().toISOString();

    const { error: updateError } = await this.serviceClient
      .from('social_live_viewers')
      .upsert(
        {
          session_id: sessionId,
          user_id: userId,
          joined_at: nowIso,
          last_seen_at: nowIso,
          left_at: null,
        },
        {
          onConflict: 'session_id,user_id',
        },
      );
    if (updateError) {
      throw new BadRequestException(
        `Failed to join live session: ${updateError.message}`,
      );
    }

    const viewerCountActive = await this.syncLiveViewerCount(sessionId);
    return {
      joined: true,
      viewer_count: viewerCountActive,
      viewer_count_active: viewerCountActive,
    };
  }

  async heartbeatLivePresence(userId: string, sessionId: string) {
    await this.assertLiveSessionStatus(sessionId, 'live');
    const nowIso = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await this.serviceClient
      .from('social_live_viewers')
      .update({
        last_seen_at: nowIso,
        left_at: null,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('session_id')
      .limit(1);
    if (updateError) {
      throw new BadRequestException(
        `Failed to refresh live presence: ${updateError.message}`,
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await this.serviceClient
        .from('social_live_viewers')
        .insert({
          session_id: sessionId,
          user_id: userId,
          joined_at: nowIso,
          last_seen_at: nowIso,
          left_at: null,
        });
      if (insertError) {
        throw new BadRequestException(
          `Failed to initialize live presence: ${insertError.message}`,
        );
      }
    }

    const viewerCountActive = await this.syncLiveViewerCount(sessionId);
    return {
      heartbeat: true,
      viewer_count: viewerCountActive,
      viewer_count_active: viewerCountActive,
    };
  }

  async leaveLiveSession(userId: string, sessionId: string) {
    await this.getLiveSessionOrThrow(sessionId);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await this.serviceClient
      .from('social_live_viewers')
      .update({
        left_at: nowIso,
        last_seen_at: nowIso,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .is('left_at', null);
    if (updateError) {
      throw new BadRequestException(
        `Failed to leave live session: ${updateError.message}`,
      );
    }

    const viewerCountActive = await this.syncLiveViewerCount(sessionId);
    return {
      left: true,
      viewer_count: viewerCountActive,
      viewer_count_active: viewerCountActive,
    };
  }

  async getLiveViewerToken(userId: string, sessionId: string) {
    const session = await this.assertLiveSessionStatus(sessionId, 'live');
    const providerRoomId =
      String(session.provider_room_id ?? '').trim() || `live-${session.id}`;
    const viewerToken = this.socialLiveProviderService.createViewerToken(
      sessionId,
      userId,
      providerRoomId,
    );
    const presence = await this.heartbeatLivePresence(userId, sessionId);

    return {
      session_id: sessionId,
      provider: viewerToken.provider,
      provider_room_id: providerRoomId,
      viewer_token: viewerToken.viewerToken,
      viewer_join_url: viewerToken.viewerJoinUrl,
      viewer_count: presence.viewer_count,
      viewer_count_active: presence.viewer_count_active,
    };
  }

  async createLiveMessage(
    userId: string,
    sessionId: string,
    payload: { body?: string },
  ) {
    const body = String(payload?.body ?? '').trim();
    if (!body) {
      throw new BadRequestException('Message body is required');
    }
    if (body.length > 500) {
      throw new BadRequestException('Message body exceeds 500 characters');
    }

    await this.assertLiveSessionStatus(sessionId, 'live');

    const recentThreshold = new Date(Date.now() - 30 * 1000).toISOString();
    const { count: recentCount, error: throttleError } =
      await this.serviceClient
        .from('social_live_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .gte('created_at', recentThreshold);
    if (throttleError) {
      throw new BadRequestException(
        `Failed to verify live message throttle: ${throttleError.message}`,
      );
    }
    if (Number(recentCount ?? 0) >= 8) {
      throw new BadRequestException(
        'You are sending messages too quickly. Please wait a moment.',
      );
    }

    const { data, error } = await this.serviceClient
      .from('social_live_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        body,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(
        `Failed to send live message: ${error?.message}`,
      );
    }

    const profiles = await this.getProfilesMap([userId]);
    const profile = profiles.get(userId);
    return {
      id: data.id,
      session_id: data.session_id,
      user_id: data.user_id,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      body: data.body,
      created_at: data.created_at,
    };
  }

  async createLiveReaction(
    userId: string,
    sessionId: string,
    payload: { emoji?: string },
  ) {
    const emoji = String(payload?.emoji ?? '').trim();
    if (!emoji) {
      throw new BadRequestException('Reaction emoji is required');
    }
    if (emoji.length > 16) {
      throw new BadRequestException('Reaction emoji is invalid');
    }

    await this.assertLiveSessionStatus(sessionId, 'live');

    const recentThreshold = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentCount, error: throttleError } =
      await this.serviceClient
        .from('social_live_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .gte('created_at', recentThreshold);
    if (throttleError) {
      throw new BadRequestException(
        `Failed to verify live reaction throttle: ${throttleError.message}`,
      );
    }
    if (Number(recentCount ?? 0) >= 20) {
      throw new BadRequestException(
        'You are sending reactions too quickly. Please wait a moment.',
      );
    }

    const { error } = await this.serviceClient
      .from('social_live_reactions')
      .insert({
        session_id: sessionId,
        user_id: userId,
        emoji,
      });
    if (error) {
      throw new BadRequestException(
        `Failed to send live reaction: ${error.message}`,
      );
    }
    return { success: true };
  }

  async pinLiveProduct(userId: string, sessionId: string, productId: string) {
    const normalizedProductId = String(productId ?? '').trim();
    if (!normalizedProductId) {
      throw new BadRequestException('Product id is required');
    }
    const { data: session, error: sessionError } = await this.serviceClient
      .from('social_live_sessions')
      .select('host_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) {
      throw new BadRequestException(
        `Failed to fetch live session: ${sessionError.message}`,
      );
    }
    if (!session) {
      throw new NotFoundException('Live session not found');
    }
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can pin products');
    }
    const { data: product, error: productError } = await this.serviceClient
      .from('social_products')
      .select('id, seller_id, status')
      .eq('id', normalizedProductId)
      .maybeSingle();
    if (productError) {
      throw new BadRequestException(
        `Failed to validate product for pinning: ${productError.message}`,
      );
    }
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.seller_id !== userId) {
      throw new ForbiddenException('Only host-owned products can be pinned');
    }
    const status = String(product.status ?? 'active')
      .trim()
      .toLowerCase();
    if (
      status === 'deleted' ||
      status === 'archived' ||
      status === 'inactive'
    ) {
      throw new BadRequestException('Only active products can be pinned');
    }

    const { error } = await this.serviceClient
      .from('social_live_products')
      .upsert(
        {
          session_id: sessionId,
          product_id: normalizedProductId,
          pinned_at: new Date().toISOString(),
        },
        {
          onConflict: 'session_id,product_id',
        },
      );
    if (error) {
      throw new BadRequestException(`Failed to pin product: ${error.message}`);
    }

    return { success: true };
  }

  async unpinLiveProduct(userId: string, sessionId: string, productId: string) {
    const normalizedProductId = String(productId ?? '').trim();
    if (!normalizedProductId) {
      throw new BadRequestException('Product id is required');
    }
    const { data: session, error: sessionError } = await this.serviceClient
      .from('social_live_sessions')
      .select('host_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) {
      throw new BadRequestException(
        `Failed to fetch live session: ${sessionError.message}`,
      );
    }
    if (!session) {
      throw new NotFoundException('Live session not found');
    }
    if (session.host_id !== userId) {
      throw new ForbiddenException('Only the host can unpin products');
    }

    const { error } = await this.serviceClient
      .from('social_live_products')
      .delete()
      .eq('session_id', sessionId)
      .eq('product_id', normalizedProductId);
    if (error) {
      throw new BadRequestException(
        `Failed to unpin product: ${error.message}`,
      );
    }

    return { success: true };
  }

  async handleLiveProviderWebhook(
    webhookSecret: string | undefined,
    payload: Record<string, unknown>,
  ) {
    const expectedSecret = String(
      process.env.SOCIAL_LIVE_WEBHOOK_SECRET ?? '',
    ).trim();
    if (expectedSecret && webhookSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid live provider webhook secret');
    }

    const parsed =
      this.socialLiveProviderService.handleRecordingWebhook(payload);
    if (!parsed.handled) {
      return { success: false, handled: false };
    }

    let sessionId = String(parsed.sessionId ?? '').trim();
    if (!sessionId && parsed.providerRoomId) {
      const { data: sessionByRoom, error } = await this.serviceClient
        .from('social_live_sessions')
        .select('id')
        .eq('provider_room_id', parsed.providerRoomId)
        .maybeSingle();
      if (error) {
        throw new BadRequestException(
          `Failed to resolve live session by provider room: ${error.message}`,
        );
      }
      sessionId = String(sessionByRoom?.id ?? '').trim();
    }

    if (!sessionId) {
      return { success: false, handled: true, reason: 'session_not_found' };
    }

    const { data: session, error: sessionError } = await this.serviceClient
      .from('social_live_sessions')
      .select('id, ended_at, replay_expires_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) {
      throw new BadRequestException(
        `Failed to fetch webhook live session: ${sessionError.message}`,
      );
    }
    if (!session) {
      return { success: false, handled: true, reason: 'session_not_found' };
    }

    const replayExpiresAt =
      session.replay_expires_at ??
      (session.ended_at
        ? new Date(
            new Date(session.ended_at).getTime() + 24 * 60 * 60 * 1000,
          ).toISOString()
        : null);
    const { error: updateError } = await this.serviceClient
      .from('social_live_sessions')
      .update({
        replay_url: parsed.replayUrl ?? null,
        replay_expires_at: replayExpiresAt,
        playback_hls_url: parsed.playbackHlsUrl ?? null,
        playback_url: parsed.playbackHlsUrl ?? null,
      })
      .eq('id', sessionId);
    if (updateError) {
      throw new BadRequestException(
        `Failed to update live replay webhook payload: ${updateError.message}`,
      );
    }

    return {
      success: true,
      handled: true,
      session_id: sessionId,
      event_type: parsed.eventType ?? null,
      replay_url: parsed.replayUrl ?? null,
      playback_hls_url: parsed.playbackHlsUrl ?? null,
    };
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

  private normalizeProductSearchSort(sort?: string | null): ProductSearchSort {
    const normalized = String(sort ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'newest') return 'newest';
    if (normalized === 'price_asc' || normalized === 'price-low')
      return 'price_asc';
    if (normalized === 'price_desc' || normalized === 'price-high')
      return 'price_desc';
    if (normalized === 'most_liked' || normalized === 'most-liked')
      return 'most_liked';
    if (normalized === 'trending') return 'trending';
    return 'relevance';
  }

  private normalizeToken(value?: string | null): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  private normalizeTokenList(values?: string[] | null): string[] {
    if (!Array.isArray(values)) return [];
    return Array.from(
      new Set(
        values.map((entry) => this.normalizeToken(entry)).filter(Boolean),
      ),
    );
  }

  private normalizeConditionToken(value?: string | null): string {
    const normalized = this.normalizeToken(value).replace(/[_-]+/g, ' ');
    if (!normalized) return 'good';
    if (normalized.includes('new') && !normalized.includes('like'))
      return 'new';
    if (normalized.includes('like')) return 'like-new';
    if (normalized.includes('very')) return 'very-good';
    if (normalized.includes('fair')) return 'fair';
    if (normalized.includes('part')) return 'parts';
    return 'good';
  }

  private getOriginalPrice(product: any): number | null {
    const details = Array.isArray(product?.additional_details)
      ? product.additional_details
      : [];
    for (const detail of details) {
      const key = this.normalizeToken(detail?.key);
      if (
        !key.includes('original') &&
        !key.includes('retail') &&
        !key.includes('msrp')
      ) {
        continue;
      }
      const parsed = Number(String(detail?.value ?? '').replace(/[^\d.]/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  }

  private inferSellerRating(product: any): number {
    const profileRating = Number(product?.rating_avg ?? 0);
    if (Number.isFinite(profileRating) && profileRating > 0) {
      return Math.max(1, Math.min(5, profileRating));
    }
    const likes = Number(product?.likes_count ?? 0);
    const followers = Number(product?.followers_count ?? 0);
    if (followers >= 1500 || likes >= 500) return 5;
    if (followers >= 450 || likes >= 120) return 4.5;
    if (followers >= 120 || likes >= 30) return 4;
    if (followers >= 30 || likes >= 8) return 3.5;
    return 3;
  }

  private applyExtendedProductSearchFilters(
    products: any[],
    options: ProductSearchOptions | undefined,
    followingSet: Set<string>,
  ): any[] {
    const sourceSet = new Set(this.normalizeTokenList(options?.source));
    const availabilitySet = new Set(
      this.normalizeTokenList(options?.availability),
    );
    const ratingSet = new Set(this.normalizeTokenList(options?.rating));
    const sellerTypeSet = new Set(this.normalizeTokenList(options?.sellerType));
    const sellerSet = new Set(this.normalizeTokenList(options?.seller));
    const extrasSet = new Set(this.normalizeTokenList(options?.extras));
    const conditionSet = new Set(
      this.normalizeTokenList(options?.conditionValues).map((entry) =>
        this.normalizeConditionToken(entry),
      ),
    );
    const brandSet = new Set(this.normalizeTokenList(options?.brandValues));
    const sizeSet = new Set(this.normalizeTokenList(options?.sizeValues));
    const colorSet = new Set(this.normalizeTokenList(options?.colorValues));
    const locationNeedle = this.normalizeToken(options?.location);

    return products.filter((product) => {
      const available = Number(
        product?.available_quantity ?? product?.quantity ?? 0,
      );
      const price = Number(product?.price ?? 0);
      const conditionToken = this.normalizeConditionToken(product?.condition);
      const brandToken = this.normalizeToken(product?.brand);
      const sizeToken = this.normalizeToken(product?.size);
      const colorToken = this.normalizeToken(product?.color);
      const sourceToken = this.normalizeToken(product?.source_type);
      const sellerId = String(product?.user_id ?? '').trim();
      const followers = Number(product?.followers_count ?? 0);
      const sellerReputation = Number(product?.seller_reputation ?? 0);
      const rating = this.inferSellerRating(product);
      const handlingTimeDays = Number(product?.handling_time_days ?? 99);
      const shippingCost = Number(product?.shipping_cost ?? 0);
      const isExchangeable = Boolean(
        product?.is_exchangeable ?? product?.allow_offers,
      );
      const originalPrice = this.getOriginalPrice(product);
      const hasPriceDrop =
        typeof originalPrice === 'number' && originalPrice > price;
      const hasFlashSale =
        hasPriceDrop && originalPrice > 0
          ? ((originalPrice - price) / originalPrice) * 100 >= 25
          : false;

      if (conditionSet.size && !conditionSet.has(conditionToken)) return false;
      if (brandSet.size && !brandSet.has(brandToken)) return false;
      if (
        sizeSet.size &&
        !Array.from(sizeSet).some((token) => sizeToken.includes(token))
      ) {
        return false;
      }
      if (
        colorSet.size &&
        !Array.from(colorSet).some((token) => colorToken.includes(token))
      ) {
        return false;
      }
      if (sourceSet.size && !sourceSet.has(sourceToken)) return false;

      if (
        availabilitySet.size &&
        !Array.from(availabilitySet).every((token) => {
          if (token === 'in_stock') return available > 0;
          if (token === 'offers') return isExchangeable;
          if (token === 'flash_sale') return hasFlashSale;
          if (token === 'ships_today') return handlingTimeDays <= 1;
          return true;
        })
      ) {
        return false;
      }

      if (ratingSet.size) {
        const matchesAny = Array.from(ratingSet).some((token) => {
          if (token === '5') return rating >= 4.95;
          if (token === '4') return rating >= 4;
          if (token === '3') return rating >= 3;
          return true;
        });
        if (!matchesAny) return false;
      }

      if (
        sellerTypeSet.size &&
        !Array.from(sellerTypeSet).every((token) => {
          if (token === 'verified') return sellerReputation >= 85;
          if (token === 'top') return followers >= 500;
          if (token === 'following')
            return sellerId ? followingSet.has(sellerId) : false;
          if (token === 'new') return followers < 50;
          return true;
        })
      ) {
        return false;
      }

      if (
        sellerSet.size &&
        !Array.from(sellerSet).every((token) => {
          if (token === 'following')
            return sellerId ? followingSet.has(sellerId) : false;
          if (token === 'verified') return sellerReputation >= 85;
          if (token === 'top') return followers >= 500;
          if (token === 'rating45') return rating >= 4.5;
          if (token === 'offers') return isExchangeable;
          if (token === 'fastship') return handlingTimeDays <= 1;
          return true;
        })
      ) {
        return false;
      }

      if (
        extrasSet.size &&
        !Array.from(extrasSet).every((token) => {
          if (token === 'photos')
            return Array.isArray(product?.social_product_media)
              ? product.social_product_media.length > 0
              : false;
          if (token === 'available') return available > 0;
          if (token === 'free_shipping') return shippingCost <= 0;
          if (token === 'price_drop') return hasPriceDrop;
          if (token === 'added_today') {
            const createdAt = new Date(product?.created_at ?? '');
            if (Number.isNaN(createdAt.getTime())) return false;
            return Date.now() - createdAt.getTime() <= 24 * 60 * 60 * 1000;
          }
          return true;
        })
      ) {
        return false;
      }

      if (locationNeedle) {
        const haystack = [
          String(product?.city ?? ''),
          String(product?.country ?? ''),
          String(product?.shipping_info ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(locationNeedle)) {
          return false;
        }
      }

      return true;
    });
  }

  private sortProductSearchResults(
    products: any[],
    sortMode: ProductSearchSort,
  ): any[] {
    if (sortMode === 'relevance') return products;
    const sorted = [...products];
    if (sortMode === 'newest') {
      sorted.sort((left, right) => {
        const leftDate = new Date(left?.created_at ?? '').getTime();
        const rightDate = new Date(right?.created_at ?? '').getTime();
        return (
          (Number.isFinite(rightDate) ? rightDate : 0) -
          (Number.isFinite(leftDate) ? leftDate : 0)
        );
      });
      return sorted;
    }
    if (sortMode === 'price_asc') {
      sorted.sort(
        (left, right) => Number(left?.price ?? 0) - Number(right?.price ?? 0),
      );
      return sorted;
    }
    if (sortMode === 'price_desc') {
      sorted.sort(
        (left, right) => Number(right?.price ?? 0) - Number(left?.price ?? 0),
      );
      return sorted;
    }
    if (sortMode === 'most_liked') {
      sorted.sort(
        (left, right) =>
          Number(right?.likes_count ?? 0) - Number(left?.likes_count ?? 0),
      );
      return sorted;
    }
    if (sortMode === 'trending') {
      const score = (product: any) =>
        Number(product?.likes_count ?? 0) * 3 +
        Number(product?.comment_count ?? 0) * 2 +
        Number(product?.share_count ?? product?.shares_count ?? 0) * 2 +
        Number(product?.views_count ?? 0) * 0.08;
      sorted.sort((left, right) => score(right) - score(left));
      return sorted;
    }
    return sorted;
  }

  private async productSearch(
    listingType: ListingType | null,
    userId?: string | null,
    options?: ProductSearchOptions,
  ) {
    const limit = this.sanitizeLimit(options?.limit, 20, 120);
    const sortMode = this.normalizeProductSearchSort(options?.sort);
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
    const ordered = ids
      .map((id: string) => map.get(id))
      .filter((entry): entry is any => Boolean(entry));
    const followingSet = await this.getFollowingSetForViewer(
      userId ?? null,
      ordered.map((item) => String(item?.user_id ?? '')),
    );
    const filtered = this.applyExtendedProductSearchFilters(
      ordered,
      options,
      followingSet,
    );
    const sorted = this.sortProductSearchResults(filtered, sortMode);
    const paged = sorted.slice(0, limit);
    const last = (ranked ?? [])[Math.max(0, (ranked ?? []).length - 1)];
    return {
      results: paged,
      nextCursor:
        sortMode === 'relevance' && paged.length === ordered.length && last
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

  async getCachedShopSearch(
    userId: string | null | undefined,
    options?: ProductSearchOptions & { locale?: string },
  ) {
    const safeLocale = this.normalizeLocale(options?.locale);
    const key = this.readCacheKey('social:shop-search', {
      userId: userId ?? null,
      locale: safeLocale,
      options: options ?? null,
    });
    return this.getOrSetReadCache(key, async () => {
      try {
        const data = await this.getShopSearch(userId ?? null, options);
        return { ...data, locale: safeLocale };
      } catch {
        return {
          results: [],
          nextCursor: null,
          locale: safeLocale,
          status: 'error',
          message: 'Shop results are temporarily unavailable.',
          retryable: true,
        };
      }
    });
  }

  async getCachedClosetSearch(
    userId: string | null | undefined,
    options?: ProductSearchOptions & { locale?: string },
  ) {
    const safeLocale = this.normalizeLocale(options?.locale);
    const key = this.readCacheKey('social:closet-search', {
      userId: userId ?? null,
      locale: safeLocale,
      options: options ?? null,
    });
    return this.getOrSetReadCache(key, async () => {
      try {
        const data = await this.getClosetSearch(userId ?? null, options);
        return { ...data, locale: safeLocale };
      } catch {
        return {
          results: [],
          nextCursor: null,
          locale: safeLocale,
          status: 'error',
          message: 'Closet results are temporarily unavailable.',
          retryable: true,
        };
      }
    });
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

  private normalizeGlobalSearchScope(scope?: string): SocialSearchScope {
    const normalized = String(scope ?? '')
      .trim()
      .toLowerCase();
    const allowed: SocialSearchScope[] = [
      'all',
      'users',
      'posts',
      'reels',
      'shop',
      'closet',
      'products',
      'exchange',
    ];
    if (!normalized) return 'all';
    return allowed.includes(normalized as SocialSearchScope)
      ? (normalized as SocialSearchScope)
      : 'all';
  }

  async searchGlobal(
    viewerUserId: string | null | undefined,
    options?: SocialGlobalSearchOptions,
  ) {
    const query = this.sanitizeSearchTerm(options?.q) ?? '';
    const scope = this.normalizeGlobalSearchScope(options?.scope);
    const limit = this.sanitizeLimit(options?.limit, 24, 60);
    const locale = this.normalizeLocale(options?.locale);
    const perGroup =
      scope === 'all' ? Math.max(4, Math.ceil(limit / 6)) : limit;

    const groups: Array<{
      key: SocialSearchScope;
      status: 'ok' | 'empty' | 'error';
      items: unknown[];
      nextCursor: string | null;
      message?: string;
    }> = [];

    const include = (group: SocialSearchScope) =>
      scope === 'all' || scope === group;

    if (include('users')) {
      try {
        const users = await this.searchUsers(viewerUserId, {
          q: query,
          limit: perGroup,
          cursor: options?.cursor,
        });
        groups.push({
          key: 'users',
          status: users.items.length ? 'ok' : 'empty',
          items: users.items,
          nextCursor: users.nextCursor ?? null,
        });
      } catch (error) {
        groups.push({
          key: 'users',
          status: 'error',
          items: [],
          nextCursor: null,
          message:
            error instanceof Error ? error.message : 'Unable to load users',
        });
      }
    }

    const hydrateContent = async (
      contentType: 'posts' | 'reels',
      table: 'social_posts' | 'social_reels',
      selectFields: string,
      queryField: string,
    ) => {
      if (!include(contentType)) return;
      try {
        let builder = this.serviceClient
          .from(table)
          .select(selectFields)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(perGroup);
        if (query) {
          builder = builder.ilike(queryField, `%${query}%`);
        }
        const { data, error } = await builder;
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        const enriched =
          contentType === 'posts'
            ? await this.enrichPosts(rows, viewerUserId ?? null)
            : await this.enrichReels(rows, viewerUserId ?? null);
        groups.push({
          key: contentType,
          status: enriched.length ? 'ok' : 'empty',
          items: enriched,
          nextCursor: null,
        });
      } catch (error) {
        groups.push({
          key: contentType,
          status: 'error',
          items: [],
          nextCursor: null,
          message:
            error instanceof Error
              ? error.message
              : `Unable to load ${contentType}`,
        });
      }
    };

    await hydrateContent(
      'posts',
      'social_posts',
      'id, user_id, caption, hashtags, created_at, reactions_count, comments_count, saves_count, shares_count, is_comments_enabled',
      'caption',
    );
    await hydrateContent(
      'reels',
      'social_reels',
      'id, user_id, caption, reel_url, thumbnail_url, category, views_count, likes_count, comments_count, saves_count, shares_count, created_at, status',
      'caption',
    );

    const appendProductsGroup = async (
      groupKey: 'products' | 'shop' | 'closet',
      listingType: ListingType | null,
    ) => {
      if (!include(groupKey)) return;
      try {
        const ranked = await this.fetchProductsRankedWithCompatibility(
          {
            p_user_id: viewerUserId ?? null,
            p_query: query || null,
            p_listing_type: listingType,
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
            p_limit: perGroup,
            p_cursor_score: null,
            p_cursor_created_at: null,
            p_cursor_id: null,
          },
          'Failed to search products',
        );
        const ids = (ranked ?? []).map((row: any) => row.product_id);
        const rows = await this.fetchProductsByIds(ids);
        const enriched = await this.enrichProducts(rows, viewerUserId ?? null);
        const map = new Map(enriched.map((item) => [item.id, item]));
        const ordered = ids.map((id: string) => map.get(id)).filter(Boolean);
        groups.push({
          key: groupKey,
          status: ordered.length ? 'ok' : 'empty',
          items: ordered,
          nextCursor: null,
        });
      } catch (error) {
        groups.push({
          key: groupKey,
          status: 'error',
          items: [],
          nextCursor: null,
          message:
            error instanceof Error ? error.message : 'Unable to load products',
        });
      }
    };

    await appendProductsGroup('products', null);
    await appendProductsGroup('shop', 'shop');
    await appendProductsGroup('closet', 'closet');

    if (include('exchange')) {
      try {
        let listingsQuery = this.serviceClient
          .from('social_swap_listings')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(perGroup);
        if (query) {
          listingsQuery = listingsQuery.or(
            `title.ilike.%${query}%,description.ilike.%${query}%`,
          );
        }
        const { data: listingRows, error: listingError } = await listingsQuery;
        if (listingError) throw new Error(listingError.message);
        const hydrated = await this.hydrateSwapListings(
          (listingRows ?? []).filter((listing) => {
            if (!listing.expires_at) return true;
            const expiresMs = new Date(String(listing.expires_at)).getTime();
            return Number.isNaN(expiresMs) || expiresMs > Date.now();
          }),
          viewerUserId ?? null,
        );
        groups.push({
          key: 'exchange',
          status: hydrated.length ? 'ok' : 'empty',
          items: hydrated,
          nextCursor: null,
        });
      } catch (error) {
        groups.push({
          key: 'exchange',
          status: 'error',
          items: [],
          nextCursor: null,
          message:
            error instanceof Error ? error.message : 'Unable to load exchange',
        });
      }
    }

    const hasData = groups.some((group) => group.items.length > 0);
    return {
      query,
      scope,
      locale,
      groups,
      nextCursor: null,
      status: hasData ? 'ok' : 'empty',
      retryable: groups.some((group) => group.status === 'error'),
    };
  }

  async getSavedSearches(userId: string) {
    const { data, error } = await this.serviceClient
      .from('social_saved_searches')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    const source = `${error?.message ?? ''}`.toLowerCase();
    if (
      error &&
      source.includes('social_saved_searches') &&
      source.includes('does not exist')
    ) {
      return [];
    }
    if (error) {
      throw new BadRequestException(
        `Failed to load saved searches: ${error.message}`,
      );
    }
    return data ?? [];
  }

  async createSavedSearch(userId: string, payload: SavedSearchPayload) {
    const query = String(payload?.query ?? '').trim();
    if (!query) {
      throw new BadRequestException('query is required');
    }
    const scope = this.normalizeGlobalSearchScope(payload?.scope);
    const filters =
      payload?.filters && typeof payload.filters === 'object'
        ? payload.filters
        : null;

    const nowIso = new Date().toISOString();
    const { data: existing } = await this.serviceClient
      .from('social_saved_searches')
      .select('*')
      .eq('user_id', userId)
      .eq('scope', scope)
      .ilike('query', query)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { data: updated, error: updateError } = await this.serviceClient
        .from('social_saved_searches')
        .update({
          query,
          filters,
          last_used_at: nowIso,
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select('*')
        .single();
      if (updateError || !updated) {
        throw new BadRequestException(
          `Failed to update saved search: ${updateError?.message}`,
        );
      }
      return updated;
    }

    const { data, error } = await this.serviceClient
      .from('social_saved_searches')
      .insert({
        user_id: userId,
        query,
        scope,
        filters,
        last_used_at: nowIso,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new BadRequestException(
        `Failed to create saved search: ${error?.message}`,
      );
    }

    return data;
  }

  async deleteSavedSearch(userId: string, searchId: string) {
    const { data, error } = await this.serviceClient
      .from('social_saved_searches')
      .delete()
      .eq('id', searchId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to delete saved search: ${error.message}`,
      );
    }
    if (!data?.id) {
      throw new NotFoundException('Saved search not found');
    }
    return { success: true, id: data.id };
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
        currency: payload.currency ?? 'TRY',
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
    if (payload.slug !== undefined) {
      const nextSlug = this.slugifyText(payload.slug) || '';
      if (!nextSlug) {
        throw new BadRequestException('Slug cannot be empty');
      }
      if (nextSlug !== existing.slug) {
        const { data: slugClash } = await this.serviceClient
          .from('social_products')
          .select('id')
          .eq('seller_id', userId)
          .eq('slug', nextSlug)
          .neq('id', productId)
          .maybeSingle();
        if (slugClash) {
          throw new BadRequestException(
            'A product with this slug already exists in your catalog.',
          );
        }
      }
      updateData.slug = nextSlug;
    }
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
      updateData.currency = payload.currency ?? 'TRY';
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

  // ---------------------------------------------------------------------------
  // Catalog imports (ownership-based): import the user's OWN wholesale / retail
  // products into their social catalog. Distinct from importRetailProduct above,
  // which imports delivered retail order items the user purchased.
  // ---------------------------------------------------------------------------

  /**
   * Lists the user's own wholesale products (via their approved wholesale brand)
   * that can be catalog-imported into social. Each item is flagged with whether
   * it has already been imported.
   */
  async getImportableWholesaleCatalog(userId: string) {
    const { data: wholesaleBrand } = await this.serviceClient
      .from('wholesale_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();

    if (!wholesaleBrand) {
      return { products: [], hasWholesaleBrand: false };
    }

    const { data: products, error } = await this.serviceClient
      .from('wholesale_products')
      .select('id, name, slug, wholesale_price, status, category_id')
      .eq('wholesale_brand_id', wholesaleBrand.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Failed to load wholesale products: ${error.message}`,
      );
    }

    const productIds = (products || []).map((p) => p.id);
    if (productIds.length === 0) {
      return { products: [], hasWholesaleBrand: true };
    }

    const [packsRes, imagesRes, importedRes] = await Promise.all([
      this.serviceClient
        .from('wholesale_product_pack_sizes')
        .select('id, product_id, label, quantity, pack_price, unit_price')
        .in('product_id', productIds)
        .order('display_order', { ascending: true }),
      this.serviceClient
        .from('wholesale_product_images')
        .select('product_id, image_url, is_primary, display_order')
        .in('product_id', productIds)
        .order('display_order', { ascending: true }),
      this.serviceClient
        .from('social_products')
        .select('id, slug, source_wholesale_product_id')
        .eq('seller_id', userId)
        .in('source_wholesale_product_id', productIds),
    ]);

    const packsByProduct = new Map<string, any[]>();
    (packsRes.data || []).forEach((pack) => {
      const list = packsByProduct.get(pack.product_id) || [];
      list.push({
        id: pack.id,
        label: pack.label,
        quantity: pack.quantity,
        packPrice: pack.pack_price,
        unitPrice:
          pack.unit_price ??
          (pack.quantity ? Number(pack.pack_price) / pack.quantity : null),
      });
      packsByProduct.set(pack.product_id, list);
    });

    const imageByProduct = new Map<string, string>();
    (imagesRes.data || []).forEach((img) => {
      if (!imageByProduct.has(img.product_id) || img.is_primary) {
        imageByProduct.set(img.product_id, img.image_url);
      }
    });

    const importedByProduct = new Map<string, { id: string; slug: string }>();
    (importedRes.data || []).forEach((sp) => {
      if (sp.source_wholesale_product_id) {
        importedByProduct.set(sp.source_wholesale_product_id, {
          id: sp.id,
          slug: sp.slug,
        });
      }
    });

    const result = (products || []).map((p) => {
      const packs = packsByProduct.get(p.id) || [];
      const imported = importedByProduct.get(p.id) || null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        wholesalePrice: p.wholesale_price,
        status: p.status,
        hasCategory: !!p.category_id,
        primaryImage: imageByProduct.get(p.id) || null,
        packSizes: packs,
        hasPacks: packs.length > 0,
        alreadyImported: !!imported,
        importedSocialProduct: imported,
      };
    });

    return { products: result, hasWholesaleBrand: true };
  }

  /**
   * Lists the user's own retail products (via their approved retail brand) that
   * can be catalog-imported into social.
   */
  async getImportableRetailCatalog(userId: string) {
    const { data: retailBrand } = await this.serviceClient
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();

    if (!retailBrand) {
      return { products: [], hasRetailBrand: false };
    }

    const { data: products, error } = await this.serviceClient
      .from('retail_products')
      .select(
        'id, name, slug, cost_price, retail_price, stock_quantity, status, category_id',
      )
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Failed to load retail products: ${error.message}`,
      );
    }

    const productIds = (products || []).map((p) => p.id);
    if (productIds.length === 0) {
      return { products: [], hasRetailBrand: true };
    }

    const [imagesRes, importedRes] = await Promise.all([
      this.serviceClient
        .from('retail_product_images')
        .select('product_id, image_url, is_primary, display_order')
        .in('product_id', productIds)
        .order('display_order', { ascending: true }),
      this.serviceClient
        .from('social_products')
        .select('id, slug, source_retail_product_id')
        .eq('seller_id', userId)
        .in('source_retail_product_id', productIds),
    ]);

    const imageByProduct = new Map<string, string>();
    (imagesRes.data || []).forEach((img) => {
      if (!imageByProduct.has(img.product_id) || img.is_primary) {
        imageByProduct.set(img.product_id, img.image_url);
      }
    });

    const importedByProduct = new Map<string, { id: string; slug: string }>();
    (importedRes.data || []).forEach((sp) => {
      if (sp.source_retail_product_id) {
        importedByProduct.set(sp.source_retail_product_id, {
          id: sp.id,
          slug: sp.slug,
        });
      }
    });

    const result = (products || []).map((p) => {
      const imported = importedByProduct.get(p.id) || null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        costPrice: p.cost_price,
        retailPrice: p.retail_price,
        stockQuantity: p.stock_quantity,
        status: p.status,
        hasCategory: !!p.category_id,
        primaryImage: imageByProduct.get(p.id) || null,
        alreadyImported: !!imported,
        importedSocialProduct: imported,
      };
    });

    return { products: result, hasRetailBrand: true };
  }

  /**
   * Builds a slug unique to this seller (social_products has UNIQUE(seller_id, slug)).
   */
  private async buildUniqueSocialSlug(
    userId: string,
    base: string,
  ): Promise<string> {
    const slug = this.resolveProductSlug(undefined, base);
    const { data: clash } = await this.serviceClient
      .from('social_products')
      .select('id')
      .eq('seller_id', userId)
      .eq('slug', slug)
      .maybeSingle();
    if (!clash) return slug;
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${slug}-${suffix}`;
  }

  private async copyImagesToSocialMedia(
    socialProductId: string,
    images: Array<{
      image_url: string;
      display_order?: number | null;
      is_primary?: boolean | null;
    }>,
  ) {
    if (!images || images.length === 0) return;
    const rows = images.map((img, index) => ({
      product_id: socialProductId,
      media_url: img.image_url,
      media_type: 'image',
      display_order: img.display_order ?? index,
      is_primary: img.is_primary ?? index === 0,
    }));
    const { error } = await this.serviceClient
      .from('social_product_media')
      .insert(rows);
    if (error) {
      console.error('Failed to copy media on catalog import:', error);
    }
  }

  /**
   * Imports one of the user's own wholesale products into their social catalog.
   * Pack-based products import in whole packs (quantity = packs * pack size);
   * non-pack products import a chosen quantity. The chosen price must be at
   * least the per-unit cost.
   */
  async importWholesaleProduct(userId: string, payload: any) {
    await this.ensureSocialProfile(userId);

    const { data: wholesaleBrand } = await this.serviceClient
      .from('wholesale_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();
    if (!wholesaleBrand) {
      throw new BadRequestException(
        'You need an approved wholesale brand to import wholesale products.',
      );
    }

    const wholesaleProductId = payload?.wholesaleProductId;
    if (!wholesaleProductId) {
      throw new BadRequestException('wholesaleProductId is required');
    }

    const { data: product, error: productError } = await this.serviceClient
      .from('wholesale_products')
      .select('*')
      .eq('id', wholesaleProductId)
      .is('deleted_at', null)
      .maybeSingle();
    if (productError) throw new BadRequestException(productError.message);
    if (!product) throw new NotFoundException('Wholesale product not found.');
    if (product.wholesale_brand_id !== wholesaleBrand.id) {
      throw new BadRequestException(
        'You can only import products from your own wholesale brand.',
      );
    }
    if (!product.category_id) {
      throw new BadRequestException(
        'This wholesale product has no category and cannot be imported.',
      );
    }

    // Block duplicate imports.
    const { data: existing } = await this.serviceClient
      .from('social_products')
      .select('id')
      .eq('seller_id', userId)
      .eq('source_wholesale_product_id', product.id)
      .maybeSingle();
    if (existing) {
      throw new BadRequestException(
        `"${product.name}" is already in your social catalog. Edit the existing listing instead.`,
      );
    }

    // Resolve pack vs single-unit and unit cost.
    const { data: packSizes } = await this.serviceClient
      .from('wholesale_product_pack_sizes')
      .select('id, quantity, pack_price, unit_price')
      .eq('product_id', product.id);

    let unitCost: number;
    let quantity: number;
    if (packSizes && packSizes.length > 0) {
      const pack = packSizes.find((p) => p.id === payload?.packSizeId);
      if (!pack) {
        throw new BadRequestException(
          'Please choose which pack to import for this product.',
        );
      }
      const packQuantity = Number(pack.quantity);
      if (!packQuantity || packQuantity < 1) {
        throw new BadRequestException('The selected pack has an invalid size.');
      }
      const numberOfPacks = Math.floor(Number(payload?.numberOfPacks ?? 1));
      if (!Number.isInteger(numberOfPacks) || numberOfPacks < 1) {
        throw new BadRequestException(
          'Number of packs must be a whole number of at least 1.',
        );
      }
      unitCost =
        pack.unit_price != null
          ? Number(pack.unit_price)
          : Number(pack.pack_price) / packQuantity;
      quantity = numberOfPacks * packQuantity;
    } else {
      const qty = Math.floor(Number(payload?.quantity ?? 1));
      if (!Number.isInteger(qty) || qty < 1) {
        throw new BadRequestException(
          'Quantity must be a whole number of at least 1.',
        );
      }
      unitCost = Number(product.wholesale_price) || 0;
      quantity = qty;
    }

    const price = Number(payload?.price);
    if (payload?.price === undefined || payload?.price === null || isNaN(price) || price <= 0) {
      throw new BadRequestException('Price must be greater than 0.');
    }
    if (price < unitCost) {
      throw new BadRequestException(
        `Price (${price}) cannot be less than the unit cost (${unitCost.toFixed(2)}).`,
      );
    }

    const slug = await this.buildUniqueSocialSlug(userId, product.name);

    const { data: created, error: createError } = await this.serviceClient
      .from('social_products')
      .insert({
        seller_id: userId,
        title: (payload?.title && String(payload.title).trim()) || product.name,
        slug,
        description: product.description ?? null,
        condition: payload?.condition ?? 'new',
        category_id: product.category_id,
        subcategory_id: product.subcategory_id ?? null,
        listing_type: payload?.listingType ?? 'shop',
        source_type: 'wholesale_catalog_import',
        source_wholesale_product_id: product.id,
        status: 'active',
        published_at: new Date().toISOString(),
        currency: 'TRY',
        price,
        compare_at_price: product.retail_price ?? null,
        quantity,
        available_quantity: quantity,
        is_exchangeable: payload?.isExchangeable ?? true,
        allow_offers: payload?.allowOffers ?? true,
      })
      .select('*')
      .single();
    if (createError || !created) {
      throw new BadRequestException(
        `Failed to import product: ${createError?.message ?? 'Unknown error'}`,
      );
    }

    const { data: images } = await this.serviceClient
      .from('wholesale_product_images')
      .select('image_url, display_order, is_primary')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });
    await this.copyImagesToSocialMedia(created.id, images || []);

    // Copy size/colour variations so buyers can pick a size on the product page.
    const sizes: string[] = [];
    const colors: Array<{ label: string; value: string }> = [];
    if (payload?.packSizeId) {
      const { data: packVars } = await this.serviceClient
        .from('wholesale_pack_variations')
        .select('color, color_value, size, variation_type, name, value')
        .eq('pack_size_id', payload.packSizeId);
      (packVars || []).forEach((v: any) => {
        if (v.size) sizes.push(v.size);
        else if (v.variation_type === 'size' && v.name) sizes.push(v.name);
        if (v.color) colors.push({ label: v.color, value: v.color_value || '#000000' });
        else if (v.variation_type === 'color' && v.name)
          colors.push({ label: v.name, value: v.value || '#000000' });
      });
    }
    const { data: prodVars } = await this.serviceClient
      .from('wholesale_product_variations')
      .select('variation_type, name, value')
      .eq('product_id', product.id);
    (prodVars || []).forEach((v: any) => {
      if (v.variation_type === 'size' && v.name) sizes.push(v.name);
      if (v.variation_type === 'color' && v.name)
        colors.push({ label: v.name, value: v.value || '#000000' });
    });
    await this.insertSocialSizeColorVariations(created.id, sizes, colors);

    const full = await this.getProductById(created.id, userId);
    return full?.product ?? null;
  }

  /**
   * Inserts "Size" (text) and "Colour" (color) variation rows on an imported
   * social product so the buyer gets a size/colour selector on the product page.
   */
  private async insertSocialSizeColorVariations(
    socialProductId: string,
    sizes: string[],
    colors: Array<{ label: string; value: string }>,
  ) {
    const rows: any[] = [];
    let order = 0;

    const uniqueSizes = [
      ...new Set(sizes.map((s) => String(s).trim()).filter(Boolean)),
    ];
    if (uniqueSizes.length) {
      rows.push({
        product_id: socialProductId,
        variation_name: 'Size',
        variation_type: 'text',
        variation_values: uniqueSizes,
        variation_options: uniqueSizes.map((v) => ({ label: v, value: v })),
        display_order: order++,
      });
    }

    const colorMap = new Map<string, string>();
    colors.forEach((c) => {
      const label = String(c.label ?? '').trim();
      if (!label || colorMap.has(label)) return;
      const value = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.value || '')
        ? c.value.toLowerCase()
        : '#000000';
      colorMap.set(label, value);
    });
    if (colorMap.size) {
      rows.push({
        product_id: socialProductId,
        variation_name: 'Color',
        variation_type: 'color',
        variation_values: [...colorMap.values()],
        variation_options: [...colorMap.entries()].map(([label, value]) => ({
          label,
          value,
        })),
        display_order: order++,
      });
    }

    if (rows.length) {
      const { error } = await this.serviceClient
        .from('social_product_variations')
        .insert(rows);
      if (error) {
        console.error('Failed to copy variations on import:', error);
      }
    }
  }

  /**
   * Imports one of the user's own retail products into their social catalog.
   * Retail products sell as single units; the user picks how many to list and
   * the price (which must be at least the retail cost price).
   */
  async importRetailCatalogProduct(userId: string, payload: any) {
    await this.ensureSocialProfile(userId);

    const { data: retailBrand } = await this.serviceClient
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();
    if (!retailBrand) {
      throw new BadRequestException(
        'You need an approved retail store to import retail products.',
      );
    }

    const retailProductId = payload?.retailProductId;
    if (!retailProductId) {
      throw new BadRequestException('retailProductId is required');
    }

    const { data: product, error: productError } = await this.serviceClient
      .from('retail_products')
      .select('*')
      .eq('id', retailProductId)
      .is('deleted_at', null)
      .maybeSingle();
    if (productError) throw new BadRequestException(productError.message);
    if (!product) throw new NotFoundException('Retail product not found.');
    if (product.retail_brand_id !== retailBrand.id) {
      throw new BadRequestException(
        'You can only import products from your own retail store.',
      );
    }
    if (!product.category_id) {
      throw new BadRequestException(
        'This retail product has no category and cannot be imported.',
      );
    }

    const { data: existing } = await this.serviceClient
      .from('social_products')
      .select('id')
      .eq('seller_id', userId)
      .eq('source_retail_product_id', product.id)
      .maybeSingle();
    if (existing) {
      throw new BadRequestException(
        `"${product.name}" is already in your social catalog. Edit the existing listing instead.`,
      );
    }

    const quantity = Math.floor(Number(payload?.quantity ?? 1));
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException(
        'Quantity must be a whole number of at least 1.',
      );
    }

    const unitCost = Number(product.cost_price) || 0;
    const price = Number(payload?.price);
    if (payload?.price === undefined || payload?.price === null || isNaN(price) || price <= 0) {
      throw new BadRequestException('Price must be greater than 0.');
    }
    if (price < unitCost) {
      throw new BadRequestException(
        `Price (${price}) cannot be less than the unit cost (${unitCost.toFixed(2)}).`,
      );
    }

    const slug = await this.buildUniqueSocialSlug(userId, product.name);

    const { data: created, error: createError } = await this.serviceClient
      .from('social_products')
      .insert({
        seller_id: userId,
        title: (payload?.title && String(payload.title).trim()) || product.name,
        slug,
        description: product.description ?? null,
        condition: payload?.condition ?? 'new',
        category_id: product.category_id,
        subcategory_id: product.subcategory_id ?? null,
        listing_type: payload?.listingType ?? 'shop',
        source_type: 'retail_catalog_import',
        source_retail_product_id: product.id,
        status: 'active',
        published_at: new Date().toISOString(),
        currency: 'TRY',
        price,
        compare_at_price: product.compare_at_price ?? product.retail_price ?? null,
        quantity,
        available_quantity: quantity,
        is_exchangeable: payload?.isExchangeable ?? true,
        allow_offers: payload?.allowOffers ?? true,
      })
      .select('*')
      .single();
    if (createError || !created) {
      throw new BadRequestException(
        `Failed to import product: ${createError?.message ?? 'Unknown error'}`,
      );
    }

    const { data: images } = await this.serviceClient
      .from('retail_product_images')
      .select('image_url, display_order, is_primary')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });
    await this.copyImagesToSocialMedia(created.id, images || []);

    // Copy size/colour variations from the retail product so buyers can pick a size.
    const sizes: string[] = [];
    const colors: Array<{ label: string; value: string }> = [];
    const { data: retailVars } = await this.serviceClient
      .from('retail_product_variations')
      .select('variation_type, name, value')
      .eq('product_id', product.id);
    (retailVars || []).forEach((v: any) => {
      const type = String(v.variation_type || '').toLowerCase();
      if (type === 'size' && v.name) sizes.push(v.name);
      else if (type === 'color' && v.name)
        colors.push({ label: v.name, value: v.value || '#000000' });
    });
    await this.insertSocialSizeColorVariations(created.id, sizes, colors);

    const full = await this.getProductById(created.id, userId);
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
    return mapped;
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
    if (
      !Number.isFinite(numeric) ||
      !Number.isInteger(numeric) ||
      numeric <= 0
    ) {
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
        const aPrimary = a?.is_primary ? 0 : 1;
        const bPrimary = b?.is_primary ? 0 : 1;
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
        const aTime = Number.isNaN(aCreated)
          ? Number.MAX_SAFE_INTEGER
          : aCreated;
        const bTime = Number.isNaN(bCreated)
          ? Number.MAX_SAFE_INTEGER
          : bCreated;
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
    const availableRaw = Number(
      product.available_quantity ?? product.quantity ?? 0,
    );
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
      owner_id:
        String(product.user_id ?? product.seller_id ?? '').trim() || null,
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

    const products = await this.enrichProducts(
      productsRaw,
      viewerUserId ?? null,
    );
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
    const products = await this.enrichProducts(
      productsRaw,
      viewerUserId ?? null,
    );
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
    const listing = await this.getSwapListingByIdOrThrow(
      transaction.listing_id,
    );
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
                  : (product.sold_at ?? null),
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

    const [
      listingRowsResult,
      proposalRowsResult,
      shipmentsResult,
      disputesResult,
    ] = await Promise.all([
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
      const { data: timelineRows, error: timelineError } =
        await this.serviceClient
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
          ? (listing?.social_products ?? null)
          : (acceptedProposal?.offered_product ?? null);
      const theirItem =
        myRole === 'owner'
          ? (acceptedProposal?.offered_product ?? null)
          : (listing?.social_products ?? null);
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

  private exchangeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private exchangeLower(value: unknown): string {
    return this.exchangeText(value).toLowerCase();
  }

  private exchangeNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseExchangeQueryList(value?: string): string[] {
    const raw = this.exchangeText(value);
    if (!raw) return [];
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((entry) => this.exchangeText(entry))
          .filter(Boolean),
      ),
    );
  }

  private normalizeExchangeStatuses(status?: string): string[] {
    return this.parseExchangeQueryList(status)
      .map((entry) => this.exchangeLower(entry))
      .filter((entry) => Boolean(entry) && entry !== 'all');
  }

  private normalizeExchangeSort(
    sort?: string,
  ):
    | 'recommended'
    | 'newest'
    | 'most_proposals'
    | 'most_viewed'
    | 'value_low'
    | 'value_high' {
    const normalized = this.exchangeLower(sort);
    if (
      normalized === 'newest' ||
      normalized === 'most_proposals' ||
      normalized === 'most_viewed' ||
      normalized === 'value_low' ||
      normalized === 'value_high'
    ) {
      return normalized;
    }
    return 'recommended';
  }

  private formatExchangeMoney(value: number): string {
    return `$${Math.round(value).toLocaleString('en-US')}`;
  }

  private exchangeListingGiveCategory(listing: any): string {
    return this.exchangeText(listing?.social_products?.category) || 'Other';
  }

  private exchangeListingWantCategory(listing: any): string {
    return this.exchangeText(listing?.wanted_category) || 'Any';
  }

  private exchangeListingValueBucket(listing: any): string {
    const min = this.exchangeNumber(listing?.wanted_min_value);
    const max = this.exchangeNumber(listing?.wanted_max_value);
    if (min !== null && max !== null) {
      return `${this.formatExchangeMoney(min)}-${this.formatExchangeMoney(max)}`;
    }
    if (min !== null) {
      return `${this.formatExchangeMoney(min)}+`;
    }
    if (max !== null) {
      return `Up to ${this.formatExchangeMoney(max)}`;
    }
    return 'Any value';
  }

  private exchangeListingType(listing: any): string {
    const quantityRaw = this.exchangeNumber(listing?.offered_quantity);
    const quantity =
      quantityRaw !== null ? Math.max(1, Math.floor(quantityRaw)) : 1;
    if (quantity > 1) return 'Bundle swap';
    if (listing?.is_cash_top_up_allowed) return 'Swap + cash';
    return 'Direct swap';
  }

  private exchangeListingCondition(listing: any): string {
    return (
      this.exchangeText(listing?.offered_product_preview?.condition) ||
      this.exchangeText(listing?.social_products?.condition) ||
      'Any'
    );
  }

  private exchangeListingSellerKey(listing: any): string {
    return (
      this.exchangeText(listing?.owner_id) ||
      this.exchangeText(listing?.owner_username) ||
      this.exchangeText(listing?.id)
    );
  }

  private exchangeListingSellerLabel(listing: any): string {
    const displayName = this.exchangeText(listing?.owner_display_name);
    const username = this.exchangeText(listing?.owner_username);
    if (displayName && username) {
      return `${displayName} (@${username})`;
    }
    if (displayName) return displayName;
    if (username) return `@${username}`;
    return 'Unknown seller';
  }

  private exchangeListingPriceEstimate(listing: any): number | null {
    const offeredValue = this.exchangeNumber(listing?.offered_value);
    if (offeredValue !== null) return offeredValue;
    const previewPrice = this.exchangeNumber(
      listing?.offered_product_preview?.price,
    );
    if (previewPrice !== null) return previewPrice;
    return this.exchangeNumber(listing?.social_products?.price);
  }

  private exchangeListingCreatedAt(listing: any): number {
    const parsed = Date.parse(String(listing?.created_at ?? ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private exchangeListingSearchHaystack(listing: any): string {
    return [
      listing?.title,
      listing?.description,
      listing?.wanted_description,
      listing?.wanted_category,
      listing?.wanted_subcategory,
      listing?.owner_username,
      listing?.owner_display_name,
      listing?.offered_product_preview?.title,
      listing?.social_products?.title,
      listing?.social_products?.brand,
    ]
      .map((entry) => this.exchangeLower(entry))
      .join(' ');
  }

  private applyExchangeFilters(
    listings: any[],
    options?: ExchangeListingsQueryOptions,
  ): any[] {
    const q = this.exchangeLower(options?.q);
    const statusValues = new Set(
      this.normalizeExchangeStatuses(options?.status),
    );
    const giveValues = new Set(
      this.parseExchangeQueryList(options?.give).map((entry) =>
        this.exchangeLower(entry),
      ),
    );
    const wantValues = new Set(
      this.parseExchangeQueryList(options?.want).map((entry) =>
        this.exchangeLower(entry),
      ),
    );
    const valueValues = new Set(
      this.parseExchangeQueryList(options?.value).map((entry) =>
        this.exchangeLower(entry),
      ),
    );
    const typeValues = new Set(
      this.parseExchangeQueryList(options?.type).map((entry) =>
        this.exchangeLower(entry),
      ),
    );
    const conditionValues = new Set(
      this.parseExchangeQueryList(options?.condition).map((entry) =>
        this.exchangeLower(entry),
      ),
    );
    const sellerValues = new Set(
      this.parseExchangeQueryList(options?.seller).map((entry) =>
        this.exchangeLower(entry),
      ),
    );

    return listings.filter((listing) => {
      if (q && !this.exchangeListingSearchHaystack(listing).includes(q)) {
        return false;
      }

      if (statusValues.size) {
        const listingStatus = this.exchangeLower(listing?.status || 'open');
        if (!statusValues.has(listingStatus)) return false;
      }

      const give = this.exchangeLower(
        this.exchangeListingGiveCategory(listing),
      );
      if (giveValues.size && !giveValues.has(give)) return false;

      const want = this.exchangeLower(
        this.exchangeListingWantCategory(listing),
      );
      if (wantValues.size && !wantValues.has(want)) return false;

      const value = this.exchangeLower(
        this.exchangeListingValueBucket(listing),
      );
      if (valueValues.size && !valueValues.has(value)) return false;

      const type = this.exchangeLower(this.exchangeListingType(listing));
      if (typeValues.size && !typeValues.has(type)) return false;

      const condition = this.exchangeLower(
        this.exchangeListingCondition(listing),
      );
      if (conditionValues.size && !conditionValues.has(condition)) return false;

      if (sellerValues.size) {
        const sellerKey = this.exchangeLower(
          this.exchangeListingSellerKey(listing),
        );
        const sellerLabel = this.exchangeLower(
          this.exchangeListingSellerLabel(listing),
        );
        if (!sellerValues.has(sellerKey) && !sellerValues.has(sellerLabel)) {
          return false;
        }
      }

      return true;
    });
  }

  private applyExchangeSort(
    listings: any[],
    sort:
      | 'recommended'
      | 'newest'
      | 'most_proposals'
      | 'most_viewed'
      | 'value_low'
      | 'value_high',
  ): any[] {
    const sorted = [...listings];
    switch (sort) {
      case 'most_proposals':
        sorted.sort(
          (a, b) =>
            Number(b?.proposal_count ?? 0) - Number(a?.proposal_count ?? 0),
        );
        return sorted;
      case 'most_viewed':
        sorted.sort(
          (a, b) => Number(b?.views_count ?? 0) - Number(a?.views_count ?? 0),
        );
        return sorted;
      case 'value_low':
        sorted.sort((a, b) => {
          const aValue =
            this.exchangeListingPriceEstimate(a) ?? Number.MAX_SAFE_INTEGER;
          const bValue =
            this.exchangeListingPriceEstimate(b) ?? Number.MAX_SAFE_INTEGER;
          return aValue - bValue;
        });
        return sorted;
      case 'value_high':
        sorted.sort((a, b) => {
          const aValue = this.exchangeListingPriceEstimate(a) ?? 0;
          const bValue = this.exchangeListingPriceEstimate(b) ?? 0;
          return bValue - aValue;
        });
        return sorted;
      case 'recommended':
      case 'newest':
      default:
        sorted.sort(
          (a, b) =>
            this.exchangeListingCreatedAt(b) - this.exchangeListingCreatedAt(a),
        );
        return sorted;
    }
  }

  private applyExchangeLimit(listings: any[], limit?: number): any[] {
    const parsedLimit = Number(limit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return listings;
    }
    const safeLimit = Math.min(200, Math.floor(parsedLimit));
    return listings.slice(0, safeLimit);
  }

  async getExchangeListings(
    viewerUserId: string | null = null,
    options?: ExchangeListingsQueryOptions,
  ) {
    const statusFilters = this.normalizeExchangeStatuses(options?.status);
    let query = this.serviceClient.from('social_swap_listings').select('*');
    if (statusFilters.length) {
      query = query.in('status', statusFilters);
    } else {
      query = query.eq('status', 'open');
    }

    const { data: listings, error } = await query.order('created_at', {
      ascending: false,
    });
    if (error) {
      throw new BadRequestException(
        `Failed to fetch exchange listings: ${error.message}`,
      );
    }

    const now = Date.now();
    const listingsWithinWindow = (listings ?? []).filter((listing) => {
      const status = this.exchangeLower(listing?.status || 'open');
      if (status !== 'open') return true;
      const expiresAtRaw = this.exchangeText(listing?.expires_at);
      if (!expiresAtRaw) return true;
      const expiresAtMs = Date.parse(expiresAtRaw);
      if (Number.isNaN(expiresAtMs)) return true;
      return expiresAtMs > now;
    });

    const hydrated = await this.hydrateSwapListings(
      listingsWithinWindow,
      viewerUserId,
    );
    const filtered = this.applyExchangeFilters(hydrated, options);
    const sortMode = this.normalizeExchangeSort(options?.sort);
    const sorted = this.applyExchangeSort(filtered, sortMode);
    return this.applyExchangeLimit(sorted, options?.limit);
  }

  async getCachedExchangeListings(
    viewerUserId: string | null = null,
    locale?: string,
    options?: ExchangeListingsQueryOptions,
  ) {
    const safeLocale = this.normalizeLocale(locale);
    const key = this.readCacheKey('social:exchange-listings', {
      viewerUserId: viewerUserId ?? null,
      locale: safeLocale,
      q: this.exchangeText(options?.q),
      status: this.exchangeText(options?.status),
      sort: this.exchangeText(options?.sort),
      give: this.exchangeText(options?.give),
      want: this.exchangeText(options?.want),
      value: this.exchangeText(options?.value),
      type: this.exchangeText(options?.type),
      condition: this.exchangeText(options?.condition),
      seller: this.exchangeText(options?.seller),
      limit: Number(options?.limit ?? 0) || 0,
    });
    return this.getOrSetReadCache(key, async () => {
      try {
        const data = await this.getExchangeListings(viewerUserId, options);
        return data;
      } catch {
        return [];
      }
    });
  }

  async getExchangeListingById(
    listingId: string,
    viewerUserId?: string | null,
  ) {
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

    const { data: transaction, error: transactionError } =
      await this.serviceClient
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

    const offeredProductId =
      String(payload?.offeredProductId ?? '').trim() || null;
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
        wanted_description:
          String(payload?.wantedDescription ?? '').trim() || null,
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
      throw new ForbiddenException(
        'Only listing owner can update this listing',
      );
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

    const { data: updatedListing, error: updateError } =
      await this.serviceClient
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
    if (
      listing.expires_at &&
      new Date(listing.expires_at).getTime() <= Date.now()
    ) {
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

    const [mappedProposal] = await this.hydrateSwapProposals(
      [proposal],
      userId,
    );
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

    const { data: acceptedRows, error: acceptError } =
      await this.serviceClient.rpc('social_accept_swap_proposal_atomic', {
        p_listing_id: listing.id,
        p_proposal_id: proposal.id,
        p_actor_id: userId,
      });
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
      throw new ForbiddenException(
        'You do not have access to this transaction',
      );
    }

    await this.syncSwapTransactionState(transaction.id, userId);
    const refreshed = await this.getSwapTransactionByIdOrThrow(transaction.id);
    const [mapped] = await this.hydrateSwapTransactions(
      [refreshed],
      userId,
      true,
    );
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
    const transaction = await this.getSwapTransactionById(
      userId,
      transactionId,
    );
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
    const transaction = await this.getSwapTransactionById(
      userId,
      transactionId,
    );
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
    const transaction = await this.getSwapTransactionById(
      userId,
      transactionId,
    );
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
    const transaction = await this.getSwapTransactionById(
      userId,
      transactionId,
    );
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

  private normalizeSwapDisputePriority(
    value: unknown,
  ): 'low' | 'normal' | 'high' | 'urgent' {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (
      normalized === 'low' ||
      normalized === 'normal' ||
      normalized === 'high' ||
      normalized === 'urgent'
    ) {
      return normalized;
    }
    return 'normal';
  }

  private computeSwapDisputeSlaDueAt(
    priority: 'low' | 'normal' | 'high' | 'urgent',
  ) {
    const hoursByPriority: Record<typeof priority, number> = {
      low: 96,
      normal: 72,
      high: 48,
      urgent: 24,
    };
    return new Date(
      Date.now() + hoursByPriority[priority] * 60 * 60 * 1000,
    ).toISOString();
  }

  private async getSwapDisputeByIdOrThrow(disputeId: string) {
    const { data, error } = await this.serviceClient
      .from('social_swap_disputes')
      .select('*')
      .eq('id', disputeId)
      .maybeSingle();
    if (error) {
      throw new BadRequestException(
        `Failed to fetch swap dispute: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException('Swap dispute not found');
    }
    return data;
  }

  private async resolveSwapDisputeAccess(userId: string, disputeId: string) {
    const dispute = await this.getSwapDisputeByIdOrThrow(disputeId);
    const transaction = await this.getSwapTransactionByIdOrThrow(
      dispute.transaction_id,
    );
    const isParticipant =
      transaction.owner_id === userId || transaction.proposer_id === userId;
    const isSupport = this.isSupportUser(userId);
    if (!isParticipant && !isSupport) {
      throw new ForbiddenException('You do not have access to this dispute');
    }
    const viewerRole = isSupport
      ? 'support'
      : transaction.owner_id === userId
        ? 'owner'
        : 'proposer';

    return {
      dispute,
      transaction,
      isParticipant,
      isSupport,
      viewerRole,
    };
  }

  async listSwapDisputes(userId: string, options?: SwapDisputeListOptions) {
    const limit = this.sanitizeLimit(options?.limit, 20, 50);
    const cursor = String(options?.cursor ?? '').trim() || null;
    const status = String(options?.status ?? '')
      .trim()
      .toLowerCase();
    const queueView = Boolean(options?.queue);
    const isSupport = this.isSupportUser(userId);

    let transactionIds: string[] | null = null;
    if (!isSupport || !queueView) {
      const { data: ownTransactions, error: ownTransactionsError } =
        await this.serviceClient
          .from('social_swap_transactions')
          .select('id')
          .or(`owner_id.eq.${userId},proposer_id.eq.${userId}`);
      if (ownTransactionsError) {
        throw new BadRequestException(
          `Failed to load swap transactions for disputes: ${ownTransactionsError.message}`,
        );
      }
      transactionIds = (ownTransactions ?? [])
        .map((row) => row.id)
        .filter((value): value is string => Boolean(value));
      if (!transactionIds.length) {
        return { items: [], nextCursor: null };
      }
    }

    let query = this.serviceClient
      .from('social_swap_disputes')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (transactionIds) {
      query = query.in('transaction_id', transactionIds);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (cursor) {
      query = query.lt('updated_at', cursor);
    }

    const { data: disputeRows, error: disputesError } = await query;
    if (disputesError) {
      throw new BadRequestException(
        `Failed to load disputes: ${disputesError.message}`,
      );
    }

    const hasMore = (disputeRows ?? []).length > limit;
    const pageRows = hasMore
      ? (disputeRows ?? []).slice(0, limit)
      : (disputeRows ?? []);
    const txIds = Array.from(
      new Set(
        pageRows
          .map((row) => row.transaction_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const transactionsResult = txIds.length
      ? await this.serviceClient
          .from('social_swap_transactions')
          .select('*')
          .in('id', txIds)
      : ({ data: [], error: null } as any);
    if (transactionsResult.error) {
      throw new BadRequestException(
        `Failed to load dispute transactions: ${transactionsResult.error.message}`,
      );
    }

    const listingIds = Array.from(
      new Set(
        (transactionsResult.data ?? [])
          .map((row) => row.listing_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const listingsResult = listingIds.length
      ? await this.serviceClient
          .from('social_swap_listings')
          .select('*')
          .in('id', listingIds)
      : ({ data: [], error: null } as any);
    if (listingsResult.error) {
      throw new BadRequestException(
        `Failed to load dispute listings: ${listingsResult.error.message}`,
      );
    }

    const txMap = new Map<string, any>(
      (transactionsResult.data ?? []).map((row: any) => [row.id, row]),
    );
    const listingMap = new Map<string, any>(
      (listingsResult.data ?? []).map((row: any) => [row.id, row]),
    );

    const items = pageRows.map((row) => {
      const transaction = txMap.get(row.transaction_id) ?? null;
      const listing = transaction
        ? (listingMap.get(transaction.listing_id) ?? null)
        : null;
      return {
        ...row,
        transaction,
        listing,
        viewer_role: isSupport
          ? 'support'
          : transaction?.owner_id === userId
            ? 'owner'
            : 'proposer',
        queue_state: {
          priority: row.priority ?? 'normal',
          sla_due_at: row.sla_due_at ?? null,
          is_overdue:
            Boolean(row.sla_due_at) &&
            new Date(String(row.sla_due_at)).getTime() < Date.now(),
        },
      };
    });

    const last = pageRows[pageRows.length - 1];
    return {
      items,
      nextCursor: hasMore && last ? String(last.updated_at ?? '') : null,
    };
  }

  async getSwapDisputeDetail(userId: string, disputeId: string) {
    const access = await this.resolveSwapDisputeAccess(userId, disputeId);
    const { dispute, transaction, isSupport, viewerRole } = access;

    let messagesQuery = this.serviceClient
      .from('social_swap_dispute_messages')
      .select('*')
      .eq('dispute_id', dispute.id)
      .order('created_at', { ascending: true });
    if (!isSupport) {
      messagesQuery = messagesQuery.eq('is_internal', false);
    }

    let evidenceQuery = this.serviceClient
      .from('social_swap_dispute_evidence')
      .select('*')
      .eq('dispute_id', dispute.id)
      .order('created_at', { ascending: true });
    if (!isSupport) {
      evidenceQuery = evidenceQuery.eq('is_internal', false);
    }

    const [messagesResult, evidenceResult, timelineResult] = await Promise.all([
      messagesQuery,
      evidenceQuery,
      this.serviceClient
        .from('social_swap_timeline')
        .select('*')
        .eq('transaction_id', dispute.transaction_id)
        .order('created_at', { ascending: true }),
    ]);

    if (messagesResult.error) {
      throw new BadRequestException(
        `Failed to load dispute messages: ${messagesResult.error.message}`,
      );
    }
    if (evidenceResult.error) {
      throw new BadRequestException(
        `Failed to load dispute evidence: ${evidenceResult.error.message}`,
      );
    }
    if (timelineResult.error) {
      throw new BadRequestException(
        `Failed to load dispute timeline: ${timelineResult.error.message}`,
      );
    }

    const listing = await this.getSwapListingByIdOrThrow(
      transaction.listing_id,
    );

    return {
      dispute,
      transaction,
      listing,
      messages: messagesResult.data ?? [],
      evidence: evidenceResult.data ?? [],
      timeline: timelineResult.data ?? [],
      viewerRole,
      isSupportView: isSupport,
    };
  }

  async createSwapDisputeMessage(
    userId: string,
    disputeId: string,
    payload: SwapDisputeMessagePayload,
  ) {
    const access = await this.resolveSwapDisputeAccess(userId, disputeId);
    const body = String(payload?.body ?? '').trim();
    if (!body) {
      throw new BadRequestException('body is required');
    }
    const isInternal = Boolean(payload?.isInternal);
    if (isInternal && !access.isSupport) {
      throw new ForbiddenException(
        'Only support can create internal dispute messages',
      );
    }

    const nowIso = new Date().toISOString();
    const { data: message, error } = await this.serviceClient
      .from('social_swap_dispute_messages')
      .insert({
        dispute_id: access.dispute.id,
        transaction_id: access.transaction.id,
        sender_id: userId,
        body,
        message_type: 'comment',
        is_internal: isInternal,
      })
      .select('*')
      .single();
    if (error || !message) {
      throw new BadRequestException(
        `Failed to create dispute message: ${error?.message}`,
      );
    }

    await this.serviceClient
      .from('social_swap_disputes')
      .update({
        last_activity_at: nowIso,
      })
      .eq('id', access.dispute.id);

    await this.serviceClient.from('social_swap_timeline').insert({
      transaction_id: access.transaction.id,
      event_type: 'swap_dispute_message',
      actor_id: userId,
      payload: {
        dispute_id: access.dispute.id,
        message_id: message.id,
        is_internal: isInternal,
      },
    });

    const counterpartId =
      access.transaction.owner_id === userId
        ? access.transaction.proposer_id
        : access.transaction.owner_id;
    if (!isInternal && counterpartId) {
      await this.createSwapNotification(
        counterpartId,
        'swap_dispute_message',
        'Dispute updated',
        'A new message was added to your dispute.',
        {
          transactionId: access.transaction.id,
          disputeId: access.dispute.id,
          messageId: message.id,
        },
      );
    }

    return this.getSwapDisputeDetail(userId, disputeId);
  }

  async createSwapDisputeEvidence(
    userId: string,
    disputeId: string,
    payload: SwapDisputeEvidencePayload,
  ) {
    const access = await this.resolveSwapDisputeAccess(userId, disputeId);
    const fileUrl = String(payload?.fileUrl ?? '').trim();
    if (!fileUrl) {
      throw new BadRequestException('fileUrl is required');
    }
    const isInternal = Boolean(payload?.isInternal);
    if (isInternal && !access.isSupport) {
      throw new ForbiddenException(
        'Only support can create internal dispute evidence',
      );
    }

    const nowIso = new Date().toISOString();
    const { data: evidence, error } = await this.serviceClient
      .from('social_swap_dispute_evidence')
      .insert({
        dispute_id: access.dispute.id,
        transaction_id: access.transaction.id,
        uploaded_by: userId,
        file_url: fileUrl,
        file_type: String(payload?.fileType ?? '').trim() || null,
        note: String(payload?.note ?? '').trim() || null,
        is_internal: isInternal,
      })
      .select('*')
      .single();
    if (error || !evidence) {
      throw new BadRequestException(
        `Failed to create dispute evidence: ${error?.message}`,
      );
    }

    await this.serviceClient
      .from('social_swap_disputes')
      .update({
        last_activity_at: nowIso,
      })
      .eq('id', access.dispute.id);

    await this.serviceClient.from('social_swap_timeline').insert({
      transaction_id: access.transaction.id,
      event_type: 'swap_dispute_evidence_added',
      actor_id: userId,
      payload: {
        dispute_id: access.dispute.id,
        evidence_id: evidence.id,
        is_internal: isInternal,
      },
    });

    const counterpartId =
      access.transaction.owner_id === userId
        ? access.transaction.proposer_id
        : access.transaction.owner_id;
    if (!isInternal && counterpartId) {
      await this.createSwapNotification(
        counterpartId,
        'swap_dispute_evidence_added',
        'Dispute evidence added',
        'New evidence was added to your dispute.',
        {
          transactionId: access.transaction.id,
          disputeId: access.dispute.id,
          evidenceId: evidence.id,
        },
      );
    }

    return this.getSwapDisputeDetail(userId, disputeId);
  }

  async updateSwapDispute(
    userId: string,
    disputeId: string,
    payload: SwapDisputeActionPayload,
  ) {
    const access = await this.resolveSwapDisputeAccess(userId, disputeId);
    const action = String(payload?.action ?? '')
      .trim()
      .toLowerCase();
    if (!action) {
      throw new BadRequestException('action is required');
    }
    if (action !== 'resolve' && action !== 'escalate' && action !== 'reopen') {
      throw new BadRequestException('Unsupported dispute action');
    }

    if ((action === 'resolve' || action === 'escalate') && !access.isSupport) {
      throw new ForbiddenException(
        'Only support users can resolve or escalate disputes',
      );
    }

    const nowIso = new Date().toISOString();
    const nextPriority =
      payload?.priority !== undefined
        ? this.normalizeSwapDisputePriority(payload.priority)
        : this.normalizeSwapDisputePriority(access.dispute.priority);

    const updateData: Record<string, unknown> = {
      priority: nextPriority,
      sla_due_at: this.computeSwapDisputeSlaDueAt(nextPriority),
      last_activity_at: nowIso,
    };
    if (payload?.resolutionNotes !== undefined) {
      updateData.resolution_notes =
        String(payload.resolutionNotes ?? '').trim() || null;
    }

    if (action === 'resolve') {
      updateData.status = 'resolved';
      updateData.resolved_by = userId;
      updateData.resolved_at = nowIso;
      if (!updateData.resolution_notes) {
        updateData.resolution_notes = 'Resolved by support';
      }
    } else if (action === 'escalate') {
      updateData.status = 'escalated';
      updateData.escalated_at = nowIso;
    } else {
      updateData.status = 'open';
      updateData.resolved_by = null;
      updateData.resolved_at = null;
    }

    const { error: updateError } = await this.serviceClient
      .from('social_swap_disputes')
      .update(updateData)
      .eq('id', access.dispute.id);
    if (updateError) {
      throw new BadRequestException(
        `Failed to update dispute: ${updateError.message}`,
      );
    }

    if (action === 'resolve') {
      await this.serviceClient
        .from('social_swap_transactions')
        .update({
          status: 'inspection',
          updated_at: nowIso,
        })
        .eq('id', access.transaction.id)
        .eq('status', 'disputed');
    }
    if (action === 'reopen') {
      await this.serviceClient
        .from('social_swap_transactions')
        .update({
          status: 'disputed',
          updated_at: nowIso,
        })
        .eq('id', access.transaction.id);
    }

    await this.serviceClient.from('social_swap_timeline').insert({
      transaction_id: access.transaction.id,
      event_type:
        action === 'resolve'
          ? 'swap_dispute_resolved'
          : action === 'escalate'
            ? 'swap_dispute_escalated'
            : 'swap_dispute_reopened',
      actor_id: userId,
      payload: {
        dispute_id: access.dispute.id,
        priority: nextPriority,
      },
    });

    const participantIds = Array.from(
      new Set([
        access.transaction.owner_id,
        access.transaction.proposer_id,
      ]).values(),
    ).filter((value): value is string => Boolean(value) && value !== userId);
    await Promise.all(
      participantIds.map((participantId) =>
        this.createSwapNotification(
          participantId,
          action === 'resolve'
            ? 'swap_dispute_resolved'
            : action === 'escalate'
              ? 'swap_dispute_escalated'
              : 'swap_dispute_reopened',
          action === 'resolve'
            ? 'Dispute resolved'
            : action === 'escalate'
              ? 'Dispute escalated'
              : 'Dispute reopened',
          action === 'resolve'
            ? 'Your dispute has been resolved.'
            : action === 'escalate'
              ? 'Your dispute has been escalated for review.'
              : 'Your dispute was reopened.',
          {
            disputeId: access.dispute.id,
            transactionId: access.transaction.id,
            action,
          },
        ),
      ),
    );

    return this.getSwapDisputeDetail(userId, disputeId);
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
    if (!addressLine1)
      throw new BadRequestException('addressLine1 is required');
    if (!city) throw new BadRequestException('city is required');

    const { data: existingAddresses, error: existingError } =
      await this.serviceClient
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
      updateData.address_line2 =
        String(payload.addressLine2 ?? '').trim() || null;
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

    const [
      mappedListings,
      mappedProposals,
      mappedProposalListings,
      mappedTransactions,
    ] = await Promise.all([
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
        currency: 'TRY',
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

  async getCategoryFilters(
    categoryId?: string,
    subcategoryId?: string,
    subSubcategoryId?: string,
  ) {
    const normalizedCategoryId = String(categoryId ?? '').trim();
    if (!normalizedCategoryId || normalizedCategoryId === 'all') {
      return [];
    }

    const normalizedSubcategoryId = String(subcategoryId ?? '').trim();
    const normalizedSubSubcategoryId = String(subSubcategoryId ?? '').trim();
    const hasSubcategory = Boolean(normalizedSubcategoryId);
    const hasSubSubcategory = Boolean(normalizedSubSubcategoryId);

    const normalizeFilterToken = (value: string) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const getFilterIdentityTokens = (row: {
      key?: string;
      dataPath?: string;
    }) =>
      new Set([
        normalizeFilterToken(row.key ?? ''),
        normalizeFilterToken(row.dataPath ?? ''),
      ]);

    const formatFilterRows = (rows: any[]) =>
      rows.map((row: any) => {
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
          subcategoryId: String(row.subcategory_id ?? '').trim() || null,
          subSubcategoryId: String(row.sub_subcategory_id ?? '').trim() || null,
        };
      });

    const taxonomyContext = {
      subcategorySlug: '',
      selectedSubSubcategoryName: '',
      availableSubSubcategoryNames: [] as string[],
    };

    if (hasSubcategory) {
      const { data: subcategoryRow, error: subcategoryError } =
        await this.serviceClient
          .from('subcategories')
          .select('id, category_id, slug')
          .eq('id', normalizedSubcategoryId)
          .eq('is_active', true)
          .maybeSingle();

      if (subcategoryError) {
        throw new BadRequestException(
          `Failed to resolve subcategory filters: ${subcategoryError.message}`,
        );
      }

      if (
        subcategoryRow &&
        String(subcategoryRow.category_id ?? '').trim() === normalizedCategoryId
      ) {
        taxonomyContext.subcategorySlug = String(
          subcategoryRow.slug ?? '',
        ).trim();

        const { data: subSubRows, error: subSubError } = await this.serviceClient
          .from('sub_subcategories')
          .select('id, subcategory_id, name')
          .eq('subcategory_id', normalizedSubcategoryId)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true });

        if (subSubError) {
          throw new BadRequestException(
            `Failed to resolve sub-subcategory filters: ${subSubError.message}`,
          );
        }

        const normalizedSubSubNames = Array.from(
          new Set(
            (subSubRows ?? [])
              .map((row: any) => String(row.name ?? '').trim())
              .filter(Boolean),
          ),
        );
        taxonomyContext.availableSubSubcategoryNames = normalizedSubSubNames;

        if (hasSubSubcategory) {
          const selectedSubSub = (subSubRows ?? []).find(
            (row: any) => String(row.id ?? '').trim() === normalizedSubSubcategoryId,
          );
          if (selectedSubSub) {
            taxonomyContext.selectedSubSubcategoryName = String(
              selectedSubSub.name ?? '',
            ).trim();
          }
        }
      }
    }

    const applyTaxonomyAwareAdjustments = (filters: any[]) => {
      if (!Array.isArray(filters) || filters.length === 0) return [];
      let scopedFilters = [...filters];

      const normalizedSubcategorySlug = normalizeFilterToken(
        taxonomyContext.subcategorySlug,
      );
      if (normalizedSubcategorySlug) {
        let allowList: string[] = [];

        if (normalizedSubcategorySlug.includes('bag')) {
          allowList = ['gender', 'bagtype', 'material', 'style', 'season'];
        } else if (
          normalizedSubcategorySlug.includes('jewel') ||
          normalizedSubcategorySlug.includes('watch')
        ) {
          allowList = ['gender', 'stone', 'material', 'style', 'season'];
        } else if (normalizedSubcategorySlug.includes('eyewear')) {
          allowList = ['gender', 'style', 'material', 'season'];
        } else if (
          normalizedSubcategorySlug.includes('clothing') ||
          normalizedSubcategorySlug.includes('underwear')
        ) {
          allowList = ['gender', 'producttype', 'style', 'material', 'season'];
        }

        if (allowList.length > 0) {
          const allowSet = new Set(allowList.map((item) => normalizeFilterToken(item)));
          const narrowed = scopedFilters.filter((filter) => {
            const tokens = getFilterIdentityTokens(filter);
            for (const token of tokens) {
              if (allowSet.has(token)) {
                return true;
              }
            }
            return false;
          });
          if (narrowed.length > 0) {
            scopedFilters = narrowed;
          }
        }
      }

      const genericCollectionTokens = new Set([
        'popular',
        'newarrivals',
        'bestsellers',
        'featured',
        'trending',
      ]);
      const selectedSubSubcategoryName = String(
        taxonomyContext.selectedSubSubcategoryName ?? '',
      ).trim();
      const selectedSubSubToken = normalizeFilterToken(selectedSubSubcategoryName);

      const availableSpecificTaxonomyOptions = Array.from(
        new Set(
          taxonomyContext.availableSubSubcategoryNames
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
            .filter(
              (value) => !genericCollectionTokens.has(normalizeFilterToken(value)),
            ),
        ),
      );

      let taxonomyOptions: string[] = [];
      if (selectedSubSubToken) {
        if (!genericCollectionTokens.has(selectedSubSubToken)) {
          taxonomyOptions = [selectedSubSubcategoryName];
        }
      } else {
        taxonomyOptions = availableSpecificTaxonomyOptions;
      }

      if (taxonomyOptions.length > 0) {
        const typeTokens = new Set(['producttype', 'shoetype']);
        let overridden = false;
        scopedFilters = scopedFilters.map((filter) => {
          const tokens = getFilterIdentityTokens(filter);
          const matchesType = Array.from(tokens).some((token) =>
            typeTokens.has(token),
          );
          if (!matchesType) return filter;
          overridden = true;
          return {
            ...filter,
            options: taxonomyOptions,
            type: 'single-select',
            isRequired:
              filter.isRequired || Boolean(taxonomyContext.selectedSubSubcategoryName),
          };
        });

        if (!overridden) {
          scopedFilters = [
            {
              key: 'productType',
              label: 'Product Type',
              type: 'single-select',
              dataPath: 'ProductType',
              options: taxonomyOptions,
              isRequired: Boolean(taxonomyContext.selectedSubSubcategoryName),
              subcategoryId: normalizedSubcategoryId || null,
              subSubcategoryId: normalizedSubSubcategoryId || null,
            },
            ...scopedFilters,
          ];
        }
      }

      return scopedFilters;
    };

    const selectWithScope =
      'filter_key, filter_label, filter_type, data_path, options, is_required, display_order, subcategory_id, sub_subcategory_id';
    const selectWithoutScope =
      'filter_key, filter_label, filter_type, data_path, options, is_required, display_order';

    const tryScopedQuery = async () =>
      this.serviceClient
        .from('category_filter_config')
        .select(selectWithScope)
        .eq('category_id', normalizedCategoryId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

    let rows: any[] = [];
    const scopedResult = await tryScopedQuery();
    if (scopedResult.error) {
      const message = String(scopedResult.error.message ?? '').toLowerCase();
      const missingScopeColumns =
        message.includes('subcategory_id') ||
        message.includes('sub_subcategory_id');
      if (!missingScopeColumns) {
        throw new BadRequestException(
          `Failed to fetch category filters: ${scopedResult.error.message}`,
        );
      }

      const legacyResult = await this.serviceClient
        .from('category_filter_config')
        .select(selectWithoutScope)
        .eq('category_id', normalizedCategoryId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (legacyResult.error) {
        throw new BadRequestException(
          `Failed to fetch category filters: ${legacyResult.error.message}`,
        );
      }
      rows = legacyResult.data ?? [];
      return applyTaxonomyAwareAdjustments(formatFilterRows(rows));
    }

    rows = scopedResult.data ?? [];
    const normalizedRows = formatFilterRows(rows);
    const matchesCategoryLevel = normalizedRows.filter(
      (row: any) => !row.subcategoryId && !row.subSubcategoryId,
    );

    if (hasSubcategory && hasSubSubcategory) {
      const matchesExactScope = normalizedRows.filter(
        (row: any) =>
          row.subcategoryId === normalizedSubcategoryId &&
          row.subSubcategoryId === normalizedSubSubcategoryId,
      );
      if (matchesExactScope.length > 0) {
        return applyTaxonomyAwareAdjustments(matchesExactScope);
      }
    }

    if (hasSubcategory) {
      const matchesSubcategoryScope = normalizedRows.filter(
        (row: any) =>
          row.subcategoryId === normalizedSubcategoryId &&
          !row.subSubcategoryId,
      );
      if (matchesSubcategoryScope.length > 0) {
        return applyTaxonomyAwareAdjustments(matchesSubcategoryScope);
      }
    }

    if (matchesCategoryLevel.length > 0) {
      return applyTaxonomyAwareAdjustments(matchesCategoryLevel);
    }

    return applyTaxonomyAwareAdjustments(normalizedRows);
  }

  async getTaxonomy(withProductsOnly = false) {
   return cached(`social:taxonomy:${withProductsOnly}`, 300_000, async () => {
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

    let categories = categoriesResult.data ?? [];

    // Shopper-facing shop/closet filters pass withProductsOnly=true so empty
    // categories are hidden. The create/edit product forms call without it, so
    // sellers still see every active category.
    if (withProductsOnly) {
      const { data: activeRows } = await this.serviceClient
        .from('social_products')
        .select('category_id')
        .eq('status', 'active');
      const categoryIdsWithProducts = new Set(
        (activeRows ?? [])
          .map((row: any) => row.category_id)
          .filter(Boolean),
      );
      categories = categories.filter((category: any) =>
        categoryIdsWithProducts.has(category.id),
      );
    }

    return categories.map((category) => ({
      ...category,
      subcategories: subMap.get(category.id) ?? [],
    }));
   });
  }
}
