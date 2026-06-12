import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { BrandsUploadService } from './brands-upload.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AdminModule } from '../../admin/admin.module';
import { PaymentsModule } from '../../payments/payments.module';

@Module({
  imports: [SupabaseModule, AdminModule, PaymentsModule],
  controllers: [BrandsController],
  providers: [BrandsService, BrandsUploadService],
  exports: [BrandsService],
})
export class BrandsModule {}
