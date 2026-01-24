import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class RetailProductsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getMyProducts(
    userId: string,
    status?: 'draft' | 'active' | 'inactive' | 'out_of_stock',
    search?: string,
    page: number = 1,
    limit: number = 50,
  ) {
    // Use service client to bypass RLS for admin operations
    const supabase = this.supabaseService.getServiceClient();

    // First, get the user's retail brand
    const { data: retailBrand, error: brandError } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();

    if (brandError || !retailBrand) {
      // Return empty array if no retail brand found (not an error)
      return [];
    }

    // Build query
    let query = supabase
      .from('retail_products')
      .select('*')
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(
        `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: products, error } = await query;

    if (error) {
      console.error('Error fetching retail products:', error);
      // Return empty array instead of throwing error if table doesn't exist yet
      return [];
    }

    return products || [];
  }

  async getProductById(productId: string, userId: string) {
    const supabase = this.supabaseService.getServiceClient();

    // First, get the user's retail brand
    const { data: retailBrand, error: brandError } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();

    if (brandError || !retailBrand) {
      throw new NotFoundException('Retail brand not found');
    }

    // Get product
    const { data: product, error } = await supabase
      .from('retail_products')
      .select('*')
      .eq('id', productId)
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .single();

    if (error || !product) {
      console.error('Product fetch error:', error);
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async updateProduct(
    productId: string,
    userId: string,
    updateData: {
      name?: string;
      description?: string;
      shortDescription?: string;
      retailPrice?: number;
      salePercentage?: number;
      status?: 'draft' | 'active' | 'inactive';
      metaTitle?: string;
      metaDescription?: string;
      lowStockThreshold?: number;
      preservedQuantity?: number;
    },
  ) {
    const supabase = this.supabaseService.getServiceClient();

    // First, get the user's retail brand
    const { data: retailBrand, error: brandError } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();

    if (brandError || !retailBrand) {
      throw new NotFoundException('Retail brand not found');
    }

    // Get the existing product to verify ownership and cost price
    const { data: existingProduct, error: fetchError } = await supabase
      .from('retail_products')
      .select('*')
      .eq('id', productId)
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !existingProduct) {
      throw new NotFoundException('Product not found');
    }

    // Validate name if provided
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim() === '') {
        throw new BadRequestException('Product name cannot be empty');
      }
    }

    // Validate retail price if provided
    if (updateData.retailPrice !== undefined) {
      if (updateData.retailPrice <= 0) {
        throw new BadRequestException('Retail price must be greater than 0');
      }
      if (updateData.retailPrice < existingProduct.cost_price) {
        throw new BadRequestException('Retail price cannot be less than cost price');
      }
    }

    // Validate sale percentage if provided
    if (updateData.salePercentage !== undefined) {
      if (updateData.salePercentage < 0 || updateData.salePercentage > 100) {
        throw new BadRequestException('Sale percentage must be between 0 and 100');
      }
    }

    // Validate low stock threshold if provided
    if (updateData.lowStockThreshold !== undefined) {
      if (updateData.lowStockThreshold < 0) {
        throw new BadRequestException('Low stock threshold cannot be negative');
      }
    }

    // Validate preserved quantity if provided
    if (updateData.preservedQuantity !== undefined) {
      if (updateData.preservedQuantity < 0) {
        throw new BadRequestException('Preserved quantity cannot be negative');
      }
      if (updateData.preservedQuantity > existingProduct.stock_quantity) {
        throw new BadRequestException('Preserved quantity cannot exceed total stock quantity');
      }
    }

    // Validate status change
    if (updateData.status === 'active') {
      const retailPrice = updateData.retailPrice ?? existingProduct.retail_price;
      if (!retailPrice) {
        throw new BadRequestException('Cannot set status to active without setting retail price');
      }
    }

    // Prepare update object
    const updateObject: any = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.name !== undefined) {
      updateObject.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      updateObject.description = updateData.description;
    }
    if (updateData.shortDescription !== undefined) {
      updateObject.short_description = updateData.shortDescription;
    }
    if (updateData.retailPrice !== undefined) {
      updateObject.retail_price = updateData.retailPrice;
    }
    if (updateData.salePercentage !== undefined) {
      updateObject.sale_percentage = updateData.salePercentage;
    }
    if (updateData.status !== undefined) {
      updateObject.status = updateData.status;
    }
    if (updateData.metaTitle !== undefined) {
      updateObject.meta_title = updateData.metaTitle;
    }
    if (updateData.metaDescription !== undefined) {
      updateObject.meta_description = updateData.metaDescription;
    }
    if (updateData.lowStockThreshold !== undefined) {
      updateObject.low_stock_threshold = updateData.lowStockThreshold;
    }
    if (updateData.preservedQuantity !== undefined) {
      updateObject.preserved_quantity = updateData.preservedQuantity;
    }

    // Update the product
    const { data: updatedProduct, error: updateError } = await supabase
      .from('retail_products')
      .update(updateObject)
      .eq('id', productId)
      .eq('retail_brand_id', retailBrand.id)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(`Failed to update product: ${updateError.message}`);
    }

    return updatedProduct;
  }

  async getPublicProducts(
    brandId?: string,
    sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular',
    priceRange?: 'under_50' | '50_100' | '100_200' | 'over_200',
    search?: string,
    page: number = 1,
    limit: number = 24,
    filter?: 'all' | 'sale' | 'best-products' | 'recent',
  ) {
    const supabase = this.supabaseService.getServiceClient();

    // Build query - only active products with approved brands, include images
    let query = supabase
      .from('retail_products')
      .select(`
        *,
        retail_brands!inner(id, display_name, logo_url, status),
        retail_product_images(id, image_url, display_order, is_primary)
      `)
      .eq('status', 'active')
      .eq('retail_brands.status', 'approved')
      .is('deleted_at', null);

    // Apply brand filter
    if (brandId) {
      query = query.eq('retail_brand_id', brandId);
    }

    // Apply tab filter
    if (filter) {
      switch (filter) {
        case 'sale':
          // Only products with sale_percentage > 0
          query = query.gt('sale_percentage', 0);
          break;
        case 'best-products':
          // TODO: Implement based on ratings/reviews when available
          // For now, just order by created date
          break;
        case 'recent':
          // Will be handled by default sorting
          break;
        case 'all':
        default:
          // No additional filter
          break;
      }
    }

    // Apply price range filter
    if (priceRange) {
      switch (priceRange) {
        case 'under_50':
          query = query.lt('retail_price', 50);
          break;
        case '50_100':
          query = query.gte('retail_price', 50).lte('retail_price', 100);
          break;
        case '100_200':
          query = query.gte('retail_price', 100).lte('retail_price', 200);
          break;
        case 'over_200':
          query = query.gt('retail_price', 200);
          break;
      }
    }

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query = query.or(
        `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'price_asc':
        query = query.order('retail_price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('retail_price', { ascending: false });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'popular':
        // TODO: Implement actual popularity logic based on sales/views
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Count total for pagination
    const { count, error: countError } = await supabase
      .from('retail_products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null);

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: products, error } = await query;

    if (error) {
      console.error('Error fetching public retail products:', error);
      return {
        products: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const totalPages = count ? Math.ceil(count / limit) : 0;

    return {
      products: products || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
      },
    };
  }

  async getProductBySlug(slug: string) {
    const supabase = this.supabaseService.getServiceClient();

    // Get product by slug with all related data
    const { data: products, error } = await supabase
      .from('retail_products')
      .select(`
        *,
        retail_brands!inner(id, brand_name, display_name, logo_url, status, description),
        retail_product_images(id, image_url, display_order, is_primary),
        retail_product_variations(id, variation_type, name, value, is_available, display_order),
        retail_product_inventory(id, combination_key, stock_quantity)
      `)
      .eq('slug', slug)
      .eq('status', 'active')
      .eq('retail_brands.status', 'approved')
      .is('deleted_at', null);

    if (error || !products || products.length === 0) {
      throw new NotFoundException('Product not found');
    }

    const product = products[0];

    // Get related products (same brand)
    const { data: relatedProducts } = await supabase
      .from('retail_products')
      .select(`
        id,
        name,
        slug,
        retail_price,
        sale_percentage,
        retail_brands!inner(display_name, status),
        retail_product_images(image_url, is_primary),
        retail_product_variations(id, variation_type, name, value, is_available, display_order)
      `)
      .eq('status', 'active')
      .eq('retail_brands.status', 'approved')
      .is('deleted_at', null)
      .neq('id', product.id)
      .eq('retail_brand_id', product.retail_brand_id)
      .order('created_at', { ascending: false })
      .limit(8);

    return {
      ...product,
      related_products: relatedProducts || [],
    };
  }

  // Get all inventory rows for a product (with preserved quantity)
  async getProductInventory(productId: string, userId: string) {
    const supabase = this.supabaseService.getServiceClient();
    // Get user's retail brand
    const { data: retailBrand, error: brandError } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();
    if (brandError || !retailBrand) throw new NotFoundException('Retail brand not found');
    // Check product ownership
    const { data: product, error: prodError } = await supabase
      .from('retail_products')
      .select('id')
      .eq('id', productId)
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .single();
    if (prodError || !product) throw new NotFoundException('Product not found');
    // Get inventory rows
    const { data: inventory, error: invError } = await supabase
      .from('retail_product_inventory')
      .select('*')
      .eq('product_id', productId);
    if (invError) throw new BadRequestException('Failed to fetch inventory');
    return inventory || [];
  }

  // Update preserved_quantity for inventory rows
  async updateInventoryPreservedQuantities(
    productId: string,
    userId: string,
    updates: { id: string; preservedQuantity: number }[]
  ) {
    console.log('DEBUG: updateInventoryPreservedQuantities called', { productId, userId, updates });
    const supabase = this.supabaseService.getServiceClient();
    // Get user's retail brand
    const { data: retailBrand, error: brandError } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();
    if (brandError || !retailBrand) {
      console.error('DEBUG: Retail brand not found', brandError);
      throw new NotFoundException('Retail brand not found');
    }
    // Check product ownership
    const { data: product, error: prodError } = await supabase
      .from('retail_products')
      .select('id')
      .eq('id', productId)
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .single();
    if (prodError || !product) {
      console.error('DEBUG: Product not found', prodError);
      throw new NotFoundException('Product not found');
    }
    // Validate and update each inventory row
    for (const update of updates) {
      // Get current row
      const { data: row, error: rowError } = await supabase
        .from('retail_product_inventory')
        .select('stock_quantity, preserved_quantity')
        .eq('id', update.id)
        .eq('product_id', productId)
        .single();
      if (rowError || !row) {
        console.error('DEBUG: Inventory row not found', rowError);
        throw new NotFoundException('Inventory row not found');
      }
      const prevPreserved = row.preserved_quantity;
      const stockQuantity = row.stock_quantity;
      const diff = update.preservedQuantity - prevPreserved;
      let newStockQuantity = stockQuantity;
      if (diff > 0) {
        // Increase in preserved, subtract from stock
        newStockQuantity = stockQuantity - diff;
      } else if (diff < 0) {
        // Decrease in preserved, add to stock
        newStockQuantity = stockQuantity + Math.abs(diff);
      }
      console.log('DEBUG: Inventory update values', {
        id: update.id,
        prevPreserved,
        stockQuantity,
        updatePreserved: update.preservedQuantity,
        diff,
        newStockQuantity
      });
      // Validation: preserved_quantity must not exceed new stock_quantity (after update)
      if (update.preservedQuantity < 0) {
        console.error('DEBUG: Preserved quantity negative', { update });
        throw new BadRequestException('Preserved quantity cannot be negative');
      }
      if (update.preservedQuantity > newStockQuantity) {
        console.error('DEBUG: Preserved quantity exceeds new stock quantity', {
          updatePreserved: update.preservedQuantity,
          newStockQuantity,
          id: update.id
        });
        throw new BadRequestException('Preserved quantity cannot exceed available stock after update');
      }
      console.log('DEBUG: Updating inventory row', { id: update.id, prevPreserved, preservedQuantity: update.preservedQuantity, newStockQuantity });
      const { error: updError } = await supabase
        .from('retail_product_inventory')
        .update({
          preserved_quantity: update.preservedQuantity,
          stock_quantity: newStockQuantity,
        })
        .eq('id', update.id)
        .eq('product_id', productId);
      if (updError) {
        console.error('DEBUG: Failed to update inventory row', updError);
        throw new BadRequestException('Failed to update preserved quantity');
      }
    }
    return { success: true };
  }
}
