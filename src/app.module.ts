import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './wholesale/brands/brands.module';
import { ProductsModule } from './wholesale/products/products.module';
import { CartModule } from './wholesale/cart/cart.module';
import { OrdersModule } from './wholesale/orders/orders.module';
import { FavouritesModule } from './wholesale/favourites/favourites.module';
import { ReviewsModule } from './wholesale/reviews/reviews.module';
import { AdminModule } from './admin/admin.module';
import { PublicCategoriesModule } from './public/categories/categories.module';

@Module({
  imports: [SupabaseModule, AuthModule, BrandsModule, ProductsModule, CartModule, OrdersModule, FavouritesModule, ReviewsModule, AdminModule, PublicCategoriesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
