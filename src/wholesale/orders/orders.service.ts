import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CartService } from '../cart/cart.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
} from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cartService: CartService,
  ) {}

  async createOrder(createOrderDto: CreateOrderDto, userId?: string) {
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
      const itemTotal = item.packPrice * item.quantity;
      calculatedSubtotal += itemTotal;
      totalItems += item.quantity;
      totalPieces += (item.packQuantity || 1) * item.quantity;

      return {
        product_id: item.productId,
        pack_size_id: item.packSizeId || null,
        product_name: item.productName,
        product_slug: item.productSlug,
        product_image: item.productImage,
        brand_name: item.brandName,
        pack_label: item.packLabel,
        pack_quantity: item.packQuantity || 1,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        pack_price: item.packPrice,
        item_total: itemTotal,
        selected_variations: item.selectedVariations || null,
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

    // Create the order
    const orderData: any = {
      user_id: userId || null,
      customer_email: createOrderDto.customerEmail,
      customer_name: createOrderDto.customerName,
      customer_phone: createOrderDto.customerPhone || null,
      shipping_address_line1: createOrderDto.shippingAddress.addressLine1,
      shipping_address_line2: createOrderDto.shippingAddress.addressLine2 || null,
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
    if (!createOrderDto.billingSameAsShipping && createOrderDto.billingAddress) {
      orderData.billing_address_line1 = createOrderDto.billingAddress.addressLine1;
      orderData.billing_address_line2 = createOrderDto.billingAddress.addressLine2 || null;
      orderData.billing_city = createOrderDto.billingAddress.city;
      orderData.billing_state = createOrderDto.billingAddress.state || null;
      orderData.billing_postal_code = createOrderDto.billingAddress.postalCode;
      orderData.billing_country = createOrderDto.billingAddress.country || 'Turkey';
    }

    // Insert order
    const { data: order, error: orderError } = await serviceClient
      .from('wholesale_orders')
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
      .from('wholesale_order_items')
      .insert(itemsWithOrderId);

    if (itemsError) {
      // Rollback: delete the order
      await serviceClient.from('wholesale_orders').delete().eq('id', order.id);
      throw new BadRequestException(
        `Failed to create order items: ${itemsError.message}`,
      );
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

    // Get order
    let query = serviceClient
      .from('wholesale_orders')
      .select('*')
      .eq('id', orderId);

    // If userId provided, ensure order belongs to user
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      throw new NotFoundException('Order not found');
    }

    // Get order items
    const { data: items, error: itemsError } = await serviceClient
      .from('wholesale_order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (itemsError) {
      throw new BadRequestException('Failed to fetch order items');
    }

    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      customerEmail: order.customer_email,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      shippingAddress: {
        addressLine1: order.shipping_address_line1,
        addressLine2: order.shipping_address_line2,
        city: order.shipping_city,
        state: order.shipping_state,
        postalCode: order.shipping_postal_code,
        country: order.shipping_country,
      },
      billingSameAsShipping: order.billing_same_as_shipping,
      billingAddress: !order.billing_same_as_shipping
        ? {
            addressLine1: order.billing_address_line1,
            addressLine2: order.billing_address_line2,
            city: order.billing_city,
            state: order.billing_state,
            postalCode: order.billing_postal_code,
            country: order.billing_country,
          }
        : null,
      subtotal: parseFloat(order.subtotal),
      shippingCost: parseFloat(order.shipping_cost),
      taxAmount: parseFloat(order.tax_amount),
      discountAmount: parseFloat(order.discount_amount),
      totalAmount: parseFloat(order.total_amount),
      totalItems: order.total_items,
      totalPieces: order.total_pieces,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      paymentReference: order.payment_reference,
      notes: order.notes,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      confirmedAt: order.confirmed_at,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
      cancelledAt: order.cancelled_at,
      items: items.map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        packSizeId: item.pack_size_id,
        productName: item.product_name,
        productSlug: item.product_slug,
        productImage: item.product_image,
        brandName: item.brand_name,
        packLabel: item.pack_label,
        packQuantity: item.pack_quantity,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        packPrice: parseFloat(item.pack_price),
        itemTotal: parseFloat(item.item_total),
        selectedVariations: item.selected_variations,
      })),
    };
  }

  async getOrderByNumber(orderNumber: string, email?: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    let query = serviceClient
      .from('wholesale_orders')
      .select('*')
      .eq('order_number', orderNumber);

    // If email provided, verify it matches
    if (email) {
      query = query.eq('customer_email', email.toLowerCase());
    }

    const { data: order, error } = await query.single();

    if (error || !order) {
      throw new NotFoundException('Order not found');
    }

    return this.getOrderById(order.id);
  }

  async getUserOrders(userId: string, page: number = 1, limit: number = 10) {
    const serviceClient = this.supabaseService.getServiceClient();

    const offset = (page - 1) * limit;

    // Get orders
    const { data: orders, error, count } = await serviceClient
      .from('wholesale_orders')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new BadRequestException('Failed to fetch orders');
    }

    // Get items for each order
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order: any) => {
        const { data: items } = await serviceClient
          .from('wholesale_order_items')
          .select('*')
          .eq('order_id', order.id)
          .order('created_at', { ascending: true });

        return {
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentStatus: order.payment_status,
          totalAmount: parseFloat(order.total_amount),
          totalItems: order.total_items,
          totalPieces: order.total_pieces,
          createdAt: order.created_at,
          items: (items || []).map((item: any) => ({
            id: item.id,
            productName: item.product_name,
            productImage: item.product_image,
            quantity: item.quantity,
            packPrice: parseFloat(item.pack_price),
            itemTotal: parseFloat(item.item_total),
          })),
        };
      }),
    );

    return {
      orders: ordersWithItems,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async updateOrderStatus(
    orderId: string,
    updateDto: UpdateOrderStatusDto,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    const updateData: any = {
      status: updateDto.status,
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

    if (updateDto.adminNotes) {
      updateData.admin_notes = updateDto.adminNotes;
    }

    const { data, error } = await serviceClient
      .from('wholesale_orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update order: ${error.message}`);
    }

    return this.getOrderById(orderId);
  }

  async updatePaymentStatus(
    orderId: string,
    updateDto: UpdatePaymentStatusDto,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    const updateData: any = {
      payment_status: updateDto.paymentStatus,
    };

    if (updateDto.paymentReference) {
      updateData.payment_reference = updateDto.paymentReference;
    }

    // Auto-confirm order when payment is successful
    if (updateDto.paymentStatus === 'paid') {
      updateData.status = 'confirmed';
      updateData.confirmed_at = new Date().toISOString();
    }

    const { data, error } = await serviceClient
      .from('wholesale_orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update payment: ${error.message}`);
    }

    return this.getOrderById(orderId);
  }

  async getBrandOrders(
    brandId: string,
    page: number = 1,
    limit: number = 12,
    search?: string,
    status?: string,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    // First, get product IDs belonging to this brand
    const { data: brandProducts, error: productsError } = await serviceClient
      .from('wholesale_products')
      .select('id')
      .eq('wholesale_brand_id', brandId);

    if (productsError) {
      throw new BadRequestException('Failed to fetch brand products');
    }

    const productIds = brandProducts?.map((p: any) => p.id) || [];

    if (productIds.length === 0) {
      return {
        orders: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Get order IDs that contain these products
    const { data: orderItems, error: itemsError } = await serviceClient
      .from('wholesale_order_items')
      .select('order_id')
      .in('product_id', productIds);

    if (itemsError) {
      throw new BadRequestException('Failed to fetch order items');
    }

    const orderIds = [...new Set(orderItems?.map((item: any) => item.order_id) || [])];

    if (orderIds.length === 0) {
      return {
        orders: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Build the orders query
    let ordersQuery = serviceClient
      .from('wholesale_orders')
      .select('*', { count: 'exact' })
      .in('id', orderIds)
      .order('created_at', { ascending: false });

    // Apply status filter
    if (status && status !== 'all') {
      ordersQuery = ordersQuery.eq('status', status);
    }

    // Apply search filter (by order number or customer name/email)
    if (search) {
      ordersQuery = ordersQuery.or(
        `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`
      );
    }

    const offset = (page - 1) * limit;
    ordersQuery = ordersQuery.range(offset, offset + limit - 1);

    const { data: orders, error: ordersError, count } = await ordersQuery;

    if (ordersError) {
      throw new BadRequestException('Failed to fetch orders');
    }

    // Get items for each order (only brand's products)
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order: any) => {
        const { data: items } = await serviceClient
          .from('wholesale_order_items')
          .select('*')
          .eq('order_id', order.id)
          .in('product_id', productIds)
          .order('created_at', { ascending: true });

        // Calculate totals for brand's items only
        let brandSubtotal = 0;
        let brandTotalItems = 0;
        let brandTotalPieces = 0;

        (items || []).forEach((item: any) => {
          brandSubtotal += parseFloat(item.item_total);
          brandTotalItems += item.quantity;
          brandTotalPieces += (item.pack_quantity || 1) * item.quantity;
        });

        return {
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          paymentStatus: order.payment_status,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          totalAmount: parseFloat(order.total_amount),
          totalItems: order.total_items,
          totalPieces: order.total_pieces,
          // Brand-specific totals (only for their products)
          brandSubtotal,
          brandTotalItems,
          brandTotalPieces,
          createdAt: order.created_at,
          items: (items || []).map((item: any) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name,
            productImage: item.product_image,
            packLabel: item.pack_label,
            packQuantity: item.pack_quantity,
            quantity: item.quantity,
            packPrice: parseFloat(item.pack_price),
            itemTotal: parseFloat(item.item_total),
            selectedVariations: item.selected_variations,
          })),
        };
      }),
    );

    return {
      orders: ordersWithItems,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async getBrandOrderById(orderId: string, brandId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // First, get product IDs belonging to this brand
    const { data: brandProducts, error: productsError } = await serviceClient
      .from('wholesale_products')
      .select('id')
      .eq('wholesale_brand_id', brandId);

    if (productsError) {
      throw new BadRequestException('Failed to fetch brand products');
    }

    const productIds = brandProducts?.map((p: any) => p.id) || [];

    if (productIds.length === 0) {
      throw new NotFoundException('Order not found');
    }

    // Check if this order contains any of the brand's products
    const { data: brandOrderItems, error: checkError } = await serviceClient
      .from('wholesale_order_items')
      .select('order_id')
      .eq('order_id', orderId)
      .in('product_id', productIds)
      .limit(1);

    if (checkError || !brandOrderItems || brandOrderItems.length === 0) {
      throw new NotFoundException('Order not found or does not contain your products');
    }

    // Get the order
    const { data: order, error: orderError } = await serviceClient
      .from('wholesale_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new NotFoundException('Order not found');
    }

    // Get only the brand's items from this order
    const { data: items, error: itemsError } = await serviceClient
      .from('wholesale_order_items')
      .select('*')
      .eq('order_id', orderId)
      .in('product_id', productIds)
      .order('created_at', { ascending: true });

    if (itemsError) {
      throw new BadRequestException('Failed to fetch order items');
    }

    // Calculate totals for brand's items only
    let brandSubtotal = 0;
    let brandTotalItems = 0;
    let brandTotalPieces = 0;

    (items || []).forEach((item: any) => {
      brandSubtotal += parseFloat(item.item_total);
      brandTotalItems += item.quantity;
      brandTotalPieces += (item.pack_quantity || 1) * item.quantity;
    });

    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      shippingAddress: {
        addressLine1: order.shipping_address_line1,
        addressLine2: order.shipping_address_line2,
        city: order.shipping_city,
        state: order.shipping_state,
        postalCode: order.shipping_postal_code,
        country: order.shipping_country,
      },
      // Full order totals
      totalAmount: parseFloat(order.total_amount),
      totalItems: order.total_items,
      totalPieces: order.total_pieces,
      // Brand-specific totals
      brandSubtotal,
      brandTotalItems,
      brandTotalPieces,
      notes: order.notes,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      confirmedAt: order.confirmed_at,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
      cancelledAt: order.cancelled_at,
      items: (items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        packSizeId: item.pack_size_id,
        productName: item.product_name,
        productSlug: item.product_slug,
        productImage: item.product_image,
        packLabel: item.pack_label,
        packQuantity: item.pack_quantity,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        packPrice: parseFloat(item.pack_price),
        itemTotal: parseFloat(item.item_total),
        selectedVariations: item.selected_variations,
      })),
    };
  }

  async getBrandAnalytics(brandId: string, dateRange: string = 'last-30-days') {
    const serviceClient = this.supabaseService.getServiceClient();

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let previousStartDate: Date;

    switch (dateRange) {
      case 'last-7-days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last-90-days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'this-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case 'last-30-days':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get brand's product IDs
    const { data: brandProducts, error: productsError } = await serviceClient
      .from('wholesale_products')
      .select('id')
      .eq('wholesale_brand_id', brandId)
      .is('deleted_at', null);

    if (productsError) {
      console.error('Error fetching brand products for analytics:', productsError);
      // Return empty analytics instead of throwing error
      return this.getEmptyAnalytics();
    }

    const productIds = brandProducts?.map((p: any) => p.id) || [];

    if (productIds.length === 0) {
      return this.getEmptyAnalytics();
    }

    // Get order items for current period
    const { data: currentItems, error: currentError } = await serviceClient
      .from('wholesale_order_items')
      .select(`
        id,
        order_id,
        product_id,
        product_name,
        product_image,
        quantity,
        item_total,
        pack_quantity,
        created_at
      `)
      .in('product_id', productIds)
      .gte('created_at', startDate.toISOString());

    if (currentError) {
      console.error('Error fetching current order items:', currentError);
      return this.getEmptyAnalytics();
    }

    // Get order items for previous period
    const { data: previousItems } = await serviceClient
      .from('wholesale_order_items')
      .select('id, order_id, quantity, item_total')
      .in('product_id', productIds)
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString());

    // Calculate current period KPIs
    const currentOrderIds = [...new Set(currentItems?.map((item: any) => item.order_id) || [])];
    let currentRevenue = 0;
    let currentPacks = 0;

    (currentItems || []).forEach((item: any) => {
      currentRevenue += parseFloat(item.item_total);
      currentPacks += item.quantity;
    });

    const currentOrders = currentOrderIds.length;
    const currentAOV = currentOrders > 0 ? currentRevenue / currentOrders : 0;

    // Calculate previous period KPIs
    const previousOrderIds = [...new Set(previousItems?.map((item: any) => item.order_id) || [])];
    let previousRevenue = 0;
    let previousPacks = 0;

    (previousItems || []).forEach((item: any) => {
      previousRevenue += parseFloat(item.item_total);
      previousPacks += item.quantity;
    });

    const previousOrders = previousOrderIds.length;
    const previousAOV = previousOrders > 0 ? previousRevenue / previousOrders : 0;

    // Calculate top products
    const productStats: Record<string, { name: string; image: string; revenue: number; orders: Set<string>; packs: number }> = {};

    (currentItems || []).forEach((item: any) => {
      if (!productStats[item.product_id]) {
        productStats[item.product_id] = {
          name: item.product_name,
          image: item.product_image,
          revenue: 0,
          orders: new Set(),
          packs: 0,
        };
      }
      productStats[item.product_id].revenue += parseFloat(item.item_total);
      productStats[item.product_id].orders.add(item.order_id);
      productStats[item.product_id].packs += item.quantity;
    });

    const topProducts = Object.entries(productStats)
      .map(([productId, stats]) => ({
        productId,
        name: stats.name,
        image: stats.image,
        revenue: stats.revenue,
        orders: stats.orders.size,
        packs: stats.packs,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Get recent orders with brand's items
    const recentOrderIds = [...new Set((currentItems || []).slice(0, 20).map((item: any) => item.order_id))].slice(0, 5);

    let recentOrders: any[] = [];
    if (recentOrderIds.length > 0) {
      const { data: orders } = await serviceClient
        .from('wholesale_orders')
        .select('id, order_number, customer_name, status, created_at, total_amount')
        .in('id', recentOrderIds)
        .order('created_at', { ascending: false })
        .limit(5);

      // Get brand's revenue for each order
      recentOrders = (orders || []).map((order: any) => {
        const orderItems = (currentItems || []).filter((item: any) => item.order_id === order.id);
        const brandRevenue = orderItems.reduce((sum: number, item: any) => sum + parseFloat(item.item_total), 0);
        const brandPacks = orderItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

        return {
          id: order.id,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          status: order.status,
          createdAt: order.created_at,
          brandRevenue,
          brandPacks,
        };
      });
    }

    // Get orders by status
    const ordersByStatus = {
      pending: 0,
      confirmed: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };

    if (currentOrderIds.length > 0) {
      const { data: ordersWithStatus } = await serviceClient
        .from('wholesale_orders')
        .select('id, status')
        .in('id', currentOrderIds);

      (ordersWithStatus || []).forEach((order: any) => {
        if (order.status in ordersByStatus) {
          ordersByStatus[order.status as keyof typeof ordersByStatus]++;
        }
      });
    }

    return {
      kpis: {
        totalRevenue: currentRevenue,
        totalOrders: currentOrders,
        averageOrderValue: currentAOV,
        totalPacks: currentPacks,
        previousRevenue,
        previousOrders,
        previousAOV,
        previousPacks,
      },
      topProducts,
      recentOrders,
      ordersByStatus,
    };
  }

  private getEmptyAnalytics() {
    return {
      kpis: {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalPacks: 0,
        previousRevenue: 0,
        previousOrders: 0,
        previousAOV: 0,
        previousPacks: 0,
      },
      topProducts: [],
      recentOrders: [],
      ordersByStatus: {
        pending: 0,
        confirmed: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0,
      },
    };
  }
}
