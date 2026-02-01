import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class RetailBrandsUploadService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async uploadImage(userId: string, file: Express.Multer.File, imageType: 'logo' | 'cover'): Promise<string> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 50MB');
    }

    // Get file extension
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${imageType}-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase storage
    const serviceClient = this.supabaseService.getServiceClient();
    const { data, error } = await serviceClient.storage
      .from('retail')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      throw new BadRequestException(`Failed to upload image: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = serviceClient.storage
      .from('retail')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  async deleteImage(imageUrl: string): Promise<void> {
    if (!imageUrl) {
      return;
    }

    // Extract file path from URL
    // URL format: https://[project].supabase.co/storage/v1/object/public/retail/[userId]/[fileName]
    const urlParts = imageUrl.split('/retail/');
    if (urlParts.length < 2) {
      return; // Invalid URL format, skip deletion
    }

    const filePath = urlParts[1];

    const serviceClient = this.supabaseService.getServiceClient();
    const { error } = await serviceClient.storage
      .from('retail')
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete image:', error);
      // Don't throw error for deletion failures, just log
    }
  }
}
