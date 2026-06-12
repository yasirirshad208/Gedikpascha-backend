import { Injectable, OnModuleInit, Logger, ServiceUnavailableException } from '@nestjs/common';
import { IyzicoConfig } from './iyzico.config';
import type {
  IyzipayInstance,
  IyzipayConstructor,
  CreateCheckoutFormInitializeRequest,
  CheckoutFormInitializeResult,
  RetrieveCheckoutFormRequest,
  RetrieveCheckoutFormResult,
  CreateSubMerchantRequest,
  UpdateSubMerchantRequest,
  SubMerchantResult,
  CreateRefundRequest,
  RefundResult,
  CreateCancelRequest,
  CancelResult,
  ApprovalRequest,
  ApprovalResult,
  DisapprovalResult,
} from './iyzico.types';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const Iyzipay = require('iyzipay') as IyzipayConstructor;

/**
 * Promise-based wrapper around the callback-style iyzipay SDK.
 * Methods are added per phase:
 *   Phase 1 — initializeCheckoutForm + retrieveCheckoutForm
 *   Phase 2 — createSubMerchant + updateSubMerchant
 *   Phase 3 — approveItem + disapproveItem
 *   Phase 6 — refundItem + cancelPayment
 */
@Injectable()
export class IyzicoService implements OnModuleInit {
  private readonly logger = new Logger(IyzicoService.name);
  private client!: IyzipayInstance;

  constructor(private readonly config: IyzicoConfig) {}

  onModuleInit(): void {
    this.client = new Iyzipay({
      apiKey: this.config.apiKey,
      secretKey: this.config.apiSecret,
      uri: this.config.baseUrl,
    });
    this.logger.log(
      `Iyzico client initialised (base: ${this.config.baseUrl}, currency: ${this.config.defaultCurrency}, ready: ${this.config.isReady()})`,
    );
  }

  // -- Phase 1 --------------------------------------------------------------

  initializeCheckoutForm(
    request: CreateCheckoutFormInitializeRequest,
  ): Promise<CheckoutFormInitializeResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.checkoutFormInitialize.create(request, cb));
  }

  retrieveCheckoutForm(
    request: RetrieveCheckoutFormRequest,
  ): Promise<RetrieveCheckoutFormResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.checkoutForm.retrieve(request, cb));
  }

  // -- Phase 2 --------------------------------------------------------------

  createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.subMerchant.create(request, cb));
  }

  updateSubMerchant(request: UpdateSubMerchantRequest): Promise<SubMerchantResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.subMerchant.update(request, cb));
  }

  // -- Phase 3 --------------------------------------------------------------

  approveItem(request: ApprovalRequest): Promise<ApprovalResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.approval.create(request, cb));
  }

  disapproveItem(request: ApprovalRequest): Promise<DisapprovalResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.disapproval.create(request, cb));
  }

  // -- Phase 6 --------------------------------------------------------------

  refundItem(request: CreateRefundRequest): Promise<RefundResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.refund.create(request, cb));
  }

  cancelPayment(request: CreateCancelRequest): Promise<CancelResult> {
    this.assertReady();
    return this.promisify((cb) => this.client.cancel.create(request, cb));
  }

  // -- Internals ------------------------------------------------------------

  private assertReady(): void {
    if (!this.config.isReady()) {
      throw new ServiceUnavailableException(
        'Iyzico credentials are not configured. Set IYZICO_API_KEY and IYZICO_API_SECRET in backend/.env.',
      );
    }
  }

  private promisify<T>(call: (cb: (err: unknown, result: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      call((err, result) => {
        if (err) {
          this.logger.error('Iyzico SDK call failed', err as Error);
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  // Re-export iyzipay enums for callers that prefer not to require() directly.
  readonly LOCALE = Iyzipay.LOCALE;
  readonly CURRENCY = Iyzipay.CURRENCY;
  readonly PAYMENT_GROUP = Iyzipay.PAYMENT_GROUP;
  readonly BASKET_ITEM_TYPE = Iyzipay.BASKET_ITEM_TYPE;
  readonly SUB_MERCHANT_TYPE = Iyzipay.SUB_MERCHANT_TYPE;
  readonly REFUND_REASON = Iyzipay.REFUND_REASON;
}
