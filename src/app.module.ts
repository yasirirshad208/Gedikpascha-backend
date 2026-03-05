import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { RetailBrandsModule } from './retail/brands/brands.module';
import { RetailProductsModule } from './retail/products/products.module';
import { RetailCartModule } from './retail/cart/cart.module';
import { RetailOrdersModule } from './retail/orders/orders.module';
import { RetailModule } from './retail/retail.module';
import { AdminModule } from './admin/admin.module';
import { PublicCategoriesModule } from './public/categories/categories.module';
import { AdminOnlyGuard } from './admin/guards/admin-only.guard';
import { SocialModule } from './social/social.module';

@Module({
  imports: [SupabaseModule, AuthModule, BrandsModule, ProductsModule, CartModule, OrdersModule, FavouritesModule, ReviewsModule, RetailBrandsModule, RetailProductsModule, RetailCartModule, RetailOrdersModule, RetailModule, AdminModule, PublicCategoriesModule, SocialModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AdminOnlyGuard,
    },
  ],
})
export class AppModule {}
