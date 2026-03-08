import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { SupabaseService } from '../supabase/supabase.service';

type SocialUploadKind =
  | 'post_image'
  | 'reel_media'
  | 'reel_thumbnail'
  | 'product_image'
  | 'status_media'
  | 'social_avatar';

@Injectable()
export class SocialUploadService {
  private readonly bucketName = 'social';

  private readonly maxPostImageBytes = 10 * 1024 * 1024; // 10 MB
  private readonly maxReelImageBytes = 15 * 1024 * 1024; // 15 MB
  private readonly maxReelVideoBytes = 100 * 1024 * 1024; // 100 MB
  private readonly maxReelThumbnailBytes = 8 * 1024 * 1024; // 8 MB
  private readonly maxProductImageBytes = 10 * 1024 * 1024; // 10 MB
  private readonly maxStatusImageBytes = 10 * 1024 * 1024; // 10 MB
  private readonly maxStatusVideoBytes = 50 * 1024 * 1024; // 50 MB
  private readonly maxSocialAvatarBytes = 8 * 1024 * 1024; // 8 MB

  private readonly allowedImageMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
  ]);

  private readonly allowedVideoMimeTypes = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/ogg',
    'video/x-matroska',
  ]);

  constructor(private readonly supabaseService: SupabaseService) {}

  private normalizeKind(kind: string | undefined): SocialUploadKind {
    const normalized = String(kind || '')
      .trim()
      .toLowerCase();
    if (
      normalized !== 'post_image' &&
      normalized !== 'reel_media' &&
      normalized !== 'reel_thumbnail' &&
      normalized !== 'product_image' &&
      normalized !== 'status_media' &&
      normalized !== 'social_avatar'
    ) {
      throw new BadRequestException('Invalid upload kind');
    }
    return normalized;
  }

  private fallbackExtFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/avif': '.avif',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/ogg': '.ogv',
      'video/x-matroska': '.mkv',
    };
    return map[mimeType] ?? '';
  }

  private resolveExtension(file: Express.Multer.File): string {
    const fromName = extname(file.originalname || '').toLowerCase();
    if (fromName) return fromName;
    return this.fallbackExtFromMime(file.mimetype || '') || '.bin';
  }

  private validateFile(kind: SocialUploadKind, file: Express.Multer.File) {
    if (!file?.buffer || !file?.mimetype) {
      throw new BadRequestException('Invalid file payload');
    }

    const isImage = this.allowedImageMimeTypes.has(file.mimetype);
    const isVideo = this.allowedVideoMimeTypes.has(file.mimetype);

    if (kind === 'post_image') {
      if (!isImage) {
        throw new BadRequestException('Post upload supports image files only');
      }
      if (file.size > this.maxPostImageBytes) {
        throw new BadRequestException('Post image size exceeds 10 MB');
      }
      return;
    }

    if (kind === 'product_image') {
      if (!isImage) {
        throw new BadRequestException(
          'Product upload supports image files only',
        );
      }
      if (file.size > this.maxProductImageBytes) {
        throw new BadRequestException('Product image size exceeds 10 MB');
      }
      return;
    }

    if (kind === 'reel_thumbnail') {
      if (!isImage) {
        throw new BadRequestException('Reel thumbnail must be an image');
      }
      if (file.size > this.maxReelThumbnailBytes) {
        throw new BadRequestException('Reel thumbnail size exceeds 8 MB');
      }
      return;
    }

    if (kind === 'status_media') {
      if (!isImage && !isVideo) {
        throw new BadRequestException(
          'Status media supports image or video files only',
        );
      }
      if (isImage && file.size > this.maxStatusImageBytes) {
        throw new BadRequestException('Status image size exceeds 10 MB');
      }
      if (isVideo && file.size > this.maxStatusVideoBytes) {
        throw new BadRequestException('Status video size exceeds 50 MB');
      }
      return;
    }

    if (kind === 'social_avatar') {
      if (!isImage) {
        throw new BadRequestException(
          'Avatar upload supports image files only',
        );
      }
      if (file.size > this.maxSocialAvatarBytes) {
        throw new BadRequestException('Avatar image size exceeds 8 MB');
      }
      return;
    }

    // reel_media
    if (!isImage && !isVideo) {
      throw new BadRequestException(
        'Reel media supports image or video files only',
      );
    }
    if (isImage && file.size > this.maxReelImageBytes) {
      throw new BadRequestException('Reel image size exceeds 15 MB');
    }
    if (isVideo && file.size > this.maxReelVideoBytes) {
      throw new BadRequestException('Reel video size exceeds 100 MB');
    }
  }

  async uploadMedia(
    userId: string,
    file: Express.Multer.File | undefined,
    kindValue?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const kind = this.normalizeKind(kindValue);
    this.validateFile(kind, file);

    const extension = this.resolveExtension(file);
    const datePart = new Date().toISOString().slice(0, 10);
    const filePath = `${userId}/${kind}/${datePart}/${Date.now()}-${randomUUID()}${extension}`;

    const serviceClient = this.supabaseService.getServiceClient();
    const { error: uploadError } = await serviceClient.storage
      .from(this.bucketName)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      throw new BadRequestException(
        `Failed to upload media: ${uploadError.message}`,
      );
    }

    const { data: publicUrlData } = serviceClient.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);

    return {
      kind,
      bucket: this.bucketName,
      path: filePath,
      url: publicUrlData.publicUrl,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
