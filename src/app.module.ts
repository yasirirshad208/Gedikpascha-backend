import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerBehindProxyGuard } from './common/throttler-proxy.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
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
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    // Rate limiting: two tiers per visitor IP (resolved via ThrottlerBehindProxyGuard).
    //  - 'short': blocks rapid floods  (max 30 requests / second)
    //  - 'long' : blocks sustained abuse (max 300 requests / minute)
    // Generous enough for normal browsing (a page fires several API calls),
    // strict enough to stop a single bot hammering the API.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 30 },
      { name: 'long', ttl: 60000, limit: 300 },
    ]),
    SupabaseModule,
    CloudinaryModule,
    AuthModule,
    BrandsModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    FavouritesModule,
    ReviewsModule,
    RetailBrandsModule,
    RetailProductsModule,
    RetailCartModule,
    RetailOrdersModule,
    RetailModule,
    AdminModule,
    PublicCategoriesModule,
    SocialModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Rate limiter runs first (before auth/admin checks) to shield the API.
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AdminOnlyGuard,
    },
  ],
})
export class AppModule {}
