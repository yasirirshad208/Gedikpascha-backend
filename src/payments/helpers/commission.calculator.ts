import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { IyzicoConfig } from '../iyzico/iyzico.config';
import type { OrderScope } from '../dto/create-checkout.dto';

export interface CommissionInputItem {
  /** Identifies the seller-side party for split attribution. */
  brandId?: string;
  brandScope: 'wholesale_brand' | 'retail_brand' | 'social_user' | 'main_merchant';
  categoryId?: string;
  /** Line gross (unit price * quantity). */
  gross: number;
}

export interface CommissionResult {
  gross: number;
  percentage: number;
  commission: number;
  net: number; // gross - commission (PSP fee is added later when known)
}

/**
 * Layered commission lookup:
 *   1. Override: scope + brand_id (most specific)
 *   2. Override: scope + category_id
 *   3. Scope rule: scope only
 *   4. Global: scope='global'
 *
 * Falls back to IyzicoConfig.defaultCommissionPercent if no row found.
 * The Phase 1 seed plants a single global row at 10% so all lookups resolve correctly.
 */
@Injectable()
export class CommissionCalculator {
  private readonly logger = new Logger(CommissionCalculator.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly iyzicoConfig: IyzicoConfig,
  ) {}

  async resolvePercentage(
    scope: OrderScope,
    item: CommissionInputItem,
  ): Promise<number> {
    const supabase = this.supabaseService.getServiceClient();
    const now = new Date().toISOString();

    // We query once and rank in memory rather than four sequential queries.
    const { data, error } = await supabase
      .from('commission_rules')
      .select('scope, category_id, brand_id, percentage')
      .eq('is_active', true)
      .lte('effective_from', now)
      .or(`effective_to.is.null,effective_to.gte.${now}`);

    if (error) {
      this.logger.warn(
        `commission_rules query failed (${error.message}); falling back to default ${this.iyzicoConfig.defaultCommissionPercent}%`,
      );
      return this.iyzicoConfig.defaultCommissionPercent;
    }

    if (!data || data.length === 0) {
      return this.iyzicoConfig.defaultCommissionPercent;
    }

    // Pick the most specific match.
    type Row = { scope: string; category_id: string | null; brand_id: string | null; percentage: number };
    const rows = data as Row[];

    const byBrand = rows.find(
      (r) => r.scope === scope && r.brand_id && r.brand_id === item.brandId,
    );
    if (byBrand) return Number(byBrand.percentage);

    const byCategory = rows.find(
      (r) => r.scope === scope && !r.brand_id && r.category_id && r.category_id === item.categoryId,
    );
    if (byCategory) return Number(byCategory.percentage);

    const byScope = rows.find(
      (r) => r.scope === scope && !r.brand_id && !r.category_id,
    );
    if (byScope) return Number(byScope.percentage);

    const global = rows.find((r) => r.scope === 'global');
    if (global) return Number(global.percentage);

    return this.iyzicoConfig.defaultCommissionPercent;
  }

  async calculate(scope: OrderScope, item: CommissionInputItem): Promise<CommissionResult> {
    const percentage = await this.resolvePercentage(scope, item);
    const commission = round2(item.gross * (percentage / 100));
    const net = round2(item.gross - commission);
    return { gross: item.gross, percentage, commission, net };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
