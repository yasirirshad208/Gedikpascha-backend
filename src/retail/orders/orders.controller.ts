import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  CreateRetailOrderDto,
  UpdateRetailOrderStatusDto,
  UpdateRetailPaymentStatusDto,
} from './dto/order.dto';

@Controller('retail/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(@Body() createOrderDto: CreateRetailOrderDto, @Req() req) {
    const userId = req.user?.id;
    return this.ordersService.createOrder(createOrderDto, userId);
  }

  @Get()
  async getUserOrders(
    @Req() req,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      return { orders: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } };
    }
    return this.ordersService.getUserOrders(userId, page, limit);
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string, @Req() req) {
    const userId = req.user?.id;
    return this.ordersService.getOrderById(id, userId);
  }

  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateRetailOrderStatusDto,
    @Req() req,
  ) {
    const userId = req.user?.id;
    return this.ordersService.updateOrderStatus(id, updateDto, userId);
  }

  @Patch(':id/payment')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateRetailPaymentStatusDto,
    @Req() req,
  ) {
    const userId = req.user?.id;
    return this.ordersService.updatePaymentStatus(id, updateDto, userId);
  }
}
