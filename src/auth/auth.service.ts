import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
      const friendlyMessage = this.mapSignupError(error.message);
      throw new BadRequestException(friendlyMessage);
    }

    // If user was created successfully, upsert into users table.
    // We use upsert (ON CONFLICT id DO UPDATE) because the DB trigger
    // handle_new_user() may have already inserted the row. Using plain
    // insert would throw a unique-violation in that race.
    if (data.user?.id) {
      try {
        const { error: userError } = await supabase
          .from('users')
          .upsert(
            {
              id: data.user.id,
              full_name: signupDto.fullName,
              email: signupDto.email,
              is_email_verified: data.user.email_confirmed_at ? true : false,
              email_verified_at: data.user.email_confirmed_at || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );

        if (userError) {
          // Don't fail signup if users table upsert fails
          // The user is already created in auth.users and the trigger
          // should have backfilled the profile row.
          console.warn(
            `[AuthService.signup] users upsert warning for ${data.user.id}: ${userError.message}`,
          );
        }
      } catch (err) {
        // Non-blocking error - auth user is already created
        console.warn(
          `[AuthService.signup] users upsert exception for ${data.user?.id}:`,
          err,
        );
      }
    }

    return {
      user: data.user,
      session: data.session,
      message:
        'Account created successfully. Please check your email to verify your account.',
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
      // Map Supabase's raw error messages to user-friendly messages
      const friendlyMessage = this.mapLoginError(error.message);
      throw new UnauthorizedException(friendlyMessage);
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
    const userWithRole = data.user;
    if (data.user?.id) {
      // Check if user has admin role in user_metadata or from a profiles table
      // For now, we'll check user_metadata. In production, you'd query a profiles table
      const isAdmin =
        data.user.user_metadata?.role === 'admin' ||
        data.user.user_metadata?.isAdmin === true;

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

    const { error } = await supabase.auth.resetPasswordForEmail(
      forgotPasswordDto.email,
      {
        redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password`,
      },
    );

    if (error) {
      throw new BadRequestException(
        error.message || 'Failed to send password reset email',
      );
    }

    return {
      message:
        'Password reset email sent successfully. Please check your email.',
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
            sessionError.message ||
              'Invalid or expired reset token. Please request a new password reset.',
          );
        }
      }

      // Now update the password (session is set)
      const { error } = await supabase.auth.updateUser({
        password: resetPasswordDto.password,
      });

      if (error) {
        throw new BadRequestException(
          error.message || 'Failed to reset password',
        );
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
      throw new BadRequestException(
        error.message || 'Failed to reset password',
      );
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
      throw new BadRequestException(
        error.message || `Failed to initiate ${provider} login`,
      );
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
    const userWithRole = data.user;
    if (data.user?.id) {
      // Check if user has admin role
      const isAdmin =
        data.user.user_metadata?.role === 'admin' ||
        data.user.user_metadata?.isAdmin === true;

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
      throw new UnauthorizedException(
        error?.message || 'Failed to refresh token',
      );
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
    };
  }

  /**
   * Maps Supabase's raw login error messages to user-friendly messages.
   */
  private mapLoginError(raw: string): string {
    const lower = raw.toLowerCase();

    if (lower.includes('invalid login credentials')) {
      return 'Incorrect email or password. Please try again.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Your email has not been verified yet. Please check your inbox for a verification link.';
    }
    if (lower.includes('user not found')) {
      return 'No account found with this email address. Please sign up first.';
    }
    if (lower.includes('too many requests') || lower.includes('rate limit')) {
      return 'Too many login attempts. Please wait a moment and try again.';
    }
    if (lower.includes('user banned') || lower.includes('user is banned')) {
      return 'Your account has been suspended. Please contact support.';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }

    // Fallback: return a generic but clear message instead of the raw Supabase error
    return 'Incorrect email or password. Please try again.';
  }

  /**
   * Maps Supabase's raw signup error messages to user-friendly messages.
   */
  private mapSignupError(raw: string): string {
    const lower = raw.toLowerCase();

    if (lower.includes('user already registered') || lower.includes('already been registered')) {
      return 'An account with this email already exists. Please sign in instead.';
    }
    if (lower.includes('password') && lower.includes('weak')) {
      return 'Your password is too weak. Please use at least 8 characters with a mix of letters and numbers.';
    }
    if (lower.includes('password') && (lower.includes('short') || lower.includes('length'))) {
      return 'Password must be at least 8 characters long.';
    }
    if (lower.includes('valid email') || lower.includes('invalid email')) {
      return 'Please enter a valid email address.';
    }
    if (lower.includes('too many requests') || lower.includes('rate limit')) {
      return 'Too many signup attempts. Please wait a moment and try again.';
    }
    if (lower.includes('signups not allowed') || lower.includes('signup is disabled')) {
      return 'New registrations are currently disabled. Please try again later.';
    }
    if (lower.includes('database error saving new user')) {
      return 'There was a problem creating your account. Please try again.';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }

    // Fallback
    return 'Failed to create account. Please try again.';
  }
}
