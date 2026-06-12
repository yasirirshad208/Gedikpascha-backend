import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IyzicoConfig {
  private readonly logger = new Logger(IyzicoConfig.name);

  readonly apiKey: string;
  readonly apiSecret: string;
  readonly baseUrl: string;
  readonly webhookSecret: string;
  readonly callbackUrl: string;
  readonly defaultCurrency: 'TRY' | 'EUR' | 'USD' | 'GBP';
  readonly defaultPayoutDays: number;
  readonly defaultCommissionPercent: number;
  readonly frontendUrl: string;

  constructor() {
    this.apiKey = process.env.IYZICO_API_KEY || '';
    this.apiSecret = process.env.IYZICO_API_SECRET || '';
    this.baseUrl = process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
    this.webhookSecret = process.env.IYZICO_WEBHOOK_SECRET || '';
    this.callbackUrl =
      process.env.IYZICO_CALLBACK_URL || 'http://localhost:5000/payments/callback';
    this.defaultCurrency =
      (process.env.IYZICO_DEFAULT_CURRENCY as IyzicoConfig['defaultCurrency']) || 'TRY';
    this.defaultPayoutDays = Number(process.env.IYZICO_DEFAULT_PAYOUT_DAYS) || 30;
    this.defaultCommissionPercent =
      Number(process.env.IYZICO_DEFAULT_COMMISSION_PERCENT) || 10;
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    this.validate();
  }

  private validate(): void {
    if (!this.apiKey || this.apiKey.includes('PLACEHOLDER')) {
      this.logger.warn(
        'IYZICO_API_KEY is not set or is a placeholder. Payments will fail until real sandbox/production keys are configured.',
      );
    }
    if (!this.apiSecret || this.apiSecret.includes('PLACEHOLDER')) {
      this.logger.warn(
        'IYZICO_API_SECRET is not set or is a placeholder. Payments will fail.',
      );
    }
    if (!this.webhookSecret || this.webhookSecret === 'PLACEHOLDER') {
      this.logger.warn(
        'IYZICO_WEBHOOK_SECRET is not set. Webhook signature verification will reject all events.',
      );
    }
  }

  isReady(): boolean {
    return (
      !!this.apiKey &&
      !this.apiKey.includes('PLACEHOLDER') &&
      !!this.apiSecret &&
      !this.apiSecret.includes('PLACEHOLDER')
    );
  }
}
