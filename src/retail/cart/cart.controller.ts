import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  SyncCartDto,
} from './dto/cart.dto';

@Controller('retail/cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async getUserFromToken(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return userData.user;
  }

  @Get()
  async getCart(@Headers('authorization') authHeader: string) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.getCart(user.id);
  }

  @Post()
  async addToCart(
    @Headers('authorization') authHeader: string,
    @Body() dto: AddToCartDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.addToCart(user.id, dto);
  }

  @Put(':id')
  async updateCartItem(
    @Headers('authorization') authHeader: string,
    @Param('id') cartItemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.updateCartItem(user.id, cartItemId, dto);
  }

  @Delete(':id')
  async removeFromCart(
    @Headers('authorization') authHeader: string,
    @Param('id') cartItemId: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.removeFromCart(user.id, cartItemId);
  }

  @Delete()
  async clearCart(@Headers('authorization') authHeader: string) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.clearCart(user.id);
  }

  @Post('sync')
  async syncGuestCart(
    @Headers('authorization') authHeader: string,
    @Body() dto: SyncCartDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.syncGuestCart(user.id, dto);
  }
}
