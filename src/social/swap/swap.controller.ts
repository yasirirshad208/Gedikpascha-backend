import { Body, Controller, Get, Headers, Param, Patch, Post, Query, ValidationPipe } from '@nestjs/common';
import { SocialAuthService } from '../common/social-auth.service';
import { SwapService } from './swap.service';
import { CreateSwapListingDto } from './dto/create-swap-listing.dto';
import { CreateSwapProposalDto } from './dto/create-swap-proposal.dto';
import { UpdateSwapShippingDto } from './dto/update-swap-shipping.dto';
import { RaiseSwapDisputeDto } from './dto/raise-swap-dispute.dto';

@Controller('social/exchange')
export class SwapController {
  constructor(
    private readonly swapService: SwapService,
    private readonly socialAuthService: SocialAuthService,
  ) {}

  @Get()
  async getListings(@Query('limit') limit?: string) {
    return this.swapService.getListings(limit ? Number(limit) : 30);
  }

  @Get(':listingId')
  async getListing(@Param('listingId') listingId: string) {
    return this.swapService.getListingById(listingId);
  }

  @Post('listings')
  async createListing(
    @Body(new ValidationPipe({ transform: true })) dto: CreateSwapListingDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.createListing(user.id, dto);
  }

  @Post(':listingId/proposals')
  async createProposal(
    @Param('listingId') listingId: string,
    @Body(new ValidationPipe({ transform: true })) dto: CreateSwapProposalDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.createProposal(user.id, listingId, dto);
  }

  @Patch('proposals/:proposalId/accept')
  async acceptProposal(@Param('proposalId') proposalId: string, @Headers('authorization') authHeader?: string) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.acceptProposal(user.id, proposalId);
  }

  @Patch('proposals/:proposalId/reject')
  async rejectProposal(
    @Param('proposalId') proposalId: string,
    @Body('reason') reason: string | undefined,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.rejectProposal(user.id, proposalId, reason);
  }

  @Patch('transactions/:transactionId/ship')
  async updateShipping(
    @Param('transactionId') transactionId: string,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateSwapShippingDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.updateShipping(user.id, transactionId, dto);
  }

  @Patch('transactions/:transactionId/complete')
  async complete(
    @Param('transactionId') transactionId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.completeTransaction(user.id, transactionId);
  }

  @Post('transactions/:transactionId/dispute')
  async dispute(
    @Param('transactionId') transactionId: string,
    @Body(new ValidationPipe({ transform: true })) dto: RaiseSwapDisputeDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const user = await this.socialAuthService.getRequiredUser(authHeader);
    return this.swapService.raiseDispute(user.id, transactionId, dto);
  }
}

