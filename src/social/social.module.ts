import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialUploadService } from './social-upload.service';

@Module({
  imports: [SupabaseModule],
  controllers: [SocialController],
  providers: [SocialService, SocialUploadService],
  exports: [SocialService],
})
export class SocialModule {}
