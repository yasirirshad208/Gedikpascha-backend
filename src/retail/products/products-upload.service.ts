import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import sharp from 'sharp';

const RETAIL_BUCKET = 'retail';

@Injectable()
export class RetailProductsUploadService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Uploads a single retail product image (converted to WebP) and returns its
   * public URL. The image is stored under the user's folder so it satisfies the
   * bucket's per-user storage policies. The URL is then attached to the product
   * via updateProduct's `images` array.
   */
  async uploadImage(userId: string, file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 50MB');
    }

    try {
      const webpBuffer = await sharp(file.buffer)
        .webp({ quality: 85 })
        .toBuffer();

      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const filePath = `${userId}/products/${timestamp}-${random}.webp`;

      const serviceClient = this.supabaseService.getServiceClient();
      const { error } = await serviceClient.storage
        .from(RETAIL_BUCKET)
        .upload(filePath, webpBuffer, {
          contentType: 'image/webp',
          upsert: false,
        });

      if (error) {
        throw new BadRequestException(
          `Failed to upload image: ${error.message}`,
        );
      }

      const { data: urlData } = serviceClient.storage
        .from(RETAIL_BUCKET)
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Best-effort deletion of an uploaded image from storage. Only removes files
   * that live in the retail bucket; ignores external/wholesale-copied URLs.
   */
  async deleteImage(imageUrl: string): Promise<void> {
    if (!imageUrl) return;
    const marker = `/${RETAIL_BUCKET}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return; // Not a retail-bucket URL (e.g. copied from wholesale)
    const filePath = imageUrl.slice(idx + marker.length);
    if (!filePath) return;

    const serviceClient = this.supabaseService.getServiceClient();
    const { error } = await serviceClient.storage
      .from(RETAIL_BUCKET)
      .remove([filePath]);
    if (error) {
      console.error('Failed to delete retail image:', error);
    }
  }
}
