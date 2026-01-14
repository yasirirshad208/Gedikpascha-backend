import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegisterRetailBrandDto } from './dto/register-brand';
import { UpdateRetailBrandDto } from './dto/update-brand';

@Injectable()
export class RetailBrandsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async registerBrand(registerBrandDto: RegisterRetailBrandDto, userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Normalize brand name (lowercase, no spaces)
    const normalizedBrandName = registerBrandDto.brandName.toLowerCase().replace(/\s/g, '');

    // Check if brand name already exists
    const { data: existingBrandName, error: nameCheckError } = await serviceClient
      .from('retail_brands')
      .select('id, brand_name')
      .eq('brand_name', normalizedBrandName)
      .maybeSingle();

    if (nameCheckError) {
      throw new BadRequestException(
        `Failed to check brand name availability: ${nameCheckError.message || 'Unknown error'}`
      );
    }

    if (existingBrandName) {
      throw new BadRequestException('Brand name is already taken. Please choose a different name.');
    }

    // Check if user already has a brand registration
    const { data: existingBrand, error: checkError } = await serviceClient
      .from('retail_brands')
      .select('id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      throw new BadRequestException(
        `Failed to check existing brand registration: ${checkError.message || 'Unknown error'}`
      );
    }

    if (existingBrand) {
      if (existingBrand.status === 'rejected') {
        // Delete old rejected brand and allow re-registration
        await serviceClient
          .from('retail_brands')
          .delete()
          .eq('id', existingBrand.id);
      } else if (existingBrand.status === 'pending') {
        throw new BadRequestException('You already have a brand registration pending review. Please wait for admin approval.');
      } else if (existingBrand.status === 'approved') {
        throw new BadRequestException('You already have an approved brand registration. You cannot register another brand.');
      }
    }

    // Create brand registration with pending status
    const { data, error } = await serviceClient
      .from('retail_brands')
      .insert({
        brand_name: normalizedBrandName,
        display_name: registerBrandDto.displayName,
        description: registerBrandDto.description || null,
        country: registerBrandDto.country,
        contact_email: registerBrandDto.contactEmail,
        phone: registerBrandDto.phone || null,
        website: registerBrandDto.website || null,
        logo_url: registerBrandDto.logoUrl || null,
        cover_image_url: registerBrandDto.coverImageUrl || null,
        category: registerBrandDto.category || null,
        user_id: userId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || error.message?.includes('unique')) {
        throw new BadRequestException('Brand name is already taken. Please choose a different name.');
      }
      throw new BadRequestException(error.message || 'Failed to register brand');
    }

    return {
      id: data.id,
      brandName: data.brand_name,
      displayName: data.display_name,
      status: data.status,
      message: 'Brand registration submitted successfully. Your brand is pending admin review.',
    };
  }

  async getMyBrand(userId: string) {
    const supabase = this.supabaseService.getServiceClient();

    const { data, error } = await supabase
      .from('retail_brands')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No brand found
      }
      throw new BadRequestException('Failed to fetch brand information');
    }

    return {
      id: data.id,
      brandName: data.brand_name,
      displayName: data.display_name,
      description: data.description,
      country: data.country,
      contactEmail: data.contact_email,
      phone: data.phone,
      website: data.website,
      logoUrl: data.logo_url,
      coverImageUrl: data.cover_image_url,
      category: data.category,
      status: data.status,
      rejectionReason: data.rejection_reason,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getApprovedBrands() {
    const supabase = this.supabaseService.getServiceClient();

    const { data: brands, error } = await supabase
      .from('retail_brands')
      .select('id, display_name, logo_url')
      .eq('status', 'approved')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Error fetching approved brands:', error);
      return [];
    }

    return brands || [];
  }

  async getAllBrands(status?: 'pending' | 'approved' | 'rejected', page = 1, limit = 12, search?: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const offset = (page - 1) * limit;

    // Get total count for pagination
    let countQuery = serviceClient
      .from('retail_brands')
      .select('*', { count: 'exact', head: true });

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      countQuery = countQuery.or(
        `display_name.ilike.${searchTerm},brand_name.ilike.${searchTerm},contact_email.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new BadRequestException(`Failed to count brands: ${countError.message || 'Unknown error'}`);
    }

    // Fetch brands with pagination
    let query = serviceClient
      .from('retail_brands')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(
        `display_name.ilike.${searchTerm},brand_name.ilike.${searchTerm},contact_email.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch brands: ${error.message || 'Unknown error'}`);
    }

    // Fetch all categories to map IDs to names
    const { data: categories, error: categoriesError } = await serviceClient
      .from('categories')
      .select('id, name');

    const categoryMap = new Map<string, string>();
    if (categories && !categoriesError) {
      categories.forEach((cat: any) => {
        categoryMap.set(cat.id, cat.name);
      });
    }

    const brands = data.map((brand: any) => {
      let categoryName: string | null = null;
      if (brand.category) {
        categoryName = categoryMap.get(brand.category) || null;
      }

      return {
        id: brand.id,
        brandName: brand.brand_name,
        displayName: brand.display_name,
        description: brand.description,
        country: brand.country,
        contactEmail: brand.contact_email,
        phone: brand.phone,
        website: brand.website,
        logoUrl: brand.logo_url,
        coverImageUrl: brand.cover_image_url,
        category: brand.category,
        categoryName: categoryName,
        status: brand.status,
        rejectionReason: brand.rejection_reason,
        userId: brand.user_id,
        createdAt: brand.created_at,
        updatedAt: brand.updated_at,
      };
    });

    const totalPages = Math.ceil((count || 0) / limit);
    const hasMore = page < totalPages;

    return {
      brands,
      hasMore,
      total: count || 0,
      page,
      limit,
    };
  }

  async updateBrandStatus(brandId: string, status: 'approved' | 'rejected', adminUserId: string, rejectionReason?: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if brand exists
    const { data: brand, error: fetchError } = await serviceClient
      .from('retail_brands')
      .select('id, status')
      .eq('id', brandId)
      .maybeSingle();

    if (fetchError || !brand) {
      throw new NotFoundException('Brand not found');
    }

    // Update brand status
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    };

    if (status === 'rejected' && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    } else if (status === 'approved') {
      // Clear rejection reason when approving
      updateData.rejection_reason = null;
    }

    const { data, error } = await serviceClient
      .from('retail_brands')
      .update(updateData)
      .eq('id', brandId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update brand status: ${error.message || 'Unknown error'}`);
    }

    return {
      id: data.id,
      status: data.status,
      message: `Brand ${status} successfully`,
    };
  }

  async updateBrand(userId: string, updateBrandDto: UpdateRetailBrandDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get the user's brand to verify ownership
    const { data: existingBrand, error: fetchError } = await serviceClient
      .from('retail_brands')
      .select('id, user_id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !existingBrand) {
      throw new NotFoundException('Brand registration not found');
    }

    // Only allow updates for approved brands
    if (existingBrand.status !== 'approved') {
      throw new BadRequestException('Only approved brands can be updated');
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateBrandDto.displayName !== undefined) updateData.display_name = updateBrandDto.displayName;
    if (updateBrandDto.description !== undefined) updateData.description = updateBrandDto.description;
    if (updateBrandDto.country !== undefined) updateData.country = updateBrandDto.country;
    if (updateBrandDto.contactEmail !== undefined) updateData.contact_email = updateBrandDto.contactEmail;
    if (updateBrandDto.phone !== undefined) updateData.phone = updateBrandDto.phone;
    if (updateBrandDto.website !== undefined) updateData.website = updateBrandDto.website;
    if (updateBrandDto.category !== undefined) updateData.category = updateBrandDto.category;
    if (updateBrandDto.logoUrl !== undefined) updateData.logo_url = updateBrandDto.logoUrl;
    if (updateBrandDto.coverImageUrl !== undefined) updateData.cover_image_url = updateBrandDto.coverImageUrl;

    const { data, error } = await serviceClient
      .from('retail_brands')
      .update(updateData)
      .eq('id', existingBrand.id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update brand: ${error.message || 'Unknown error'}`);
    }

    return {
      id: data.id,
      brandName: data.brand_name,
      displayName: data.display_name,
      description: data.description,
      country: data.country,
      contactEmail: data.contact_email,
      phone: data.phone,
      website: data.website,
      logoUrl: data.logo_url,
      coverImageUrl: data.cover_image_url,
      category: data.category,
      status: data.status,
      updatedAt: data.updated_at,
      message: 'Brand information updated successfully',
    };
  }

  async getBrandById(brandId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data, error } = await serviceClient
      .from('retail_brands')
      .select('*')
      .eq('id', brandId)
      .eq('status', 'approved')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Brand not found or not approved');
      }
      throw new BadRequestException('Failed to fetch brand');
    }

    return {
      id: data.id,
      brandName: data.brand_name,
      displayName: data.display_name,
      description: data.description,
      country: data.country,
      contactEmail: data.contact_email,
      phone: data.phone,
      website: data.website,
      logoUrl: data.logo_url,
      coverImageUrl: data.cover_image_url,
      category: data.category,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
