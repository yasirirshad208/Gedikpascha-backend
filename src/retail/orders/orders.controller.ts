import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  Headers,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  CreateRetailOrderDto,
  UpdateRetailOrderStatusDto,
  UpdateRetailPaymentStatusDto,
} from './dto/order.dto';

@Controller('retail/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async getUserFromToken(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return null; // Allow guest orders
    }

    try {
      const supabase = this.supabaseService.getClient();
      const { data: userData, error } = await supabase.auth.getUser(token);

      if (error || !userData.user) {
        return null;
      }

      return userData.user;
    } catch {
      return null;
    }
  }

  @Post()
  async createOrder(
    @Body() createOrderDto: CreateRetailOrderDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    const userId = user?.id;
    return this.ordersService.createOrder(createOrderDto, userId);
  }

  @Get()
  async getUserOrders(
    @Headers('authorization') authHeader: string,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    const user = await this.getUserFromToken(authHeader);
    const userId = user?.id;
    if (!userId) {
      return { orders: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } };
    }
    return this.ordersService.getUserOrders(userId, page, limit);
  }

  @Get(':id')
  async getOrderById(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    const userId = user?.id;
    return this.ordersService.getOrderById(id, userId);
  }

  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateRetailOrderStatusDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    const userId = user?.id;
    return this.ordersService.updateOrderStatus(id, updateDto, userId);
  }

  @Patch(':id/payment')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateRetailPaymentStatusDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    const userId = user?.id;
    return this.ordersService.updatePaymentStatus(id, updateDto, userId);
  }
}
