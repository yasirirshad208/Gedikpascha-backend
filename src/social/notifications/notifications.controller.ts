import { Controller, Get, Headers, Param, Post, Query, ValidationPipe } from '@nestjs/common';
import { SocialAuthService } from '../common/social-auth.service';
import { NotificationsService } from './notifications.service';
import { SocialNotificationQueryDto } from './dto/social-notification-query.dto';

@Controller('social/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Get()
  async list(
    @Query(new ValidationPipe({ transform: true })) query: SocialNotificationQueryDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.notificationsService.list(user.id, query);
  }

  @Post(':id/read')
  async markRead(@Param('id') notificationId: string, @Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.notificationsService.markRead(user.id, notificationId);
  }

  @Post('read-all')
  async markAllRead(@Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.notificationsService.markAllRead(user.id);
  }
}

