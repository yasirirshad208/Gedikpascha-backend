import {
  Injectable,
  Logger,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymentProviderConfig } from './payment-provider.config';
import type {
  ApprovalRequest,
  ApprovalResult,
  CancelResult,
  CheckoutFormInitializeResult,
  CreateCancelRequest,
  CreateCheckoutFormInitializeRequest,
  CreateRefundRequest,
  CreateSubMerchantRequest,
  DisapprovalResult,
  RefundResult,
  RetrieveCheckoutFormRequest,
  RetrieveCheckoutFormResult,
  SubMerchantResult,
} from './payment-provider.types';
import type { UpdateSubMerchantRequest } from './payment-provider.types';

/** PayTR takes amounts as an integer number of kuruş. */
const toKurus = (amount: string | number): number =>
  Math.round(Number(amount || 0) * 100);

/** PayTR uses "TL" rather than the ISO code for Turkish Lira. */
const toPaytrCurrency = (currency?: string): string =>
  !currency || currency.toUpperCase() === 'TRY' ? 'TL' : currency.toUpperCase();

/**
 * PayTR gateway adapter.
 *
 * Replaces the previous the payment gateway integration. PayTR's iFrame API works in two
 * steps: request a token for the basket, then load the hosted payment page at
 * /odeme/guvenli/<token>. The final result is not polled — PayTR POSTs it to
 * the callback URL, which must reply with the literal body "OK".
 */
