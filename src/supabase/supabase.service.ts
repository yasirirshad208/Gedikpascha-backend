import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabaseClient: SupabaseClient;
  private supabaseServiceClient: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase environment variables. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in your .env file',
      );
    }

    this.supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
    });

    // Service role client for admin operations like storage uploads
    if (!supabaseServiceKey) {
      console.warn(
        '⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Admin operations may fail due to RLS policies.',
      );
      console.warn(
        '   To fix this, add SUPABASE_SERVICE_ROLE_KEY to your .env file. You can find it in Supabase Dashboard > Settings > API',
      );
      // Fallback to anon key if service key not provided (will respect RLS)
      this.supabaseServiceClient = this.supabaseClient;
    } else {
      this.supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  onModuleInit() {
    console.log('✅ Supabase client initialized successfully');
  }

  getClient(): SupabaseClient {
    return this.supabaseClient;
  }

  getServiceClient(): SupabaseClient {
    return this.supabaseServiceClient;
  }

  // Helper methods for common operations
  async healthCheck() {
    try {
      // Simple connection test - just verify the client is initialized
      return { healthy: !!this.supabaseClient, clientInitialized: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

