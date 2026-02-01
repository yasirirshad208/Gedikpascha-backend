import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SupabaseModule } from '../../supabase/supabase.module';
import { RetailCartModule } from '../cart/cart.module';

@Module({
  imports: [SupabaseModule, RetailCartModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class RetailOrdersModule {}
