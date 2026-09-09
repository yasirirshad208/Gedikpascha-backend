import { Injectable, Logger } from '@nestjs/common';
import type { PaymentCurrency } from './payment-provider.types';

/**
 * Payment gateway configuration.
 *
 * Replaces the former PaymentProviderConfig. Credentials are read from PAYTR_* and the
 * marketplace defaults from PAYMENT_* so they are not tied to any one gateway.
 */
@Injectable()
export class PaymentProviderConfig {
  private readonly logger = new Logger(PaymentProviderConfig.name);

  /** Gateway identifier persisted on orders (orders.payment_provider). */
  readonly provider = 'paytr';

  // --- PayTR credentials (from the merchant panel) ---
  readonly merchantId: string;
  readonly merchantKey: string;
  readonly merchantSalt: string;
  /** PayTR sandbox flag: 1 = test mode, 0 = live. */
  readonly testMode: '0' | '1';

  // --- Marketplace defaults (gateway independent) ---
  readonly baseUrl: string;
  readonly callbackUrl: string;
  readonly defaultCurrency: PaymentCurrency;
  readonly defaultPayoutDays: number;
  readonly defaultCommissionPercent: number;
  readonly frontendUrl: string;

  constructor() {
    this.merchantId = (process.env.PAYTR_MERCHANT_ID || '').trim();
    this.merchantKey = (process.env.PAYTR_MERCHANT_KEY || '').trim();
    this.merchantSalt = (process.env.PAYTR_MERCHANT_SALT || '').trim();
    this.testMode = process.env.PAYTR_TEST_MODE === '0' ? '0' : '1';

    this.baseUrl = (process.env.PAYTR_BASE_URL || 'https://www.paytr.com').replace(
      /\/$/,
      '',
    );
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.callbackUrl =
      process.env.PAYMENT_CALLBACK_URL ||
      'http://localhost:5000/payments/callback';
    this.defaultCurrency =
      (process.env.PAYMENT_DEFAULT_CURRENCY as PaymentCurrency) || 'TRY';
    this.defaultPayoutDays = Number(process.env.PAYMENT_DEFAULT_PAYOUT_DAYS) || 30;
    this.defaultCommissionPercent =
      Number(process.env.PAYMENT_DEFAULT_COMMISSION_PERCENT) || 10;

    this.validate();
  }

  private validate(): void {
    const missing = [
      !this.merchantId && 'PAYTR_MERCHANT_ID',
      !this.merchantKey && 'PAYTR_MERCHANT_KEY',
      !this.merchantSalt && 'PAYTR_MERCHANT_SALT',
    ].filter(Boolean);

    if (missing.length) {
      this.logger.warn(
        `Payment gateway is not configured (missing: ${missing.join(', ')}). ` +
          'Checkout will be rejected until these are set in backend/.env.',
      );
    }
  }

  /** True when the gateway has everything it needs to take a payment. */
  isReady(): boolean {
    return Boolean(this.merchantId && this.merchantKey && this.merchantSalt);
  }
}
