import { Injectable, BadRequestException } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';

@Injectable()
export class RetailProductsUploadService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  /**
   * Uploads a retail product image to Cloudinary and returns its optimized URL.
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

    const result = await this.cloudinary.uploadBuffer(file.buffer, {
      folder: this.cloudinary.folder(`retail/products/${userId}`),
      resourceType: 'image',
    });
    return result.url;
  }

  /** Best-effort deletion of a previously uploaded image. */
  async deleteImage(imageUrl: string): Promise<void> {
    await this.cloudinary.deleteByUrl(imageUrl);
  }
}
