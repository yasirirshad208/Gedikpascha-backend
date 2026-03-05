import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SendSocialMessageDto } from './dto/send-social-message.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getThreads(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: participantRows } = await serviceClient
      .from('social_thread_participants')
      .select('thread_id')
      .eq('user_id', userId);

    const threadIds = (participantRows || []).map((row) => row.thread_id);
    if (!threadIds.length) {
      return [];
    }

    const { data: threads } = await serviceClient
      .from('social_threads')
      .select('*')
      .in('id', threadIds)
      .order('updated_at', { ascending: false });

    return threads || [];
  }

  async getMessages(userId: string, threadId: string) {
    await this.assertParticipant(userId, threadId);

    const serviceClient = this.supabaseService.getServiceClient();
    const { data } = await serviceClient
      .from('social_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    return data || [];
  }

  async sendMessage(userId: string, threadId: string, dto: SendSocialMessageDto) {
    await this.assertParticipant(userId, threadId);
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: message, error } = await serviceClient
      .from('social_messages')
      .insert({
        thread_id: threadId,
        sender_id: userId,
        message_type: dto.messageType || 'text',
        message: dto.message || '',
        metadata: dto.metadata || {},
      })
      .select('*')
      .single();

    if (error || !message) {
      throw new NotFoundException(`Failed to send message: ${error?.message || 'Unknown error'}`);
    }

    await serviceClient
      .from('social_threads')
      .update({
        updated_at: new Date().toISOString(),
        last_message_preview: dto.message || dto.messageType || 'message',
      })
      .eq('id', threadId);

    return message;
  }

  private async assertParticipant(userId: string, threadId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data } = await serviceClient
      .from('social_thread_participants')
      .select('id')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .single();

    if (!data) {
      throw new ForbiddenException('You are not part of this thread');
    }
  }
}

