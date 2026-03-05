import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SocialAuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getOptionalUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) {
      return null;
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user) {
      return null;
    }

    return userData.user;
  }

  async getRequiredUser(authHeader?: string) {
    const token = this.extractToken(authHeader);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return userData.user;
  }

  private extractToken(authHeader?: string) {
    if (!authHeader) {
      return null;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}

