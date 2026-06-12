import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { AdminOnly } from '../../admin/decorators/admin-only.decorator';
import {
  CancelTransactionDto,
  CreateRefundRequestDto,
  DecideRefundRequestDto,
  RefundTransactionDto,
  UploadDisputeEvidenceDto,
} from '../dto/refund.dto';

@Controller('payments/refunds')
export class RefundsController {
  constructor(
    private readonly service: RefundsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async authenticatedUser(authHeader?: string): Promise<{ id: string }> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required.');
    const { data, error } = await this.supabaseService.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid token.');
    return { id: data.user.id };
  }

  // -- Buyer-facing -----------------------------------------------------------

  /** Buyer opens a refund / 14-day withdrawal request. */
  @Post('requests')
  async createRequest(
    @Body() dto: CreateRefundRequestDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.createRequest(user.id, dto);
  }

  /** Buyer lists their own refund requests. */
  @Get('requests/me')
  async myRequests(@Headers('authorization') authHeader: string) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.listRequestsForUser(user.id);
  }

  /** Seller submits chargeback dispute documents. */
  @Post('evidence')
  async uploadEvidence(
    @Body() dto: UploadDisputeEvidenceDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.uploadEvidence(user.id, dto);
  }

  // -- Admin ------------------------------------------------------------------

  @Get('admin/requests')
  @AdminOnly()
  async openRequests() {
    return this.service.listOpenRequests();
  }

  /** Seller/admin approves or rejects a refund request (approval triggers Iyzico). */
  @Post('admin/requests/:id/decide')
  @AdminOnly()
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideRefundRequestDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.decideRequest(id, user.id, dto);
  }

  /** Direct refund of a settled transaction (full or selected splits). */
  @Post('admin/transactions/:id/refund')
  @AdminOnly()
  async refund(@Param('id') id: string, @Body() dto: RefundTransactionDto) {
    return this.service.refundTransaction(id, dto);
  }

  /** Cancel (void) a pre-settlement payment. */
  @Post('admin/transactions/:id/cancel')
  @AdminOnly()
  async cancel(@Param('id') id: string, @Body() dto: CancelTransactionDto) {
    return this.service.cancelTransaction(id, dto);
  }

  @Get('admin/transactions/:id/evidence')
  @AdminOnly()
  async evidence(@Param('id') id: string) {
    return this.service.listEvidence(id);
  }
}
