import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';
import { IS_ADMIN_KEY } from '../decorators/admin-only.decorator';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabaseService: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdminOnlyRoute = this.reflector.getAllAndOverride<boolean>(
      IS_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isAdminOnlyRoute) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const supabase = this.supabaseService.getClient();
    const { data: userData, error } = await supabase.auth.getUser(token);

    if (error || !userData.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userMetadata = userData.user.user_metadata || {};
    const role =
      typeof userMetadata.role === 'string'
        ? userMetadata.role.toLowerCase()
        : undefined;
    const isAdmin =
      role === 'admin' ||
      userMetadata.isAdmin === true ||
      userMetadata.isAdmin === 'true';

    if (!isAdmin) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
