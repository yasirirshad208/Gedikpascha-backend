import { Controller, Get, Headers, Param } from '@nestjs/common';
import { SocialAuthService } from '../common/social-auth.service';
import { ProfilesService } from './profiles.service';

@Controller('social/profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Get('me')
  async getMyProfile(@Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.profilesService.getProfileByUserId(user.id);
  }

  @Get(':username')
  async getProfile(@Param('username') username: string) {
    return this.profilesService.getProfile(username);
  }
}
