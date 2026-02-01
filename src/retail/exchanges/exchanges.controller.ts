import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ExchangesService } from './exchanges.service';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  CreateExchangeDto,
  UpdateDeliveryStatusDto,
  CreateAddressDto,
} from './dto';

@Controller('retail/exchanges')
export class ExchangesController {
  constructor(
    private readonly exchangesService: ExchangesService,
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

  // Create new exchange request
  @Post()
  async createExchange(
    @Headers('authorization') authHeader: string,
    @Body() createExchangeDto: CreateExchangeDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.createExchange(user.id, createExchangeDto);
  }

  // Get all exchanges for current user
  @Get()
  async getExchanges(
    @Headers('authorization') authHeader: string,
    @Query('role') role?: 'initiator' | 'receiver',
    @Query('status') status?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getExchanges(user.id, role, status);
  }

  // Get single exchange by ID
  @Get(':id')
  async getExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getExchangeById(id, user.id);
  }

  // Approve exchange (receiver action)
  @Patch(':id/approve')
  async approveExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body('receiverAddressId') receiverAddressId: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.approveExchange(id, user.id, receiverAddressId);
  }

  // Reject exchange (receiver action)
  @Patch(':id/reject')
  async rejectExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body('reason') reason?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.rejectExchange(id, user.id, reason);
  }

  // Cancel exchange (initiator action)
  @Patch(':id/cancel')
  async cancelExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body('reason') reason?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.cancelExchange(id, user.id, reason);
  }

  // Update delivery status
  @Patch(':id/delivery')
  async updateDeliveryStatus(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body() updateDto: UpdateDeliveryStatusDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.updateDeliveryStatus(id, user.id, updateDto);
  }

  // Address management
  @Get('addresses/list')
  async getAddresses(@Headers('authorization') authHeader: string) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getAddresses(user.id);
  }

  @Post('addresses')
  async createAddress(
    @Headers('authorization') authHeader: string,
    @Body() createAddressDto: CreateAddressDto,
  ) {
    console.log('createAddress called with:', createAddressDto);
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.createAddress(user.id, createAddressDto);
  }

  @Delete('addresses/:id')
  async deleteAddress(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.deleteAddress(user.id, id);
  }

  // Marketplace endpoints
  @Get('marketplace/retailers')
  async getRetailers(
    @Headers('authorization') authHeader: string,
    @Query('search') search?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getRetailers(user.id, search);
  }

  @Get('marketplace/my-products')
  async getMyProducts(@Headers('authorization') authHeader: string) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getAvailableProducts(user.id);
  }

  @Get('marketplace/retailer-products/:retailerId')
  async getRetailerProducts(@Param('retailerId') retailerId: string) {
    return this.exchangesService.getRetailerProducts(retailerId);
  }
}
