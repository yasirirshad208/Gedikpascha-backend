import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderService } from './provider/payment-provider.service';
import { PaymentProviderConfig } from './provider/payment-provider.config';
import { CommissionCalculator } from './helpers/commission.calculator';
import { OrderLocator } from './helpers/order-locator';
import { SubMerchantsService } from './sub-merchants/sub-merchants.service';
import { SubMerchantsController } from './sub-merchants/sub-merchants.controller';
import { RefundsService } from './refunds/refunds.service';
import { RefundsController } from './refunds/refunds.controller';
import { PayoutsService } from './payouts/payouts.service';
import { PayoutsController } from './payouts/payouts.controller';
import { PayoutScheduler } from './payouts/payout-scheduler.service';

@Module({
  controllers: [
    PaymentsController,
    SubMerchantsController,
    RefundsController,
    PayoutsController,
  ],
  providers: [
    PaymentsService,
    PaymentProviderService,
    PaymentProviderConfig,
    CommissionCalculator,
    OrderLocator,
    SubMerchantsService,
    RefundsService,
    PayoutsService,
    PayoutScheduler,
  ],
  exports: [
    PaymentsService,
    PaymentProviderService,
    PaymentProviderConfig,
    CommissionCalculator,
    SubMerchantsService,
    RefundsService,
    PayoutsService,
  ],
})
export class PaymentsModule {}
