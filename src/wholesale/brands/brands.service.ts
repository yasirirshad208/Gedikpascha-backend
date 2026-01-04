import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegisterBrandDto } from './dto/register-brand';
import { UpdateBrandDto } from './dto/update-brand';

@Injectable()
export class BrandsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async registerBrand(registerBrandDto: RegisterBrandDto, userId: string) {
    // Use service client for all operations to bypass RLS issues with users table
    const serviceClient = this.supabaseService.getServiceClient();

    // Normalize brand name (lowercase, no spaces)
    const normalizedBrandName = registerBrandDto.brandName.toLowerCase().replace(/\s/g, '');

    // Check if brand name already exists (must be unique)
    // Use service client to bypass RLS for this public availability check
    const { data: existingBrandName, error: nameCheckError } = await serviceClient
      .from('wholesale_brands')
      .select('id, brand_name')
      .eq('brand_name', normalizedBrandName)
      .maybeSingle();

    if (nameCheckError) {
      // Log the actual error for debugging
      throw new BadRequestException(
        `Failed to check brand name availability: ${nameCheckError.message || 'Unknown error'}`
      );
    }

    if (existingBrandName) {
      throw new BadRequestException('Brand name is already taken. Please choose a different name.');
    }

    // Check if user already has a brand registration
    // Use service client to bypass RLS for this check (userId is already validated)
    const { data: existingBrand, error: checkError } = await serviceClient
      .from('wholesale_brands')
      .select('id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      // Log the actual error for debugging
      throw new BadRequestException(
        `Failed to check existing brand registration: ${checkError.message || 'Unknown error'}`
      );
    }

    // Allow registration if existing brand is rejected, otherwise block
    if (existingBrand) {
      if (existingBrand.status === 'rejected') {
        // User can register again after rejection - allow the registration to proceed
        // We'll delete the old rejected brand and create a new one
        await serviceClient
          .from('wholesale_brands')
          .delete()
          .eq('id', existingBrand.id);
        // Continue with registration below
      } else if (existingBrand.status === 'pending') {
        throw new BadRequestException('You already have a brand registration pending review. Please wait for admin approval.');
      } else if (existingBrand.status === 'approved') {
        throw new BadRequestException('You already have an approved brand registration. You cannot register another brand.');
      }
    }

    // Create brand registration with pending status
    // Use service client to bypass RLS for insert operation
    const { data, error } = await serviceClient
      .from('wholesale_brands')
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
      // Check if error is due to unique constraint violation
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
    // Use service client to bypass RLS for user's own brand query
    const supabase = this.supabaseService.getServiceClient();

