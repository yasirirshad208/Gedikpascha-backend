import { Injectable, BadRequestException } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';

@Injectable()
export class BrandsUploadService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async uploadImage(
    userId: string,
    file: Express.Multer.File,
    imageType: 'logo' | 'cover',
  ): Promise<string> {
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
      folder: this.cloudinary.folder(`wholesale/brands/${userId}`),
      resourceType: 'image',
      // Covers can be wide; keep a generous cap so they stay crisp.
      maxWidth: imageType === 'cover' ? 2000 : 800,
    });
    return result.url;
  }

  async deleteImage(imageUrl: string): Promise<void> {
    await this.cloudinary.deleteByUrl(imageUrl);
  }
}
