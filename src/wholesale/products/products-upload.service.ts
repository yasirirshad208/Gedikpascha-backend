import { Injectable, BadRequestException } from '@nestjs/common';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';

@Injectable()
export class ProductsUploadService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async uploadImage(
    userId: string,
    productId: string,
    file: Express.Multer.File,
    _displayOrder: number = 0,
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
      folder: this.cloudinary.folder(`wholesale/products/${productId}`),
      resourceType: 'image',
    });
    return result.url;
  }

  async deleteImage(imageUrl: string): Promise<void> {
    await this.cloudinary.deleteByUrl(imageUrl);
  }

  async deleteProductImages(productId: string, _userId: string): Promise<void> {
    await this.cloudinary.deleteFolder(
      this.cloudinary.folder(`wholesale/products/${productId}`),
    );
  }
}
