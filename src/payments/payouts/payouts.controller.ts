import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { AdminOnly } from '../../admin/decorators/admin-only.decorator';

@Controller('payments/payouts')
export class PayoutsController {
  constructor(
    private readonly service: PayoutsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async authenticatedUser(authHeader?: string): Promise<{ id: string }> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required.');
    const { data, error } = await this.supabaseService.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid token.');
    return { id: data.user.id };
  }

  // -- Seller-facing ----------------------------------------------------------

  /** Seller's payout splits + summary. */
  @Get('me')
  async mine(
    @Headers('authorization') authHeader: string,
    @Query('brandId') brandId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.listForSeller(user.id, { brandId, status, from, to });
  }

  /** Seller's balance summary only (pending / approvable / approved / on-hold). */
  @Get('me/balance')
  async myBalance(
    @Headers('authorization') authHeader: string,
    @Query('brandId') brandId?: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.balanceForSeller(user.id, brandId);
  }

  // -- Admin ------------------------------------------------------------------

  @Get('admin')
  @AdminOnly()
  async all(
    @Query('status') status?: string,
    @Query('brandScope') brandScope?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listAll({ status, brandScope, from, to });
  }

  @Post('admin/:splitId/hold')
  @AdminOnly()
  async hold(
    @Param('splitId') splitId: string,
    @Body() body: { reason?: string },
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.hold(splitId, user.id, body?.reason || 'manual_hold');
  }

  @Post('admin/:splitId/release')
  @AdminOnly()
  async release(
    @Param('splitId') splitId: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.release(splitId, user.id);
  }

  @Post('admin/:splitId/approve')
  @AdminOnly()
  async approve(
    @Param('splitId') splitId: string,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.approve(splitId, user.id);
  }

  /** Manually trigger the auto-release sweep (also runs on a timer). */
  @Post('admin/run-auto-release')
  @AdminOnly()
  async runAutoRelease() {
    return this.service.runAutoRelease();
  }
}
