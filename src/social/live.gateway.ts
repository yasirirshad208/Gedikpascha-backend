import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface JoinPayload {
  sessionId: string;
  userId?: string;
  username?: string;
  avatarUrl?: string;
  isHost?: boolean;
}

interface RoomPeer {
  socketId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  isHost: boolean;
}

const roomName = (sessionId: string) => `live:${sessionId}`;

/**
 * Real-time layer for live sessions.
 *
 * Carries three things over one socket connection:
 *  - chat messages and emoji reactions (previously polled on a timer, so
 *    messages could take seconds to appear)
 *  - viewer presence/count
 *  - WebRTC signalling, relayed between the host and each viewer so the host's
 *    camera reaches viewers without a third-party media server
 *
 * Video is peer-to-peer (mesh): the host opens one connection per viewer. That
 * is fine for small audiences; a media server (SFU) would be needed to scale.
 */
@WebSocketGateway({
  namespace: '/live',
  cors: { origin: true, credentials: true },
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(LiveGateway.name);

  /** sessionId -> socketId -> peer */
  private readonly rooms = new Map<string, Map<string, RoomPeer>>();
  /** socketId -> sessionId, so a disconnect can be cleaned up. */
  private readonly socketSession = new Map<string, string>();

  handleConnection(client: Socket) {
    this.logger.debug(`socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const sessionId = this.socketSession.get(client.id);
    if (!sessionId) return;
    this.socketSession.delete(client.id);

    const peers = this.rooms.get(sessionId);
    if (!peers) return;
    const peer = peers.get(client.id);
    peers.delete(client.id);
    if (peers.size === 0) this.rooms.delete(sessionId);

    if (peer?.isHost) {
      // Viewers must tear down their peer connections when the host drops.
      this.server.to(roomName(sessionId)).emit('host:left', {});
    } else if (peer) {
      this.server.to(roomName(sessionId)).emit('peer:left', {
        socketId: client.id,
      });
    }
    this.emitViewers(sessionId);
  }

  private emitViewers(sessionId: string) {
    const peers = this.rooms.get(sessionId);
    const viewers = peers
      ? Array.from(peers.values()).filter((peer) => !peer.isHost).length
      : 0;
    this.server.to(roomName(sessionId)).emit('viewers', { count: viewers });
  }

  private hostOf(sessionId: string): RoomPeer | null {
    const peers = this.rooms.get(sessionId);
    if (!peers) return null;
    return Array.from(peers.values()).find((peer) => peer.isHost) ?? null;
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const sessionId = String(payload?.sessionId ?? '').trim();
    if (!sessionId) return { ok: false, error: 'sessionId is required' };

    const peer: RoomPeer = {
      socketId: client.id,
      userId: String(payload?.userId ?? client.id),
      username: String(payload?.username ?? 'guest'),
      avatarUrl: String(payload?.avatarUrl ?? ''),
      isHost: Boolean(payload?.isHost),
    };

    void client.join(roomName(sessionId));
    if (!this.rooms.has(sessionId)) this.rooms.set(sessionId, new Map());
    this.rooms.get(sessionId)!.set(client.id, peer);
    this.socketSession.set(client.id, sessionId);

    const host = this.hostOf(sessionId);

    // A viewer arriving mid-stream asks the host for an offer; the host
    // arriving (e.g. after a refresh) re-offers to everyone already watching.
    if (peer.isHost) {
      const viewers = Array.from(this.rooms.get(sessionId)!.values()).filter(
        (entry) => !entry.isHost,
      );
      for (const viewer of viewers) {
        client.emit('viewer:joined', { socketId: viewer.socketId });
      }
      this.server.to(roomName(sessionId)).emit('host:ready', {});
    } else if (host) {
      this.server.to(host.socketId).emit('viewer:joined', {
        socketId: client.id,
      });
    }

    this.emitViewers(sessionId);
    return { ok: true, hostOnline: Boolean(host) || peer.isHost };
  }

  @SubscribeMessage('chat')
  handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { body?: string },
  ) {
    const sessionId = this.socketSession.get(client.id);
    const peer = sessionId
      ? this.rooms.get(sessionId)?.get(client.id)
      : undefined;
    const body = String(payload?.body ?? '').trim().slice(0, 500);
    if (!sessionId || !peer || !body) return { ok: false };

    this.server.to(roomName(sessionId)).emit('chat', {
      id: `${client.id}-${Date.now()}`,
      userId: peer.userId,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
      body,
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  @SubscribeMessage('reaction')
  handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { emoji?: string },
  ) {
    const sessionId = this.socketSession.get(client.id);
    const peer = sessionId
      ? this.rooms.get(sessionId)?.get(client.id)
      : undefined;
    const emoji = String(payload?.emoji ?? '').trim().slice(0, 8);
    if (!sessionId || !peer || !emoji) return { ok: false };

    this.server.to(roomName(sessionId)).emit('reaction', {
      id: `${client.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      emoji,
      username: peer.username,
    });
    return { ok: true };
  }

  // --- WebRTC signalling: relayed verbatim between two sockets -------------

  @SubscribeMessage('webrtc:offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { to?: string; description?: unknown },
  ) {
    if (!payload?.to) return;
    this.server.to(payload.to).emit('webrtc:offer', {
      from: client.id,
      description: payload.description,
    });
  }

  @SubscribeMessage('webrtc:answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { to?: string; description?: unknown },
  ) {
    if (!payload?.to) return;
    this.server.to(payload.to).emit('webrtc:answer', {
      from: client.id,
      description: payload.description,
    });
  }

  @SubscribeMessage('webrtc:ice')
  handleIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { to?: string; candidate?: unknown },
  ) {
    if (!payload?.to) return;
    this.server.to(payload.to).emit('webrtc:ice', {
      from: client.id,
      candidate: payload.candidate,
    });
  }
}
