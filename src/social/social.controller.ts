import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired token');
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

  @Get('feed')
  async getFeed(
    @Headers('authorization') authHeader?: string,
    @Query('mode') mode = 'all',
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getFeed(mode as any, user?.id ?? null, limit, cursor);
  }

  @Get('explore')
  async getExplore(@Headers('authorization') authHeader?: string) {
    const user = await this.getOptionalUser(authHeader);
    return this.socialService.getExplore(user?.id ?? null);
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
  async createStatuses(@Headers('authorization') authHeader: string, @Body() payload: any) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createStatuses(user.id, payload);
  }

  @Post('statuses/view')
  async markStatusesViewed(@Headers('authorization') authHeader: string, @Body() payload: any) {
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
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      radiusKm: radiusKm ? Number(radiusKm) : undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('closet/search')
  async getClosetSearch(
    @Headers('authorization') authHeader?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('subcategoryId') subcategoryId?: string,
    @Query('subSubcategoryId') subSubcategoryId?: string,
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
    return this.socialService.getProfileByUserId(user.id);
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
  async getProfile(@Param('username') username: string) {
    return this.socialService.getProfileByUsername(username);
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
  async createProduct(@Headers('authorization') authHeader: string, @Body() payload: any) {
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
  async getProduct(@Headers('authorization') authHeader: string, @Param('id') productId: string) {
    const user = await this.getOptionalUser(authHeader);
    const result = await this.socialService.getProductById(productId, user?.id ?? null);
    if (!result) {
      throw new BadRequestException('Product not found');
    }
    return result;
  }

  @Post('posts')
  async createPost(@Headers('authorization') authHeader: string, @Body() payload: any) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createPost(user.id, payload);
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
  async publishPost(@Headers('authorization') authHeader: string, @Param('id') postId: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.publishPost(user.id, postId);
  }

  @Post('reels')
  async createReel(@Headers('authorization') authHeader: string, @Body() payload: any) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createReel(user.id, payload);
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
  async publishReel(@Headers('authorization') authHeader: string, @Param('id') reelId: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.publishReel(user.id, reelId);
  }

  @Get('exchange')
  async getExchangeListings() {
    return this.socialService.getExchangeListings();
  }

  @Post('exchange')
  async createSwapListing(@Headers('authorization') authHeader: string, @Body() payload: any) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createSwapListing(user.id, payload);
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

  @Get('exchange/:listingId')
  async getExchangeListing(@Param('listingId') listingId: string) {
    return this.socialService.getExchangeListingById(listingId);
  }

  @Get('messages/threads')
  async getThreads(@Headers('authorization') authHeader: string) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.getThreads(user.id);
  }

  @Post('messages/threads')
  async createThread(@Headers('authorization') authHeader: string, @Body() payload: any) {
    const user = await this.getRequiredUser(authHeader);
    return this.socialService.createThread(user.id, payload);
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
  async createOrder(@Headers('authorization') authHeader: string, @Body() payload: any) {
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
