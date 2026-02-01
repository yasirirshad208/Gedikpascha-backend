import { Module } from '@nestjs/common';
import { ExchangesModule } from './exchanges/exchanges.module';

@Module({
  imports: [ExchangesModule],
  exports: [ExchangesModule],
})
export class RetailModule {}
