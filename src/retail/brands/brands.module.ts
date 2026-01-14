import { Module } from '@nestjs/common';
import { RetailBrandsController } from './brands.controller';
import { RetailBrandsService } from './brands.service';
import { RetailBrandsUploadService } from './brands-upload.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AdminModule } from '../../admin/admin.module';

@Module({
  imports: [SupabaseModule, AdminModule],
  controllers: [RetailBrandsController],
  providers: [RetailBrandsService, RetailBrandsUploadService],
  exports: [RetailBrandsService],
})
export class RetailBrandsModule {}
