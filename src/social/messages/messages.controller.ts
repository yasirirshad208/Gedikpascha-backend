import { Body, Controller, Get, Headers, Param, Post, ValidationPipe } from '@nestjs/common';
import { SocialAuthService } from '../common/social-auth.service';
import { MessagesService } from './messages.service';
import { SendSocialMessageDto } from './dto/send-social-message.dto';

@Controller('social/messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Get('threads')
  async getThreads(@Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.messagesService.getThreads(user.id);
  }

  @Get('threads/:threadId')
  async getMessages(@Param('threadId') threadId: string, @Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.messagesService.getMessages(user.id, threadId);
  }

  @Post('threads/:threadId/messages')
  async sendMessage(
    @Param('threadId') threadId: string,
    @Body(new ValidationPipe({ transform: true })) dto: SendSocialMessageDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.messagesService.sendMessage(user.id, threadId, dto);
  }
}

