import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SubMerchantsService } from './sub-merchants.service';
import { OnboardSubMerchantDto } from '../dto/sub-merchant.dto';
import type { SubMerchantBrandScope } from '../dto/sub-merchant.dto';
import { SupabaseService } from '../../supabase/supabase.service';
import { AdminOnly } from '../../admin/decorators/admin-only.decorator';

@Controller('payments/sub-merchants')
export class SubMerchantsController {
  constructor(
    private readonly service: SubMerchantsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private async authenticatedUser(authHeader?: string): Promise<{ id: string }> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Authentication required.');
    const { data, error } = await this.supabaseService.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid token.');
    return { id: data.user.id };
  }

  /** Seller saves or updates their payout details (always a draft until approval). */
  @Post('me')
  async upsertMine(
    @Body() dto: OnboardSubMerchantDto,
    @Headers('authorization') authHeader: string,
  ) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.upsertDraft(user.id, dto);
  }

  /** Seller submits their draft to Iyzico (or retries after a failed submission). */
  @Post('me/submit')
  async submitMine(@Headers('authorization') authHeader: string) {
    const user = await this.authenticatedUser(authHeader);
    const mine = await this.service.getMine(user.id);
    if (mine.length === 0) {
      throw new BadRequestException('No sub-merchant configured. POST /payments/sub-merchants/me first.');
    }
    return this.service.submit(mine[0].id);
  }

  /** Seller reads their own sub-merchant record(s). */
  @Get('me')
  async myStatus(@Headers('authorization') authHeader: string) {
    const user = await this.authenticatedUser(authHeader);
    return this.service.getMine(user.id);
  }

  /** Admin retries a failed Iyzico submission for any sub-merchant. */
  @Post('admin/:id/submit')
  @AdminOnly()
  async adminSubmit(@Param('id') id: string) {
    return this.service.submit(id);
  }

  /**
   * Admin looks up a sub-merchant by brand. Returns null if the seller hasn't
   * submitted payout details yet. Used by the admin brands dashboard badge.
   */
  @Get('admin/by-brand/:brandScope/:brandId')
  @AdminOnly()
  async adminByBrand(
    @Param('brandScope') brandScope: SubMerchantBrandScope,
    @Param('brandId') brandId: string,
  ) {
    const record = await this.service.findByBrand(brandScope, brandId);
    return record ?? null;
  }

  @Get('admin/:id')
  @AdminOnly()
  async adminGet(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
