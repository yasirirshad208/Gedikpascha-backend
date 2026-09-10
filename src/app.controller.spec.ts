import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

describe('AppController', () => {
  let appController: AppController;
  let healthCheck: jest.Mock;

  beforeEach(async () => {
    // AppController gained a SupabaseService dependency for /health. Stub it so
    // the test never reaches the network or needs credentials.
    healthCheck = jest.fn();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: SupabaseService, useValue: { healthCheck } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok when Supabase is reachable', async () => {
      healthCheck.mockResolvedValue({ healthy: true });
      const result = await appController.healthCheck();
      expect(result).toMatchObject({ status: 'ok', supabase: 'connected' });
    });

    it('reports error when Supabase is unreachable', async () => {
      healthCheck.mockResolvedValue({ healthy: false });
      const result = await appController.healthCheck();
      expect(result).toMatchObject({
        status: 'error',
        supabase: 'disconnected',
      });
    });
  });
});
