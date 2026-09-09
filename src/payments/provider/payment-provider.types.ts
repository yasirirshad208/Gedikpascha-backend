/**
 * Provider-neutral payment types.
 *
 * These replace the former gateway-specific definitions. The field names
 * are kept close to the previous shapes so the surrounding marketplace logic
 * (checkout, refunds, payouts, sub-merchants) did not have to be rewritten
 * when the payment gateway was removed. A concrete gateway adapter (PayTR) maps its own
 * request/response format onto these.
 */

export type PaymentLocale = 'TR' | 'EN';
export type PaymentCurrency = 'TRY' | 'EUR' | 'USD' | 'GBP';
export type PaymentGroup = 'PRODUCT' | 'LISTING' | 'SUBSCRIPTION';
export type BasketItemType = 'PHYSICAL' | 'VIRTUAL';
export type SubMerchantType =
  | 'PERSONAL'
  | 'PRIVATE_COMPANY'
  | 'LIMITED_OR_JOINT_STOCK_COMPANY';

export interface PaymentBaseResult {
  status: 'success' | 'failure' | string;
  errorCode?: string;
  errorMessage?: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
}

export interface PaymentBuyer {
  id: string;
  name: string;
  surname: string;
  email: string;
  identityNumber: string;
  registrationAddress: string;
  city: string;
  country: string;
  ip: string;
  gsmNumber?: string;
  zipCode?: string;
}

export interface PaymentAddress {
  contactName: string;
  address: string;
  city: string;
  country: string;
  zipCode?: string;
}

export interface PaymentBasketItem {
  id: string;
  name: string;
  category1: string;
  category2?: string;
  itemType: BasketItemType;
  price: string;
  subMerchantKey?: string;
  subMerchantPrice?: string;
}

export interface CreateCheckoutFormInitializeRequest {
  locale?: PaymentLocale;
  conversationId?: string;
  price: string;
  paidPrice: string;
  currency: PaymentCurrency;
  basketId: string;
  paymentGroup?: PaymentGroup;
  callbackUrl: string;
  enabledInstallments?: number[];
  buyer: PaymentBuyer;
  shippingAddress: PaymentAddress;
  billingAddress: PaymentAddress;
  basketItems: PaymentBasketItem[];
}

export interface CheckoutFormInitializeResult extends PaymentBaseResult {
  token?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  tokenExpireTime?: number;
}

export interface RetrieveCheckoutFormRequest {
  locale?: PaymentLocale;
  conversationId?: string;
  token: string;
}

export interface CheckoutFormItemTransaction {
  itemId: string;
  paymentTransactionId: string;
  transactionStatus?: number;
  price?: string;
  paidPrice?: string;
  /** Gateway's own commission on the transaction, when it reports one. */
  providerCommissionFee?: string;
  providerCommissionRateAmount?: string;
  merchantCommissionRate?: string;
  merchantCommissionRateAmount?: string;
  merchantPayoutAmount?: string;
  subMerchantKey?: string;
  subMerchantPrice?: string;
  subMerchantPayoutRate?: string;
  subMerchantPayoutAmount?: string;
  convertedPayout?: Record<string, unknown>;
}

export interface RetrieveCheckoutFormResult extends PaymentBaseResult {
  token?: string;
  paymentStatus?: string;
  paymentId?: string;
  price?: string;
  paidPrice?: string;
  currency?: string;
  basketId?: string;
  installment?: number;
  fraudStatus?: number;
  cardType?: string;
  cardAssociation?: string;
  cardFamily?: string;
  binNumber?: string;
  lastFourDigits?: string;
  itemTransactions?: CheckoutFormItemTransaction[];
}

export interface CreateSubMerchantRequest {
  locale?: PaymentLocale;
  conversationId?: string;
  subMerchantExternalId: string;
  subMerchantType: SubMerchantType;
  address: string;
  contactName?: string;
  contactSurname?: string;
  email: string;
  gsmNumber?: string;
  name: string;
  iban: string;
  identityNumber?: string;
  taxNumber?: string;
  taxOffice?: string;
  legalCompanyTitle?: string;
  swiftCode?: string;
  currency?: PaymentCurrency;
}

export interface SubMerchantResult extends PaymentBaseResult {
  subMerchantKey?: string;
}

export interface UpdateSubMerchantRequest
  extends Omit<CreateSubMerchantRequest, 'subMerchantExternalId'> {
  subMerchantKey: string;
}

export interface CreateRefundRequest {
  locale?: PaymentLocale;
  conversationId?: string;
  paymentTransactionId: string;
  price: string;
  currency?: PaymentCurrency;
  ip?: string;
  reason?: string;
  description?: string;
}

export interface RefundResult extends PaymentBaseResult {
  paymentId?: string;
  paymentTransactionId?: string;
  price?: string;
  currency?: string;
}

export interface CreateCancelRequest {
  locale?: PaymentLocale;
  conversationId?: string;
  paymentId: string;
  ip?: string;
  reason?: string;
  description?: string;
}

export type CancelResult = RefundResult;

export interface ApprovalRequest {
  locale?: PaymentLocale;
  conversationId?: string;
  paymentTransactionId: string;
}

export type ApprovalResult = PaymentBaseResult;
export type DisapprovalResult = PaymentBaseResult;
