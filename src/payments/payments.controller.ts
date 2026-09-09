import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentProviderConfig } from './provider/payment-provider.config';
import { PaymentProviderService } from './provider/payment-provider.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: PaymentProviderConfig,
    private readonly paymentProvider: PaymentProviderService,
  ) {}

  /**
   * POST /payments/checkout
   * Body: CreateCheckoutDto
   * Response: { transactionId, token, checkoutFormContent, paymentPageUrl }
   *
   * Auth is optional (guest checkout is supported on the retail side).
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Req() req: Request,
    @Headers('authorization') _authHeader?: string,
  ) {
    const buyerIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return this.paymentsService.createCheckoutForm(dto, buyerIp);
  }

  /**
   * the payment gateway redirects the buyer here after the Hosted Checkout Form completes.
   * It POSTs `token` as application/x-www-form-urlencoded. We retrieve the
   * payment result, persist it, and redirect the buyer to /retail/checkout/{success|failure}.
   *
   * Both GET and POST are exposed because the payment gateway's docs use POST but tests
   * sometimes hit GET. The GET path lets us re-process a callback for debugging.
   */
  @Post('callback')
  async callbackPost(@Body('token') token: string, @Res() res: Response) {
    const { redirectUrl } = await this.paymentsService.handleCallback(token);
    return res.redirect(303, redirectUrl);
  }

  @Get('callback')
  async callbackGet(@Query('token') token: string, @Res() res: Response) {
    const { redirectUrl } = await this.paymentsService.handleCallback(token);
    return res.redirect(303, redirectUrl);
  }

  /**
   * POST /payments/webhook
   *
   * PayTR posts the payment result as form fields and signs it with a hash
   * over merchant_oid + salt + status + total_amount. We verify that hash,
   * then idempotently log the event. Always returns 200 so PayTR does not
   * retry — the event row is the durable record.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const payload = (req.body || {}) as Record<string, unknown>;

    const merchantOid = String(payload.merchant_oid ?? '');
    const status = String(payload.status ?? '');
    const totalAmount = String(payload.total_amount ?? '');
    const hash = String(payload.hash ?? '');

    const verified = this.paymentProvider.verifyCallback({
      merchantOid,
      status,
      totalAmount,
      hash,
    });

    const eventId = merchantOid || String(payload.payment_id ?? '');
    const eventType = status ? `payment.${status}` : 'UNKNOWN';

    await this.paymentsService.ingestWebhookEvent({
      eventId,
      eventType,
      providerPaymentId: merchantOid || undefined,
      payload,
      signature: hash || undefined,
      verified,
    });

    return { received: true, verified };
  }
}
