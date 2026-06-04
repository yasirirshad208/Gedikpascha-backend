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

  // Address management (MUST be before :id routes)
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

  // Marketplace endpoints (MUST be before :id routes)
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
  async getRetailerProducts(
    @Param('retailerId') retailerId: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('priceRange') priceRange?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.exchangesService.getRetailerProducts(retailerId, {
      search,
      category,
      sortBy,
      priceRange,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 24,
    });
  }

  @Get('marketplace/all-products')
  async getAllExchangeableProducts(
    @Headers('authorization') authHeader: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('priceRange') priceRange?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getAllExchangeableProducts(user.id, {
      search,
      category,
      sortBy,
      priceRange,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 24,
    });
  }

  // Parameterized :id routes (MUST be LAST to avoid matching static routes)
  @Get(':id')
  async getExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getExchangeById(id, user.id);
  }

  @Patch(':id/approve')
  async approveExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body('receiverAddressId') receiverAddressId: string,
    @Body('selectedInitiatorItems') selectedInitiatorItems?: any[],
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.approveExchange(
      id,
      user.id,
      receiverAddressId,
      selectedInitiatorItems,
    );
  }

  @Patch(':id/reject')
  async rejectExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body('reason') reason?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.rejectExchange(id, user.id, reason);
  }

  @Patch(':id/cancel')
  async cancelExchange(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body('reason') reason?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.cancelExchange(id, user.id, reason);
  }

  @Patch(':id/delivery')
  async updateDeliveryStatus(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Body() updateDto: UpdateDeliveryStatusDto,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.updateDeliveryStatus(id, user.id, updateDto);
  }

  @Get(':id/initiator-products')
  async getInitiatorProducts(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('priceRange') priceRange?: string,
    @Query('category') category?: string,
  ) {
    const user = await this.getUserFromToken(authHeader);
    return this.exchangesService.getInitiatorProducts(id, user.id, {
      search,
      sortBy,
      priceRange,
      category,
    });
  }
}
