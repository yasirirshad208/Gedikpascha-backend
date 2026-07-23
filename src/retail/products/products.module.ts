import { Module } from '@nestjs/common';
import { RetailProductsController } from './products.controller';
import { RetailProductsService } from './products.service';
import { RetailProductsUploadService } from './products-upload.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [RetailProductsController],
  providers: [RetailProductsService, RetailProductsUploadService],
  exports: [RetailProductsService],
})
export class RetailProductsModule {}
