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
import { IyzicoConfig } from './iyzico/iyzico.config';
import { verifyIyzicoSignature } from './iyzico/webhook-verifier';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: IyzicoConfig,
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
   * Iyzico redirects the buyer here after the Hosted Checkout Form completes.
   * It POSTs `token` as application/x-www-form-urlencoded. We retrieve the
   * payment result, persist it, and redirect the buyer to /retail/checkout/{success|failure}.
   *
   * Both GET and POST are exposed because Iyzico's docs use POST but tests
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
   * Iyzico signs webhooks with HMAC-SHA256 using the merchant webhook secret.
   * We verify the signature, then idempotently log the event for the Phase-6
   * handlers (refunds/chargebacks). Always returns 200 to avoid retry storms
   * — the event row is the durable record.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-iyz-signature') sigHeader?: string,
  ) {
    const rawBody =
      (req.rawBody && req.rawBody.toString('utf8')) ||
      (req.body ? JSON.stringify(req.body) : '');

    const verified = verifyIyzicoSignature({
      rawBody,
      signature: sigHeader,
      secret: this.config.webhookSecret,
    });

    const payload = (req.body || {}) as Record<string, unknown>;
    const eventId =
      (payload.eventId as string) ||
      (payload.iyziEventId as string) ||
      (payload.paymentId as string) ||
      '';
    const eventType =
      (payload.eventType as string) ||
      (payload.iyziEventType as string) ||
      'UNKNOWN';

    await this.paymentsService.ingestWebhookEvent({
      eventId,
      eventType,
      providerPaymentId: (payload.paymentId as string) || undefined,
      payload,
      signature: sigHeader,
      verified,
    });

    return { received: true, verified };
  }
}
