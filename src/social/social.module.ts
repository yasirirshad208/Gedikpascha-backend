import { Module } from '@nestjs/common';
import { FeedController } from './feed/feed.controller';
import { FeedService } from './feed/feed.service';
import { ReelsController } from './reels/reels.controller';
import { ReelsService } from './reels/reels.service';
import { ClosetController } from './closet/closet.controller';
import { ClosetService } from './closet/closet.service';
import { ShopController } from './shop/shop.controller';
import { ShopService } from './shop/shop.service';
import { ProfilesController } from './profiles/profiles.controller';
import { ProfilesService } from './profiles/profiles.service';
import { SocialProductsController } from './products/products.controller';
import { SocialProductsService } from './products/products.service';
import { SwapController } from './swap/swap.controller';
import { SwapService } from './swap/swap.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { SocialAuthService } from './common/social-auth.service';

@Module({
  controllers: [
    FeedController,
    ReelsController,
    ClosetController,
    ShopController,
    ProfilesController,
    SocialProductsController,
    SwapController,
    MessagesController,
    NotificationsController,
  ],
  providers: [
    FeedService,
    ReelsService,
    ClosetService,
    ShopService,
    ProfilesService,
    SocialProductsService,
    SwapService,
    MessagesService,
    NotificationsService,
    SocialAuthService,
  ],
})
export class SocialModule {}

