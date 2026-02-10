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
    category?: string,
    subcategory?: string,
    inStock?: string,
    colors?: string,
    sizes?: string,
    dynamicFilters?: string,
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

    // Apply category filter
    if (category) {
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', category)
        .eq('is_active', true)
        .single();
      
      if (categoryError || !categoryData) {
        // If category not found, return empty results
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
      
      // Try to apply category filter, but don't fail if column doesn't exist
      // The error will be caught when the query executes
      query = query.eq('category_id', categoryData.id);
    }

    // Apply subcategory filter
    if (subcategory) {
      const { data: subcategoryData, error: subcategoryError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('slug', subcategory)
        .eq('is_active', true)
        .single();
      
      if (subcategoryError || !subcategoryData) {
        // If subcategory not found, return empty results
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
      
      // Try to apply subcategory filter, but don't fail if column doesn't exist
      // The error will be caught when the query executes
      query = query.eq('subcategory_id', subcategoryData.id);
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

    // Apply in-stock filter
    if (inStock === 'true') {
      query = query.gt('stock_quantity', 0);
    }

    // Apply colors/sizes filter via variation matching (AND when both present)
    let variationProductIds: string[] | null = null;
    if (colors?.trim() || sizes?.trim()) {
      const idsByColor: string[] = [];
      const idsBySize: string[] = [];

      if (colors?.trim()) {
        const colorList = colors.split(',').map((c) => c.trim()).filter(Boolean);
        if (colorList.length > 0) {
          const { data: colorProducts } = await supabase
            .from('retail_product_variations')
            .select('product_id')
            .in('name', colorList)
            .or('variation_type.eq.Color,variation_type.eq.color');
          idsByColor.push(...(colorProducts || []).map((p: any) => p.product_id));
        }
      }

      if (sizes?.trim()) {
        const sizeList = sizes.split(',').map((s) => s.trim()).filter(Boolean);
        if (sizeList.length > 0) {
          const { data: sizeProducts } = await supabase
            .from('retail_product_variations')
            .select('product_id')
            .in('name', sizeList)
            .or('variation_type.eq.Size,variation_type.eq.size');
          idsBySize.push(...(sizeProducts || []).map((p: any) => p.product_id));
        }
      }

      if (idsByColor.length > 0 && idsBySize.length > 0) {
        const colorSet = new Set(idsByColor);
        variationProductIds = [...new Set(idsBySize)].filter((id) => colorSet.has(id));
      } else if (idsByColor.length > 0) {
        variationProductIds = [...new Set(idsByColor)];
      } else if (idsBySize.length > 0) {
        variationProductIds = [...new Set(idsBySize)];
      }

      if (variationProductIds && variationProductIds.length > 0) {
        query = query.in('id', variationProductIds);
      } else {
        // Colors/sizes were requested but no matching products found
        return { products: [], pagination: { page, limit, total: 0, totalPages: 0 } };
      }
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
    let countQuery = supabase
      .from('retail_products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null);

    // Apply same filters to count query
    if (brandId) {
      countQuery = countQuery.eq('retail_brand_id', brandId);
    }

    if (category) {
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', category)
        .eq('is_active', true)
        .single();
      
      if (!categoryError && categoryData) {
        // Try to apply category filter, but don't fail if column doesn't exist
        // The error will be caught when the query executes
        countQuery = countQuery.eq('category_id', categoryData.id);
      }
    }

    if (subcategory) {
      const { data: subcategoryData, error: subcategoryError } = await supabase
        .from('subcategories')
        .select('id')
        .eq('slug', subcategory)
        .eq('is_active', true)
        .single();
      
      if (!subcategoryError && subcategoryData) {
        // Try to apply subcategory filter, but don't fail if column doesn't exist
        // The error will be caught when the query executes
        countQuery = countQuery.eq('subcategory_id', subcategoryData.id);
      }
    }

    // Apply tab filter to count
    if (filter) {
      switch (filter) {
        case 'sale':
          countQuery = countQuery.gt('sale_percentage', 0);
          break;
        case 'best-products':
        case 'recent':
        case 'all':
        default:
          break;
      }
    }

    // Apply price range to count
    if (priceRange) {
      switch (priceRange) {
        case 'under_50':
          countQuery = countQuery.lt('retail_price', 50);
          break;
        case '50_100':
          countQuery = countQuery.gte('retail_price', 50).lte('retail_price', 100);
          break;
        case '100_200':
          countQuery = countQuery.gte('retail_price', 100).lte('retail_price', 200);
          break;
        case 'over_200':
          countQuery = countQuery.gt('retail_price', 200);
          break;
      }
    }

    // Apply search to count
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      countQuery = countQuery.or(
        `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`
      );
    }

    // Apply in-stock filter to count
    if (inStock === 'true') {
      countQuery = countQuery.gt('stock_quantity', 0);
    }

    // Apply colors/sizes filter to count (use same variationProductIds from main query)
    if (variationProductIds && variationProductIds.length > 0) {
      countQuery = countQuery.in('id', variationProductIds);
    }

    const { count, error: countError } = await countQuery;

    // Check if error is due to missing category_id or subcategory_id column
    // If so, skip category filtering and return all products
    if (countError && countError.code === '42703' && 
        (countError.message?.includes('category_id') || countError.message?.includes('subcategory_id'))) {
      console.warn('Category filtering not available - category_id/subcategory_id columns do not exist.');
      console.warn('Please run migration: backend/database/migrations/retail/add_category_fields_to_retail_products.sql');
      console.warn('Continuing without category filter...');
      
      // Rebuild queries without category filters
      countQuery = supabase
        .from('retail_products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .is('deleted_at', null);
      
      if (brandId) {
        countQuery = countQuery.eq('retail_brand_id', brandId);
      }
      
      // Rebuild main query without category filters
      query = supabase
        .from('retail_products')
        .select(`
          *,
          retail_brands!inner(id, display_name, logo_url, status),
          retail_product_images(id, image_url, display_order, is_primary)
        `)
        .eq('status', 'active')
        .eq('retail_brands.status', 'approved')
        .is('deleted_at', null);
      
      if (brandId) {
        query = query.eq('retail_brand_id', brandId);
      }
      
      // Reapply other filters (filter, priceRange, search, sortBy)
      if (filter) {
        switch (filter) {
          case 'sale':
            query = query.gt('sale_percentage', 0);
            countQuery = countQuery.gt('sale_percentage', 0);
            break;
        }
      }
      
      if (priceRange) {
        switch (priceRange) {
          case 'under_50':
            query = query.lt('retail_price', 50);
            countQuery = countQuery.lt('retail_price', 50);
            break;
          case '50_100':
            query = query.gte('retail_price', 50).lte('retail_price', 100);
            countQuery = countQuery.gte('retail_price', 50).lte('retail_price', 100);
            break;
          case '100_200':
            query = query.gte('retail_price', 100).lte('retail_price', 200);
            countQuery = countQuery.gte('retail_price', 100).lte('retail_price', 200);
            break;
          case 'over_200':
            query = query.gt('retail_price', 200);
            countQuery = countQuery.gt('retail_price', 200);
            break;
        }
      }
      
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
        countQuery = countQuery.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
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
          query = query.order('created_at', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }
      
      // Re-execute count query
      const { count: retryCount, error: retryCountError } = await countQuery;
      if (retryCountError) {
        console.error('Error counting public retail products:', retryCountError);
      }
      
      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
      
      const { data: products, error: retryError } = await query;
      
      if (retryError) {
        console.error('Error fetching public retail products:', retryError);
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
      
      const totalPages = retryCount ? Math.ceil(retryCount / limit) : 0;
      
      return {
        products: products || [],
        pagination: {
          page,
          limit,
          total: retryCount || 0,
          totalPages,
        },
      };
    }
    
    if (countError) {
      console.error('Error counting public retail products:', countError);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: products, error } = await query;

    if (error) {
      // Check if error is due to missing category_id column
      if (error.code === '42703' && 
          (error.message?.includes('category_id') || error.message?.includes('subcategory_id'))) {
        console.warn('Category filtering not available - category_id/subcategory_id columns do not exist.');
        console.warn('Please run migration: backend/database/migrations/retail/add_category_fields_to_retail_products.sql');
        console.warn('Returning empty results for category filter...');
        
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

    // Aggregate inventory by combination_key (multiple rows may exist per key)
    const rawInventory = product.retail_product_inventory || [];
    const inventoryMap = new Map<string, { id: string; combination_key: string; stock_quantity: number }>();
    for (const row of rawInventory) {
      const existing = inventoryMap.get(row.combination_key);
      if (existing) {
        existing.stock_quantity += row.stock_quantity;
      } else {
        inventoryMap.set(row.combination_key, {
          id: row.id,
          combination_key: row.combination_key,
          stock_quantity: row.stock_quantity,
        });
      }
    }
    product.retail_product_inventory = Array.from(inventoryMap.values());

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

  // Get all inventory rows for a product, aggregated by combination_key
  // Auto-splits "default" inventory into per-variation rows when variations exist
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
    // Get all inventory rows
    const { data: inventory, error: invError } = await supabase
      .from('retail_product_inventory')
      .select('*')
      .eq('product_id', productId);
    if (invError) throw new BadRequestException('Failed to fetch inventory');

    const rows = inventory || [];

    // Check if we need to auto-split: inventory is only "default" but product has variations
    const allDefault = rows.length > 0 && rows.every(r => r.combination_key === 'default');
    if (allDefault) {
      // Fetch the product's variations
      const { data: variations } = await supabase
        .from('retail_product_variations')
        .select('variation_type, name')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });

      if (variations && variations.length > 0) {
        // Build combination keys from variations
        const combinationKeys = this.buildCombinationKeysFromVariations(variations);

        if (combinationKeys.length > 0) {
          // Calculate total stock from all default rows
          const totalStock = rows.reduce((sum, r) => sum + r.stock_quantity + r.preserved_quantity, 0);
          const stockPerCombination = Math.floor(totalStock / combinationKeys.length);
          const remainder = totalStock % combinationKeys.length;

          // Pick one default row to get source_wholesale_order_item_id
          const sourceId = rows[0].source_wholesale_order_item_id;

          // Delete all "default" rows
          await supabase
            .from('retail_product_inventory')
            .delete()
            .eq('product_id', productId)
            .eq('combination_key', 'default');

          // Insert new rows per combination
          const newRows: any[] = [];
          for (let i = 0; i < combinationKeys.length; i++) {
            const qty = stockPerCombination + (i < remainder ? 1 : 0);
            const { data: inserted } = await supabase
              .from('retail_product_inventory')
              .insert({
                product_id: productId,
                combination_key: combinationKeys[i],
                stock_quantity: qty,
                preserved_quantity: 0,
                source_wholesale_order_item_id: sourceId,
              })
              .select('*')
              .single();
            if (inserted) {
              newRows.push(inserted);
            }
          }

          // Return the newly created rows
          return newRows.map(r => ({
            combination_key: r.combination_key,
            stock_quantity: r.stock_quantity,
            preserved_quantity: r.preserved_quantity,
            row_count: 1,
          }));
        }
      }
    }
    
    // Aggregate by combination_key (multiple rows can exist per key due to different order sources)
    const aggregated = new Map<string, { combination_key: string; stock_quantity: number; preserved_quantity: number; row_count: number }>();
    for (const row of rows) {
      const key = row.combination_key;
      const existing = aggregated.get(key);
      if (existing) {
        existing.stock_quantity += row.stock_quantity;
        existing.preserved_quantity += row.preserved_quantity;
        existing.row_count += 1;
      } else {
        aggregated.set(key, {
          combination_key: key,
          stock_quantity: row.stock_quantity,
          preserved_quantity: row.preserved_quantity,
          row_count: 1,
        });
      }
    }
    
    return Array.from(aggregated.values());
  }

  // Build all combination keys from a product's variations
  private buildCombinationKeysFromVariations(
    variations: { variation_type: string; name: string }[]
  ): string[] {
    // Group by variation_type
    const byType = new Map<string, string[]>();
    for (const v of variations) {
      const existing = byType.get(v.variation_type) || [];
      existing.push(v.name);
      byType.set(v.variation_type, existing);
    }

    const types = Array.from(byType.keys()).sort((a, b) => a.localeCompare(b, 'en'));

    // Check for combined types (e.g. "color_size")
    // If a type contains "_" and includes "color", each variation name is already a combination
    const hasCombinedType = types.some(t => t.includes('_'));
    if (hasCombinedType && types.length === 1) {
      // Single combined type - each variation name IS a combination
      const type = types[0];
      const names = byType.get(type) || [];
      return names.map(name => `${type}:${name}`);
    }

    // Multiple separate types - create cross-product
    // e.g. color: [Black, White], size: [S, M, L] => color:Black|size:S, color:Black|size:M, ...
    const groups = types.map(type => ({
      type,
      names: byType.get(type) || [],
    }));

    // Cross-product helper
    const crossProduct = (groups: { type: string; names: string[] }[]): string[] => {
      if (groups.length === 0) return [];
      if (groups.length === 1) {
        return groups[0].names.map(name => `${groups[0].type}:${name}`);
      }

      const [first, ...rest] = groups;
      const restCombinations = crossProduct(rest);
      const result: string[] = [];
      for (const name of first.names) {
        const prefix = `${first.type}:${name}`;
        for (const suffix of restCombinations) {
          result.push(`${prefix}|${suffix}`);
        }
      }
      return result;
    };

    return crossProduct(groups);
  }

  // Update preserved_quantity for inventory rows (by combination_key)
  async updateInventoryPreservedQuantities(
    productId: string,
    userId: string,
    updates: { combinationKey: string; preservedQuantity: number }[]
  ) {
    const supabase = this.supabaseService.getServiceClient();
    // Get user's retail brand
    const { data: retailBrand, error: brandError } = await supabase
      .from('retail_brands')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .single();
    if (brandError || !retailBrand) {
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
      throw new NotFoundException('Product not found');
    }

    for (const update of updates) {
      if (update.preservedQuantity < 0) {
        throw new BadRequestException('Preserved quantity cannot be negative');
      }

      // Get all rows for this combination_key
      const { data: rows, error: rowError } = await supabase
        .from('retail_product_inventory')
        .select('id, stock_quantity, preserved_quantity')
        .eq('product_id', productId)
        .eq('combination_key', update.combinationKey)
        .order('created_at', { ascending: true });

      if (rowError || !rows || rows.length === 0) {
        throw new NotFoundException(`Inventory not found for combination: ${update.combinationKey}`);
      }

      // Calculate current aggregated totals
      const currentTotalStock = rows.reduce((sum, r) => sum + r.stock_quantity, 0);
      const currentTotalPreserved = rows.reduce((sum, r) => sum + r.preserved_quantity, 0);
      const grandTotal = currentTotalStock + currentTotalPreserved;
      const diff = update.preservedQuantity - currentTotalPreserved;

      // Validate: preserved cannot exceed total stock
      if (update.preservedQuantity > grandTotal) {
        throw new BadRequestException(`Preserved quantity (${update.preservedQuantity}) exceeds total stock (${grandTotal}) for ${update.combinationKey}`);
      }

      if (diff === 0) continue; // No change

      // Apply the diff to the first row (simplest distribution)
      const firstRow = rows[0];
      const newStockQuantity = firstRow.stock_quantity - diff;
      const newPreserved = firstRow.preserved_quantity + diff;

      const { error: updError } = await supabase
        .from('retail_product_inventory')
        .update({
          preserved_quantity: newPreserved,
          stock_quantity: newStockQuantity,
        })
        .eq('id', firstRow.id)
        .eq('product_id', productId);

      if (updError) {
        throw new BadRequestException('Failed to update preserved quantity');
      }
    }
    return { success: true };
  }
}