    const { data, error } = await supabase
      .from('wholesale_brands')
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
      totalFollowers: data.total_followers || 0,
      totalProducts: data.total_products || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getAllBrands(status?: 'pending' | 'approved' | 'rejected', page = 1, limit = 12, search?: string) {
    // Use service client to bypass RLS for admin operations
    const serviceClient = this.supabaseService.getServiceClient();

    const offset = (page - 1) * limit;

    // Get total count for pagination
    let countQuery = serviceClient
      .from('wholesale_brands')
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
      .from('wholesale_brands')
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
      // Try to get category name, handle both UUID and string formats
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
        totalFollowers: brand.total_followers || 0,
        followersCount: brand.followers_count || brand.total_followers || 0,
        totalProducts: brand.total_products || 0,
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

  async updateBrandStatus(brandId: string, status: 'approved' | 'rejected', adminUserId: string) {
    // Use service client to bypass RLS for admin operations
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if brand exists
    const { data: brand, error: fetchError } = await serviceClient
      .from('wholesale_brands')
      .select('id, status')
      .eq('id', brandId)
      .maybeSingle();

    if (fetchError || !brand) {
      throw new NotFoundException('Brand not found');
    }

    // Update brand status
    const { data, error } = await serviceClient
      .from('wholesale_brands')
      .update({
        status,
        updated_at: new Date().toISOString(),
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString(),
      })
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

  async updateBrand(userId: string, updateBrandDto: UpdateBrandDto) {
    // Use service client to bypass RLS
    const serviceClient = this.supabaseService.getServiceClient();

    // First, get the user's brand to verify ownership
    const { data: existingBrand, error: fetchError } = await serviceClient
      .from('wholesale_brands')
      .select('id, user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      throw new BadRequestException(`Failed to fetch brand: ${fetchError.message || 'Unknown error'}`);
    }

    if (!existingBrand) {
      throw new NotFoundException('Brand not found');
    }

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateBrandDto.displayName !== undefined) {
      updateData.display_name = updateBrandDto.displayName;
    }
    if (updateBrandDto.description !== undefined) {
      updateData.description = updateBrandDto.description || null;
    }
    if (updateBrandDto.country !== undefined) {
      updateData.country = updateBrandDto.country;
    }
    if (updateBrandDto.contactEmail !== undefined) {
      updateData.contact_email = updateBrandDto.contactEmail;
    }
    if (updateBrandDto.phone !== undefined) {
      updateData.phone = updateBrandDto.phone || null;
    }
    if (updateBrandDto.website !== undefined) {
      updateData.website = updateBrandDto.website || null;
    }
    if (updateBrandDto.category !== undefined) {
      updateData.category = updateBrandDto.category || null;
    }
    if (updateBrandDto.logoUrl !== undefined) {
      updateData.logo_url = updateBrandDto.logoUrl || null;
    }
    if (updateBrandDto.coverImageUrl !== undefined) {
      updateData.cover_image_url = updateBrandDto.coverImageUrl || null;
    }

    // Update the brand
    const { data, error } = await serviceClient
      .from('wholesale_brands')
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
      totalFollowers: data.total_followers,
      totalProducts: data.total_products,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getBrandById(brandId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data, error } = await serviceClient
      .from('wholesale_brands')
      .select('*')
      .eq('id', brandId)
      .eq('status', 'approved')
      .single();

    if (error || !data) {
      throw new NotFoundException('Brand not found');
    }

    // Get product count
    const { count: productCount } = await serviceClient
      .from('wholesale_products')
      .select('id', { count: 'exact', head: true })
      .eq('wholesale_brand_id', brandId)
      .eq('status', 'active')
      .is('deleted_at', null);

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
      totalFollowers: data.total_followers || 0,
      totalProducts: productCount || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getBrandByName(brandName: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Brand names are stored lowercase without spaces
    const normalizedBrandName = brandName.toLowerCase().replace(/\s/g, '');

    const { data, error } = await serviceClient
      .from('wholesale_brands')
      .select('*')
      .eq('brand_name', normalizedBrandName)
      .eq('status', 'approved')
      .single();

    if (error || !data) {
      throw new NotFoundException('Brand not found');
    }

    // Get product count
    const { count: productCount } = await serviceClient
      .from('wholesale_products')
      .select('id', { count: 'exact', head: true })
      .eq('wholesale_brand_id', data.id)
      .eq('status', 'active')
      .is('deleted_at', null);

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
      totalFollowers: data.total_followers || 0,
      totalProducts: productCount || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getBrandProducts(brandId: string, page = 1, limit = 20) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify brand exists and is approved
    const { data: brand, error: brandError } = await serviceClient
      .from('wholesale_brands')
      .select('id, status')
      .eq('id', brandId)
      .eq('status', 'approved')
      .single();

    if (brandError || !brand) {
      throw new NotFoundException('Brand not found');
    }

    const offset = (page - 1) * limit;

    // Get products
    const { data: products, error: productsError, count } = await serviceClient
      .from('wholesale_products')
      .select('*', { count: 'exact' })
      .eq('wholesale_brand_id', brandId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (productsError) {
      throw new BadRequestException('Failed to fetch products');
    }

    // Get images for all products
    const productIds = (products || []).map((p: any) => p.id);
    let productImages: any[] = [];

    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });

      productImages = images || [];
    }

    // Get pack sizes for all products
    let productPackSizes: any[] = [];
    if (productIds.length > 0) {
      const { data: packSizes } = await serviceClient
        .from('wholesale_product_pack_sizes')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });

      productPackSizes = packSizes || [];
    }

    const formattedProducts = (products || []).map((product: any) => {
      const images = productImages.filter(img => img.product_id === product.id);
      const packSizes = productPackSizes.filter(ps => ps.product_id === product.id);

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        sku: product.sku,
        basePrice: product.wholesale_price ? parseFloat(product.wholesale_price) : 0,
        minOrderQuantity: product.min_order_quantity,
        status: product.status,
        images: images.map((img: any) => ({
          id: img.id,
          url: img.image_url,
          altText: img.alt_text,
          displayOrder: img.display_order,
          isPrimary: img.is_primary,
        })),
        packSizes: packSizes.map((ps: any) => ({
          id: ps.id,
          label: ps.label,
          quantity: ps.quantity,
          price: ps.pack_price ? parseFloat(ps.pack_price) : 0,
          displayOrder: ps.display_order,
        })),
        createdAt: product.created_at,
      };
    });

    return {
      products: formattedProducts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }
}

