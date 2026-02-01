import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CartService } from '../cart/cart.service';
import {
  CreateRetailOrderDto,
  UpdateRetailOrderStatusDto,
  UpdateRetailPaymentStatusDto,
} from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cartService: CartService,
  ) {}

  async createOrder(createOrderDto: CreateRetailOrderDto, userId?: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Validate items
    if (!createOrderDto.items || createOrderDto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // Calculate totals
    let calculatedSubtotal = 0;
    let totalItems = 0;
    let totalPieces = 0;

    const orderItems = createOrderDto.items.map((item) => {
      const itemTotal = item.unitPrice * item.quantity;
      calculatedSubtotal += itemTotal;
      totalItems += item.quantity;
      totalPieces += item.quantity;

      return {
        product_id: item.productId,
        product_name: item.productName,
        product_slug: item.productSlug,
        product_image: item.productImage,
        brand_name: item.brandName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        item_total: itemTotal,
        combination_key: item.combinationKey || null,
        variation_details: item.variationDetails || null,
        color_value: item.colorValue || null,
        size_value: item.sizeValue || null,
      };
    });

    // Verify totals match (with small tolerance for rounding)
    const tolerance = 0.01;
    if (Math.abs(calculatedSubtotal - createOrderDto.subtotal) > tolerance) {
      throw new BadRequestException('Order subtotal mismatch');
    }

    const shippingCost = createOrderDto.shippingCost || 0;
    const calculatedTotal = calculatedSubtotal + shippingCost;

    if (Math.abs(calculatedTotal - createOrderDto.totalAmount) > tolerance) {
      throw new BadRequestException('Order total mismatch');
    }

    // Validate stock availability and prepare inventory updates
    const inventoryUpdates: Array<{
      product_id: string;
      combination_key: string;
      quantity_to_subtract: number;
    }> = [];
    for (const item of createOrderDto.items) {
      if (item.combinationKey) {
        // Check stock for variation
        const { data: inventory, error: inventoryError } = await serviceClient
          .from('retail_product_inventory')
          .select('stock_quantity')
          .eq('product_id', item.productId)
          .eq('combination_key', item.combinationKey)
          .single();

        if (inventoryError || !inventory) {
          throw new BadRequestException(
            `Product ${item.productName} variation is not available`,
          );
        }

        if (inventory.stock_quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${item.productName}. Available: ${inventory.stock_quantity}, Requested: ${item.quantity}`,
          );
        }

        inventoryUpdates.push({
          product_id: item.productId,
          combination_key: item.combinationKey,
          quantity_to_subtract: item.quantity,
        });
      }
    }

    // Create the order
    const orderData: any = {
      user_id: userId || null,
      customer_email: createOrderDto.customerEmail,
      customer_name: createOrderDto.customerName,
      customer_phone: createOrderDto.customerPhone || null,
      shipping_address_line1: createOrderDto.shippingAddress.addressLine1,
      shipping_address_line2:
        createOrderDto.shippingAddress.addressLine2 || null,
      shipping_city: createOrderDto.shippingAddress.city,
      shipping_state: createOrderDto.shippingAddress.state || null,
      shipping_postal_code: createOrderDto.shippingAddress.postalCode,
      shipping_country: createOrderDto.shippingAddress.country || 'Turkey',
      billing_same_as_shipping: createOrderDto.billingSameAsShipping,
      subtotal: calculatedSubtotal,
      shipping_cost: shippingCost,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: calculatedTotal,
      total_items: totalItems,
      total_pieces: totalPieces,
      status: 'pending',
      payment_status: 'pending',
      payment_method: createOrderDto.paymentMethod || 'cash_on_delivery',
      notes: createOrderDto.notes || null,
    };

    // Add billing address if different from shipping
    if (
      !createOrderDto.billingSameAsShipping &&
      createOrderDto.billingAddress
    ) {
      orderData.billing_address_line1 =
        createOrderDto.billingAddress.addressLine1;
      orderData.billing_address_line2 =
        createOrderDto.billingAddress.addressLine2 || null;
      orderData.billing_city = createOrderDto.billingAddress.city;
      orderData.billing_state = createOrderDto.billingAddress.state || null;
      orderData.billing_postal_code =
        createOrderDto.billingAddress.postalCode;
      orderData.billing_country =
        createOrderDto.billingAddress.country || 'Turkey';
    }

    // Insert order
    const { data: order, error: orderError } = await serviceClient
      .from('retail_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      throw new BadRequestException(
        `Failed to create order: ${orderError.message}`,
      );
    }

    // Insert order items
    const itemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await serviceClient
      .from('retail_order_items')
      .insert(itemsWithOrderId);

    if (itemsError) {
      // Rollback: delete the order
      await serviceClient.from('retail_orders').delete().eq('id', order.id);
      throw new BadRequestException(
        `Failed to create order items: ${itemsError.message}`,
      );
    }

    // Update inventory
    for (const update of inventoryUpdates) {
      const { error: updateError } = await serviceClient.rpc(
        'decrement_retail_inventory',
        {
          p_product_id: update.product_id,
          p_combination_key: update.combination_key,
          p_quantity: update.quantity_to_subtract,
        },
      );

      if (updateError) {
        console.error('Failed to update inventory:', updateError);
        // Don't fail the order, but log the error
      }
    }

    // Clear the user's cart after successful order
    if (userId) {
      try {
        await this.cartService.clearCart(userId);
      } catch (error) {
        // Log but don't fail the order if cart clearing fails
        console.error('Failed to clear cart after order:', error);
      }
    }

    // Return the complete order with items
    return this.getOrderById(order.id, userId);
  }

  async getOrderById(orderId: string, userId?: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: order, error: orderError } = await serviceClient
      .from('retail_orders')
      .select(
        `
        *,
        items:retail_order_items(*)
      `,
      )
      .eq('id', orderId)
      .single();

    if (orderError) {
      throw new NotFoundException('Order not found');
    }

    // Verify user has access to this order
    if (userId && order.user_id !== userId && order.user_id !== null) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    const serviceClient = this.supabaseService.getServiceClient();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: orders, error: ordersError, count } = await serviceClient
      .from('retail_orders')
      .select(
        `
        *,
        items:retail_order_items(*)
      `,
        { count: 'exact' },
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (ordersError) {
      throw new BadRequestException(
        `Failed to fetch orders: ${ordersError.message}`,
      );
    }

    return {
      orders: orders || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async updateOrderStatus(
    orderId: string,
    updateDto: UpdateRetailOrderStatusDto,
    userId?: string,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get the order first to verify ownership
    const order = await this.getOrderById(orderId, userId);

    const updateData: any = {
      status: updateDto.status,
      admin_notes: updateDto.adminNotes || order.admin_notes,
    };

    // Set timestamp based on status
    switch (updateDto.status) {
      case 'confirmed':
        updateData.confirmed_at = new Date().toISOString();
        break;
      case 'shipped':
        updateData.shipped_at = new Date().toISOString();
        break;
      case 'delivered':
        updateData.delivered_at = new Date().toISOString();
        break;
      case 'cancelled':
        updateData.cancelled_at = new Date().toISOString();
        break;
    }

    const { data: updatedOrder, error: updateError } = await serviceClient
      .from('retail_orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(
        `Failed to update order: ${updateError.message}`,
      );
    }

    return updatedOrder;
  }

  async updatePaymentStatus(
    orderId: string,
    updateDto: UpdateRetailPaymentStatusDto,
    userId?: string,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get the order first to verify ownership
    await this.getOrderById(orderId, userId);

    const { data: updatedOrder, error: updateError } = await serviceClient
      .from('retail_orders')
      .update({
        payment_status: updateDto.paymentStatus,
        payment_reference: updateDto.paymentReference || null,
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(
        `Failed to update payment status: ${updateError.message}`,
      );
    }

    return updatedOrder;
  }
}
