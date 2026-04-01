import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'crypto';

export interface LiveProviderRoomContext {
  sessionId: string;
  hostId: string;
  title: string;
}

export interface LiveProviderRoomResult {
  provider: 'livekit' | 'mock';
  providerRoomId: string;
  hostToken: string;
  viewerJoinUrl: string | null;
  playbackHlsUrl: string | null;
}

export interface LiveProviderViewerTokenResult {
  provider: 'livekit' | 'mock';
  providerRoomId: string;
  viewerToken: string;
  viewerJoinUrl: string | null;
}

export interface LiveProviderWebhookResult {
  handled: boolean;
  sessionId?: string;
  providerRoomId?: string;
  replayUrl?: string;
  playbackHlsUrl?: string;
  eventType?: string;
}

@Injectable()
export class SocialLiveProviderService {
  private readonly configuredProvider: 'livekit' | 'mock';
  private readonly livekitUrl: string;
  private readonly livekitApiKey: string;
  private readonly livekitApiSecret: string;
  private readonly tokenTtlSeconds: number;
  private readonly joinUrlBase: string;

  constructor() {
    const provider = String(process.env.SOCIAL_LIVE_PROVIDER ?? 'livekit')
      .trim()
      .toLowerCase();
    this.configuredProvider = provider === 'mock' ? 'mock' : 'livekit';
    this.livekitUrl = String(process.env.LIVEKIT_URL ?? '').trim();
    this.livekitApiKey = String(process.env.LIVEKIT_API_KEY ?? '').trim();
    this.livekitApiSecret = String(process.env.LIVEKIT_API_SECRET ?? '').trim();
    this.joinUrlBase = String(
      process.env.SOCIAL_LIVE_VIEWER_URL_BASE ?? '',
    ).trim();
    const ttlSeconds = Number(
      process.env.SOCIAL_LIVE_TOKEN_TTL_SECONDS ?? 3600,
    );
    this.tokenTtlSeconds =
      Number.isFinite(ttlSeconds) && ttlSeconds > 60
        ? Math.min(24 * 60 * 60, Math.floor(ttlSeconds))
        : 3600;
  }

  private hashToken(parts: string[]): string {
    const digest = createHash('sha256').update(parts.join(':')).digest('hex');
    return `lk_${digest}`;
  }

  private hasLiveKitCredentials(): boolean {
    return Boolean(
      this.livekitUrl &&
      this.livekitApiKey &&
      this.livekitApiSecret &&
      this.configuredProvider === 'livekit',
    );
  }

  private buildViewerJoinUrl(providerRoomId: string): string | null {
    const safeRoom = encodeURIComponent(providerRoomId);
    const base = this.joinUrlBase || this.livekitUrl;
    if (!base) return null;
    const normalizedBase = base.replace(/\/$/, '');
    if (!/^https?:\/\//i.test(normalizedBase)) {
      return null;
    }
    return `${normalizedBase}/rooms/${safeRoom}`;
  }

  private createLiveKitToken(
    identity: string,
    providerRoomId: string,
    grants: {
      canPublish: boolean;
      canSubscribe: boolean;
      canPublishData?: boolean;
    },
  ): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };
    const payload = {
      iss: this.livekitApiKey,
      sub: identity,
      nbf: nowSeconds - 5,
      exp: nowSeconds + this.tokenTtlSeconds,
      jti: randomUUID(),
      video: {
        room: providerRoomId,
        roomJoin: true,
        canPublish: grants.canPublish,
        canSubscribe: grants.canSubscribe,
        canPublishData: grants.canPublishData ?? true,
      },
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.livekitApiSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  createRoom(context: LiveProviderRoomContext): LiveProviderRoomResult {
    const providerRoomId = `live-${context.sessionId}`;
    const useLiveKit = this.hasLiveKitCredentials();
    const provider: 'livekit' | 'mock' = useLiveKit ? 'livekit' : 'mock';

    const hostToken = useLiveKit
      ? this.createLiveKitToken(`host:${context.hostId}`, providerRoomId, {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        })
      : this.hashToken([
          context.sessionId,
          context.hostId,
          'host',
          Date.now().toString(),
          randomUUID(),
        ]);

    const viewerJoinUrl =
      provider === 'livekit' ? this.buildViewerJoinUrl(providerRoomId) : null;

    return {
      provider,
      providerRoomId,
      hostToken,
      viewerJoinUrl,
      playbackHlsUrl: null,
    };
  }

  createViewerToken(sessionId: string, userId: string, providerRoomId: string) {
    const useLiveKit = this.hasLiveKitCredentials();
    const provider: 'livekit' | 'mock' = useLiveKit ? 'livekit' : 'mock';
    const viewerToken = useLiveKit
      ? this.createLiveKitToken(`viewer:${userId}`, providerRoomId, {
          canPublish: false,
          canSubscribe: true,
          canPublishData: true,
        })
      : this.hashToken([
          sessionId,
          userId,
          providerRoomId,
          'viewer',
          Date.now().toString(),
          randomUUID(),
        ]);

    const viewerJoinUrl =
      provider === 'livekit' ? this.buildViewerJoinUrl(providerRoomId) : null;

    const result: LiveProviderViewerTokenResult = {
      provider,
      providerRoomId,
      viewerToken,
      viewerJoinUrl,
    };
    return result;
  }

  endRoom(_providerRoomId: string): { success: true } {
    return { success: true };
  }

  handleRecordingWebhook(
    payload: Record<string, unknown>,
  ): LiveProviderWebhookResult {
    const eventType = String(payload.event ?? payload.type ?? '').trim();
    const sessionId = String(
      payload.sessionId ?? payload.session_id ?? '',
    ).trim();
    const providerRoomId = String(
      payload.roomId ?? payload.room_id ?? '',
    ).trim();
    const replayUrl = String(
      payload.replayUrl ?? payload.replay_url ?? '',
    ).trim();
    const playbackHlsUrl = String(
      payload.playbackHlsUrl ??
        payload.playback_hls_url ??
        payload.playbackUrl ??
        payload.playback_url ??
        '',
    ).trim();

    if (!eventType) {
      return { handled: false };
    }

    return {
      handled: true,
      eventType,
      sessionId: sessionId || undefined,
      providerRoomId: providerRoomId || undefined,
      replayUrl: replayUrl || undefined,
      playbackHlsUrl: playbackHlsUrl || undefined,
    };
  }
}
