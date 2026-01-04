import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import sharp from 'sharp';

@Injectable()
export class ProductsUploadService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async uploadImage(
    userId: string,
    productId: string,
    file: Express.Multer.File,
    displayOrder: number = 0,
  ): Promise<string> {
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

    try {
      // Convert image to WebP format
      const webpBuffer = await sharp(file.buffer)
        .webp({ quality: 85 }) // 85% quality for good balance between size and quality
        .toBuffer();

      // Generate unique file name
      const timestamp = Date.now();
      const fileName = `product-${timestamp}-${displayOrder}.webp`;
      const filePath = `${userId}/products/${productId}/${fileName}`;

      // Upload to Supabase storage
      const serviceClient = this.supabaseService.getServiceClient();
      const { data, error } = await serviceClient.storage
        .from('wholesale_products')
        .upload(filePath, webpBuffer, {
          contentType: 'image/webp',
          upsert: false, // Don't overwrite existing files
        });

      if (error) {
        throw new BadRequestException(`Failed to upload image: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = serviceClient.storage
        .from('wholesale_products')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // If sharp conversion fails, try to upload original
      console.error('WebP conversion failed, attempting original upload:', error);
      throw new BadRequestException(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteImage(imageUrl: string): Promise<void> {
    if (!imageUrl) {
      return;
    }

    // Extract file path from URL
    // URL format: https://[project].supabase.co/storage/v1/object/public/wholesale_products/[userId]/products/[productId]/[fileName]
    const urlParts = imageUrl.split('/wholesale_products/');
    if (urlParts.length < 2) {
      return; // Invalid URL format, skip deletion
    }

    const filePath = urlParts[1];

    const serviceClient = this.supabaseService.getServiceClient();
    const { error } = await serviceClient.storage
      .from('wholesale_products')
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete image:', error);
      // Don't throw error for deletion failures, just log
    }
  }

  async deleteProductImages(productId: string, userId: string): Promise<void> {
    const serviceClient = this.supabaseService.getServiceClient();
    const folderPath = `${userId}/products/${productId}/`;

    // List all files in the product folder
    const { data: files, error: listError } = await serviceClient.storage
      .from('wholesale_products')
      .list(folderPath);

    if (listError || !files || files.length === 0) {
      return; // No files to delete or error listing
    }

    // Delete all files
    const filePaths = files.map((file) => `${folderPath}${file.name}`);
    const { error: deleteError } = await serviceClient.storage
      .from('wholesale_products')
      .remove(filePaths);

    if (deleteError) {
      console.error('Failed to delete product images:', deleteError);
      // Don't throw error for deletion failures, just log
    }
  }
}

