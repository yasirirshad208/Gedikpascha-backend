import { Body, Controller, Get, Headers, Post, Query, ValidationPipe } from '@nestjs/common';
import { SocialAuthService } from '../common/social-auth.service';
import { ReelsService } from './reels.service';
import { SocialReelQueryDto } from './dto/social-reel-query.dto';
import { CreateSocialReelDto } from './dto/create-social-reel.dto';

@Controller('social/reels')
export class ReelsController {
  constructor(
    private readonly reelsService: ReelsService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Get()
  async getReels(
    @Query(new ValidationPipe({ transform: true })) query: SocialReelQueryDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getOptionalUser(authHeader);
    return this.reelsService.getReelsFeed(
      user?.id,
      query.limit || 20,
      query.cursor,
      query.category,
    );
  }

  @Post()
  async createReel(
    @Body(new ValidationPipe({ transform: true })) dto: CreateSocialReelDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.reelsService.createReel(user.id, dto);
  }
}

