import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { CartModule } from '../cart/cart.module';
import { BrandsModule } from '../brands/brands.module';

@Module({
  imports: [SupabaseModule, CartModule, BrandsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
