import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { SocialController } from './social.controller';
import { SocialLiveProviderService } from './live-provider.service';
import { SocialService } from './social.service';
import { SocialUploadService } from './social-upload.service';

@Module({
  imports: [SupabaseModule],
  controllers: [SocialController],
  providers: [SocialService, SocialUploadService, SocialLiveProviderService],
  exports: [SocialService],
})
export class SocialModule {}
