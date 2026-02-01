import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { BrandsService } from '../brands/brands.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
} from './dto/order.dto';

@Controller('wholesale/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly supabaseService: SupabaseService,
    private readonly brandsService: BrandsService,
  ) {}

  private async getUserFromToken(authHeader?: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return null;
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

  private async requireAuth(authHeader?: string) {
    const user = await this.getUserFromToken(authHeader);
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }

  // Create a new order (works for both logged-in and guest users)
  @Post()
  @UsePipes(new ValidationPipe({ transform: true }))
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.ordersService.createOrder(createOrderDto, user?.id);
  }

  // Get user's orders (requires authentication)
  @Get()
  async getUserOrders(
    @Headers('authorization') authHeader: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.requireAuth(authHeader);
    return this.ordersService.getUserOrders(
      user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // Track order by order number (for guests and logged-in users)
  @Get('track/:orderNumber')
  async trackOrder(
    @Param('orderNumber') orderNumber: string,
    @Query('email') email?: string,
  ) {
    return this.ordersService.getOrderByNumber(orderNumber, email);
  }

  // Get brand's orders (for brand owners - orders containing their products)
  @Get('brand/my-orders')
  async getBrandOrders(
    @Headers('authorization') authHeader: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const user = await this.requireAuth(authHeader);

    // Get the user's brand
    const brand = await this.brandsService.getMyBrand(user.id);
    if (!brand) {
      throw new ForbiddenException('You do not have a registered brand');
    }

    if (brand.status !== 'approved') {
      throw new ForbiddenException('Your brand is not approved yet');
    }

    return this.ordersService.getBrandOrders(
      brand.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 12,
      search,
      status,
    );
  }

  // Get brand's order by ID (for brand owners - only shows their products)
  @Get('brand/my-orders/:id')
  async getBrandOrderById(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.requireAuth(authHeader);

    // Get the user's brand
    const brand = await this.brandsService.getMyBrand(user.id);
    if (!brand) {
      throw new ForbiddenException('You do not have a registered brand');
    }

    if (brand.status !== 'approved') {
      throw new ForbiddenException('Your brand is not approved yet');
    }

    return this.ordersService.getBrandOrderById(id, brand.id);
  }

  // Get brand analytics
  @Get('brand/analytics')
  async getBrandAnalytics(
    @Headers('authorization') authHeader: string,
    @Query('dateRange') dateRange?: string,
  ) {
    const user = await this.requireAuth(authHeader);

    // Get the user's brand
    const brand = await this.brandsService.getMyBrand(user.id);
    if (!brand) {
      throw new ForbiddenException('You do not have a registered brand');
    }

    if (brand.status !== 'approved') {
      throw new ForbiddenException('Your brand is not approved yet');
    }

    return this.ordersService.getBrandAnalytics(brand.id, dateRange || 'last-30-days');
  }

  // Get order by ID (for logged-in users)
  @Get(':id')
  async getOrderById(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.requireAuth(authHeader);
    return this.ordersService.getOrderById(id, user.id);
  }

  // Update order status (admin only - for now simplified)
  @Put(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrderStatusDto,
    @Headers('authorization') authHeader: string,
  ) {
    await this.requireAuth(authHeader);
    return this.ordersService.updateOrderStatus(id, updateDto);
  }

  // Update payment status (admin/webhook)
  @Put(':id/payment')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdatePaymentStatusDto,
    @Headers('authorization') authHeader: string,
  ) {
    await this.requireAuth(authHeader);
    return this.ordersService.updatePaymentStatus(id, updateDto);
  }
}
