import { Module } from '@nestjs/common';
import { RetailProductsController } from './products.controller';
import { RetailProductsService } from './products.service';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [RetailProductsController],
  providers: [RetailProductsService],
  exports: [RetailProductsService],
})
export class RetailProductsModule {}
