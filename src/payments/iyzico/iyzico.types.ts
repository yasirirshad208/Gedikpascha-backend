/**
 * Minimal TypeScript surface for the `iyzipay` package.
 * The official SDK ships without typings, so we declare only what the codebase touches.
 */

export type IyzipayLocale = 'TR' | 'EN';
export type IyzipayCurrency = 'TRY' | 'EUR' | 'USD' | 'GBP';
export type IyzipayPaymentGroup = 'PRODUCT' | 'LISTING' | 'SUBSCRIPTION';
export type IyzipayBasketItemType = 'PHYSICAL' | 'VIRTUAL';
export type IyzipaySubMerchantType =
  | 'PERSONAL'
  | 'PRIVATE_COMPANY'
  | 'LIMITED_OR_JOINT_STOCK_COMPANY';

export interface IyzipayCallback<T> {
  (err: unknown, result: T): void;
}

export interface IyzipayBaseResult {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
  locale?: IyzipayLocale;
  systemTime?: number;
  conversationId?: string;
}

export interface IyzipayBuyer {
  id: string;
  name: string;
  surname: string;
  gsmNumber?: string;
  email: string;
  identityNumber: string;
  lastLoginDate?: string;
  registrationDate?: string;
  registrationAddress: string;
  ip: string;
  city: string;
  country: string;
  zipCode?: string;
}

export interface IyzipayAddress {
  contactName: string;
  city: string;
  country: string;
  address: string;
  zipCode?: string;
}

export interface IyzipayBasketItem {
  id: string;
  name: string;
  category1: string;
  category2?: string;
  itemType: IyzipayBasketItemType;
  price: string;
  subMerchantKey?: string;
  subMerchantPrice?: string;
}

export interface CreateCheckoutFormInitializeRequest {
  locale: IyzipayLocale;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: IyzipayCurrency;
  basketId: string;
  paymentGroup: IyzipayPaymentGroup;
  callbackUrl: string;
  enabledInstallments?: number[];
  buyer: IyzipayBuyer;
  shippingAddress: IyzipayAddress;
  billingAddress: IyzipayAddress;
  basketItems: IyzipayBasketItem[];
}

export interface CheckoutFormInitializeResult extends IyzipayBaseResult {
  token: string;
  checkoutFormContent: string;
  tokenExpireTime: number;
  paymentPageUrl: string;
}

export interface RetrieveCheckoutFormRequest {
  locale: IyzipayLocale;
  conversationId: string;
  token: string;
}

export interface CheckoutFormItemTransaction {
  itemId: string;
  paymentTransactionId: string;
  transactionStatus: number;
  price: string;
  paidPrice: string;
  merchantCommissionRate?: string;
  merchantCommissionRateAmount?: string;
  iyziCommissionRateAmount?: string;
  iyziCommissionFee?: string;
  blockageRate?: string;
  blockageRateAmountMerchant?: string;
  blockageRateAmountSubMerchant?: string;
  blockageResolvedDate?: string;
  subMerchantKey?: string;
  subMerchantPrice?: string;
  subMerchantPayoutRate?: string;
  subMerchantPayoutAmount?: string;
}

export interface RetrieveCheckoutFormResult extends IyzipayBaseResult {
  paymentStatus:
    | 'SUCCESS'
    | 'FAILURE'
    | 'INIT_THREEDS'
    | 'CALLBACK_THREEDS'
    | 'BKM_POS_SELECTED'
    | 'CALLBACK_PECCO';
  paymentId?: string;
  paymentConversationId?: string;
  price?: string;
  paidPrice?: string;
  installment?: number;
  basketId?: string;
  binNumber?: string;
  lastFourDigits?: string;
  cardAssociation?: string;
  cardFamily?: string;
  cardType?: string;
  fraudStatus?: number;
  itemTransactions?: CheckoutFormItemTransaction[];
  token?: string;
}

// -- Sub-merchant ------------------------------------------------------------

