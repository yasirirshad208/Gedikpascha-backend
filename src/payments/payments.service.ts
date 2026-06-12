import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { IyzicoService } from './iyzico/iyzico.service';
import { IyzicoConfig } from './iyzico/iyzico.config';
import { CommissionCalculator } from './helpers/commission.calculator';
import { OrderLocator, ResolvedOrder, ResolvedOrderItem } from './helpers/order-locator';
import { CreateCheckoutDto, OrderScope } from './dto/create-checkout.dto';
import type {
  CheckoutFormItemTransaction,
  CreateCheckoutFormInitializeRequest,
  IyzipayBasketItem,
  RetrieveCheckoutFormResult,
} from './iyzico/iyzico.types';

/**
 * Multi-scope checkout orchestrator.
 *
 * Phase 1 — retail single-brand (kept).
 * Phase 3 — multi-brand splits (active).
 * Phase 4 — wholesale B2B (active).
 * Phase 5 — social C2C + swap differentials (active).
 *
 * Webhook ingest stays idempotent and feeds Refunds / Chargebacks handlers in Phase 6.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly iyzico: IyzicoService,
    private readonly config: IyzicoConfig,
    private readonly commissionCalculator: CommissionCalculator,
    private readonly orderLocator: OrderLocator,
  ) {}

  // ---------------------------------------------------------------------------
  // CHECKOUT
  // ---------------------------------------------------------------------------

  async createCheckoutForm(dto: CreateCheckoutDto, buyerIp: string) {
    if (!dto.acceptCommissionAndPayment || !dto.acceptKvkk) {
      throw new BadRequestException(
        'Komisyon ve Ödeme Politikası ve KVKK Aydınlatma Metni onayı zorunludur.',
      );
    }
    // Distance Sales acceptance is mandatory ONLY for retail B2C.
    if (dto.orderScope === 'retail' && dto.acceptDistanceSalesContract === false) {
      throw new BadRequestException('Mesafeli Satış Sözleşmesi onayı zorunludur.');
    }

    if (dto.orderScope === 'swap') {
      throw new BadRequestException(
        'Swap differentials use POST /payments/checkout/swap, not /payments/checkout.',
      );
    }

    const order = await this.orderLocator.load(dto.orderScope, dto.orderId);
    if (order.payment_status === 'paid') {
      throw new BadRequestException('Bu sipariş için ödeme zaten alınmış.');
    }
    if (Math.abs(order.total_amount - dto.amount) > 0.01) {
      throw new BadRequestException(
        `Order amount (${order.total_amount}) does not match the requested checkout amount (${dto.amount}).`,
      );
    }
    if (order.items.length === 0) {
      throw new BadRequestException('Order has no items.');
    }

    const currency = dto.currency || this.config.defaultCurrency;
    const conversationId = `gp-${dto.orderScope}-${order.id}-${Date.now()}`;

    const supabase = this.supabaseService.getServiceClient();

    // 1. Insert transaction.
    const { data: tx, error: txErr } = await supabase
      .from('payment_transactions')
      .insert({
        order_id: order.id,
        order_scope: dto.orderScope,
        user_id: order.user_id,
        provider: 'iyzico',
        provider_conv_id: conversationId,
        status: 'init',
        amount: order.total_amount,
        currency,
        buyer_ip: buyerIp || null,
        raw_request: { orderNumber: order.order_number, itemCount: order.items.length },
      })
      .select('id')
      .single();
    if (txErr || !tx) throw new InternalServerErrorException('Could not create payment transaction.');

    // 2. Resolve sub-merchant per item.
    const subMerchantByItem = await this.resolveSubMerchantsByItem(dto.orderScope, order.items);

    // 3. Build basket items.
    const basketItems: IyzipayBasketItem[] = order.items.map((it) => {
      const subKey = subMerchantByItem.get(it.id);
      const base: IyzipayBasketItem = {
        id: it.id,
        name: (it.product_name || 'Product').slice(0, 200),
        category1: (it.brand_name || 'General').slice(0, 60),
        itemType: 'PHYSICAL',
        price: Number(it.item_total).toFixed(2),
      };
      if (subKey) {
        // Iyzico splits: subMerchantPrice = what the sub-merchant receives.
        // Platform commission = item price - subMerchantPrice.
        // We pre-compute via CommissionCalculator below.
        base.subMerchantKey = subKey;
      }
      return base;
    });

    // 4. Pre-compute split amounts (per item) so the basket carries subMerchantPrice
    //    AND so we can persist payment_splits when the payment succeeds.
    const eligibleAt = await this.computePayoutEligibleAt(dto.orderScope);
    const itemPlan = await Promise.all(
      order.items.map(async (it) => {
        const brandScope = this.brandScopeForItem(dto.orderScope, it);
        const commission = await this.commissionCalculator.calculate(dto.orderScope, {
          brandScope,
          brandId: it.brand_id ?? undefined,
          gross: Number(it.item_total),
        });
        const subMerchantKey = subMerchantByItem.get(it.id) || null;
        const subMerchantPrice = subMerchantKey ? commission.net : 0;
        return { item: it, commission, subMerchantKey, subMerchantPrice, eligibleAt };
      }),
    );

    // Apply subMerchantPrice to basket items.
    basketItems.forEach((b, i) => {
      if (itemPlan[i].subMerchantKey) {
        b.subMerchantPrice = itemPlan[i].subMerchantPrice.toFixed(2);
      }
    });

    // 5. Build the Iyzico request.
    const request: CreateCheckoutFormInitializeRequest = {
      locale: this.iyzico.LOCALE.TR,
      conversationId,
      price: order.subtotal.toFixed(2),
      paidPrice: order.total_amount.toFixed(2),
      currency: this.iyzico.CURRENCY[currency],
      basketId: order.order_number,
      paymentGroup: this.iyzico.PAYMENT_GROUP.PRODUCT,
      callbackUrl: this.config.callbackUrl,
      buyer: {
        id: order.user_id || `guest-${order.id}`,
        name: dto.buyer.name,
        surname: dto.buyer.surname,
        email: dto.buyer.email,
        gsmNumber: dto.buyer.gsmNumber,
        identityNumber: dto.buyer.identityNumber,
        registrationAddress: dto.shippingAddress.address,
        ip: buyerIp || '127.0.0.1',
        city: dto.shippingAddress.city,
        country: dto.shippingAddress.country,
        zipCode: dto.shippingAddress.zipCode,
      },
      shippingAddress: { ...dto.shippingAddress },
      billingAddress: { ...dto.billingAddress },
      basketItems,
    };

    let result;
    try {
      result = await this.iyzico.initializeCheckoutForm(request);
    } catch (err: unknown) {
      await supabase
        .from('payment_transactions')
        .update({
          status: 'failure',
          failure_code: 'INITIALIZE_FAILED',
          failure_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
          raw_response: { error: String(err) },
        })
        .eq('id', tx.id);
      throw new InternalServerErrorException('Ödeme başlatılırken bir hata oluştu.');
    }

    // 6. Persist token + result snapshot + pre-computed plan (stored in raw_request).
    await supabase
      .from('payment_transactions')
      .update({
        status: result.status === 'success' ? 'pending' : 'failure',
        provider_token: result.token || null,
        failure_code: result.status === 'success' ? null : result.errorCode || null,
        failure_message: result.status === 'success' ? null : result.errorMessage || null,
        raw_request: {
          orderNumber: order.order_number,
          plan: itemPlan.map((p) => ({
            itemId: p.item.id,
            brandId: p.item.brand_id,
            brandScope: this.brandScopeForItem(dto.orderScope, p.item),
            commissionPercent: p.commission.percentage,
            commission: p.commission.commission,
            subMerchantKey: p.subMerchantKey,
            subMerchantPrice: p.subMerchantPrice,
            payoutEligibleAt: p.eligibleAt,
            sellerUserId: p.item.brand_user_id,
          })),
        },
        raw_response: result as unknown,
      })
      .eq('id', tx.id);

    // 7. Link the order to this transaction.
    await supabase
      .from(order.ordersTable)
      .update({
        payment_provider: 'iyzico',
        payment_method: 'iyzico',
        payment_transaction_id: tx.id,
        payment_intent_token: result.token || null,
        payment_status: result.status === 'success' ? 'pending' : 'failed',
      })
      .eq('id', order.id);

    if (result.status !== 'success') {
      throw new BadRequestException(result.errorMessage || 'Ödeme sağlayıcı isteği reddetti.');
    }

    return {
      transactionId: tx.id,
      conversationId,
      token: result.token,
      checkoutFormContent: result.checkoutFormContent,
      paymentPageUrl: result.paymentPageUrl,
      tokenExpireTime: result.tokenExpireTime,
    };
  }

  // ---------------------------------------------------------------------------
  // SWAP DIFFERENTIAL
  // ---------------------------------------------------------------------------

  /**
   * Initialize a payment for a swap proposal price differential.
   * No order row exists; the transaction stores `order_scope='swap'` and links via raw_request.
   */
  async createSwapDifferentialCheckout(opts: {
    proposalId: string;
    listingId: string;
    payerUserId: string;
    payeeUserId: string;
    payeeSubMerchantKey: string | null;
    amount: number;
    buyer: CreateCheckoutDto['buyer'];
    shippingAddress: CreateCheckoutDto['shippingAddress'];
    billingAddress: CreateCheckoutDto['billingAddress'];
    buyerIp: string;
  }) {
    if (opts.amount <= 0) {
      throw new BadRequestException('Swap differential amount must be positive.');
    }

    const supabase = this.supabaseService.getServiceClient();
    const currency = this.config.defaultCurrency;
    const conversationId = `gp-swap-${opts.proposalId}-${Date.now()}`;

    const { data: tx, error: txErr } = await supabase
      .from('payment_transactions')
      .insert({
        order_id: null,
        order_scope: 'swap',
        user_id: opts.payerUserId,
        provider: 'iyzico',
        provider_conv_id: conversationId,
        status: 'init',
        amount: opts.amount,
        currency,
        buyer_ip: opts.buyerIp,
        raw_request: {
          swap: { proposalId: opts.proposalId, listingId: opts.listingId, payee: opts.payeeUserId },
        },
      })
      .select('id')
      .single();
    if (txErr || !tx) throw new InternalServerErrorException('Could not create payment transaction.');

    const commission = await this.commissionCalculator.calculate('swap', {
      brandScope: 'social_user',
      gross: opts.amount,
    });
    const subMerchantPrice = opts.payeeSubMerchantKey ? commission.net : 0;

    const basketItems: IyzipayBasketItem[] = [
      {
        id: opts.proposalId,
        name: 'Takas Fiyat Farkı',
        category1: 'Swap',
        itemType: 'VIRTUAL',
        price: opts.amount.toFixed(2),
        ...(opts.payeeSubMerchantKey
          ? {
              subMerchantKey: opts.payeeSubMerchantKey,
              subMerchantPrice: subMerchantPrice.toFixed(2),
            }
          : {}),
      },
    ];

    const request: CreateCheckoutFormInitializeRequest = {
      locale: this.iyzico.LOCALE.TR,
      conversationId,
      price: opts.amount.toFixed(2),
      paidPrice: opts.amount.toFixed(2),
      currency: this.iyzico.CURRENCY[currency],
      basketId: `swap-${opts.proposalId}`,
      paymentGroup: this.iyzico.PAYMENT_GROUP.PRODUCT,
      callbackUrl: this.config.callbackUrl,
      buyer: {
        id: opts.payerUserId,
        ...opts.buyer,
        registrationAddress: opts.shippingAddress.address,
        ip: opts.buyerIp,
        city: opts.shippingAddress.city,
        country: opts.shippingAddress.country,
        zipCode: opts.shippingAddress.zipCode,
      },
      shippingAddress: { ...opts.shippingAddress },
      billingAddress: { ...opts.billingAddress },
      basketItems,
    };

    let result;
    try {
      result = await this.iyzico.initializeCheckoutForm(request);
    } catch (err: unknown) {
      await supabase
        .from('payment_transactions')
        .update({
          status: 'failure',
          failure_code: 'INITIALIZE_FAILED',
          failure_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        })
        .eq('id', tx.id);
      throw new InternalServerErrorException('Ödeme başlatılırken bir hata oluştu.');
    }

    const eligibleAt = await this.computePayoutEligibleAt('swap');
    await supabase
      .from('payment_transactions')
      .update({
        status: result.status === 'success' ? 'pending' : 'failure',
        provider_token: result.token || null,
        failure_code: result.status === 'success' ? null : result.errorCode || null,
        failure_message: result.status === 'success' ? null : result.errorMessage || null,
        raw_request: {
          swap: { proposalId: opts.proposalId, listingId: opts.listingId, payee: opts.payeeUserId },
          plan: [
            {
              itemId: opts.proposalId,
              brandScope: 'social_user',
              commissionPercent: commission.percentage,
              commission: commission.commission,
              subMerchantKey: opts.payeeSubMerchantKey,
              subMerchantPrice,
              payoutEligibleAt: eligibleAt,
              sellerUserId: opts.payeeUserId,
            },
          ],
        },
        raw_response: result as unknown,
      })
      .eq('id', tx.id);

    if (result.status !== 'success') {
      throw new BadRequestException(result.errorMessage || 'Ödeme sağlayıcı isteği reddetti.');
    }

    return {
      transactionId: tx.id,
      conversationId,
      token: result.token,
      checkoutFormContent: result.checkoutFormContent,
      paymentPageUrl: result.paymentPageUrl,
      tokenExpireTime: result.tokenExpireTime,
    };
  }

  // ---------------------------------------------------------------------------
  // CALLBACK
  // ---------------------------------------------------------------------------

  async handleCallback(token: string): Promise<{
    redirectUrl: string;
    status: 'success' | 'failure';
  }> {
    const supabase = this.supabaseService.getServiceClient();
    const fail = (reason: string, scope: OrderScope | 'unknown' = 'unknown') => ({
      redirectUrl: this.failureRedirect(scope as OrderScope, reason),
      status: 'failure' as const,
    });

    if (!token) return fail('missing_token');

    const { data: tx } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('provider_token', token)
      .maybeSingle();
    if (!tx) return fail('unknown_token');

    let result: RetrieveCheckoutFormResult;
    try {
      result = await this.iyzico.retrieveCheckoutForm({
        locale: this.iyzico.LOCALE.TR,
        conversationId: tx.provider_conv_id,
        token,
      });
    } catch (err: unknown) {
      this.logger.error('retrieveCheckoutForm failed', err as Error);
      await supabase
        .from('payment_transactions')
        .update({
          status: 'failure',
          failure_code: 'RETRIEVE_FAILED',
          failure_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        })
        .eq('id', tx.id);
      return fail('retrieve_failed', tx.order_scope);
    }

    const isSuccess = result.status === 'success' && result.paymentStatus === 'SUCCESS';

    await supabase
      .from('payment_transactions')
      .update({
        status: isSuccess ? 'success' : 'failure',
        provider_payment_id: result.paymentId || null,
        paid_price: result.paidPrice ? Number(result.paidPrice) : null,
        installment: result.installment || 1,
        card_family: result.cardFamily || null,
        card_association: result.cardAssociation || null,
        card_type: result.cardType || null,
        last_four_digits: result.lastFourDigits || null,
        failure_code: isSuccess ? null : result.errorCode || null,
        failure_message: isSuccess ? null : result.errorMessage || 'Payment did not succeed',
        raw_response: result as unknown,
      })
      .eq('id', tx.id);

    // Update the linked order (if applicable; swap has no order).
    // Note: the B2C 14-day withdrawal window (`refund_due_until`) is NOT set here —
    // it legally starts at delivery, so it is populated when the order is marked
    // delivered (see retail orders.service.ts).
    if (tx.order_id && tx.order_scope !== 'swap') {
      const ordersTable = this.ordersTableFor(tx.order_scope);

      const updatePayload: Record<string, unknown> = {
        payment_status: isSuccess ? 'paid' : 'failed',
        status: isSuccess ? 'confirmed' : 'cancelled',
      };

      await supabase.from(ordersTable).update(updatePayload).eq('id', tx.order_id);
    }

    if (isSuccess) {
      await this.writeSplitsFromPlan(tx, result);
    }

    return {
      redirectUrl: isSuccess
        ? this.successRedirect(tx.order_scope, tx.order_id || undefined)
        : this.failureRedirect(tx.order_scope, result.errorCode || 'payment_failed'),
      status: isSuccess ? 'success' : 'failure',
    };
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK
  // ---------------------------------------------------------------------------

  async ingestWebhookEvent(opts: {
    eventId: string;
    eventType: string;
    providerPaymentId?: string;
    payload: unknown;
    signature?: string;
    verified: boolean;
  }): Promise<{ accepted: boolean; duplicate: boolean }> {
    const supabase = this.supabaseService.getServiceClient();
    const { data, error } = await supabase
      .from('payment_events')
      .insert({
        event_id: opts.eventId || randomUUID(),
        event_type: opts.eventType,
        provider: 'iyzico',
        provider_payment_id: opts.providerPaymentId || null,
        payload: opts.payload as unknown,
        signature: opts.signature || null,
        verified: opts.verified,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === '23505') return { accepted: true, duplicate: true };
      this.logger.error('Failed to insert payment_events row', error);
      throw new InternalServerErrorException('Could not record webhook event.');
    }

    // Phase 6 chargeback hook: when a chargeback opens, mark splits on_hold.
    if (
      opts.verified &&
      typeof opts.eventType === 'string' &&
      opts.eventType.toUpperCase().includes('CHARGEBACK') &&
      opts.providerPaymentId
    ) {
      await supabase
        .from('payment_splits')
        .update({ payout_status: 'on_hold', hold_reason: `chargeback:${opts.eventType}` })
        .in(
          'transaction_id',
          (
            await supabase
              .from('payment_transactions')
              .select('id')
              .eq('provider_payment_id', opts.providerPaymentId)
          ).data?.map((r: { id: string }) => r.id) || [],
        );
    }

    return { accepted: true, duplicate: !data };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private brandScopeForItem(
    scope: OrderScope,
    item: ResolvedOrderItem,
  ): 'wholesale_brand' | 'retail_brand' | 'social_user' | 'main_merchant' {
    if (scope === 'wholesale') return 'wholesale_brand';
    if (scope === 'retail') return item.brand_id ? 'retail_brand' : 'main_merchant';
    if (scope === 'social' || scope === 'swap') return 'social_user';
    return 'main_merchant';
  }

  /**
   * For each item, look up the sub_merchant_key of the seller.
   * Returns a Map<orderItemId, subMerchantKey> with only items that have an
   * active sub-merchant. Items missing one fall through to the main merchant.
   */
  private async resolveSubMerchantsByItem(
    scope: OrderScope,
    items: ResolvedOrderItem[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const supabase = this.supabaseService.getServiceClient();

    if (scope === 'wholesale' || scope === 'retail') {
      const brandIds = Array.from(new Set(items.map((i) => i.brand_id).filter(Boolean) as string[]));
      if (brandIds.length === 0) return out;

      const brandScope = scope === 'wholesale' ? 'wholesale_brand' : 'retail_brand';
      const { data } = await supabase
        .from('sub_merchants')
        .select('brand_id, sub_merchant_key, status')
        .in('brand_id', brandIds)
        .eq('brand_scope', brandScope)
        .eq('status', 'active');
      const keyByBrand = new Map<string, string>();
      for (const row of (data as { brand_id: string; sub_merchant_key: string }[]) || []) {
        if (row.brand_id && row.sub_merchant_key) keyByBrand.set(row.brand_id, row.sub_merchant_key);
      }
      for (const it of items) {
        if (it.brand_id && keyByBrand.has(it.brand_id)) {
          out.set(it.id, keyByBrand.get(it.brand_id)!);
        }
      }
      return out;
    }

    if (scope === 'social') {
      const sellerIds = Array.from(new Set(items.map((i) => i.brand_user_id).filter(Boolean) as string[]));
      if (sellerIds.length === 0) return out;
      const { data } = await supabase
        .from('sub_merchants')
        .select('user_id, sub_merchant_key, status')
        .in('user_id', sellerIds)
        .eq('brand_scope', 'social_user')
        .eq('status', 'active');
      const keyByUser = new Map<string, string>();
      for (const row of (data as { user_id: string; sub_merchant_key: string }[]) || []) {
        if (row.user_id && row.sub_merchant_key) keyByUser.set(row.user_id, row.sub_merchant_key);
      }
      for (const it of items) {
        if (it.brand_user_id && keyByUser.has(it.brand_user_id)) {
          out.set(it.id, keyByUser.get(it.brand_user_id)!);
        }
      }
    }
    return out;
  }

  /**
   * Persist payment_splits from the plan stored at initialize-time, enriched with
   * Iyzico's per-item paymentTransactionId and PSP fee.
   */
  private async writeSplitsFromPlan(
    tx: Record<string, unknown>,
    result: RetrieveCheckoutFormResult,
  ): Promise<void> {
    const supabase = this.supabaseService.getServiceClient();
    const plan = ((tx.raw_request as Record<string, unknown>)?.plan as Array<{
      itemId: string;
      brandId: string | null;
      brandScope: string;
      commissionPercent: number;
      commission: number;
      subMerchantKey: string | null;
      subMerchantPrice: number;
      payoutEligibleAt: string;
      sellerUserId: string | null;
    }>) || [];
    if (plan.length === 0) return;

    const itemTx = new Map<string, CheckoutFormItemTransaction>();
    for (const it of result.itemTransactions || []) {
      itemTx.set(it.itemId, it);
    }

    const rows = plan.map((p) => {
      const it = itemTx.get(p.itemId);
      const pspFee = it ? round2(Number(it.iyziCommissionFee ?? 0) + Number(it.iyziCommissionRateAmount ?? 0)) : 0;
      const gross = it ? Number(it.price) : Number((p.commission + p.subMerchantPrice).toFixed(2));
      const net = round2(gross - p.commission - pspFee);
      return {
        transaction_id: tx.id as string,
        sub_merchant_key: p.subMerchantKey,
        brand_id: p.brandId,
        brand_scope: p.brandScope,
        user_id: p.sellerUserId,
        order_id: (tx.order_id as string) || null,
        order_item_id: p.itemId,
        gross_amount: gross,
        commission_percent: p.commissionPercent,
        commission_amount: p.commission,
        psp_fee_amount: pspFee,
        net_amount: net,
        sub_merchant_payout: p.subMerchantPrice,
        payout_status: 'pending',
        payout_eligible_at: p.payoutEligibleAt,
        basket_item_id: p.itemId,
        provider_payment_tx_id: it?.paymentTransactionId || null,
      };
    });

    const { error } = await supabase.from('payment_splits').insert(rows);
    if (error) {
      this.logger.warn(`Failed to insert payment_splits for tx ${tx.id}: ${error.message}`);
    }
  }

  private async computePayoutEligibleAt(scope: OrderScope): Promise<string> {
    const supabase = this.supabaseService.getServiceClient();
    let days = this.config.defaultPayoutDays;
    const { data } = await supabase
      .from('payout_settings')
      .select('scope, release_after_days')
      .in('scope', [scope, 'global']);
    const scopeRow = (data || []).find((r) => (r as { scope: string }).scope === scope);
    const globalRow = (data || []).find((r) => (r as { scope: string }).scope === 'global');
    days = Number(((scopeRow ?? globalRow) as { release_after_days?: number })?.release_after_days ?? days);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  private ordersTableFor(scope: OrderScope): string {
    if (scope === 'wholesale') return 'wholesale_orders';
    if (scope === 'retail') return 'retail_orders';
    if (scope === 'social') return 'social_sales_orders';
    throw new BadRequestException(`No order table for scope ${scope}.`);
  }

  private successRedirect(scope: OrderScope, orderId?: string): string {
    const seg = scope === 'wholesale' ? 'wholesale' : scope === 'social' ? 'social' : 'retail';
    const q = orderId ? `?orderId=${orderId}` : '';
    if (scope === 'swap') return `${this.config.frontendUrl}/social/exchange${q}`;
    return `${this.config.frontendUrl}/${seg}/checkout/success${q}`;
  }

  private failureRedirect(scope: OrderScope, reason: string): string {
    const seg = scope === 'wholesale' ? 'wholesale' : scope === 'social' ? 'social' : 'retail';
    if (scope === 'swap') return `${this.config.frontendUrl}/social/exchange?paymentReason=${reason}`;
    return `${this.config.frontendUrl}/${seg}/checkout/failure?reason=${reason}`;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
