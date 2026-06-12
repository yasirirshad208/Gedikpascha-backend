import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { IyzicoConfig } from '../iyzico/iyzico.config';

/**
 * Phase 7 — lightweight payout release scheduler.
 *
 * `@nestjs/schedule` is not a dependency, so this uses a guarded interval timer
 * instead of a cron decorator. It runs the auto-release sweep once on a fixed
 * interval (default: every 6 hours) plus a short delay after boot. Admins can
 * also trigger a sweep on demand via POST /payments/payouts/admin/run-auto-release.
 *
 * Set IYZICO_AUTO_RELEASE_INTERVAL_MS to tune; set it to 0 to disable the timer
 * entirely (e.g. when running the sweep from an external cron / job runner).
 */
@Injectable()
export class PayoutScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayoutScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly intervalMs =
    Number(process.env.IYZICO_AUTO_RELEASE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
  private readonly bootDelayMs = 60 * 1000;

  constructor(
    private readonly payouts: PayoutsService,
    private readonly config: IyzicoConfig,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0) {
      this.logger.log('Payout auto-release timer disabled (IYZICO_AUTO_RELEASE_INTERVAL_MS=0).');
      return;
    }
    if (!this.config.isReady()) {
      this.logger.warn(
        'Payout auto-release timer not started: Iyzico is not configured (placeholder keys).',
      );
      return;
    }

    // First sweep shortly after boot, then on the configured interval.
    this.bootTimer = setTimeout(() => void this.tick(), this.bootDelayMs);
    if (typeof this.bootTimer.unref === 'function') this.bootTimer.unref();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(
      `Payout auto-release timer started (every ${Math.round(this.intervalMs / 60000)} min).`,
    );
  }

  onModuleDestroy(): void {
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return; // prevent overlap if a sweep runs long
    this.running = true;
    try {
      const res = await this.payouts.runAutoRelease();
      if (res.promoted || res.approved || res.skipped) {
        this.logger.log(
          `Auto-release: promoted=${res.promoted} approved=${res.approved} skipped=${res.skipped}`,
        );
      }
    } catch (e) {
      this.logger.error(`Auto-release sweep failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
