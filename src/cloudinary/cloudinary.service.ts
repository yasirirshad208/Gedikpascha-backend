import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryUploadResult {
  url: string; // optimized delivery URL (stored in DB)
  publicId: string;
  resourceType: string;
  bytes: number;
  format: string;
  width?: number;
  height?: number;
}

/**
 * Central media store backed by Cloudinary (replaces Supabase Storage).
 *
 * Compression strategy — smaller files, no visible quality loss:
 *   - f_auto  : serve the best format per browser (AVIF/WebP → falls back to jpg)
 *   - q_auto:good : perceptual quality; large byte savings without blur
 *   - c_limit,w_<max> : only DOWNSCALE oversized images (never upscales), so
 *     nothing gets blurry; small images are untouched.
 * These are baked into the delivery URL we store, so the whole app renders the
 * optimized version automatically.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly baseFolder = process.env.CLOUDINARY_FOLDER || 'gedikpascha';
  private configured = false;

  constructor() {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const key = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;
    if (cloud && key && secret) {
      cloudinary.config({
        cloud_name: cloud,
        api_key: key,
        api_secret: secret,
        secure: true,
      });
      this.configured = true;
      this.logger.log('Cloudinary configured');
    } else {
      this.logger.warn(
        'Cloudinary NOT configured — set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET. Uploads will fail until then.',
      );
    }
  }

  private ensureConfigured() {
    if (!this.configured) {
      throw new BadRequestException(
        'Image storage is not configured. Please contact support.',
      );
    }
  }

  /** Prefix a sub-path with the configured base folder. */
  folder(subPath: string): string {
    return `${this.baseFolder}/${subPath}`.replace(/\/+/g, '/');
  }

  /**
   * Uploads a buffer to Cloudinary and returns an optimized delivery URL.
   * resourceType 'auto' detects image vs video (used by social media).
   */
  async uploadBuffer(
    buffer: Buffer,
    opts: {
      folder: string;
      resourceType?: 'image' | 'video' | 'auto';
      maxWidth?: number; // downscale cap for images (default 1600)
    },
  ): Promise<CloudinaryUploadResult> {
    this.ensureConfigured();
    const resourceType = opts.resourceType ?? 'image';
    const maxWidth = opts.maxWidth ?? 1600;

    // Reel videos can be up to 100 MB. The SDK's 60s default timeout and its
    // single-request upload both fall over on files that size, surfacing as
    // "Failed to upload media: Request Timeout". Videos therefore upload in
    // chunks with a much longer timeout.
    const isVideoUpload = resourceType === 'video' || resourceType === 'auto';
    const uploadOptions: Record<string, unknown> = {
      folder: opts.folder,
      resource_type: resourceType,
      overwrite: false,
      unique_filename: true,
      timeout: isVideoUpload ? 600_000 : 120_000,
    };
    if (isVideoUpload) {
      uploadOptions.chunk_size = 6 * 1024 * 1024;
    }

    const raw = await new Promise<any>((resolve, reject) => {
      const handler = (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Empty Cloudinary response'));
        resolve(result);
      };
      const stream = isVideoUpload
        ? cloudinary.uploader.upload_chunked_stream(uploadOptions, handler)
        : cloudinary.uploader.upload_stream(uploadOptions, handler);
      Readable.from(buffer).pipe(stream);
    }).catch((err) => {
      this.logger.error(`Cloudinary upload failed: ${err?.message ?? err}`);
      const reason = String(err?.message ?? 'Unknown error');
      if (/timeout/i.test(reason)) {
        throw new BadRequestException(
          'Upload timed out. The file may be too large or the connection too slow — try a shorter or smaller video.',
        );
      }
      throw new BadRequestException(`Failed to upload media: ${reason}`);
    });

    const deliveredResourceType = raw.resource_type || resourceType;
    const url = this.buildOptimizedUrl(
      raw.public_id,
      deliveredResourceType,
      raw.format,
      maxWidth,
    );

    return {
      url,
      publicId: raw.public_id,
      resourceType: deliveredResourceType,
      bytes: raw.bytes,
      format: raw.format,
      width: raw.width,
      height: raw.height,
    };
  }

  /**
   * Builds an optimized delivery URL (f_auto,q_auto,[c_limit,w]) for a public id.
   */
  buildOptimizedUrl(
    publicId: string,
    resourceType: string,
    format?: string,
    maxWidth = 1600,
  ): string {
    const transformation: Record<string, any>[] = [
      { fetch_format: 'auto', quality: 'auto:good' },
    ];
    // Only cap width for images; leave video dimensions alone.
    if (resourceType !== 'video') {
      transformation.push({ width: maxWidth, crop: 'limit' });
    }
    return cloudinary.url(publicId, {
      resource_type: resourceType === 'video' ? 'video' : 'image',
      secure: true,
      transformation,
      format: resourceType === 'video' ? undefined : format,
    });
  }

  /**
   * Parses a Cloudinary delivery URL back into { publicId, resourceType } so we
   * can delete the asset. Returns null for non-Cloudinary URLs (e.g. legacy
   * Supabase URLs), which callers should just skip.
   */
  parseUrl(url: string): { publicId: string; resourceType: string } | null {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    // .../<cloud>/<resourceType>/upload/<transforms?>/<v123?>/<folder>/<name>.<ext>
    const m = url.match(
      /res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(.+)$/,
    );
    if (!m) return null;
    const resourceType = m[1];
    let rest = m[2];
    // Drop any leading transformation segments (contain '_' params like f_auto).
    const segments = rest.split('/');
    const cleaned: string[] = [];
    let started = false;
    for (const seg of segments) {
      // Skip transformation segment(s) and the version segment (v123456).
      if (!started && /(^|,)[a-z]{1,3}_/.test(seg)) continue; // transformation
      if (!started && /^v\d+$/.test(seg)) {
        started = true;
        continue;
      }
      started = true;
      cleaned.push(seg);
    }
    rest = cleaned.join('/');
    // Strip file extension from the public id.
    const publicId = rest.replace(/\.[a-zA-Z0-9]+$/, '');
    if (!publicId) return null;
    return { publicId, resourceType };
  }

  /** Best-effort delete of every asset under a folder prefix. */
  async deleteFolder(folder: string): Promise<void> {
    if (!this.configured || !folder) return;
    try {
      await cloudinary.api.delete_resources_by_prefix(folder);
      await cloudinary.api.delete_folder(folder).catch(() => undefined);
    } catch (err: any) {
      this.logger.error(`Cloudinary folder delete failed: ${err?.message ?? err}`);
    }
  }

  /** Best-effort delete of a Cloudinary asset by its delivery URL. */
  async deleteByUrl(url: string): Promise<void> {
    const parsed = this.parseUrl(url);
    if (!parsed) return; // not a Cloudinary URL — skip
    try {
      await cloudinary.uploader.destroy(parsed.publicId, {
        resource_type: parsed.resourceType,
        invalidate: true,
      });
    } catch (err: any) {
      this.logger.error(`Cloudinary delete failed: ${err?.message ?? err}`);
    }
  }
}