@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(private readonly config: PaymentProviderConfig) {}

  // -- Checkout -------------------------------------------------------------

  async initializeCheckoutForm(
    request: CreateCheckoutFormInitializeRequest,
  ): Promise<CheckoutFormInitializeResult> {
    this.assertReady();

    const paymentAmount = toKurus(request.paidPrice ?? request.price);
    const currency = toPaytrCurrency(request.currency);
    const noInstallment = '0';
    const maxInstallment = '0';
    const testMode = this.config.testMode;
    const merchantOid = this.sanitizeOid(request.basketId);
    const userIp = request.buyer.ip;
    const email = request.buyer.email;

    // PayTR expects the basket as base64([[name, unitPrice, count], ...]).
    const basket = request.basketItems.map((item) => [
      item.name,
      Number(item.price).toFixed(2),
      1,
    ]);
    const userBasket = Buffer.from(JSON.stringify(basket)).toString('base64');

    const token = this.hmacBase64(
      [
        this.config.merchantId,
        userIp,
        merchantOid,
        email,
        String(paymentAmount),
        userBasket,
        noInstallment,
        maxInstallment,
        currency,
        testMode,
      ].join('') + this.config.merchantSalt,
    );

    const body = new URLSearchParams({
      merchant_id: this.config.merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email,
      payment_amount: String(paymentAmount),
      paytr_token: token,
      user_basket: userBasket,
      debug_on: testMode === '1' ? '1' : '0',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: `${request.buyer.name} ${request.buyer.surname}`.trim(),
      user_address: request.shippingAddress.address,
      user_phone: request.buyer.gsmNumber || '',
      merchant_ok_url: `${this.config.frontendUrl}/payments/success`,
      merchant_fail_url: `${this.config.frontendUrl}/payments/failure`,
      timeout_limit: '30',
      currency,
      test_mode: testMode,
    });

    const response = await fetch(`${this.config.baseUrl}/odeme/api/get-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      token?: string;
      reason?: string;
    } | null;

    if (!payload || payload.status !== 'success' || !payload.token) {
      const reason = payload?.reason || `HTTP ${response.status}`;
      this.logger.error(`PayTR get-token failed: ${reason}`);
      return {
        status: 'failure',
        errorMessage: reason,
        conversationId: request.conversationId,
      };
    }

    return {
      status: 'success',
      token: payload.token,
      // The hosted page is loaded in an iframe (or opened directly).
      paymentPageUrl: `${this.config.baseUrl}/odeme/guvenli/${payload.token}`,
      conversationId: request.conversationId,
    };
  }

  /**
   * PayTR has no "fetch the result by token" endpoint — the outcome is
   * delivered to the callback URL. Kept so the surrounding flow still type
   * checks, but it fails loudly rather than pretending to verify a payment.
   */
  retrieveCheckoutForm(
    _request: RetrieveCheckoutFormRequest,
  ): Promise<RetrieveCheckoutFormResult> {
    throw new NotImplementedException(
      'PayTR does not support retrieving a payment by token. The payment result ' +
        'arrives at the callback endpoint (POST /payments/callback).',
    );
  }

  /**
   * Verifies a PayTR callback. The hash covers the order id, status and amount,
   * so a forged or tampered notification is rejected.
   */
  verifyCallback(input: {
    merchantOid: string;
    status: string;
    totalAmount: string;
    hash: string;
  }): boolean {
    if (!this.config.isReady() || !input?.hash) return false;
    const expected = this.hmacBase64(
      `${input.merchantOid}${this.config.merchantSalt}${input.status}${input.totalAmount}`,
    );
    return expected === input.hash;
  }

  // -- Refunds --------------------------------------------------------------

  async refundItem(request: CreateRefundRequest): Promise<RefundResult> {
    this.assertReady();

    const merchantOid = this.sanitizeOid(request.paymentTransactionId);
    const returnAmount = Number(request.price || 0).toFixed(2);
    const token = this.hmacBase64(
      `${this.config.merchantId}${merchantOid}${returnAmount}${this.config.merchantSalt}`,
    );

    const response = await fetch(`${this.config.baseUrl}/odeme/iade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        merchant_id: this.config.merchantId,
        merchant_oid: merchantOid,
        return_amount: returnAmount,
        paytr_token: token,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      err_msg?: string;
      err_no?: string;
    } | null;

    if (!payload || payload.status !== 'success') {
      return {
        status: 'failure',
        errorCode: payload?.err_no,
        errorMessage: payload?.err_msg || `HTTP ${response.status}`,
        paymentTransactionId: request.paymentTransactionId,
      };
    }

    return {
      status: 'success',
      paymentTransactionId: request.paymentTransactionId,
      price: returnAmount,
      currency: request.currency ?? this.config.defaultCurrency,
    };
  }

  /** A full cancellation is a full-amount refund on PayTR. */
  cancelPayment(request: CreateCancelRequest): Promise<CancelResult> {
    return this.refundItem({
      paymentTransactionId: request.paymentId,
      price: '0',
      conversationId: request.conversationId,
      reason: request.reason,
      description: request.description,
    });
  }

  // -- Marketplace (not part of PayTR's standard iFrame product) ------------

  private marketplaceUnavailable(feature: string): never {
    throw new NotImplementedException(
      `${feature} is not available on the PayTR iFrame integration. PayTR's ` +
        'marketplace (sub-seller) product uses a separate API and must be ' +
        'enabled on the merchant account before this can be wired up.',
    );
  }

  createSubMerchant(_request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    this.marketplaceUnavailable('Creating a sub-merchant');
  }

  updateSubMerchant(_request: UpdateSubMerchantRequest): Promise<SubMerchantResult> {
    this.marketplaceUnavailable('Updating a sub-merchant');
  }

  approveItem(_request: ApprovalRequest): Promise<ApprovalResult> {
    this.marketplaceUnavailable('Approving a marketplace item');
  }

  disapproveItem(_request: ApprovalRequest): Promise<DisapprovalResult> {
    this.marketplaceUnavailable('Disapproving a marketplace item');
  }

  // Constant sets that used to come from the gateway SDK's enums. Kept so the
  // surrounding marketplace code reads the same way.
  readonly LOCALE = { TR: 'TR', EN: 'EN' } as const;
  readonly CURRENCY = {
    TRY: 'TRY',
    EUR: 'EUR',
    USD: 'USD',
    GBP: 'GBP',
  } as const;
  readonly PAYMENT_GROUP = {
    PRODUCT: 'PRODUCT',
    LISTING: 'LISTING',
    SUBSCRIPTION: 'SUBSCRIPTION',
  } as const;
  readonly BASKET_ITEM_TYPE = { PHYSICAL: 'PHYSICAL', VIRTUAL: 'VIRTUAL' } as const;
  readonly SUB_MERCHANT_TYPE = {
    PERSONAL: 'PERSONAL',
    PRIVATE_COMPANY: 'PRIVATE_COMPANY',
    LIMITED_OR_JOINT_STOCK_COMPANY: 'LIMITED_OR_JOINT_STOCK_COMPANY',
  } as const;
  readonly REFUND_REASON = {
    DOUBLE_PAYMENT: 'double_payment',
    BUYER_REQUEST: 'buyer_request',
    FRAUD: 'fraud',
    OTHER: 'other',
  } as const;

  // -- Internals ------------------------------------------------------------

  private assertReady(): void {
    if (!this.config.isReady()) {
      throw new ServiceUnavailableException(
        'Payment gateway is not configured. Set PAYTR_MERCHANT_ID, ' +
          'PAYTR_MERCHANT_KEY and PAYTR_MERCHANT_SALT in backend/.env.',
      );
    }
  }

  private hmacBase64(payload: string): string {
    return createHmac('sha256', this.config.merchantKey)
      .update(payload)
      .digest('base64');
  }

  /** PayTR order ids must be alphanumeric. */
  private sanitizeOid(value: string): string {
    return String(value ?? '').replace(/[^a-zA-Z0-9]/g, '');
  }
}
