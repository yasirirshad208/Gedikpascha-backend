import { Body, Controller, Get, Headers, Post, Query, ValidationPipe } from '@nestjs/common';
import { FeedService } from './feed.service';
import { SocialAuthService } from '../common/social-auth.service';
import { SocialFeedQueryDto } from '../common/dto/social-feed-query.dto';

@Controller('social')
export class FeedController {
  constructor(
    private readonly feedService: FeedService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Get('feed')
  async getFeed(@Query(new ValidationPipe({ transform: true })) query: SocialFeedQueryDto, @Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getOptionalUser(authHeader);
    return this.feedService.getFeed(
      user?.id,
      query.mode || 'all',
      query.limit || 20,
      query.cursor,
    );
  }

  @Get('explore')
  async getExplore(@Query('limit') limit?: string) {
    return this.feedService.getExplore(limit ? Number(limit) : 20);
  }

  @Post('posts')
  async createPost(
    @Body()
    body: {
      caption: string;
      mediaUrls?: string[];
      taggedProductIds?: string[];
    },
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.feedService.createPost(user.id, body);
  }
}

