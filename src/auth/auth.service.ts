import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async signup(signupDto: SignupDto) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email: signupDto.email,
      password: signupDto.password,
      options: {
        data: {
          full_name: signupDto.fullName,
        },
      },
    });

    if (error) {
      throw new BadRequestException(error.message || 'Failed to create account');
    }

    // If user was created successfully, insert into users table
    if (data.user?.id) {
      try {
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            full_name: signupDto.fullName,
            email: signupDto.email,
            is_email_verified: data.user.email_confirmed_at ? true : false,
            email_verified_at: data.user.email_confirmed_at || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (userError) {
          // Don't fail signup if users table insert fails
          // The user is already created in auth.users
        }
      } catch (err) {
        // Non-blocking error - auth user is already created
      }
    }

    return {
      user: data.user,
      session: data.session,
      message: 'Account created successfully. Please check your email to verify your account.',
    };
  }

  async login(loginDto: LoginDto) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginDto.email,
      password: loginDto.password,
      options: {
        // Request 7-day session duration
        // Note: This requires Supabase JWT expiry to be configured in dashboard
      },
    });

    if (error) {
      throw new UnauthorizedException(error.message || 'Invalid email or password');
    }

    // Update last_login_at in users table
    if (data.user?.id) {
      try {
        await supabase
          .from('users')
          .update({
            last_login_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.user.id);
      } catch (err) {
        // Non-blocking error - login still succeeds
      }
    }

    // Fetch user with role information from database
    let userWithRole = data.user;
    if (data.user?.id) {
      // Check if user has admin role in user_metadata or from a profiles table
      // For now, we'll check user_metadata. In production, you'd query a profiles table
      const isAdmin = data.user.user_metadata?.role === 'admin' || data.user.user_metadata?.isAdmin === true;
      
      // Add role info to user metadata if not already present
      if (!userWithRole.user_metadata) {
        userWithRole.user_metadata = {};
      }
      userWithRole.user_metadata.isAdmin = isAdmin;
    }

    return {
      user: userWithRole,
      session: data.session,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordDto.email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password`,
    });

    if (error) {
      throw new BadRequestException(error.message || 'Failed to send password reset email');
    }

    return {
      message: 'Password reset email sent successfully. Please check your email.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const supabase = this.supabaseService.getClient();

    // For password reset with tokens from email link
    if (resetPasswordDto.token) {
      // Set the session first with both tokens if available
      if (resetPasswordDto.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: resetPasswordDto.token,
          refresh_token: resetPasswordDto.refreshToken,
        });

        if (sessionError) {
          throw new BadRequestException(
            sessionError.message || 'Invalid or expired reset token. Please request a new password reset.'
          );
        }
      }

      // Now update the password (session is set)
      const { error } = await supabase.auth.updateUser({
        password: resetPasswordDto.password,
      });

      if (error) {
        throw new BadRequestException(error.message || 'Failed to reset password');
      }

      return {
        message: 'Password reset successfully.',
      };
    }

    // Fallback: try with default client (if user is already authenticated)
    const { error } = await supabase.auth.updateUser({
      password: resetPasswordDto.password,
    });

    if (error) {
      throw new BadRequestException(error.message || 'Failed to reset password');
    }

    return {
      message: 'Password reset successfully.',
    };
  }

  async getProviderUrl(provider: 'google' | 'facebook') {
    const supabase = this.supabaseService.getClient();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${frontendUrl}/auth/callback`,
      },
    });

    if (error) {
      throw new BadRequestException(error.message || `Failed to initiate ${provider} login`);
    }

    return {
      url: data.url,
    };
  }

  async verifySession(accessToken: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Fetch user with role information
    let userWithRole = data.user;
    if (data.user?.id) {
      // Check if user has admin role
      const isAdmin = data.user.user_metadata?.role === 'admin' || data.user.user_metadata?.isAdmin === true;
      
      // Ensure user_metadata exists and include role info
      if (!userWithRole.user_metadata) {
        userWithRole.user_metadata = {};
      }
      userWithRole.user_metadata.isAdmin = isAdmin;
    }

    return {
      user: userWithRole,
    };
  }

  async refreshToken(refreshToken: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException(error?.message || 'Failed to refresh token');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
    };
  }
}

