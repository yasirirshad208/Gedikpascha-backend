import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class ProfilesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getProfile(username: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: profile, error } = await serviceClient
      .from('social_profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profile not found');
    }

    return this.getProfilePayload(profile.user_id);
  }

  async getProfileByUserId(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: profile, error } = await serviceClient
      .from('social_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profile not found');
    }

    return this.getProfilePayload(userId);
  }

  private async getProfilePayload(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: profile } = await serviceClient
      .from('social_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    const [productsResult, reelsResult] = await Promise.all([
      serviceClient
        .from('social_products')
        .select('*')
        .eq('user_id', userId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(12),
      serviceClient
        .from('social_reels')
        .select('*')
        .eq('user_id', userId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    return {
      profile,
      products: productsResult.data || [],
      reels: reelsResult.data || [],
    };
  }
}
