import { Module } from '@nestjs/common';
import { PublicCategoriesController } from './categories.controller';
import { PublicCategoriesService } from './categories.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [PublicCategoriesController],
  providers: [PublicCategoriesService],
  exports: [PublicCategoriesService],
})
export class PublicCategoriesModule {}
