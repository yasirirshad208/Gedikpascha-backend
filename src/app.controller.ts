import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async healthCheck() {
    const health = await this.supabaseService.healthCheck();
    return {
      status: health.healthy ? 'ok' : 'error',
      supabase: health.healthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
