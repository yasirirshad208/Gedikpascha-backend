import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  CreateExchangeDto,
  UpdateExchangeStatusDto,
  UpdateDeliveryStatusDto,
  CreateAddressDto,
} from './dto';

@Injectable()
export class ExchangesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // Create a new exchange request
  async createExchange(userId: string, createExchangeDto: CreateExchangeDto) {
    const supabase = this.supabaseService.getServiceClient();

    // Verify user is not trying to exchange with themselves
    if (userId === createExchangeDto.receiverId) {
      throw new BadRequestException('Cannot create exchange with yourself');
    }

    // Verify both users have approved retail brands
    const { data: retailBrands, error: brandsError } = await supabase
      .from('retail_brands')
      .select('id, user_id')
      .in('user_id', [userId, createExchangeDto.receiverId])
      .eq('status', 'approved');

    if (brandsError) {
      throw new BadRequestException(`User verification failed: ${brandsError.message}`);
    }
    
    if (!retailBrands || retailBrands.length !== 2) {
      throw new BadRequestException(`Both users must be approved retailers - found ${retailBrands?.length || 0} approved retail brands`);
    }

    const initiatorBrand = retailBrands.find((b) => b.user_id === userId);
    const receiverBrand = retailBrands.find((b) => b.user_id === createExchangeDto.receiverId);

    if (!initiatorBrand || !receiverBrand) {
      throw new ForbiddenException('Both users must have approved retail brands to create exchanges');
    }

    // Calculate total prices
    const initiatorTotal = createExchangeDto.initiatorItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );
    const receiverTotal = createExchangeDto.receiverItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );
    const priceDifference = receiverTotal - initiatorTotal;

    // Create the exchange
    const { data: exchange, error: exchangeError } = await supabase
      .from('retail_product_exchanges')
      .insert({
        initiator_id: userId,
        receiver_id: createExchangeDto.receiverId,
        initiator_address_id: createExchangeDto.initiatorAddressId,
        receiver_address_id: createExchangeDto.receiverAddressId || null,
        initiator_notes: createExchangeDto.initiatorNotes,
        price_difference: priceDifference,
        status: 'pending',
        payment_method: 'cod',
        payment_status: priceDifference === 0 ? 'paid' : 'pending',
      })
      .select()
      .single();

    if (exchangeError || !exchange) {
      throw new BadRequestException(`Failed to create exchange: ${exchangeError?.message || 'Unknown error'}`);
    }

    // Insert initiator items
    const initiatorItemsData = createExchangeDto.initiatorItems.map((item) => ({
      exchange_id: exchange.id,
      side: 'initiator',
      product_id: item.productId,
      product_name: item.productName,
      product_image_url: item.productImageUrl,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      variation_details: item.variationDetails,
    }));

    const { error: initiatorItemsError } = await supabase
      .from('retail_exchange_items')
      .insert(initiatorItemsData);

    if (initiatorItemsError) {
      // Rollback: delete the exchange
      await supabase.from('retail_product_exchanges').delete().eq('id', exchange.id);
      throw new BadRequestException(`Failed to add initiator items: ${initiatorItemsError.message}`);
    }

    // Insert receiver items
    const receiverItemsData = createExchangeDto.receiverItems.map((item) => ({
      exchange_id: exchange.id,
      side: 'receiver',
      product_id: item.productId,
      product_name: item.productName,
      product_image_url: item.productImageUrl,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      variation_details: item.variationDetails,
    }));

    const { error: receiverItemsError } = await supabase
      .from('retail_exchange_items')
      .insert(receiverItemsData);

    if (receiverItemsError) {
      // Rollback: delete the exchange and initiator items
      await supabase.from('retail_product_exchanges').delete().eq('id', exchange.id);
      throw new BadRequestException(`Failed to add receiver items: ${receiverItemsError.message}`);
    }

    // Add timeline entry
    await this.addTimelineEntry(
      exchange.id,
      'exchange_created',
      'Exchange request created',
      userId,
    );

    // Return the complete exchange with items
    return this.getExchangeById(exchange.id, userId);
  }

  // Get exchange by ID
  async getExchangeById(exchangeId: string, userId: string) {
    const supabase = this.supabaseService.getServiceClient();

    const { data: exchange, error } = await supabase
      .from('retail_product_exchanges')
      .select('*')
      .eq('id', exchangeId)
      .single();

    if (error || !exchange) {
      throw new NotFoundException('Exchange not found');
    }

    // Verify user is part of the exchange
    if (exchange.initiator_id !== userId && exchange.receiver_id !== userId) {
      throw new ForbiddenException('You are not authorized to view this exchange');
    }

    // Get exchange items
    const { data: items } = await supabase
      .from('retail_exchange_items')
      .select('*')
      .eq('exchange_id', exchangeId);

    // Get timeline
    const { data: timeline } = await supabase
      .from('retail_exchange_timeline')
      .select('*')
      .eq('exchange_id', exchangeId)
      .order('created_at', { ascending: false });

    // Get addresses - filter out null values
    const addressIds = [exchange.initiator_address_id, exchange.receiver_address_id].filter(Boolean);
    const { data: addresses } = addressIds.length > 0 ? await supabase
      .from('retail_exchange_addresses')
      .select('*')
      .in('id', addressIds) : { data: [] };

    return {
      ...exchange,
      items: items || [],
      timeline: timeline || [],
      addresses: addresses || [],
    };
  }

  // Get all exchanges for a user
  async getExchanges(userId: string, role?: 'initiator' | 'receiver', status?: string) {
    const supabase = this.supabaseService.getServiceClient();

    let query = supabase
      .from('retail_product_exchanges')
      .select('*, retail_exchange_items(*)');

    // Apply role filter
    if (role === 'initiator') {
      query = query.eq('initiator_id', userId);
    } else if (role === 'receiver') {
      query = query.eq('receiver_id', userId);
    } else {
      // If no role specified, get exchanges where user is either initiator or receiver
      query = query.or(`initiator_id.eq.${userId},receiver_id.eq.${userId}`);
    }

    // Apply status filter
    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false });

    const { data: exchanges, error } = await query;

    if (error) {
      throw new BadRequestException('Failed to fetch exchanges');
    }

    // Transform the response to rename retail_exchange_items to items
    return (exchanges || []).map(exchange => ({
      ...exchange,
      items: exchange.retail_exchange_items || [],
    }));
  }

  // Approve exchange (receiver action)
  async approveExchange(exchangeId: string, userId: string, receiverAddressId: string) {
    const exchange = await this.getExchangeById(exchangeId, userId);

    if (exchange.receiver_id !== userId) {
      throw new ForbiddenException('Only the receiver can approve the exchange');
    }

    if (exchange.status !== 'pending') {
      throw new BadRequestException('Exchange is not in pending status');
    }

    const supabase = this.supabaseService.getServiceClient();

    // Update exchange status to approved and set receiver address
    const { error } = await supabase
      .from('retail_product_exchanges')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        receiver_address_id: receiverAddressId,
      })
      .eq('id', exchangeId);

    if (error) {
      throw new BadRequestException('Failed to approve exchange');
    }

    // Lock inventory for both sides
    await this.lockInventory(exchangeId);

    // Add timeline entry
    await this.addTimelineEntry(
      exchangeId,
      'exchange_approved',
      'Exchange approved by receiver',
      userId,
    );

    return this.getExchangeById(exchangeId, userId);
  }

  // Reject exchange (receiver action)
  async rejectExchange(exchangeId: string, userId: string, reason?: string) {
    const exchange = await this.getExchangeById(exchangeId, userId);

    if (exchange.receiver_id !== userId) {
      throw new ForbiddenException('Only the receiver can reject the exchange');
    }

    if (exchange.status !== 'pending') {
      throw new BadRequestException('Exchange is not in pending status');
    }

    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('retail_product_exchanges')
      .update({
        status: 'rejected',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', exchangeId);

    if (error) {
      throw new BadRequestException('Failed to reject exchange');
    }

    await this.addTimelineEntry(
      exchangeId,
      'exchange_rejected',
      `Exchange rejected${reason ? ': ' + reason : ''}`,
      userId,
    );

    return this.getExchangeById(exchangeId, userId);
  }

  // Cancel exchange (initiator action, only before approval)
  async cancelExchange(exchangeId: string, userId: string, reason?: string) {
    const exchange = await this.getExchangeById(exchangeId, userId);

    if (exchange.initiator_id !== userId) {
      throw new ForbiddenException('Only the initiator can cancel the exchange');
    }

    if (exchange.status !== 'pending') {
      throw new BadRequestException('Can only cancel pending exchanges');
    }

    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('retail_product_exchanges')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', exchangeId);

    if (error) {
      throw new BadRequestException('Failed to cancel exchange');
    }

    await this.addTimelineEntry(
      exchangeId,
      'exchange_cancelled',
      `Exchange cancelled${reason ? ': ' + reason : ''}`,
      userId,
    );

    return this.getExchangeById(exchangeId, userId);
  }

  // Update delivery status
  async updateDeliveryStatus(
    exchangeId: string,
    userId: string,
    updateDto: UpdateDeliveryStatusDto,
  ) {
    const exchange = await this.getExchangeById(exchangeId, userId);

    if (exchange.status !== 'approved' && exchange.status !== 'in_transit') {
      throw new BadRequestException('Invalid exchange status for delivery update');
    }

    const supabase = this.supabaseService.getClient();
    const isInitiator = exchange.initiator_id === userId;

    const updateData: any = {};

    if (isInitiator) {
      updateData.initiator_delivery_status = updateDto.deliveryStatus;
      if (updateDto.trackingNumber) {
        updateData.initiator_tracking_number = updateDto.trackingNumber;
      }
    } else {
      updateData.receiver_delivery_status = updateDto.deliveryStatus;
      if (updateDto.trackingNumber) {
        updateData.receiver_tracking_number = updateDto.trackingNumber;
      }
    }

    // Update to in_transit if either party ships
    if (updateDto.deliveryStatus === 'shipped' || updateDto.deliveryStatus === 'in_transit') {
      updateData.status = 'in_transit';
      if (!exchange.shipped_at) {
        updateData.shipped_at = new Date().toISOString();
      }
    }

    const { error } = await supabase
      .from('retail_product_exchanges')
      .update(updateData)
      .eq('id', exchangeId);

    if (error) {
      throw new BadRequestException('Failed to update delivery status');
    }

    await this.addTimelineEntry(
      exchangeId,
      'delivery_status_updated',
      `Delivery status updated to ${updateDto.deliveryStatus} by ${isInitiator ? 'initiator' : 'receiver'}`,
      userId,
    );

    // Check if both parties have delivered
    const updatedExchange = await this.getExchangeById(exchangeId, userId);
    if (
      updatedExchange.initiator_delivery_status === 'delivered' &&
      updatedExchange.receiver_delivery_status === 'delivered'
    ) {
      await this.completeExchange(exchangeId);
    }

    return updatedExchange;
  }

  // Complete exchange (auto-called when both parties confirm delivery)
  async completeExchange(exchangeId: string) {
    const supabase = this.supabaseService.getClient();

    // Update exchange status
    const { error: exchangeError } = await supabase
      .from('retail_product_exchanges')
      .update({
        status: 'completed',
        delivered_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', exchangeId);

    if (exchangeError) {
      throw new BadRequestException('Failed to complete exchange');
    }

    // Release inventory locks and add products to shops
    await this.releaseInventoryAndAddProducts(exchangeId);

    await this.addTimelineEntry(
      exchangeId,
      'exchange_completed',
      'Exchange completed successfully - products released',
      null,
    );
  }

  // Lock inventory for exchange
  private async lockInventory(exchangeId: string) {
    const supabase = this.supabaseService.getClient();

    // Get exchange items
    const { data: items, error: itemsError } = await supabase
      .from('retail_exchange_items')
      .select('*')
      .eq('exchange_id', exchangeId);

    if (itemsError || !items) {
      throw new BadRequestException('Failed to fetch exchange items');
    }

    // Get exchange to know who owns what
    const { data: exchange, error: exchangeError } = await supabase
      .from('retail_product_exchanges')
      .select('initiator_id, receiver_id')
      .eq('id', exchangeId)
      .single();

    if (exchangeError || !exchange) {
      throw new BadRequestException('Failed to fetch exchange');
    }

    // Lock each item
    for (const item of items) {
      const ownerId = item.side === 'initiator' ? exchange.initiator_id : exchange.receiver_id;

      // Create inventory hold
      const { error: holdError } = await supabase.from('retail_inventory_holds').insert({
        exchange_item_id: item.id,
        user_id: ownerId,
        product_id: item.product_id,
        quantity_held: item.quantity,
        hold_reason: 'exchange',
        is_active: true,
      });

      if (holdError) {
        console.error('Failed to create inventory hold:', holdError);
      }

      // Mark item as locked
      await supabase
        .from('retail_exchange_items')
        .update({
          is_locked: true,
          locked_at: new Date().toISOString(),
        })
        .eq('id', item.id);
    }
  }

  // Release inventory and add products to shops
  private async releaseInventoryAndAddProducts(exchangeId: string) {
    const supabase = this.supabaseService.getClient();

    // Get exchange items
    const { data: items } = await supabase
      .from('retail_exchange_items')
      .select('*')
      .eq('exchange_id', exchangeId);

    if (!items) return;

    // Get exchange to know who receives what
    const { data: exchange } = await supabase
      .from('retail_product_exchanges')
      .select('initiator_id, receiver_id')
      .eq('id', exchangeId)
      .single();

    if (!exchange) return;

    // Release holds and add products
    for (const item of items) {
      const receiverId = item.side === 'initiator' ? exchange.receiver_id : exchange.initiator_id;

      // Release inventory hold
      await supabase
        .from('retail_inventory_holds')
        .update({
          is_active: false,
          released_at: new Date().toISOString(),
        })
        .eq('exchange_item_id', item.id);

      // Mark item as released
      await supabase
        .from('retail_exchange_items')
        .update({
          is_locked: false,
          released_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      // TODO: Add product to receiver's retail shop inventory
      // This would depend on how your retail shop inventory is structured
    }
  }

  // Add timeline entry
  private async addTimelineEntry(
    exchangeId: string,
    action: string,
    description: string,
    actorId: string | null,
  ) {
    const supabase = this.supabaseService.getClient();

    let actorName = 'System';
    if (actorId) {
      const { data: user } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', actorId)
        .single();

      if (user) {
        actorName = user.full_name || user.email;
      }
    }

    await supabase.from('retail_exchange_timeline').insert({
      exchange_id: exchangeId,
      action,
      description,
      actor_id: actorId,
      actor_name: actorName,
    });
  }

  // Address management
  async createAddress(userId: string, createAddressDto: CreateAddressDto) {
    const supabase = this.supabaseService.getClient();

    // If this is set as default, unset other defaults
    if (createAddressDto.isDefault) {
      await supabase
        .from('retail_exchange_addresses')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const { data: address, error } = await supabase
      .from('retail_exchange_addresses')
      .insert({
        user_id: userId,
        full_name: createAddressDto.fullName,
        phone: createAddressDto.phone,
        address_line1: createAddressDto.addressLine1,
        address_line2: createAddressDto.addressLine2,
        city: createAddressDto.city,
        state: createAddressDto.state,
        postal_code: createAddressDto.postalCode,
        country: createAddressDto.country || 'India',
        is_default: createAddressDto.isDefault || false,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error creating address:', error);
      throw new BadRequestException(`Failed to create address: ${error.message}`);
    }

    return address;
  }

  async getAddresses(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: addresses, error } = await supabase
      .from('retail_exchange_addresses')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch addresses');
    }

    return addresses || [];
  }

  async deleteAddress(userId: string, addressId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify address belongs to user
    const { data: address } = await supabase
      .from('retail_exchange_addresses')
      .select('id')
      .eq('id', addressId)
      .eq('user_id', userId)
      .single();

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    const { error } = await supabase
      .from('retail_exchange_addresses')
      .update({ is_active: false })
      .eq('id', addressId);

    if (error) {
      throw new BadRequestException('Failed to delete address');
    }

    return { message: 'Address deleted successfully' };
  }

  // Get available products for exchange (retailer's own products)
  async getAvailableProducts(userId: string) {
    const supabase = this.supabaseService.getServiceClient();

    // Get user's retail brand
    const { data: retailBrand } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();

    if (!retailBrand) {
      return [];
    }

    // Fetch from retail_products table
    const { data: products, error } = await supabase
      .from('retail_products')
      .select(`
        id,
        name,
        retail_price,
        sku,
        stock_quantity,
        retail_product_images(image_url, is_primary)
      `)
      .eq('retail_brand_id', retailBrand.id)
      .eq('status', 'active')
      .gt('stock_quantity', 0)
      .is('deleted_at', null);

    if (error) {
      throw new BadRequestException('Failed to fetch available products');
    }

    // Transform to match expected format
    const transformedProducts = (products || []).map(product => {
      // Sort images by is_primary (primary first) and extract URLs
      const sortedImages = (product.retail_product_images || [])
        .sort((a: any, b: any) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
        .map((img: any) => img.image_url);
      
      return {
        id: product.id,
        name: product.name,
        wholesale_price: product.retail_price, // Map retail_price to wholesale_price for compatibility
        sku: product.sku,
        stock_quantity: product.stock_quantity,
        images: sortedImages,
      };
    });

    return transformedProducts;
  }

  // Get other retailer's products available for exchange
  async getRetailerProducts(retailerId: string) {
    const supabase = this.supabaseService.getServiceClient();

    // Verify retailer brand exists (retailerId is actually the brand_id)
    const { data: retailBrand } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('id', retailerId)
      .eq('status', 'approved')
      .single();

    if (!retailBrand) {
      throw new NotFoundException('Retailer not found');
    }

    // Fetch from retail_products table
    const { data: products, error } = await supabase
      .from('retail_products')
      .select(`
        id,
        name,
        retail_price,
        sku,
        stock_quantity,
        retail_product_images(image_url, is_primary)
      `)
      .eq('retail_brand_id', retailerId)
      .eq('status', 'active')
      .gt('stock_quantity', 0)
      .is('deleted_at', null);

    if (error) {
      throw new BadRequestException('Failed to fetch retailer products');
    }

    // Transform to match expected format
    const transformedProducts = (products || []).map(product => {
      // Sort images by is_primary (primary first) and extract URLs
      const sortedImages = (product.retail_product_images || [])
        .sort((a: any, b: any) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
        .map((img: any) => img.image_url);
      
      return {
        id: product.id,
        name: product.name,
        wholesale_price: product.retail_price, // Map retail_price to wholesale_price for compatibility
        sku: product.sku,
        stock_quantity: product.stock_quantity,
        images: sortedImages,
      };
    });

    return transformedProducts;
  }

  // Get all retailers for exchange marketplace
  async getRetailers(userId: string, search?: string) {
    const supabase = this.supabaseService.getServiceClient();

    console.log('[getRetailers] Called with userId:', userId, 'search:', search);

    // Query retail_brands table to get approved retail shops
    let query = supabase
      .from('retail_brands')
      .select(`
        id,
        user_id,
        brand_name,
        display_name,
        logo_url,
        description,
        status
      `)
      .eq('status', 'approved')
      .neq('user_id', userId); // Exclude self

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(`brand_name.ilike.${searchTerm},display_name.ilike.${searchTerm}`);
    }

    const { data: retailers, error } = await query.limit(50);

    console.log('[getRetailers] Query result:', { 
      retailersCount: retailers?.length, 
      error: error?.message,
      retailers: retailers 
    });

    if (error) {
      console.error('Error fetching retailers:', error);
      throw new BadRequestException('Failed to fetch retailers');
    }

    return retailers || [];
  }
}
