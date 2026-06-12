import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import { IyzicoService } from '../iyzico/iyzico.service';
import { IyzicoConfig } from '../iyzico/iyzico.config';
import {
  CancelTransactionDto,
  CreateRefundRequestDto,
  DecideRefundRequestDto,
  RefundReason,
  RefundTransactionDto,
  UploadDisputeEvidenceDto,
} from '../dto/refund.dto';

type IyzicoRefundReason = 'double_payment' | 'buyer_request' | 'fraud' | 'other';

interface PaymentTransactionRow {
  id: string;
  order_id: string | null;
  order_scope: string;
  user_id: string | null;
  provider_payment_id: string | null;
  provider_conv_id: string;
  status: string;
  amount: number;
  paid_price: number | null;
  currency: string;
  buyer_ip: string | null;
  refunded_amount: number;
}

interface PaymentSplitRow {
  id: string;
  transaction_id: string;
  order_id: string | null;
  order_item_id: string | null;
  net_amount: number;
  psp_fee_amount: number;
  gross_amount: number;
  refunded_amount: number;
  payout_status: string;
  provider_payment_tx_id: string | null;
}

/**
 * Phase 6 — Refunds, cancellations, 14-day withdrawals, chargeback evidence.
 *
 * Flows:
 *  - cancelTransaction  : before settlement; voids the whole payment (Iyzico cancel API).
 *  - refundTransaction  : after settlement; per-item refund (Iyzico refund API).
 *  - createRequest      : buyer opens a refund/withdrawal request (no money moves yet).
 *  - decideRequest      : seller/admin approves -> triggers the actual Iyzico refund.
 *  - uploadEvidence     : seller submits chargeback dispute documents.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly iyzico: IyzicoService,
    private readonly config: IyzicoConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Admin / system: direct cancel
  // ---------------------------------------------------------------------------

  /**
   * Cancel an entire payment before settlement (full void, refund to buyer).
   * Only valid while Iyzico still allows cancel (typically same-day, pre-settlement).
   */
  async cancelTransaction(transactionId: string, dto: CancelTransactionDto) {
    const supabase = this.supabaseService.getServiceClient();
    const tx = await this.getTransaction(transactionId);

    if (tx.status !== 'success') {
      throw new BadRequestException(
        `Transaction ${transactionId} is '${tx.status}', only successful payments can be cancelled.`,
      );
    }
    if (!tx.provider_payment_id) {
      throw new BadRequestException('Transaction has no Iyzico paymentId; cannot cancel.');
    }

    const result = await this.iyzico.cancelPayment({
      locale: this.iyzico.LOCALE.TR,
      conversationId: `${tx.provider_conv_id}-cancel`,
      paymentId: tx.provider_payment_id,
      ip: tx.buyer_ip || '127.0.0.1',
      reason: dto.reason,
      description: dto.description,
    });

    if (result.status !== 'success') {
      this.logger.warn(
        `Iyzico cancel failed for tx ${transactionId}: ${result.errorMessage || result.errorCode}`,
      );
      throw new InternalServerErrorException(
        result.errorMessage || 'Iyzico cancellation failed.',
      );
    }

    await supabase
      .from('payment_transactions')
      .update({
        status: 'cancelled',
        refunded_amount: tx.paid_price ?? tx.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    await supabase
      .from('payment_splits')
      .update({ payout_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId);

    await this.markOrderRefunded(tx, tx.paid_price ?? tx.amount, 'cancelled');

    return { ok: true, transactionId, status: 'cancelled' };
  }

  // ---------------------------------------------------------------------------
  // Admin / system: refund (after settlement)
  // ---------------------------------------------------------------------------

  /**
   * Refund a transaction after settlement. Iyzico refunds happen per
   * paymentTransactionId (i.e. per split). PSP fee is passed through to the
   * seller (deducted from their balance) per client policy.
   */
  async refundTransaction(transactionId: string, dto: RefundTransactionDto) {
    const supabase = this.supabaseService.getServiceClient();
    const tx = await this.getTransaction(transactionId);

    if (tx.status !== 'success' && tx.status !== 'refunded') {
      throw new BadRequestException(
        `Transaction ${transactionId} is '${tx.status}'; cannot refund.`,
      );
    }

    const { data: splitsRaw } = await supabase
      .from('payment_splits')
      .select(
        'id, transaction_id, order_id, order_item_id, net_amount, psp_fee_amount, gross_amount, refunded_amount, payout_status, provider_payment_tx_id',
      )
      .eq('transaction_id', transactionId);
    const allSplits = (splitsRaw as PaymentSplitRow[]) || [];

    const targetSplits = dto.splitIds?.length
      ? allSplits.filter((s) => dto.splitIds!.includes(s.id))
      : allSplits;

    if (targetSplits.length === 0) {
      // No split rows (e.g. main-merchant single payment). Refund against the
      // payment transaction directly using the provider_payment_id path.
      return this.refundWholeWithoutSplits(tx, dto);
    }

    const reason = this.mapReason(dto.reason);
    const results: Array<{ splitId: string; refunded: number; ok: boolean; error?: string }> = [];
    let totalRefunded = 0;

    // When a specific amount is requested (e.g. a partial refund / withdrawal for
    // one item), cap the total refunded across splits at that amount. When no
    // amount is given, refund each target split in full.
    let remainingBudget = dto.amount != null ? round2(dto.amount) : Infinity;

    for (const split of targetSplits) {
      if (remainingBudget <= 0) break;
      if (split.payout_status === 'refunded') {
        results.push({ splitId: split.id, refunded: 0, ok: true });
        continue;
      }
      if (!split.provider_payment_tx_id) {
        results.push({
          splitId: split.id,
          refunded: 0,
          ok: false,
          error: 'missing provider_payment_tx_id',
        });
        continue;
      }

      // Refund the remaining gross for this item, capped by the requested budget.
      const splitRefundable = round2(split.gross_amount - (split.refunded_amount || 0));
      const refundAmount = round2(Math.min(splitRefundable, remainingBudget));
      if (refundAmount <= 0) {
        results.push({ splitId: split.id, refunded: 0, ok: true });
        continue;
      }

      const result = await this.iyzico.refundItem({
        locale: this.iyzico.LOCALE.TR,
        conversationId: `${tx.provider_conv_id}-refund-${split.id}`,
        paymentTransactionId: split.provider_payment_tx_id,
        price: refundAmount.toFixed(2),
        ip: tx.buyer_ip || '127.0.0.1',
        currency: tx.currency as 'TRY',
        reason,
        description: dto.description,
      });

      if (result.status !== 'success') {
        this.logger.warn(
          `Iyzico refund failed for split ${split.id}: ${result.errorMessage || result.errorCode}`,
        );
        results.push({
          splitId: split.id,
          refunded: 0,
          ok: false,
          error: result.errorMessage || result.errorCode || 'refund failed',
        });
        continue;
      }

      const newSplitRefunded = round2((split.refunded_amount || 0) + refundAmount);
      const splitFullyRefunded = newSplitRefunded >= split.gross_amount - 0.01;
      const splitUpdate: Record<string, unknown> = {
        // Only flip to 'refunded' when the whole item has been refunded; a
        // partial refund leaves the split releasable for the remainder.
        payout_status: splitFullyRefunded ? 'refunded' : split.payout_status,
        refunded_amount: newSplitRefunded,
        updated_at: new Date().toISOString(),
      };
      if (splitFullyRefunded) splitUpdate.hold_reason = null;
      await supabase.from('payment_splits').update(splitUpdate).eq('id', split.id);

      totalRefunded = round2(totalRefunded + refundAmount);
      remainingBudget = round2(remainingBudget - refundAmount);
      results.push({ splitId: split.id, refunded: refundAmount, ok: true });
    }

    const newRefundedTotal = round2((tx.refunded_amount || 0) + totalRefunded);
    const fullyRefunded = newRefundedTotal >= (tx.paid_price ?? tx.amount) - 0.01;

    await supabase
      .from('payment_transactions')
      .update({
        refunded_amount: newRefundedTotal,
        status: fullyRefunded ? 'refunded' : tx.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    if (totalRefunded > 0) {
      await this.markOrderRefunded(tx, newRefundedTotal, fullyRefunded ? 'refunded' : 'partial_refund');
    }

    return {
      ok: results.every((r) => r.ok),
      transactionId,
      totalRefunded,
      fullyRefunded,
      splits: results,
    };
  }

  private async refundWholeWithoutSplits(
    tx: PaymentTransactionRow,
    dto: RefundTransactionDto,
  ): Promise<never> {
    // For single main-merchant payments we still need a paymentTransactionId.
    // Iyzico exposes it on the retrieve result's itemTransactions; if we never
    // stored splits, fall back to cancel for full amounts.
    const amount = dto.amount ?? (tx.paid_price ?? tx.amount) - (tx.refunded_amount || 0);
    throw new BadRequestException(
      `No payment_splits found for transaction ${tx.id}. Refund amount ${amount} cannot be routed; ` +
        'use cancelTransaction for full voids, or ensure splits were persisted at checkout.',
    );
  }

  // ---------------------------------------------------------------------------
  // Buyer-initiated requests (14-day withdrawal etc.)
  // ---------------------------------------------------------------------------

  async createRequest(buyerId: string, dto: CreateRefundRequestDto) {
    const supabase = this.supabaseService.getServiceClient();

    // Locate the transaction for this order to attach the request.
    const { data: txRow } = await supabase
      .from('payment_transactions')
      .select('id, order_scope, status')
      .eq('order_id', dto.orderId)
      .eq('order_scope', dto.orderScope)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!txRow) {
      throw new NotFoundException('No payment found for this order.');
    }

    // Enforce 14-day withdrawal window for B2C retail.
    if (dto.requestType === 'withdrawal') {
      if (dto.orderScope !== 'retail') {
        throw new BadRequestException(
          'The 14-day withdrawal right applies to retail (B2C) orders only.',
        );
      }
      const eligible = await this.isWithinWithdrawalWindow(dto.orderScope, dto.orderId);
      if (!eligible) {
        throw new BadRequestException(
          'The 14-day withdrawal window has closed or the item is not yet delivered.',
        );
      }
    }

    const { data, error } = await supabase
      .from('refund_requests')
      .insert({
        order_id: dto.orderId,
        order_scope: dto.orderScope,
        transaction_id: (txRow as { id: string }).id,
        requested_by: buyerId,
        reason: dto.reason,
        description: dto.description,
        request_type: dto.requestType,
        requested_amount: dto.requestedAmount,
        status: 'open',
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(`Failed to create refund request: ${error.message}`);
    }
    return data;
  }

  async listRequestsForUser(userId: string) {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('requested_by', userId)
      .order('created_at', { ascending: false });
    return data || [];
  }

  async listOpenRequests() {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('refund_requests')
      .select('*')
      .in('status', ['open', 'processing'])
      .order('created_at', { ascending: true });
    return data || [];
  }

  /**
   * Seller/admin decides on a request. Approval triggers the real Iyzico refund.
   */
  async decideRequest(requestId: string, deciderId: string, dto: DecideRefundRequestDto) {
    const supabase = this.supabaseService.getServiceClient();
    const { data: reqRow } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (!reqRow) throw new NotFoundException('Refund request not found.');
    const req = reqRow as {
      id: string;
      status: string;
      transaction_id: string | null;
      requested_amount: number;
      reason: RefundReason;
      description: string | null;
    };

    if (req.status !== 'open' && req.status !== 'processing') {
      throw new BadRequestException(`Request is already '${req.status}'.`);
    }

    if (dto.decision === 'rejected') {
      const { data } = await supabase
        .from('refund_requests')
        .update({
          status: 'rejected',
          decided_by: deciderId,
          decided_at: new Date().toISOString(),
          decision_note: dto.note,
        })
        .eq('id', requestId)
        .select('*')
        .single();
      return data;
    }

    // Approved -> mark processing, run the refund, then complete.
    await supabase
      .from('refund_requests')
      .update({
        status: 'processing',
        decided_by: deciderId,
        decided_at: new Date().toISOString(),
        decision_note: dto.note,
      })
      .eq('id', requestId);

    if (!req.transaction_id) {
      throw new BadRequestException('Refund request has no linked transaction.');
    }

    const refundResult = await this.refundTransaction(req.transaction_id, {
      amount: req.requested_amount,
      reason: this.requestReasonToRefundReason(req.reason),
      description: dto.note || req.description || undefined,
    });

    const { data } = await supabase
      .from('refund_requests')
      .update({
        status: refundResult.ok ? 'completed' : 'processing',
        refunded_amount: refundResult.totalRefunded ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select('*')
      .single();

    return { request: data, refund: refundResult };
  }

  // ---------------------------------------------------------------------------
  // Chargeback dispute evidence
  // ---------------------------------------------------------------------------

  async uploadEvidence(uploaderId: string, dto: UploadDisputeEvidenceDto) {
    const supabase = this.supabaseService.getServiceClient();
    const rows = dto.evidence.map((e) => ({
      id: randomUUID(),
      transaction_id: dto.transactionId,
      order_id: dto.orderId || null,
      uploaded_by: uploaderId,
      evidence_type: e.evidenceType,
      file_url: e.fileUrl,
      file_name: e.fileName || null,
      notes: e.notes || null,
    }));

    const { data, error } = await supabase.from('dispute_evidence').insert(rows).select('*');
    if (error) {
      throw new InternalServerErrorException(`Failed to store evidence: ${error.message}`);
    }
    return data;
  }

  async listEvidence(transactionId: string) {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: true });
    return data || [];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getTransaction(id: string): Promise<PaymentTransactionRow> {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('payment_transactions')
      .select(
        'id, order_id, order_scope, user_id, provider_payment_id, provider_conv_id, status, amount, paid_price, currency, buyer_ip, refunded_amount',
      )
      .eq('id', id)
      .maybeSingle();
    if (!data) throw new NotFoundException(`Payment transaction ${id} not found.`);
    return data as PaymentTransactionRow;
  }

  private async markOrderRefunded(
    tx: PaymentTransactionRow,
    refundedAmount: number,
    paymentStatus: string,
  ): Promise<void> {
    if (!tx.order_id || tx.order_scope === 'swap') return;
    const table = this.ordersTableFor(tx.order_scope);
    const supabase = this.supabaseService.getServiceClient();
    await supabase
      .from(table)
      .update({
        refunded_amount: refundedAmount,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.order_id);
  }

  /**
   * The 14-day withdrawal window opens at delivery. `delivered_at` is the source
   * of truth (matches the buyer-facing UI); `refund_due_until` is used as a
   * fallback when present. The order must be delivered before a withdrawal is
   * eligible — an undelivered order cannot be withdrawn.
   */
  private async isWithinWithdrawalWindow(scope: string, orderId: string): Promise<boolean> {
    const supabase = this.supabaseService.getServiceClient();
    const table = this.ordersTableFor(scope);
    const { data } = await supabase
      .from(table)
      .select('refund_due_until, delivered_at')
      .eq('id', orderId)
      .maybeSingle();
    if (!data) return false;
    const row = data as { refund_due_until: string | null; delivered_at: string | null };

    if (row.delivered_at) {
      const due = new Date(row.delivered_at).getTime() + 14 * 24 * 60 * 60 * 1000;
      return Date.now() <= due;
    }
    if (row.refund_due_until) {
      return new Date(row.refund_due_until).getTime() >= Date.now();
    }
    // Not delivered yet → no withdrawal right has started.
    return false;
  }

  private ordersTableFor(scope: string): string {
    if (scope === 'wholesale') return 'wholesale_orders';
    if (scope === 'retail') return 'retail_orders';
    if (scope === 'social') return 'social_sales_orders';
    throw new BadRequestException(`No order table for scope ${scope}.`);
  }

  private mapReason(reason: RefundReason): IyzicoRefundReason {
    switch (reason) {
      case 'double_payment':
        return 'double_payment';
      case 'fraud':
        return 'fraud';
      case 'buyer_request':
      case 'damaged':
      case 'wrong_item':
      case 'not_delivered':
        return 'buyer_request';
      default:
        return 'other';
    }
  }

  private requestReasonToRefundReason(
    reason: RefundReason,
  ): RefundReason {
    return reason;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
