import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { OrderScope } from '../dto/create-checkout.dto';

/**
 * Resolves an order + its items across the three commerce segments.
 * The shape returned is segment-agnostic so PaymentsService can stay simple.
 */
export interface ResolvedOrder {
  scope: OrderScope;
  /** Real table name, e.g. `retail_orders`. */
  ordersTable: string;
  itemsTable: string;
  id: string;
  user_id: string | null;
  order_number: string;
  subtotal: number;
  total_amount: number;
  payment_status: string;
  status: string;
  /** Each item carries enough to build the Iyzico basket + commission split. */
  items: ResolvedOrderItem[];
}

export interface ResolvedOrderItem {
  id: string;
  product_id: string | null;
  product_name: string | null;
  brand_name: string | null;
  brand_id: string | null;
  brand_user_id: string | null;
  quantity: number;
  unit_price: number;
  item_total: number;
  vat_mode?: 'included' | 'excluded' | 'none';
}

@Injectable()
export class OrderLocator {
  constructor(private readonly supabaseService: SupabaseService) {}

  async load(scope: OrderScope, orderId: string): Promise<ResolvedOrder> {
    switch (scope) {
      case 'retail':
        return this.loadRetail(orderId);
      case 'wholesale':
        return this.loadWholesale(orderId);
      case 'social':
        return this.loadSocial(orderId);
      case 'swap':
        throw new Error('Swap orders are loaded via a separate flow (no order row).');
    }
  }

  // -------------------------------------------------------------------------

  private async loadRetail(orderId: string): Promise<ResolvedOrder> {
    const supabase = this.supabaseService.getServiceClient();
    const { data: o } = await supabase
      .from('retail_orders')
      .select('id, user_id, order_number, subtotal, total_amount, payment_status, status')
      .eq('id', orderId)
      .maybeSingle();
    if (!o) throw new NotFoundException(`Retail order ${orderId} not found.`);

    const { data: items } = await supabase
      .from('retail_order_items')
      .select(
        'id, product_id, product_name, brand_name, quantity, unit_price, item_total, vat_mode',
      )
      .eq('order_id', orderId);

    // Retail brand_id is on the product; fetch in batch.
    const productIds = (items || []).map((i) => (i as { product_id: string | null }).product_id).filter(Boolean) as string[];
    let brandByProduct: Record<string, { brand_id: string | null; user_id: string | null }> = {};
    if (productIds.length) {
      const { data: products } = await supabase
        .from('retail_products')
        .select('id, brand_id, user_id')
        .in('id', productIds);
      brandByProduct = Object.fromEntries(
        (products || []).map((p: { id: string; brand_id: string; user_id: string }) => [
          p.id,
          { brand_id: p.brand_id, user_id: p.user_id },
        ]),
      );
    }

    return {
      scope: 'retail',
      ordersTable: 'retail_orders',
      itemsTable: 'retail_order_items',
      ...(o as Omit<ResolvedOrder, 'scope' | 'ordersTable' | 'itemsTable' | 'items'>),
      items: (items || []).map((it) => ({
        ...(it as Omit<ResolvedOrderItem, 'brand_id' | 'brand_user_id'>),
        brand_id: brandByProduct[(it as { product_id: string }).product_id]?.brand_id || null,
        brand_user_id: brandByProduct[(it as { product_id: string }).product_id]?.user_id || null,
      })),
    };
  }

  private async loadWholesale(orderId: string): Promise<ResolvedOrder> {
    const supabase = this.supabaseService.getServiceClient();
    const { data: o } = await supabase
      .from('wholesale_orders')
      .select('id, user_id, order_number, subtotal, total_amount, payment_status, status')
      .eq('id', orderId)
      .maybeSingle();
    if (!o) throw new NotFoundException(`Wholesale order ${orderId} not found.`);

    const { data: items } = await supabase
      .from('wholesale_order_items')
      .select(
        'id, product_id, product_name, brand_name, brand_id, quantity, unit_price, item_total, vat_mode',
      )
      .eq('order_id', orderId);

    // Resolve seller user_id by brand.
    const brandIds = Array.from(new Set((items || []).map((i) => (i as { brand_id: string | null }).brand_id).filter(Boolean) as string[]));
    let userByBrand: Record<string, string> = {};
    if (brandIds.length) {
      const { data: brands } = await supabase
        .from('wholesale_brands')
        .select('id, user_id')
        .in('id', brandIds);
      userByBrand = Object.fromEntries(
        (brands || []).map((b: { id: string; user_id: string }) => [b.id, b.user_id]),
      );
    }

    return {
      scope: 'wholesale',
      ordersTable: 'wholesale_orders',
      itemsTable: 'wholesale_order_items',
      ...(o as Omit<ResolvedOrder, 'scope' | 'ordersTable' | 'itemsTable' | 'items'>),
      items: (items || []).map((it) => ({
        ...(it as Omit<ResolvedOrderItem, 'brand_user_id'>),
        brand_user_id: userByBrand[(it as { brand_id: string }).brand_id] || null,
      })),
    };
  }

  private async loadSocial(orderId: string): Promise<ResolvedOrder> {
    const supabase = this.supabaseService.getServiceClient();
    const { data: o } = await supabase
      .from('social_sales_orders')
      .select('id, buyer_user_id, order_number, subtotal, total_amount, payment_status, status, seller_user_id')
      .eq('id', orderId)
      .maybeSingle();
    if (!o) throw new NotFoundException(`Social order ${orderId} not found.`);

    const { data: items } = await supabase
      .from('social_sales_order_items')
      .select('id, product_id, product_name, quantity, unit_price, item_total, vat_mode')
      .eq('order_id', orderId);

    const sellerUserId = (o as { seller_user_id: string | null }).seller_user_id;

    return {
      scope: 'social',
      ordersTable: 'social_sales_orders',
      itemsTable: 'social_sales_order_items',
      id: (o as { id: string }).id,
      user_id: (o as { buyer_user_id: string | null }).buyer_user_id,
      order_number: (o as { order_number: string }).order_number,
      subtotal: Number((o as { subtotal: number }).subtotal),
      total_amount: Number((o as { total_amount: number }).total_amount),
      payment_status: (o as { payment_status: string }).payment_status,
      status: (o as { status: string }).status,
      items: (items || []).map((it) => ({
        ...(it as Omit<ResolvedOrderItem, 'brand_id' | 'brand_user_id' | 'brand_name'>),
        brand_id: null,
        brand_name: null,
        brand_user_id: sellerUserId,
      })),
    };
  }
}
