import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateSwapListingDto } from './dto/create-swap-listing.dto';
import { CreateSwapProposalDto } from './dto/create-swap-proposal.dto';
import { RaiseSwapDisputeDto } from './dto/raise-swap-dispute.dto';
import { UpdateSwapShippingDto } from './dto/update-swap-shipping.dto';

@Injectable()
export class SwapService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getListings(limit = 30) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data, error } = await serviceClient
      .from('social_swap_listings')
      .select('*, social_products(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));

    if (error) {
      throw new BadRequestException(`Failed to fetch swap listings: ${error.message}`);
    }

    return data || [];
  }

  async getListingById(listingId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: listing, error } = await serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (error || !listing) {
      throw new NotFoundException('Swap listing not found');
    }

    const [proposals, timeline] = await Promise.all([
      serviceClient
        .from('social_swap_proposals')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false }),
      serviceClient
        .from('social_swap_timeline')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false }),
    ]);

    return {
      listing,
      proposals: proposals.data || [],
      timeline: timeline.data || [],
    };
  }

  async createListing(userId: string, dto: CreateSwapListingDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: product, error: productError } = await serviceClient
      .from('social_products')
      .select('id, user_id, price, title')
      .eq('id', dto.offeredProductId)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Offered product not found');
    }
    if (product.user_id !== userId) {
      throw new ForbiddenException('You can only swap your own products');
    }

    const { data: listing, error } = await serviceClient
      .from('social_swap_listings')
      .insert({
        owner_id: userId,
        offered_product_id: dto.offeredProductId,
        description: dto.description || null,
        wanted_category: dto.wantedCategory,
        wanted_description: dto.wantedDescription || null,
        wanted_alternatives: dto.wantedAlternatives || [],
        wanted_min_value: dto.wantedMinValue || 0,
        wanted_max_value: dto.wantedMaxValue || 0,
        offered_value: product.price || 0,
        cash_top_up_allowed: dto.cashTopUpAllowed ?? true,
        status: 'open',
      })
      .select('*')
      .single();

    if (error || !listing) {
      throw new BadRequestException(`Failed to create swap listing: ${error?.message || 'Unknown error'}`);
    }

    await this.addTimeline(listing.id, 'listing_created', userId, 'Swap listing created');

    return listing;
  }

  async createProposal(userId: string, listingId: string, dto: CreateSwapProposalDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: listing } = await serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (!listing) {
      throw new NotFoundException('Swap listing not found');
    }
    if (listing.owner_id === userId) {
      throw new BadRequestException('You cannot propose on your own listing');
    }
    if (listing.status !== 'open') {
      throw new BadRequestException('Listing is no longer open');
    }

    const { data: offeredProduct } = await serviceClient
      .from('social_products')
      .select('id, user_id, price')
      .eq('id', dto.offeredProductId)
      .single();

    if (!offeredProduct) {
      throw new NotFoundException('Offered product not found');
    }
    if (offeredProduct.user_id !== userId) {
      throw new ForbiddenException('You can only offer your own product');
    }

    const { data: proposal, error } = await serviceClient
      .from('social_swap_proposals')
      .insert({
        listing_id: listingId,
        proposer_id: userId,
        offered_product_id: dto.offeredProductId,
        offered_value: offeredProduct.price || 0,
        cash_top_up: dto.cashTopUp || 0,
        message: dto.message || null,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error || !proposal) {
      throw new BadRequestException(`Failed to create proposal: ${error?.message || 'Unknown error'}`);
    }

    await this.addTimeline(listingId, 'proposal_created', userId, 'Proposal submitted');
    await this.createNotification(
      listing.owner_id,
      'swap_proposal_received',
      'New swap proposal',
      `You received a new proposal on listing ${listingId}.`,
      { listingId, proposalId: proposal.id },
    );

    return proposal;
  }

  async acceptProposal(userId: string, proposalId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: proposal } = await serviceClient
      .from('social_swap_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const { data: listing } = await serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', proposal.listing_id)
      .single();

    if (!listing) {
      throw new NotFoundException('Swap listing not found');
    }
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('Only the listing owner can accept this proposal');
    }
    if (proposal.status !== 'pending') {
      throw new BadRequestException('Proposal is not pending');
    }

    await serviceClient.from('social_swap_proposals').update({ status: 'accepted' }).eq('id', proposalId);
    await serviceClient
      .from('social_swap_proposals')
      .update({ status: 'rejected' })
      .eq('listing_id', proposal.listing_id)
      .neq('id', proposalId)
      .eq('status', 'pending');

    await serviceClient
      .from('social_swap_listings')
      .update({ status: 'accepted', accepted_proposal_id: proposalId })
      .eq('id', proposal.listing_id);

    const { data: transaction } = await serviceClient
      .from('social_swap_transactions')
      .insert({
        listing_id: proposal.listing_id,
        proposal_id: proposal.id,
        owner_id: listing.owner_id,
        proposer_id: proposal.proposer_id,
        status: 'accepted',
      })
      .select('*')
      .single();

    await this.addTimeline(proposal.listing_id, 'proposal_accepted', userId, 'Proposal accepted');
    await this.createNotification(
      proposal.proposer_id,
      'swap_proposal_accepted',
      'Proposal accepted',
      'Your swap proposal has been accepted.',
      { listingId: proposal.listing_id, proposalId, transactionId: transaction?.id },
    );

    return transaction;
  }

  async rejectProposal(userId: string, proposalId: string, reason?: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: proposal } = await serviceClient
      .from('social_swap_proposals')
      .select('*')
      .eq('id', proposalId)
      .single();
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const { data: listing } = await serviceClient
      .from('social_swap_listings')
      .select('*')
      .eq('id', proposal.listing_id)
      .single();
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('Only owner can reject proposals');
    }

    await serviceClient
      .from('social_swap_proposals')
      .update({ status: 'rejected', rejection_reason: reason || null })
      .eq('id', proposalId);

    await this.addTimeline(listing.id, 'proposal_rejected', userId, 'Proposal rejected');
    await this.createNotification(
      proposal.proposer_id,
      'swap_proposal_rejected',
      'Proposal rejected',
      reason || 'Your swap proposal was rejected.',
      { listingId: listing.id, proposalId },
    );

    return { success: true };
  }

  async updateShipping(userId: string, transactionId: string, dto: UpdateSwapShippingDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: transaction } = await serviceClient
      .from('social_swap_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (!transaction) {
      throw new NotFoundException('Swap transaction not found');
    }
    if (transaction.owner_id !== userId && transaction.proposer_id !== userId) {
      throw new ForbiddenException('Not a participant of this swap');
    }

    const sideUserId = dto.side === 'owner' ? transaction.owner_id : transaction.proposer_id;
    if (sideUserId !== userId) {
      throw new ForbiddenException(`Only ${dto.side} can update ${dto.side} shipping`);
    }

    const { data: existingShipment } = await serviceClient
      .from('social_swap_shipments')
      .select('*')
      .eq('transaction_id', transactionId)
      .eq('side', dto.side)
      .single();

    if (existingShipment) {
      await serviceClient
        .from('social_swap_shipments')
        .update({
          status: dto.status,
          tracking_number: dto.trackingNumber || existingShipment.tracking_number,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingShipment.id);
    } else {
      await serviceClient.from('social_swap_shipments').insert({
        transaction_id: transactionId,
        side: dto.side,
        status: dto.status,
        tracking_number: dto.trackingNumber || null,
      });
    }

    const { data: shipments } = await serviceClient
      .from('social_swap_shipments')
      .select('side, status')
      .eq('transaction_id', transactionId);

    const ownerStatus = shipments?.find((s) => s.side === 'owner')?.status || 'pending';
    const proposerStatus = shipments?.find((s) => s.side === 'proposer')?.status || 'pending';

    let nextStatus = transaction.status;
    if (ownerStatus === 'delivered' && proposerStatus === 'delivered') {
      nextStatus = 'delivered';
    } else if (
      ['shipped', 'delivered'].includes(ownerStatus) ||
      ['shipped', 'delivered'].includes(proposerStatus)
    ) {
      nextStatus = 'in_transit';
    }

    await serviceClient
      .from('social_swap_transactions')
      .update({
        status: nextStatus,
        delivered_at: nextStatus === 'delivered' ? new Date().toISOString() : transaction.delivered_at,
      })
      .eq('id', transactionId);

    await this.addTimeline(transaction.listing_id, 'shipping_updated', userId, `${dto.side} marked ${dto.status}`);
    return { success: true, status: nextStatus };
  }

  async completeTransaction(userId: string, transactionId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: transaction } = await serviceClient
      .from('social_swap_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (!transaction) {
      throw new NotFoundException('Swap transaction not found');
    }
    if (transaction.owner_id !== userId && transaction.proposer_id !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    if (transaction.status !== 'delivered') {
      throw new BadRequestException('Both deliveries must be confirmed before completion');
    }

    const completedAt = new Date().toISOString();
    const inspectionEndsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await serviceClient
      .from('social_swap_transactions')
      .update({
        status: 'completed',
        completed_at: completedAt,
        inspection_ends_at: inspectionEndsAt,
      })
      .eq('id', transactionId);

    await this.addTimeline(transaction.listing_id, 'swap_completed', userId, 'Swap completed');
    return { success: true, completedAt, inspectionEndsAt };
  }

  async raiseDispute(userId: string, transactionId: string, dto: RaiseSwapDisputeDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: transaction } = await serviceClient
      .from('social_swap_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (!transaction) {
      throw new NotFoundException('Swap transaction not found');
    }
    if (transaction.owner_id !== userId && transaction.proposer_id !== userId) {
      throw new ForbiddenException('Not a participant');
    }
    if (!transaction.completed_at) {
      throw new BadRequestException('Swap must be completed before opening dispute');
    }
    if (transaction.inspection_ends_at && new Date(transaction.inspection_ends_at).getTime() < Date.now()) {
      throw new BadRequestException('Inspection window ended');
    }

    const { data: dispute, error } = await serviceClient
      .from('social_swap_disputes')
      .insert({
        transaction_id: transactionId,
        raised_by: userId,
        reason: dto.reason,
        details: dto.details,
        status: 'open',
      })
      .select('*')
      .single();

    if (error || !dispute) {
      throw new BadRequestException(`Failed to create dispute: ${error?.message || 'Unknown error'}`);
    }

    await this.addTimeline(transaction.listing_id, 'dispute_opened', userId, dto.reason);
    return dispute;
  }

  private async addTimeline(listingId: string, eventType: string, actorId: string | null, description: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    await serviceClient.from('social_swap_timeline').insert({
      listing_id: listingId,
      event_type: eventType,
      actor_id: actorId,
      description,
    });
  }

  private async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    metadata: Record<string, unknown>,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();
    await serviceClient.from('social_notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      metadata,
      is_read: false,
    });
  }
}

