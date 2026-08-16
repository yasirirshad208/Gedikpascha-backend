import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

// Global so any module can inject CloudinaryService without importing this everywhere.
@Global()
@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
