import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { IyzicoService } from '../iyzico/iyzico.service';
import { IyzicoConfig } from '../iyzico/iyzico.config';

export type PayoutBrandScope =
  | 'wholesale_brand'
  | 'retail_brand'
  | 'social_user'
  | 'main_merchant';

export interface SplitRow {
  id: string;
  transaction_id: string;
  brand_id: string | null;
  brand_scope: string;
  user_id: string | null;
  order_id: string | null;
  order_item_id: string | null;
  gross_amount: number;
  commission_amount: number;
  psp_fee_amount: number;
  net_amount: number;
  refunded_amount: number;
  payout_status: string;
  payout_eligible_at: string | null;
  approved_at: string | null;
  hold_reason: string | null;
  provider_payment_tx_id: string | null;
  created_at: string;
}

export interface BalanceSummary {
  pending: number;
  approvable: number;
  approved: number;
  onHold: number;
  refunded: number;
  currency: string;
}

/**
 * Phase 7 — Seller payout dashboard + admin hold/release.
 *
 * Money model (per split):
 *   gross      = price buyer paid for the item
 *   commission = platform's cut
 *   psp_fee    = Iyzico fee (passed through to seller)
 *   net        = gross - commission - psp_fee   (what the seller receives)
 *
 * payout_status lifecycle:
 *   pending -> approvable -> approved          (happy path)
 *   pending/approvable -> on_hold             (fraud / chargeback / dispute)
 *   any -> refunded / cancelled               (refund flow)
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly iyzico: IyzicoService,
    private readonly config: IyzicoConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Seller-facing
  // ---------------------------------------------------------------------------

  /** A seller's payout splits, optionally filtered by status / date range. */
  async listForSeller(
    sellerUserId: string,
    opts: { brandId?: string; status?: string; from?: string; to?: string } = {},
  ) {
    const splits = await this.fetchSellerSplits(sellerUserId, opts);
    return {
      summary: this.summarise(splits),
      items: splits.map((s) => this.toSellerView(s)),
    };
  }

  async balanceForSeller(sellerUserId: string, brandId?: string): Promise<BalanceSummary> {
    const splits = await this.fetchSellerSplits(sellerUserId, { brandId });
    return this.summarise(splits);
  }

  private async fetchSellerSplits(
    sellerUserId: string,
    opts: { brandId?: string; status?: string; from?: string; to?: string },
  ): Promise<SplitRow[]> {
    const supabase = this.supabaseService.getServiceClient();

    // A seller can be matched either by user_id (social) or by owning a brand.
    const brandIds = await this.brandIdsForUser(sellerUserId);

    let query = supabase.from('payment_splits').select('*');

    if (brandIds.length > 0) {
      // Match social splits (user_id) OR brand splits (brand_id IN ...).
      const brandList = brandIds.map((b) => `"${b}"`).join(',');
      query = query.or(`user_id.eq.${sellerUserId},brand_id.in.(${brandList})`);
    } else {
      query = query.eq('user_id', sellerUserId);
    }

    if (opts.brandId) query = query.eq('brand_id', opts.brandId);
    if (opts.status) query = query.eq('payout_status', opts.status);
    if (opts.from) query = query.gte('created_at', opts.from);
    if (opts.to) query = query.lte('created_at', opts.to);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      this.logger.warn(`fetchSellerSplits failed: ${error.message}`);
      return [];
    }
    return (data as SplitRow[]) || [];
  }

  private async brandIdsForUser(userId: string): Promise<string[]> {
    const supabase = this.supabaseService.getServiceClient();
    const ids = new Set<string>();
    for (const table of ['wholesale_brands', 'retail_brands']) {
      const { data } = await supabase.from(table).select('id').eq('user_id', userId);
      for (const r of (data as { id: string }[]) || []) ids.add(r.id);
    }
    return Array.from(ids);
  }

  private toSellerView(s: SplitRow) {
    return {
      id: s.id,
      orderId: s.order_id,
      orderItemId: s.order_item_id,
      gross: s.gross_amount,
      commission: s.commission_amount,
      pspFee: s.psp_fee_amount,
      net: s.net_amount,
      refunded: s.refunded_amount,
      status: s.payout_status,
      holdReason: s.hold_reason,
      eligibleAt: s.payout_eligible_at,
      approvedAt: s.approved_at,
      createdAt: s.created_at,
    };
  }

  private summarise(splits: SplitRow[]): BalanceSummary {
    const acc: BalanceSummary = {
      pending: 0,
      approvable: 0,
      approved: 0,
      onHold: 0,
      refunded: 0,
      currency: this.config.defaultCurrency,
    };
    for (const s of splits) {
      const net = Number(s.net_amount) || 0;
      switch (s.payout_status) {
        case 'pending':
          acc.pending = round2(acc.pending + net);
          break;
        case 'approvable':
          acc.approvable = round2(acc.approvable + net);
          break;
        case 'approved':
          acc.approved = round2(acc.approved + net);
          break;
        case 'on_hold':
          acc.onHold = round2(acc.onHold + net);
          break;
        case 'refunded':
        case 'cancelled':
          acc.refunded = round2(acc.refunded + (Number(s.refunded_amount) || net));
          break;
      }
    }
    return acc;
  }

  // ---------------------------------------------------------------------------
  // Admin-facing
  // ---------------------------------------------------------------------------

  async listAll(opts: { status?: string; brandScope?: string; from?: string; to?: string } = {}) {
    const supabase = this.supabaseService.getServiceClient();
    let query = supabase.from('payment_splits').select('*');
    if (opts.status) query = query.eq('payout_status', opts.status);
    if (opts.brandScope) query = query.eq('brand_scope', opts.brandScope);
    if (opts.from) query = query.gte('created_at', opts.from);
    if (opts.to) query = query.lte('created_at', opts.to);
    const { data } = await query.order('created_at', { ascending: false }).limit(1000);
    return (data as SplitRow[]) || [];
  }

  async hold(splitId: string, adminId: string, reason: string) {
    const supabase = this.supabaseService.getServiceClient();
    const split = await this.getSplit(splitId);
    if (split.payout_status === 'approved') {
      throw new BadRequestException('Split already approved/released; cannot hold.');
    }
    const { data, error } = await supabase
      .from('payment_splits')
      .update({
        payout_status: 'on_hold',
        hold_reason: reason || 'manual_hold',
        updated_at: new Date().toISOString(),
      })
      .eq('id', splitId)
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    this.logger.log(`Split ${splitId} put on hold by ${adminId}: ${reason}`);
    return data;
  }

  /** Release a hold back to its prior eligible state (does not pay out by itself). */
  async release(splitId: string, adminId: string) {
    const supabase = this.supabaseService.getServiceClient();
    const split = await this.getSplit(splitId);
    if (split.payout_status !== 'on_hold') {
      throw new BadRequestException(`Split is '${split.payout_status}', not on hold.`);
    }
    const nextStatus =
      split.payout_eligible_at && new Date(split.payout_eligible_at).getTime() <= Date.now()
        ? 'approvable'
        : 'pending';
    const { data, error } = await supabase
      .from('payment_splits')
      .update({
        payout_status: nextStatus,
        hold_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', splitId)
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    this.logger.log(`Split ${splitId} released from hold by ${adminId} -> ${nextStatus}`);
    return data;
  }

  /**
   * Approve (release) a split's funds to the sub-merchant via Iyzico.
   * Calls Iyzico item-approve on the split's paymentTransactionId.
   */
  async approve(splitId: string, adminId: string) {
    const supabase = this.supabaseService.getServiceClient();
    const split = await this.getSplit(splitId);

    if (split.payout_status === 'approved') {
      return { ok: true, splitId, status: 'approved', alreadyApproved: true };
    }
    if (split.payout_status === 'on_hold') {
      throw new BadRequestException('Split is on hold; release it before approving.');
    }
    if (split.payout_status === 'refunded' || split.payout_status === 'cancelled') {
      throw new BadRequestException(`Split is '${split.payout_status}'; cannot approve.`);
    }
    // A 'pending' split has not reached its release window yet. Only allow an
    // approval once the eligibility date has passed (i.e. it is effectively
    // 'approvable' but the scheduler hasn't promoted it). This prevents
    // releasing funds before the payout window / refund window closes.
    if (split.payout_status === 'pending') {
      const eligibleAt = split.payout_eligible_at
        ? new Date(split.payout_eligible_at).getTime()
        : Infinity;
      if (eligibleAt > Date.now()) {
        throw new BadRequestException(
          'Split is not yet eligible for release (payout window has not elapsed).',
        );
      }
    }
    if (!split.provider_payment_tx_id) {
      throw new BadRequestException('Split has no provider_payment_tx_id; cannot approve in Iyzico.');
    }

    const conv = await this.convIdForTransaction(split.transaction_id);
    const result = await this.iyzico.approveItem({
      locale: this.iyzico.LOCALE.TR,
      conversationId: `${conv}-approve-${split.id}`,
      paymentTransactionId: split.provider_payment_tx_id,
    });

    if (result.status !== 'success') {
      this.logger.warn(
        `Iyzico approve failed for split ${splitId}: ${result.errorMessage || result.errorCode}`,
      );
      throw new InternalServerErrorException(
        result.errorMessage || 'Iyzico item approval failed.',
      );
    }

    const { data } = await supabase
      .from('payment_splits')
      .update({
        payout_status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', splitId)
      .select('*')
      .single();

    this.logger.log(`Split ${splitId} approved/released by ${adminId}`);
    return { ok: true, splitId, status: 'approved', split: data };
  }

  // ---------------------------------------------------------------------------
  // Auto-release (used by scheduler + admin "run now")
  // ---------------------------------------------------------------------------

  /**
   * 1) Promote eligible 'pending' splits to 'approvable' once their window passes.
   * 2) Auto-approve 'approvable' splits whose order is delivered/completed and
   *    that carry no pending refund.
   * Returns counts for observability.
   */
  async runAutoRelease(): Promise<{ promoted: number; approved: number; skipped: number }> {
    const supabase = this.supabaseService.getServiceClient();
    const nowIso = new Date().toISOString();
    let promoted = 0;
    let approved = 0;
    let skipped = 0;

    // Step 1: promote pending -> approvable in a single bulk update (no N+1).
    const { data: promotedRows, error: promoteErr } = await supabase
      .from('payment_splits')
      .update({ payout_status: 'approvable', updated_at: nowIso })
      .eq('payout_status', 'pending')
      .lte('payout_eligible_at', nowIso)
      .select('id');
    if (promoteErr) {
      this.logger.warn(`Promote step failed: ${promoteErr.message}`);
    }
    promoted = (promotedRows as { id: string }[] | null)?.length || 0;

    // Step 2: auto-approve approvable splits (respect auto_release_enabled)
    if (!(await this.autoReleaseEnabled())) {
      return { promoted, approved, skipped };
    }

    const { data: approvable } = await supabase
      .from('payment_splits')
      .select('*')
      .eq('payout_status', 'approvable')
      .lte('payout_eligible_at', nowIso)
      .limit(200);

    for (const split of (approvable as SplitRow[]) || []) {
      const orderOk = await this.orderEligibleForRelease(split);
      if (!orderOk) {
        skipped++;
        continue;
      }
      try {
        await this.approve(split.id, 'system:auto-release');
        approved++;
      } catch (e) {
        this.logger.warn(`Auto-release skipped split ${split.id}: ${(e as Error).message}`);
        skipped++;
      }
    }

    this.logger.log(`Auto-release run: promoted=${promoted} approved=${approved} skipped=${skipped}`);
    return { promoted, approved, skipped };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getSplit(id: string): Promise<SplitRow> {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase.from('payment_splits').select('*').eq('id', id).maybeSingle();
    if (!data) throw new NotFoundException(`Payment split ${id} not found.`);
    return data as SplitRow;
  }

  private async convIdForTransaction(transactionId: string): Promise<string> {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('payment_transactions')
      .select('provider_conv_id')
      .eq('id', transactionId)
      .maybeSingle();
    return (data as { provider_conv_id: string } | null)?.provider_conv_id || `gp-${transactionId}`;
  }

  private async autoReleaseEnabled(): Promise<boolean> {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('payout_settings')
      .select('scope, auto_release_enabled')
      .eq('scope', 'global')
      .maybeSingle();
    const row = data as { auto_release_enabled: boolean } | null;
    return row ? !!row.auto_release_enabled : true;
  }

  /** Order must be delivered/completed and have no open refund to release funds. */
  private async orderEligibleForRelease(split: SplitRow): Promise<boolean> {
    if (!split.order_id) return true; // swap differentials, etc.
    const supabase = this.supabaseService.getServiceClient();

    const { data: openRefunds } = await supabase
      .from('refund_requests')
      .select('id')
      .eq('order_id', split.order_id)
      .in('status', ['open', 'processing'])
      .limit(1);
    if ((openRefunds as unknown[])?.length) return false;

    const table = this.tableForBrandScope(split.brand_scope);
    if (!table) return true;
    const { data } = await supabase
      .from(table)
      .select('status')
      .eq('id', split.order_id)
      .maybeSingle();
    const status = (data as { status?: string } | null)?.status;
    if (!status) return true;
    return ['delivered', 'completed'].includes(status);
  }

  private tableForBrandScope(brandScope: string): string | null {
    switch (brandScope) {
      case 'wholesale_brand':
        return 'wholesale_orders';
      case 'retail_brand':
        return 'retail_orders';
      case 'social_user':
        return 'social_sales_orders';
      default:
        return null;
    }
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
