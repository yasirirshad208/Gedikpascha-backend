import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ShopService } from './shop.service';
import { SocialShopSearchDto } from '../common/dto/social-shop-search.dto';

@Controller('social/shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('search')
  async search(@Query(new ValidationPipe({ transform: true })) query: SocialShopSearchDto) {
    return this.shopService.search(query);
  }
}

