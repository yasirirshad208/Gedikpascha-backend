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
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getFeed(
      mode as any,
      user?.id ?? null,
      limit,
      cursor,
    );
  }

  @Get('explore')
  async getExplore(@Headers('authorization') authHeader?: string) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getExplore(user?.id ?? null);
  }

  @Get('explore/feed')
  async getExploreFeed(
    @Headers('authorization') authHeader?: string,
    @Query('tab') tab = 'all',
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('q') q?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getExploreFeed(
      tab,
      user?.id ?? null,
      limit,
      cursor,
      q,
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

  @Get('shop/search')
  async getShopSearch(
    @Headers('authorization') authHeader?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('subSubcategoryId') subSubcategoryId?: string,
    @Query('condition') condition?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('filters') filters?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getShopSearch(user?.id ?? null, {
      q,
      categoryId,
      subcategoryId,
      subSubcategoryId,
      condition,
      brand,
      size,
      color,
      dynamicFilters: this.parseDynamicFilters(filters),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      limit: limit ? Number(limit) : undefined,
      cursor,
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
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('subSubcategoryId') subSubcategoryId?: string,
    @Query('condition') condition?: string,
    @Query('brand') brand?: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('filters') filters?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getClosetSearch(user?.id ?? null, {
      q,
      categoryId,
      subcategoryId,
      subSubcategoryId,
      condition,
      brand,
      size,
      color,
      dynamicFilters: this.parseDynamicFilters(filters),
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      limit: limit ? Number(limit) : undefined,
      cursor,
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
  async getExchangeListings(@Headers('authorization') authHeader?: string) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getExchangeListings(user?.id ?? null);
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
    return this.socialService.confirmSwapDelivery(user.id, transactionId, payload);
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
    return this.socialService.getExchangeListingById(listingId, user?.id ?? null);
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