export interface CreateSubMerchantRequest {
  locale: IyzipayLocale;
  conversationId: string;
  subMerchantExternalId: string;
  subMerchantType: IyzipaySubMerchantType;
  address: string;
  contactName: string;
  contactSurname: string;
  email: string;
  gsmNumber?: string;
  name?: string; // brand display name
  iban: string;
  identityNumber?: string; // required for PERSONAL
  taxOffice?: string;
  taxNumber?: string; // required for PRIVATE_COMPANY / LIMITED_OR_JOINT_STOCK_COMPANY
  legalCompanyTitle?: string;
  currency: IyzipayCurrency;
}

export interface SubMerchantResult extends IyzipayBaseResult {
  subMerchantKey?: string;
}

export interface UpdateSubMerchantRequest extends Omit<CreateSubMerchantRequest, 'subMerchantExternalId'> {
  subMerchantKey: string;
}

// -- Refund / cancel / approval ---------------------------------------------

export interface CreateRefundRequest {
  locale: IyzipayLocale;
  conversationId: string;
  paymentTransactionId: string; // itemTransaction.paymentTransactionId
  price: string;                // partial-refund amount
  ip: string;
  currency?: IyzipayCurrency;
  reason?: 'double_payment' | 'buyer_request' | 'fraud' | 'other';
  description?: string;
}

export interface RefundResult extends IyzipayBaseResult {
  paymentId?: string;
  paymentTransactionId?: string;
  price?: string;
  currency?: IyzipayCurrency;
  hostReference?: string;
  authCode?: string;
}

export interface CreateCancelRequest {
  locale: IyzipayLocale;
  conversationId: string;
  paymentId: string;
  ip: string;
  reason?: 'double_payment' | 'buyer_request' | 'fraud' | 'other';
  description?: string;
}

export type CancelResult = RefundResult;

export interface ApprovalRequest {
  locale: IyzipayLocale;
  conversationId: string;
  paymentTransactionId: string;
}
export type ApprovalResult = IyzipayBaseResult;
export type DisapprovalResult = IyzipayBaseResult;

// -- SDK constructor shape --------------------------------------------------

interface IyzipayResourceCreate<Req, Res> {
  create(req: Req, callback: IyzipayCallback<Res>): void;
}
interface IyzipayResourceUpdate<Req, Res> {
  update(req: Req, callback: IyzipayCallback<Res>): void;
}

export interface IyzipayInstance {
  checkoutFormInitialize: IyzipayResourceCreate<
    CreateCheckoutFormInitializeRequest,
    CheckoutFormInitializeResult
  >;
  checkoutForm: {
    retrieve(
      req: RetrieveCheckoutFormRequest,
      callback: IyzipayCallback<RetrieveCheckoutFormResult>,
    ): void;
  };
  subMerchant: IyzipayResourceCreate<CreateSubMerchantRequest, SubMerchantResult> &
    IyzipayResourceUpdate<UpdateSubMerchantRequest, SubMerchantResult>;
  refund: IyzipayResourceCreate<CreateRefundRequest, RefundResult>;
  cancel: IyzipayResourceCreate<CreateCancelRequest, CancelResult>;
  approval: IyzipayResourceCreate<ApprovalRequest, ApprovalResult>;
  disapproval: IyzipayResourceCreate<ApprovalRequest, DisapprovalResult>;
}

export interface IyzipayConstructor {
  new (options: { apiKey: string; secretKey: string; uri: string }): IyzipayInstance;
  LOCALE: { TR: 'TR'; EN: 'EN' };
  CURRENCY: { TRY: 'TRY'; EUR: 'EUR'; USD: 'USD'; GBP: 'GBP' };
  PAYMENT_GROUP: { PRODUCT: 'PRODUCT'; LISTING: 'LISTING'; SUBSCRIPTION: 'SUBSCRIPTION' };
  BASKET_ITEM_TYPE: { PHYSICAL: 'PHYSICAL'; VIRTUAL: 'VIRTUAL' };
  SUB_MERCHANT_TYPE: {
    PERSONAL: 'PERSONAL';
    PRIVATE_COMPANY: 'PRIVATE_COMPANY';
    LIMITED_OR_JOINT_STOCK_COMPANY: 'LIMITED_OR_JOINT_STOCK_COMPANY';
  };
  REFUND_REASON: {
    DOUBLE_PAYMENT: 'double_payment';
    BUYER_REQUEST: 'buyer_request';
    FRAUD: 'fraud';
    OTHER: 'other';
  };
}
