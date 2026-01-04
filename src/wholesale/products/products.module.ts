import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsUploadService } from './products-upload.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsUploadService],
  exports: [ProductsService],
})
export class ProductsModule {}

