import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  SyncCartDto,
} from './dto/cart.dto';

@Controller('wholesale/cart')
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

  @Get('count')
  async getCartCount(@Headers('authorization') authHeader: string) {
    const user = await this.getUserFromToken(authHeader);
    const count = await this.cartService.getCartCount(user.id);
    return { count };
  }

  @Post('add')
  @UsePipes(new ValidationPipe({ transform: true }))
  async addToCart(
    @Headers('authorization') authHeader: string,
    @Body() addToCartDto: AddToCartDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.addToCart(user.id, addToCartDto);
  }

  @Put('item/:id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateCartItem(
    @Headers('authorization') authHeader: string,
    @Param('id') cartItemId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.updateCartItem(user.id, cartItemId, updateCartItemDto);
  }

  @Delete('item/:id')
  async removeCartItem(
    @Headers('authorization') authHeader: string,
    @Param('id') cartItemId: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.removeCartItem(user.id, cartItemId);
  }

  @Delete('remove')
  async removeFromCart(
    @Headers('authorization') authHeader: string,
    @Query('productId') productId: string,
    @Query('packSizeId') packSizeId?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.removeFromCart(user.id, productId, packSizeId);
  }

  @Delete('clear')
  async clearCart(@Headers('authorization') authHeader: string) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.clearCart(user.id);
  }

  @Post('sync')
  @UsePipes(new ValidationPipe({ transform: true }))
  async syncCart(
    @Headers('authorization') authHeader: string,
    @Body() syncCartDto: SyncCartDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.cartService.syncCart(user.id, syncCartDto);
  }
}
