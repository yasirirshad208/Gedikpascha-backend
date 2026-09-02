import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
// Import class-transformer to ensure it's available for ValidationPipe
import 'class-transformer';

async function bootstrap() {
  // Create app with body parser enabled for JSON, but multer will handle multipart
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    // rawBody required by /payments/webhook for Iyzico HMAC verification.
    rawBody: true,
  });

  // Behind reverse proxies (Vercel rewrite proxy, Cloudflare, Render's LB).
  // Lets Express derive req.ip from forwarded headers so rate limiting and
  // logging see the real visitor IP instead of the proxy address.
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Enable global validation pipe
  // Note: ValidationPipe will skip multipart/form-data automatically when FileInterceptor is used
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
