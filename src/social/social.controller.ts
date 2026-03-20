import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseService } from '../supabase/supabase.service';
import { SocialService } from './social.service';
import { SocialUploadService } from './social-upload.service';

@Controller('social')
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly supabaseService: SupabaseService,
    private readonly socialUploadService: SocialUploadService,
  ) {}

  private extractToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return null;
    return token;
  }

  private async getRequiredUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) throw new UnauthorizedException('Authentication required');
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user)
      throw new UnauthorizedException('Invalid or expired token');
    return data.user;
  }

  private async getOptionalUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) return null;
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  }

  private parseDynamicFilters(
    rawFilters?: string,
  ): Record<string, string[]> | undefined {
    if (!rawFilters) return undefined;

    try {
      const parsed = JSON.parse(rawFilters);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return undefined;
      }

      const normalized: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(
        parsed as Record<string, unknown>,
      )) {
        const filterKey = String(key ?? '').trim();
        if (!filterKey) continue;

        const sourceValues = Array.isArray(value) ? value : [value];
        const cleaned = Array.from(
          new Set(
            sourceValues
              .map((entry) => String(entry ?? '').trim())
              .filter(Boolean),
          ),
        ).slice(0, 50);

        if (cleaned.length) {
          normalized[filterKey] = cleaned;
        }
      }

      return Object.keys(normalized).length ? normalized : undefined;
    } catch {
      return undefined;
    }
  }

  @Get('feed')
  async getFeed(
    @Headers('authorization') authHeader?: string,
    @Query('mode') mode = 'all',
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('locale') locale?: string,
    @Query('sort') sort?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getCachedFeed(
      mode as any,
      user?.id ?? null,
      limit,
      cursor,
      locale,
      sort,
    );
  }

  @Get('explore')
  async getExplore(
    @Headers('authorization') authHeader?: string,
    @Query('locale') locale?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getCachedExplore(user?.id ?? null, locale);
  }

  @Get('feature-flags')
  async getFeatureFlags() {
    return this.socialService.getFeatureFlags();
  }

  private parseCsv(raw?: string): string[] {
    if (!raw) return [];
    return Array.from(
      new Set(
        String(raw)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  @Get('summary')
  async getSummary(@Headers('authorization') authHeader?: string) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getSummary(user?.id ?? null);
  }

  @Post('analytics/events')
  async ingestAnalyticsEvents(
    @Headers('authorization') authHeader: string | undefined,
    @Body() payload: { events?: unknown[] },
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.ingestAnalyticsEvents(user?.id ?? null, payload);
  }

  @Get('explore/feed')
  async getExploreFeed(
    @Headers('authorization') authHeader?: string,
    @Query('tab') tab = 'all',
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('category') category?: string,
    @Query('price_min') priceMin?: string,
    @Query('price_max') priceMax?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getExploreFeed(
      tab,
      user?.id ?? null,
      limit,
      cursor,
      q,
      sort,
      category,
      priceMin,
      priceMax,
    );
  }

  @Get('users/search')
  async searchUsers(
    @Headers('authorization') authHeader?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.searchUsers(user?.id ?? null, {
      q,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('search/global')
  async searchGlobal(
    @Headers('authorization') authHeader?: string,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('locale') locale?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.searchGlobal(user?.id ?? null, {
      q,
      scope,
      cursor,
      locale,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('search/saved')
  async getSavedSearches(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getSavedSearches(user.id);
  }

  @Post('search/saved')
  async createSavedSearch(
    @Headers('authorization') authHeader: string,
    @Body()
    payload: {
      query?: string;
      scope?: string;
      filters?: Record<string, unknown>;
    },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSavedSearch(user.id, payload);
  }

  @Delete('search/saved/:searchId')
  async deleteSavedSearch(
    @Headers('authorization') authHeader: string,
    @Param('searchId') searchId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.deleteSavedSearch(user.id, searchId);
  }

  @Get('users/suggested')
  async getSuggestedUsers(
    @Headers('authorization') authHeader?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getSuggestedUsers(user?.id ?? null, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('reels')
  async getReels(
    @Headers('authorization') authHeader?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getReels(user?.id ?? null, limit, cursor);
  }

  @Get('statuses')
  async getStatuses(@Headers('authorization') authHeader?: string) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getStatuses(user?.id ?? null);
  }

  @Post('statuses')
  async createStatuses(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createStatuses(user.id, payload);
  }

  @Post('statuses/view')
  async markStatusesViewed(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.markStatusesViewed(user.id, payload);
  }

  @Get('statuses/:statusId/viewers')
  async getStatusViewers(
    @Headers('authorization') authHeader: string,
    @Param('statusId') statusId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getStatusViewers(user.id, statusId);
  }

  @Get('live')
  async getLiveSessions(
    @Headers('authorization') authHeader?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getLiveSessions(user?.id ?? null, status, limit);
  }

  @Get('live/:sessionId')
  async getLiveSessionDetail(
    @Headers('authorization') authHeader: string | undefined,
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getLiveSessionDetail(
      user?.id ?? null,
      sessionId,
      limit,
    );
  }

  @Post('live')
  async createLiveSession(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createLiveSession(user.id, payload);
  }

  @Post('live/:sessionId/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async uploadLiveCover(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.uploadLiveCover(user.id, sessionId, file);
  }

  @Post('live/:sessionId/go-live')
  async goLiveSession(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @Body() payload: { playbackUrl?: string; playbackHlsUrl?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.goLiveSession(user.id, sessionId, payload);
  }

  @Patch('live/:sessionId/start')
  async startLiveSession(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @Body() payload: { playbackUrl?: string; playbackHlsUrl?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.goLiveSession(user.id, sessionId, payload);
  }

  @Post('live/:sessionId/viewer-token')
  async getLiveViewerToken(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getLiveViewerToken(user.id, sessionId);
  }

  @Patch('live/:sessionId/end')
  async endLiveSession(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.endLiveSession(user.id, sessionId);
  }

  @Post('live/:sessionId/join')
  async joinLiveSession(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.joinLiveSession(user.id, sessionId);
  }

  @Post('live/:sessionId/presence/heartbeat')
  async heartbeatLivePresence(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.heartbeatLivePresence(user.id, sessionId);
  }

  @Post('live/:sessionId/leave')
  async leaveLiveSession(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.leaveLiveSession(user.id, sessionId);
  }

  @Post('live/:sessionId/messages')
  async createLiveMessage(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @Body() payload: { body?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createLiveMessage(user.id, sessionId, payload);
  }

  @Post('live/:sessionId/reactions')
  async createLiveReaction(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @Body() payload: { emoji?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createLiveReaction(user.id, sessionId, payload);
  }

  @Post('live/:sessionId/pin-product')
  async pinLiveProduct(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @Body() payload: { productId?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    const productId = String(payload?.productId ?? '').trim();
    return this.socialService.pinLiveProduct(user.id, sessionId, productId);
  }

  @Delete('live/:sessionId/pin-product/:productId')
  async unpinLiveProduct(
    @Headers('authorization') authHeader: string,
    @Param('sessionId') sessionId: string,
    @Param('productId') productId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.unpinLiveProduct(user.id, sessionId, productId);
  }

  @Post('live/provider/webhook')
  async handleLiveProviderWebhook(
    @Headers('x-social-live-webhook-secret') webhookSecret: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.socialService.handleLiveProviderWebhook(webhookSecret, payload);
  }

  @Get('shop/search')
  async getShopSearch(
    @Headers('authorization') authHeader?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('subSubcategoryId') subSubcategoryId?: string,
    @Query('condition') condition?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('source') source?: string,
    @Query('availability') availability?: string,
    @Query('rating') rating?: string,
    @Query('sellerType') sellerType?: string,
    @Query('seller') seller?: string,
    @Query('extras') extras?: string,
    @Query('location') location?: string,
    @Query('radius') radius?: string,
    @Query('filters') filters?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('locale') locale?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    const conditionValues = this.parseCsv(condition);
    const brandValues = this.parseCsv(brand);
    const sizeValues = this.parseCsv(size);
    const colorValues = this.parseCsv(color);
    return this.socialService.getCachedShopSearch(user?.id ?? null, {
      q,
      sort,
      categoryId,
      subcategoryId,
      subSubcategoryId,
      condition: conditionValues[0],
      brand: brandValues[0],
      size: sizeValues[0],
      color: colorValues[0],
      conditionValues,
      brandValues,
      sizeValues,
      colorValues,
      source: this.parseCsv(source),
      availability: this.parseCsv(availability),
      rating: this.parseCsv(rating),
      sellerType: this.parseCsv(sellerType),
      seller: this.parseCsv(seller),
      extras: this.parseCsv(extras),
      location,
      radius,
      dynamicFilters: this.parseDynamicFilters(filters),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      limit: limit ? Number(limit) : undefined,
      cursor,
      locale,
    });
  }

  @Get('category-filters')
  async getCategoryFilters(@Query('categoryId') categoryId?: string) {
    return this.socialService.getCategoryFilters(categoryId);
  }

  @Get('closet/search')
  async getClosetSearch(
    @Headers('authorization') authHeader?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('subSubcategoryId') subSubcategoryId?: string,
    @Query('condition') condition?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('source') source?: string,
    @Query('availability') availability?: string,
    @Query('rating') rating?: string,
    @Query('sellerType') sellerType?: string,
    @Query('seller') seller?: string,
    @Query('extras') extras?: string,
    @Query('location') location?: string,
    @Query('radius') radius?: string,
    @Query('filters') filters?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('locale') locale?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    const conditionValues = this.parseCsv(condition);
    const brandValues = this.parseCsv(brand);
    const sizeValues = this.parseCsv(size);
    const colorValues = this.parseCsv(color);
    return this.socialService.getCachedClosetSearch(user?.id ?? null, {
      q,
      sort,
      categoryId,
      subcategoryId,
      subSubcategoryId,
      condition: conditionValues[0],
      brand: brandValues[0],
      size: sizeValues[0],
      color: colorValues[0],
      conditionValues,
      brandValues,
      sizeValues,
      colorValues,
      source: this.parseCsv(source),
      availability: this.parseCsv(availability),
      rating: this.parseCsv(rating),
      sellerType: this.parseCsv(sellerType),
      seller: this.parseCsv(seller),
      extras: this.parseCsv(extras),
      location,
      radius,
      dynamicFilters: this.parseDynamicFilters(filters),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      limit: limit ? Number(limit) : undefined,
      cursor,
      locale,
    });
  }

  @Get('taxonomy')
  async getTaxonomy() {
    return this.socialService.getTaxonomy();
  }

  @Post('uploads/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 120 * 1024 * 1024,
      },
    }),
  )
  async uploadMedia(
    @Headers('authorization') authHeader: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('kind') kind?: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialUploadService.uploadMedia(user.id, file, kind);
  }

  @Get('profiles/me')
  async getMyProfile(@Headers('authorization') authHeader?: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getProfileByUserId(user.id, user.id);
  }

  @Patch('profiles/me')
  async updateMyProfile(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateMyProfile(user.id, payload);
  }

  @Get('profiles/:username')
  async getProfile(
    @Headers('authorization') authHeader: string | undefined,
    @Param('username') username: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getProfileByUsername(username, user?.id ?? null);
  }

  @Post('profiles/:username/follow')
  async followProfile(
    @Headers('authorization') authHeader: string,
    @Param('username') username: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.followProfileByUsername(user.id, username);
  }

  @Delete('profiles/:username/follow')
  async unfollowProfile(
    @Headers('authorization') authHeader: string,
    @Param('username') username: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.unfollowProfileByUsername(user.id, username);
  }

  @Get('profiles/:username/followers')
  async getProfileFollowers(
    @Headers('authorization') authHeader?: string,
    @Param('username') username?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getProfileFollowers(
      username ?? '',
      user?.id ?? null,
      {
        q,
        limit: limit ? Number(limit) : undefined,
        cursor,
      },
    );
  }

  @Get('profiles/:username/following')
  async getProfileFollowing(
    @Headers('authorization') authHeader?: string,
    @Param('username') username?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getProfileFollowing(
      username ?? '',
      user?.id ?? null,
      {
        q,
        limit: limit ? Number(limit) : undefined,
        cursor,
      },
    );
  }

  @Get('products/my')
  async getMyProducts(@Headers('authorization') authHeader?: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getMyProducts(user.id);
  }

  @Get('products/importable-retail')
  async getImportableRetail(@Headers('authorization') authHeader?: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getImportableRetail(user.id);
  }

  @Post('products/import-retail')
  async importRetailProduct(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.importRetailProduct(user.id, payload);
  }

  @Post('products')
  async createProduct(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createProduct(user.id, payload);
  }

  @Patch('products/:id')
  async updateProduct(
    @Headers('authorization') authHeader: string,
    @Param('id') productId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateProduct(user.id, productId, payload);
  }

  @Post('products/:id/publish')
  async publishProduct(
    @Headers('authorization') authHeader: string,
    @Param('id') productId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.publishProduct(user.id, productId);
  }

  @Post('products/:id/mark-sold')
  async markProductSold(
    @Headers('authorization') authHeader: string,
    @Param('id') productId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.markProductSold(user.id, productId);
  }

  @Get('products/:id')
  async getProduct(
    @Headers('authorization') authHeader: string,
    @Param('id') productIdOrSlug: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    const result = await this.socialService.getProductById(
      productIdOrSlug,
      user?.id ?? null,
    );
    if (!result) {
      throw new NotFoundException('Product not found');
    }
    return result;
  }

  @Post('posts')
  async createPost(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createPost(user.id, payload);
  }

  @Get('posts/:id')
  async getPost(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') postId: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getPostById(postId, user?.id ?? null);
  }

  @Patch('posts/:id')
  async updatePost(
    @Headers('authorization') authHeader: string,
    @Param('id') postId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updatePost(user.id, postId, payload);
  }

  @Post('posts/:id/publish')
  async publishPost(
    @Headers('authorization') authHeader: string,
    @Param('id') postId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.publishPost(user.id, postId);
  }

  @Post('reels')
  async createReel(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createReel(user.id, payload);
  }

  @Get('reels/:id')
  async getReel(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') reelId: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getReelById(reelId, user?.id ?? null);
  }

  @Patch('reels/:id')
  async updateReel(
    @Headers('authorization') authHeader: string,
    @Param('id') reelId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateReel(user.id, reelId, payload);
  }

  @Post('reels/:id/publish')
  async publishReel(
    @Headers('authorization') authHeader: string,
    @Param('id') reelId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.publishReel(user.id, reelId);
  }

  @Post(':contentType/:id/likes')
  async likeContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.likeContent(user.id, contentType, contentId);
  }

  @Delete(':contentType/:id/likes')
  async unlikeContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.unlikeContent(user.id, contentType, contentId);
  }

  @Post(':contentType/:id/saves')
  async saveContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.saveContent(user.id, contentType, contentId);
  }

  @Delete(':contentType/:id/saves')
  async unsaveContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.unsaveContent(user.id, contentType, contentId);
  }

  @Post(':contentType/:id/shares')
  async shareContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
    @Body() payload: { channel?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.shareContent(
      user.id,
      contentType,
      contentId,
      payload,
    );
  }

  @Get(':contentType/:id/comments')
  async getComments(
    @Headers('authorization') authHeader: string | undefined,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.listComments(
      user?.id ?? null,
      contentType,
      contentId,
      {
        cursor,
        limit: limit ? Number(limit) : undefined,
      },
    );
  }

  @Post(':contentType/:id/comments')
  async createComment(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
    @Body() payload: { body?: string; parentCommentId?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createComment(
      user.id,
      contentType,
      contentId,
      payload,
    );
  }

  @Patch('comments/:commentId')
  async updateComment(
    @Headers('authorization') authHeader: string,
    @Param('commentId') commentId: string,
    @Body() payload: { body?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateComment(user.id, commentId, payload);
  }

  @Delete('comments/:commentId')
  async deleteComment(
    @Headers('authorization') authHeader: string,
    @Param('commentId') commentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.deleteComment(user.id, commentId);
  }

  @Get('content-controls/hidden')
  async getHiddenContent(
    @Headers('authorization') authHeader: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('contentType') contentType?: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getHiddenContent(user.id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
      contentType,
    });
  }

  @Get('content-controls/reports')
  async getReportedContent(
    @Headers('authorization') authHeader: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('contentType') contentType?: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getReportedContent(user.id, {
      limit: limit ? Number(limit) : undefined,
      cursor,
      contentType,
    });
  }

  @Post(':contentType/:id/report')
  async reportContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
    @Body() payload: { reason?: string; details?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.reportContent(
      user.id,
      contentType,
      contentId,
      payload,
    );
  }

  @Post(':contentType/:id/hide')
  async hideContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
    @Body()
    payload: { reason?: 'hide' | 'not_interested'; expiresAt?: string | null },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.hideContent(
      user.id,
      contentType,
      contentId,
      payload,
    );
  }

  @Delete(':contentType/:id/hide')
  async unhideContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.unhideContent(user.id, contentType, contentId);
  }

  @Patch(':contentType/:id/status')
  async updateContentStatus(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
    @Body() payload: { status?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateContentStatus(
      user.id,
      contentType,
      contentId,
      payload,
    );
  }

  @Patch('posts/:id/comments-enabled')
  async setPostCommentsEnabled(
    @Headers('authorization') authHeader: string,
    @Param('id') postId: string,
    @Body() payload: { isCommentsEnabled?: boolean },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.setPostCommentsEnabled(
      user.id,
      postId,
      Boolean(payload?.isCommentsEnabled),
    );
  }

  @Delete(':contentType/:id')
  async deleteContent(
    @Headers('authorization') authHeader: string,
    @Param('contentType') contentType: string,
    @Param('id') contentId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.deleteContent(user.id, contentType, contentId);
  }

  @Get('exchange')
  async getExchangeListings(
    @Headers('authorization') authHeader?: string,
    @Query('locale') locale?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('give') give?: string,
    @Query('want') want?: string,
    @Query('value') value?: string,
    @Query('type') type?: string,
    @Query('condition') condition?: string,
    @Query('seller') seller?: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    const parsedLimit = Number(limit);
    const normalizedLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : undefined;
    return this.socialService.getCachedExchangeListings(
      user?.id ?? null,
      locale,
      {
        q,
        status,
        sort,
        give,
        want,
        value,
        type,
        condition,
        seller,
        limit: normalizedLimit,
      },
    );
  }

  @Get('exchange/my')
  async getMyExchangeManager(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getMyExchangeManager(user.id);
  }

  @Post('exchange')
  async createSwapListing(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSwapListing(user.id, payload);
  }

  @Patch('exchange/:listingId')
  async updateSwapListing(
    @Headers('authorization') authHeader: string,
    @Param('listingId') listingId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateSwapListing(user.id, listingId, payload);
  }

  @Post('exchange/:listingId/proposals')
  async createSwapProposal(
    @Headers('authorization') authHeader: string,
    @Param('listingId') listingId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSwapProposal(user.id, listingId, payload);
  }

  @Patch('exchange/proposals/:proposalId')
  async updateSwapProposalAction(
    @Headers('authorization') authHeader: string,
    @Param('proposalId') proposalId: string,
    @Body() payload: { action?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    const action = String(payload?.action ?? '')
      .trim()
      .toLowerCase();
    if (!action) {
      throw new BadRequestException('action is required');
    }
    return this.socialService.updateSwapProposalAction(
      user.id,
      proposalId,
      action as 'accept' | 'decline' | 'withdraw',
    );
  }

  // Backward-compatible endpoints
  @Post('exchange/proposals/:proposalId/accept')
  async acceptSwapProposal(
    @Headers('authorization') authHeader: string,
    @Param('proposalId') proposalId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.acceptSwapProposal(user.id, proposalId);
  }

  @Post('exchange/proposals/:proposalId/decline')
  async declineSwapProposal(
    @Headers('authorization') authHeader: string,
    @Param('proposalId') proposalId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.declineSwapProposal(user.id, proposalId);
  }

  @Get('exchange/transactions')
  async getSwapTransactions(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.listSwapTransactions(user.id);
  }

  @Get('exchange/transactions/:transactionId')
  async getSwapTransactionById(
    @Headers('authorization') authHeader: string,
    @Param('transactionId') transactionId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getSwapTransactionById(user.id, transactionId);
  }

  @Patch('exchange/transactions/:transactionId/address')
  async setSwapTransactionAddress(
    @Headers('authorization') authHeader: string,
    @Param('transactionId') transactionId: string,
    @Body() payload: { addressId?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.setSwapTransactionAddress(
      user.id,
      transactionId,
      payload,
    );
  }

  @Post('exchange/transactions/:transactionId/shipments')
  async addSwapShipment(
    @Headers('authorization') authHeader: string,
    @Param('transactionId') transactionId: string,
    @Body() payload: { carrier?: string; trackingNumber?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.addSwapShipment(user.id, transactionId, payload);
  }

  @Patch('exchange/transactions/:transactionId/confirm-delivery')
  async confirmSwapDelivery(
    @Headers('authorization') authHeader: string,
    @Param('transactionId') transactionId: string,
    @Body() payload: { notes?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.confirmSwapDelivery(
      user.id,
      transactionId,
      payload,
    );
  }

  @Post('exchange/transactions/:transactionId/disputes')
  async openSwapDispute(
    @Headers('authorization') authHeader: string,
    @Param('transactionId') transactionId: string,
    @Body() payload: { reason?: string; details?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.openSwapDispute(user.id, transactionId, payload);
  }

  @Get('exchange/disputes')
  async getSwapDisputes(
    @Headers('authorization') authHeader: string,
    @Query('status') status?: string,
    @Query('queue') queue?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.listSwapDisputes(user.id, {
      status,
      queue: queue === 'true' || queue === '1',
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('exchange/disputes/:disputeId')
  async getSwapDisputeDetail(
    @Headers('authorization') authHeader: string,
    @Param('disputeId') disputeId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getSwapDisputeDetail(user.id, disputeId);
  }

  @Post('exchange/disputes/:disputeId/messages')
  async createSwapDisputeMessage(
    @Headers('authorization') authHeader: string,
    @Param('disputeId') disputeId: string,
    @Body() payload: { body?: string; isInternal?: boolean },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSwapDisputeMessage(
      user.id,
      disputeId,
      payload,
    );
  }

  @Post('exchange/disputes/:disputeId/evidence')
  async createSwapDisputeEvidence(
    @Headers('authorization') authHeader: string,
    @Param('disputeId') disputeId: string,
    @Body()
    payload: {
      fileUrl?: string;
      fileType?: string;
      note?: string;
      isInternal?: boolean;
    },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSwapDisputeEvidence(
      user.id,
      disputeId,
      payload,
    );
  }

  @Patch('exchange/disputes/:disputeId')
  async updateSwapDispute(
    @Headers('authorization') authHeader: string,
    @Param('disputeId') disputeId: string,
    @Body()
    payload: {
      action?: 'resolve' | 'escalate' | 'reopen';
      resolutionNotes?: string;
      priority?: string;
    },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateSwapDispute(user.id, disputeId, payload);
  }

  @Get('exchange/addresses')
  async getSwapAddresses(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getSwapAddresses(user.id);
  }

  @Post('exchange/addresses')
  async createSwapAddress(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSwapAddress(user.id, payload);
  }

  @Patch('exchange/addresses/:addressId')
  async updateSwapAddress(
    @Headers('authorization') authHeader: string,
    @Param('addressId') addressId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateSwapAddress(user.id, addressId, payload);
  }

  @Delete('exchange/addresses/:addressId')
  async deleteSwapAddress(
    @Headers('authorization') authHeader: string,
    @Param('addressId') addressId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.deleteSwapAddress(user.id, addressId);
  }

  @Get('exchange/:listingId')
  async getExchangeListing(
    @Headers('authorization') authHeader: string | undefined,
    @Param('listingId') listingId: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getExchangeListingById(
      listingId,
      user?.id ?? null,
    );
  }

  @Get('messages/threads')
  async getThreads(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getThreads(user.id);
  }

  @Post('messages/threads')
  async createThread(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createThread(user.id, payload);
  }

  @Post('messages/direct')
  async getOrCreateDirectThread(
    @Headers('authorization') authHeader: string,
    @Body() payload: { username?: string; userId?: string },
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getOrCreateDirectThread(user.id, payload);
  }

  @Get('messages/threads/:threadId')
  async getThreadMessages(
    @Headers('authorization') authHeader: string,
    @Param('threadId') threadId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getThreadMessages(user.id, threadId);
  }

  @Post('messages/threads/:threadId/messages')
  async sendMessage(
    @Headers('authorization') authHeader: string,
    @Param('threadId') threadId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.sendThreadMessage(user.id, threadId, payload);
  }

  @Post('messages/threads/:threadId/read')
  async markThreadRead(
    @Headers('authorization') authHeader: string,
    @Param('threadId') threadId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.markThreadRead(user.id, threadId);
  }

  @Get('notifications')
  async getNotifications(
    @Headers('authorization') authHeader: string,
    @Query('filter') filter = 'all',
    @Query('limit') limit?: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getNotifications(
      user.id,
      filter === 'unread' ? 'unread' : 'all',
      limit,
    );
  }

  @Post('notifications/:notificationId/read')
  async markNotificationRead(
    @Headers('authorization') authHeader: string,
    @Param('notificationId') notificationId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.markNotificationRead(user.id, notificationId);
  }

  @Post('notifications/read-all')
  async markAllNotificationsRead(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.markAllNotificationsRead(user.id);
  }

  @Get('orders')
  async getOrders(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.listSalesOrders(user.id);
  }

  @Get('orders/:orderId')
  async getOrderById(
    @Headers('authorization') authHeader: string,
    @Param('orderId') orderId: string,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getSalesOrderById(user.id, orderId);
  }

  @Post('orders')
  async createOrder(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSalesOrder(user.id, payload);
  }

  @Patch('orders/:orderId/status')
  async updateOrderStatus(
    @Headers('authorization') authHeader: string,
    @Param('orderId') orderId: string,
    @Body() payload: any,
  ) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.updateSalesOrderStatus(user.id, orderId, payload);
  }
}
