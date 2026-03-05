import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SocialNotificationQueryDto } from './dto/social-notification-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(userId: string, query: SocialNotificationQueryDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const limit = Math.max(1, Math.min(query.limit || 50, 100));

    let dbQuery = serviceClient
      .from('social_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (query.filter === 'unread') {
      dbQuery = dbQuery.eq('is_read', false);
    }

    const { data } = await dbQuery;
    return data || [];
  }

  async markRead(userId: string, notificationId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: existing } = await serviceClient
      .from('social_notifications')
      .select('id, user_id')
      .eq('id', notificationId)
      .single();

    if (!existing || existing.user_id !== userId) {
      throw new NotFoundException('Notification not found');
    }

    const { data } = await serviceClient
      .from('social_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('*')
      .single();

    return data;
  }

  async markAllRead(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    await serviceClient
      .from('social_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);

    return { success: true };
  }
}

