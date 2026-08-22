import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { cached, TTL, clearCache } from '../../common/cache.util';

/**
 * Columns for PUBLIC retail LISTINGS (cards). Excludes heavy detail-only columns
 * (product_details JSONB, description, short_description, meta_*) that cards
 * never use — cuts per-row egress. Detail pages still fetch full rows.
 */
const RETAIL_LIST_COLUMNS =
  'id, retail_brand_id, category_id, subcategory_id, name, slug, sku, ' +
  'cost_price, retail_price, compare_at_price, sale_percentage, stock_quantity, ' +
  'track_inventory, low_stock_threshold, source_wholesale_product_id, ' +
  'source_wholesale_slug, is_auto_imported, is_exchangeable, total_sold, rating, ' +
  'review_count, view_count, status, created_at, updated_at';

@Injectable()
export class RetailProductsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getBrandCategories(brandId: string) {
   return cached(`retail:brand-categories:${brandId}`, TTL.medium, async () => {
    const supabase = this.supabaseService.getServiceClient();

    // Get distinct category_ids from brand's active products
    const { data: products, error } = await supabase
      .from('retail_products')
      .select('category_id')
      .eq('retail_brand_id', brandId)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (error || !products || products.length === 0) {
      return [];
    }

    const categoryIds = [
      ...new Set(products.map((p: any) => p.category_id).filter(Boolean)),
    ];
    if (categoryIds.length === 0) return [];

    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name, slug')
      .in('id', categoryIds)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (catError || !categories) return [];

    return categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    }));
   });
  }

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
        `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`,
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

  async toggleExchangeable(
    productId: string,
    userId: string,
    isExchangeable: boolean,
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

    // Verify the product belongs to the user's brand
    const { data: product, error: productError } = await supabase
      .from('retail_products')
      .select('id')
      .eq('id', productId)
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Product not found');
    }

    const { data: updated, error: updateError } = await supabase
      .from('retail_products')
      .update({ is_exchangeable: isExchangeable })
      .eq('id', productId)
      .select('id, is_exchangeable')
      .single();

    if (updateError) {
      throw new BadRequestException('Failed to update exchangeable status');
    }

    return updated;
  }

  async setAllExchangeable(userId: string, isExchangeable: boolean) {
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

    const { error: updateError } = await supabase
      .from('retail_products')
      .update({ is_exchangeable: isExchangeable })
      .eq('retail_brand_id', retailBrand.id)
      .is('deleted_at', null);

    if (updateError) {
      throw new BadRequestException(
        'Failed to update all products exchangeable status',
      );
    }

    return { success: true, count: 'all' };
  }

  async getProductById(productId: string, userId: string) {
    const supabase = this.supabaseService.getServiceClient();

    // Fetch retail brand and product in parallel
    const [brandResult, productResult] = await Promise.all([
      supabase
        .from('retail_brands')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .single(),
      supabase
        .from('retail_products')
        .select('*')
        .eq('id', productId)
        .is('deleted_at', null)
        .single(),
    ]);

    if (brandResult.error || !brandResult.data) {
      throw new NotFoundException('Retail brand not found');
    }

    if (productResult.error || !productResult.data) {
      console.error('Product fetch error:', productResult.error);
      throw new NotFoundException('Product not found');
    }

    const product = productResult.data;

    // Verify the product belongs to this user's brand
    if (product.retail_brand_id !== brandResult.data.id) {
      throw new NotFoundException('Product not found');
    }

    // Fetch recommended retail price from the source wholesale product
    if (product.source_wholesale_product_id) {
      const { data: wholesaleProduct } = await supabase
        .from('wholesale_products')
        .select('retail_price')
        .eq('id', product.source_wholesale_product_id)
        .single();

      if (
        wholesaleProduct?.retail_price &&
        parseFloat(wholesaleProduct.retail_price) > 0
      ) {
        product.recommended_retail_price = parseFloat(
          wholesaleProduct.retail_price,
        );
      }
    }

    // Hydrate images and variations so the edit form can prefill them.
    const [imagesResult, variationsResult] = await Promise.all([
      supabase
        .from('retail_product_images')
        .select('id, image_url, display_order, alt_text, is_primary')
        .eq('product_id', productId)
        .order('display_order', { ascending: true }),
      supabase
        .from('retail_product_variations')
        .select('id, variation_type, name, value, is_available, display_order')
        .eq('product_id', productId)
        .order('display_order', { ascending: true }),
    ]);

    product.images = imagesResult.data || [];
    product.variations = variationsResult.data || [];

    return product;
  }

  async updateProduct(
    productId: string,
    userId: string,
    updateData: {
      name?: string;
      slug?: string;
      sku?: string;
      description?: string;
      shortDescription?: string;
      retailPrice?: number;
      compareAtPrice?: number | null;
      salePercentage?: number;
      status?: 'draft' | 'active' | 'inactive';
      categoryId?: string | null;
      subcategoryId?: string | null;
      metaTitle?: string;
      metaDescription?: string;
      metaKeywords?: string;
      lowStockThreshold?: number;
      preservedQuantity?: number;
      productDetails?: Record<string, any> | null;
      images?: Array<{
        imageUrl: string;
        displayOrder?: number;
        altText?: string;
        isPrimary?: boolean;
      }>;
      variations?: Array<{
        variationType: string;
        name: string;
        value?: string;
        isAvailable?: boolean;
        displayOrder?: number;
      }>;
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
        throw new BadRequestException(
          'Retail price cannot be less than cost price',
        );
      }
    }

    // Validate sale percentage if provided
    if (updateData.salePercentage !== undefined) {
      if (updateData.salePercentage < 0 || updateData.salePercentage > 100) {
        throw new BadRequestException(
          'Sale percentage must be between 0 and 100',
        );
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
        throw new BadRequestException(
          'Preserved quantity cannot exceed total stock quantity',
        );
      }
    }

    // Validate status change
    if (updateData.status === 'active') {
      const retailPrice =
        updateData.retailPrice ?? existingProduct.retail_price;
      if (!retailPrice) {
        throw new BadRequestException(
          'Cannot set status to active without setting retail price',
        );
      }
    }

    // Validate slug (unique per brand, excluding this product)
    if (updateData.slug !== undefined) {
      const slug = (updateData.slug || '').trim();
      if (!slug) {
        throw new BadRequestException('Slug cannot be empty');
      }
      const { data: slugClash } = await supabase
        .from('retail_products')
        .select('id')
        .eq('retail_brand_id', retailBrand.id)
        .eq('slug', slug)
        .neq('id', productId)
        .is('deleted_at', null)
        .maybeSingle();
      if (slugClash) {
        throw new BadRequestException(
          'A product with this slug already exists in your store.',
        );
      }
    }

    // Validate SKU (globally unique, excluding this product)
    if (updateData.sku !== undefined && updateData.sku) {
      const { data: skuClash } = await supabase
        .from('retail_products')
        .select('id')
        .eq('sku', updateData.sku)
        .neq('id', productId)
        .maybeSingle();
      if (skuClash) {
        throw new BadRequestException('A product with this SKU already exists.');
      }
    }

    // Validate compare-at price
    if (
      updateData.compareAtPrice !== undefined &&
      updateData.compareAtPrice !== null &&
      updateData.compareAtPrice < 0
    ) {
      throw new BadRequestException('Compare-at price cannot be negative');
    }

    // Validate category if provided
    if (updateData.categoryId) {
      const { data: category } = await supabase
        .from('categories')
        .select('id, is_active')
        .eq('id', updateData.categoryId)
        .maybeSingle();
      if (!category) {
        throw new BadRequestException('Category not found');
      }
      if (!category.is_active) {
        throw new BadRequestException('Cannot use an inactive category');
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
    if (updateData.slug !== undefined) {
      updateObject.slug = updateData.slug.trim();
    }
    if (updateData.sku !== undefined) {
      updateObject.sku = updateData.sku ? updateData.sku.trim() : null;
    }
    if (updateData.compareAtPrice !== undefined) {
      updateObject.compare_at_price = updateData.compareAtPrice ?? null;
    }
    if (updateData.categoryId !== undefined) {
      updateObject.category_id = updateData.categoryId || null;
    }
    if (updateData.subcategoryId !== undefined) {
      updateObject.subcategory_id = updateData.subcategoryId || null;
    }
    if (updateData.metaKeywords !== undefined) {
      updateObject.meta_keywords = updateData.metaKeywords || null;
    }
    if (updateData.productDetails !== undefined) {
      updateObject.product_details = updateData.productDetails || null;
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
      throw new BadRequestException(
        `Failed to update product: ${updateError.message}`,
      );
    }

    // Replace images if provided (full ordered set).
    if (updateData.images !== undefined) {
      await supabase
        .from('retail_product_images')
        .delete()
        .eq('product_id', productId);

      if (updateData.images.length > 0) {
        const imageRecords = updateData.images.map((img, index) => ({
          product_id: productId,
          image_url: img.imageUrl,
          display_order: img.displayOrder ?? index,
          alt_text: img.altText || null,
          is_primary: img.isPrimary ?? index === 0,
        }));
        const { error: imagesError } = await supabase
          .from('retail_product_images')
          .insert(imageRecords);
        if (imagesError) {
          console.error('Failed to update retail product images:', imagesError);
        }
      }
    }

    // Replace variations if provided (full set).
    if (updateData.variations !== undefined) {
      await supabase
        .from('retail_product_variations')
        .delete()
        .eq('product_id', productId);

      if (updateData.variations.length > 0) {
        const variationRecords = updateData.variations.map((v, index) => ({
          product_id: productId,
          variation_type: v.variationType,
          name: v.name,
          value: v.value || null,
          is_available: v.isAvailable ?? true,
          display_order: v.displayOrder ?? index,
        }));
        const { error: variationsError } = await supabase
          .from('retail_product_variations')
          .insert(variationRecords);
        if (variationsError) {
          console.error(
            'Failed to update retail product variations:',
            variationsError,
          );
        }
      }
    }

    // Edited product affects public listings + category presence — drop caches.
    clearCache('retail:');
    clearCache('categories:');
    return this.getProductById(productId, userId);
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
   const cacheKey =
     'retail:public:' +
     JSON.stringify([
       brandId, sortBy, priceRange, search, page, limit, filter, category,
       subcategory, inStock, colors, sizes, dynamicFilters,
     ]);
   return cached(cacheKey, TTL.short, async () => {
    const supabase = this.supabaseService.getServiceClient();

    // Build query - only active products with approved brands, include images
    let query = supabase
      .from('retail_products')
      .select(
        `
        ${RETAIL_LIST_COLUMNS},
        retail_brands!inner(id, display_name, logo_url, status),
        retail_product_images(id, image_url, display_order, is_primary)
      `,
      )
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
        `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`,
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
        const colorList = colors
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        if (colorList.length > 0) {
          const { data: colorProducts } = await supabase
            .from('retail_product_variations')
            .select('product_id')
            .in('name', colorList)
            .or('variation_type.eq.Color,variation_type.eq.color');
          idsByColor.push(
            ...(colorProducts || []).map((p: any) => p.product_id),
          );
        }
      }

      if (sizes?.trim()) {
        const sizeList = sizes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
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
        variationProductIds = [...new Set(idsBySize)].filter((id) =>
          colorSet.has(id),
        );
      } else if (idsByColor.length > 0) {
        variationProductIds = [...new Set(idsByColor)];
      } else if (idsBySize.length > 0) {
        variationProductIds = [...new Set(idsBySize)];
      }

      if (variationProductIds && variationProductIds.length > 0) {
        query = query.in('id', variationProductIds);
      } else {
        // Colors/sizes were requested but no matching products found
        return {
          products: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        };
      }
    }

    // Apply dynamic filters from product_details JSONB
    let parsedDynamicFilters: Record<string, string[]> | undefined;
    if (dynamicFilters) {
      try {
        parsedDynamicFilters = JSON.parse(dynamicFilters);
      } catch (e) {
        console.warn('Failed to parse dynamicFilters:', e);
      }
    }

    if (parsedDynamicFilters && Object.keys(parsedDynamicFilters).length > 0) {
      for (const [filterKey, filterValues] of Object.entries(
        parsedDynamicFilters,
      )) {
        if (filterValues && filterValues.length > 0) {
          // Convert filterKey from camelCase to PascalCase for the JSON path
          const jsonPath =
            filterKey.charAt(0).toUpperCase() + filterKey.slice(1);

          // Array fields stored as JSON arrays in product_details
          const arrayFields = [
            'Features',
            'Ingredients',
            'Connectivity',
            'SpecialFeatures',
            'Dietary',
            'Allergens',
            'Usage',
            'SafetyStandards',
            'SpecialNeeds',
            'Certifications',
            'SpecialDiet',
            'SpecialEdition',
          ];

          if (arrayFields.includes(jsonPath)) {
            // For array fields, use contains (AND logic)
            for (const value of filterValues) {
              query = query.contains('product_details', {
                [jsonPath]: [value],
              });
            }
          } else {
            // For single-value fields, use OR logic
            const conditions = filterValues
              .map((v) => `product_details->>'${jsonPath}'.eq.${v}`)
              .join(',');
            query = query.or(conditions);
          }
        }
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
          countQuery = countQuery
            .gte('retail_price', 50)
            .lte('retail_price', 100);
          break;
        case '100_200':
          countQuery = countQuery
            .gte('retail_price', 100)
            .lte('retail_price', 200);
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
        `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`,
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

    // Apply dynamic filters to count query
    if (parsedDynamicFilters && Object.keys(parsedDynamicFilters).length > 0) {
      for (const [filterKey, filterValues] of Object.entries(
        parsedDynamicFilters,
      )) {
        if (filterValues && filterValues.length > 0) {
          const jsonPath =
            filterKey.charAt(0).toUpperCase() + filterKey.slice(1);
          const arrayFields = [
            'Features',
            'Ingredients',
            'Connectivity',
            'SpecialFeatures',
            'Dietary',
            'Allergens',
            'Usage',
            'SafetyStandards',
            'SpecialNeeds',
            'Certifications',
            'SpecialDiet',
            'SpecialEdition',
          ];

          if (arrayFields.includes(jsonPath)) {
            for (const value of filterValues) {
              countQuery = countQuery.contains('product_details', {
                [jsonPath]: [value],
              });
            }
          } else {
            const conditions = filterValues
              .map((v) => `product_details->>'${jsonPath}'.eq.${v}`)
              .join(',');
            countQuery = countQuery.or(conditions);
          }
        }
      }
    }

    const { count, error: countError } = await countQuery;

    // Check if error is due to missing category_id or subcategory_id column
    // If so, skip category filtering and return all products
    if (
      countError &&
      countError.code === '42703' &&
      (countError.message?.includes('category_id') ||
        countError.message?.includes('subcategory_id'))
    ) {
      console.warn(
        'Category filtering not available - category_id/subcategory_id columns do not exist.',
      );
      console.warn(
        'Please run migration: backend/database/migrations/retail/add_category_fields_to_retail_products.sql',
      );
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
        .select(
          `
          *,
          retail_brands!inner(id, display_name, logo_url, status),
          retail_product_images(id, image_url, display_order, is_primary)
        `,
        )
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
            countQuery = countQuery
              .gte('retail_price', 50)
              .lte('retail_price', 100);
            break;
          case '100_200':
            query = query.gte('retail_price', 100).lte('retail_price', 200);
            countQuery = countQuery
              .gte('retail_price', 100)
              .lte('retail_price', 200);
            break;
          case 'over_200':
            query = query.gt('retail_price', 200);
            countQuery = countQuery.gt('retail_price', 200);
            break;
        }
      }

      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.or(
          `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`,
        );
        countQuery = countQuery.or(
          `name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`,
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
          query = query.order('created_at', { ascending: false });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      // Re-execute count query
      const { count: retryCount, error: retryCountError } = await countQuery;
      if (retryCountError) {
        console.error(
          'Error counting public retail products:',
          retryCountError,
        );
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
      if (
        error.code === '42703' &&
        (error.message?.includes('category_id') ||
          error.message?.includes('subcategory_id'))
      ) {
        console.warn(
          'Category filtering not available - category_id/subcategory_id columns do not exist.',
        );
        console.warn(
          'Please run migration: backend/database/migrations/retail/add_category_fields_to_retail_products.sql',
        );
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
   });
  }

  async getProductBySlug(slug: string) {
   return cached(`retail:slug:${slug}`, TTL.short, async () => {
    const supabase = this.supabaseService.getServiceClient();

    // Get product by slug with all related data
    const { data: products, error } = await supabase
      .from('retail_products')
      .select(
        `
        *,
        retail_brands!inner(id, brand_name, display_name, logo_url, status, description),
        retail_product_images(id, image_url, display_order, is_primary),
        retail_product_variations(id, variation_type, name, value, is_available, display_order),
        retail_product_inventory(id, combination_key, stock_quantity)
      `,
      )
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
    const inventoryMap = new Map<
      string,
      { id: string; combination_key: string; stock_quantity: number }
    >();
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
      .select(
        `
        id,
        name,
        slug,
        retail_price,
        sale_percentage,
        retail_brands!inner(display_name, status),
        retail_product_images(image_url, is_primary),
        retail_product_variations(id, variation_type, name, value, is_available, display_order)
      `,
      )
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
   });
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
    if (brandError || !retailBrand)
      throw new NotFoundException('Retail brand not found');
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
    const allDefault =
      rows.length > 0 && rows.every((r) => r.combination_key === 'default');
    if (allDefault) {
      // Fetch the product's variations
      const { data: variations } = await supabase
        .from('retail_product_variations')
        .select('variation_type, name')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });

      if (variations && variations.length > 0) {
        // Build combination keys from variations
        const combinationKeys =
          this.buildCombinationKeysFromVariations(variations);

        if (combinationKeys.length > 0) {
          // Calculate total stock from all default rows
          const totalStock = rows.reduce(
            (sum, r) => sum + r.stock_quantity + r.preserved_quantity,
            0,
          );
          const stockPerCombination = Math.floor(
            totalStock / combinationKeys.length,
          );
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
          return newRows.map((r) => ({
            combination_key: r.combination_key,
            stock_quantity: r.stock_quantity,
            preserved_quantity: r.preserved_quantity,
            row_count: 1,
          }));
        }
      }
    }

    // Aggregate by combination_key (multiple rows can exist per key due to different order sources)
    const aggregated = new Map<
      string,
      {
        combination_key: string;
        stock_quantity: number;
        preserved_quantity: number;
        row_count: number;
      }
    >();
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
    variations: { variation_type: string; name: string }[],
  ): string[] {
    // Group by variation_type
    const byType = new Map<string, string[]>();
    for (const v of variations) {
      const existing = byType.get(v.variation_type) || [];
      existing.push(v.name);
      byType.set(v.variation_type, existing);
    }

    const types = Array.from(byType.keys()).sort((a, b) =>
      a.localeCompare(b, 'en'),
    );

    // Check for combined types (e.g. "color_size")
    // If a type contains "_" and includes "color", each variation name is already a combination
    const hasCombinedType = types.some((t) => t.includes('_'));
    if (hasCombinedType && types.length === 1) {
      // Single combined type - each variation name IS a combination
      const type = types[0];
      const names = byType.get(type) || [];
      return names.map((name) => `${type}:${name}`);
    }

    // Multiple separate types - create cross-product
    // e.g. color: [Black, White], size: [S, M, L] => color:Black|size:S, color:Black|size:M, ...
    const groups = types.map((type) => ({
      type,
      names: byType.get(type) || [],
    }));

    // Cross-product helper
    const crossProduct = (
      groups: { type: string; names: string[] }[],
    ): string[] => {
      if (groups.length === 0) return [];
      if (groups.length === 1) {
        return groups[0].names.map((name) => `${groups[0].type}:${name}`);
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
    updates: { combinationKey: string; preservedQuantity: number }[],
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
        throw new NotFoundException(
          `Inventory not found for combination: ${update.combinationKey}`,
        );
      }

      // Calculate current aggregated totals
      const currentTotalStock = rows.reduce(
        (sum, r) => sum + r.stock_quantity,
        0,
      );
      const currentTotalPreserved = rows.reduce(
        (sum, r) => sum + r.preserved_quantity,
        0,
      );
      const grandTotal = currentTotalStock + currentTotalPreserved;
      const diff = update.preservedQuantity - currentTotalPreserved;

      // Validate: preserved cannot exceed total stock
      if (update.preservedQuantity > grandTotal) {
        throw new BadRequestException(
          `Preserved quantity (${update.preservedQuantity}) exceeds total stock (${grandTotal}) for ${update.combinationKey}`,
        );
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

  // ---------------------------------------------------------------------------
  // Import from own wholesale catalog into own retail store
  // ---------------------------------------------------------------------------

  /**
   * Lists the wholesale products owned by this user (via their approved
   * wholesale brand) so they can be cross-listed into their retail store.
   * Each item is flagged with whether it has already been imported.
   */
  async getImportableWholesaleProducts(userId: string) {
    const supabase = this.supabaseService.getServiceClient();

    // The user must own both an approved wholesale brand (source) and an
    // approved retail brand (destination). If either is missing there is
    // nothing to import — return an empty list with the reason.
    const [wholesaleBrandRes, retailBrandRes] = await Promise.all([
      supabase
        .from('wholesale_brands')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle(),
      supabase
        .from('retail_brands')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle(),
    ]);

    const wholesaleBrand = wholesaleBrandRes.data;
    const retailBrand = retailBrandRes.data;

    if (!wholesaleBrand) {
      return {
        products: [],
        hasWholesaleBrand: false,
        hasRetailBrand: !!retailBrand,
      };
    }
    if (!retailBrand) {
      return {
        products: [],
        hasWholesaleBrand: true,
        hasRetailBrand: false,
      };
    }

    // Load the wholesale products for this brand.
    const { data: products, error: productsError } = await supabase
      .from('wholesale_products')
      .select(
        'id, name, slug, sku, wholesale_price, retail_price, status, stock_quantity',
      )
      .eq('wholesale_brand_id', wholesaleBrand.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (productsError) {
      throw new BadRequestException(
        `Failed to load wholesale products: ${productsError.message || 'Unknown error'}`,
      );
    }

    const productIds = (products || []).map((p) => p.id);
    if (productIds.length === 0) {
      return { products: [], hasWholesaleBrand: true, hasRetailBrand: true };
    }

    // Fetch pack sizes, primary images, and existing retail imports in parallel.
    const [packsRes, imagesRes, importedRes] = await Promise.all([
      supabase
        .from('wholesale_product_pack_sizes')
        .select('id, product_id, label, quantity, pack_price, unit_price')
        .in('product_id', productIds)
        .order('display_order', { ascending: true }),
      supabase
        .from('wholesale_product_images')
        .select('product_id, image_url, is_primary, display_order')
        .in('product_id', productIds)
        .order('display_order', { ascending: true }),
      supabase
        .from('retail_products')
        .select('id, slug, source_wholesale_product_id')
        .eq('retail_brand_id', retailBrand.id)
        .in('source_wholesale_product_id', productIds)
        .is('deleted_at', null),
    ]);

    const packsByProduct = new Map<string, any[]>();
    (packsRes.data || []).forEach((pack) => {
      const list = packsByProduct.get(pack.product_id) || [];
      list.push({
        id: pack.id,
        label: pack.label,
        quantity: pack.quantity,
        packPrice: pack.pack_price,
        unitPrice:
          pack.unit_price ??
          (pack.quantity ? Number(pack.pack_price) / pack.quantity : null),
      });
      packsByProduct.set(pack.product_id, list);
    });

    const imageByProduct = new Map<string, string>();
    (imagesRes.data || []).forEach((img) => {
      if (!imageByProduct.has(img.product_id)) {
        imageByProduct.set(img.product_id, img.image_url);
      }
      if (img.is_primary) {
        imageByProduct.set(img.product_id, img.image_url);
      }
    });

    const importedByProduct = new Map<string, { id: string; slug: string }>();
    (importedRes.data || []).forEach((rp) => {
      if (rp.source_wholesale_product_id) {
        importedByProduct.set(rp.source_wholesale_product_id, {
          id: rp.id,
          slug: rp.slug,
        });
      }
    });

    const result = (products || []).map((p) => {
      const packs = packsByProduct.get(p.id) || [];
      const imported = importedByProduct.get(p.id) || null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        wholesalePrice: p.wholesale_price,
        suggestedRetailPrice: p.retail_price,
        status: p.status,
        stockQuantity: p.stock_quantity,
        primaryImage: imageByProduct.get(p.id) || null,
        packSizes: packs,
        hasPacks: packs.length > 0,
        alreadyImported: !!imported,
        importedRetailProduct: imported,
      };
    });

    return { products: result, hasWholesaleBrand: true, hasRetailBrand: true };
  }

  /**
   * Imports one of the user's own wholesale products into their retail store.
   * Pack-based products import in whole packs (total units = packs * pack size);
   * non-pack products import as single units. The chosen retail price must be
   * at least the per-unit cost.
   */
  async importFromWholesale(
    userId: string,
    dto: {
      wholesaleProductId: string;
      packSizeId?: string;
      numberOfPacks?: number;
      quantity?: number;
      retailPrice: number;
      name?: string;
      salePercentage?: number;
      compareAtPrice?: number;
      status?: 'draft' | 'active';
    },
  ) {
    const supabase = this.supabaseService.getServiceClient();

    // Verify ownership of both marketplaces.
    const [wholesaleBrandRes, retailBrandRes] = await Promise.all([
      supabase
        .from('wholesale_brands')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle(),
      supabase
        .from('retail_brands')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .maybeSingle(),
    ]);

    if (!wholesaleBrandRes.data) {
      throw new BadRequestException(
        'You need an approved wholesale brand to import wholesale products.',
      );
    }
    if (!retailBrandRes.data) {
      throw new BadRequestException(
        'You need an approved retail store to import products into retail.',
      );
    }
    const wholesaleBrandId = wholesaleBrandRes.data.id;
    const retailBrandId = retailBrandRes.data.id;

    // Load the source wholesale product and verify the user owns it.
    const { data: product, error: productError } = await supabase
      .from('wholesale_products')
      .select('*')
      .eq('id', dto.wholesaleProductId)
      .is('deleted_at', null)
      .maybeSingle();

    if (productError) {
      throw new BadRequestException(
        `Failed to load wholesale product: ${productError.message || 'Unknown error'}`,
      );
    }
    if (!product) {
      throw new NotFoundException('Wholesale product not found.');
    }
    if (product.wholesale_brand_id !== wholesaleBrandId) {
      throw new BadRequestException(
        'You can only import products from your own wholesale brand.',
      );
    }

    // Block duplicate imports (one retail listing per source wholesale product).
    const { data: existing } = await supabase
      .from('retail_products')
      .select('id, slug, name')
      .eq('retail_brand_id', retailBrandId)
      .eq('source_wholesale_product_id', product.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      throw new BadRequestException(
        `"${product.name}" is already in your retail store. Edit the existing listing instead.`,
      );
    }

    // Load pack sizes to decide pack-based vs single-unit import.
    const { data: packSizes } = await supabase
      .from('wholesale_product_pack_sizes')
      .select('id, quantity, pack_price, unit_price')
      .eq('product_id', product.id);

    let unitCost: number;
    let totalUnits: number;
    let chosenPackSizeId: string | null = null;

    if (packSizes && packSizes.length > 0) {
      // Pack-based product: a pack must be chosen and imported in whole packs.
      if (!dto.packSizeId) {
        throw new BadRequestException(
          'Please choose which pack to import for this product.',
        );
      }
      const pack = packSizes.find((p) => p.id === dto.packSizeId);
      if (!pack) {
        throw new BadRequestException(
          'The selected pack does not belong to this product.',
        );
      }
      const packQuantity = Number(pack.quantity);
      if (!packQuantity || packQuantity < 1) {
        throw new BadRequestException('The selected pack has an invalid size.');
      }
      const numberOfPacks = dto.numberOfPacks ?? 1;
      if (!Number.isInteger(numberOfPacks) || numberOfPacks < 1) {
        throw new BadRequestException(
          'Number of packs must be a whole number of at least 1.',
        );
      }
      chosenPackSizeId = pack.id;
      unitCost =
        pack.unit_price != null
          ? Number(pack.unit_price)
          : Number(pack.pack_price) / packQuantity;
      totalUnits = numberOfPacks * packQuantity;
    } else {
      // Non-pack product: import a chosen quantity of single units.
      const quantity = dto.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException(
          'Quantity must be a whole number of at least 1.',
        );
      }
      unitCost = Number(product.wholesale_price) || 0;
      totalUnits = quantity;
    }

    // Enforce the price floor: never sell below unit cost.
    if (dto.retailPrice == null || dto.retailPrice <= 0) {
      throw new BadRequestException('Retail price must be greater than 0.');
    }
    if (dto.retailPrice < unitCost) {
      throw new BadRequestException(
        `Retail price (${dto.retailPrice}) cannot be less than the unit cost (${unitCost.toFixed(2)}).`,
      );
    }

    if (dto.salePercentage != null) {
      if (dto.salePercentage < 0 || dto.salePercentage > 100) {
        throw new BadRequestException(
          'Sale percentage must be between 0 and 100.',
        );
      }
    }

    // Build a unique slug within the retail brand (append entropy on clash,
    // e.g. when a previously-imported listing was soft-deleted).
    const baseSlug = product.slug || 'product';
    let slug = baseSlug;
    const { data: slugClash } = await supabase
      .from('retail_products')
      .select('id')
      .eq('retail_brand_id', retailBrandId)
      .eq('slug', slug)
      .maybeSingle();
    if (slugClash) {
      slug = `${baseSlug}-${randomSuffix(6)}`;
    }

    // Generate a unique SKU (retail SKUs are globally unique).
    const sku = `RTL-${randomSuffix(8).toUpperCase()}`;

    const insertData: any = {
      retail_brand_id: retailBrandId,
      name: (dto.name && dto.name.trim()) || product.name,
      slug,
      sku,
      description: product.description || null,
      short_description: product.short_description || null,
      category_id: product.category_id || null,
      subcategory_id: product.subcategory_id || null,
      cost_price: unitCost,
      retail_price: dto.retailPrice,
      compare_at_price:
        dto.compareAtPrice ?? product.retail_price ?? null,
      sale_percentage: dto.salePercentage ?? 0,
      stock_quantity: totalUnits,
      track_inventory: true,
      source_wholesale_product_id: product.id,
      source_wholesale_slug: product.slug,
      is_auto_imported: false,
      status: dto.status || 'draft',
      meta_title: product.meta_title || null,
      meta_description: product.meta_description || null,
      product_details: product.product_details || null,
    };

    const { data: retailProduct, error: insertError } = await supabase
      .from('retail_products')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      throw new BadRequestException(
        `Failed to import product: ${insertError.message || 'Unknown error'}`,
      );
    }

    // Copy images.
    const { data: images } = await supabase
      .from('wholesale_product_images')
      .select('image_url, display_order, alt_text, is_primary')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    if (images && images.length > 0) {
      const imageRecords = images.map((img, index) => ({
        product_id: retailProduct.id,
        image_url: img.image_url,
        display_order: img.display_order ?? index,
        alt_text: img.alt_text || null,
        is_primary: img.is_primary ?? index === 0,
      }));
      const { error: imagesError } = await supabase
        .from('retail_product_images')
        .insert(imageRecords);
      if (imagesError) {
        console.error('Failed to copy product images on import:', imagesError);
      }
    }

    // Copy product-level variations, then the chosen pack's variations.
    const variationRecords: any[] = [];
    const seenVariations = new Set<string>();

    const { data: productVariations } = await supabase
      .from('wholesale_product_variations')
      .select('variation_type, name, value, is_available, display_order')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    (productVariations || []).forEach((v) => {
      const key = `${v.variation_type}:${v.name}`;
      if (seenVariations.has(key)) return;
      seenVariations.add(key);
      variationRecords.push({
        product_id: retailProduct.id,
        variation_type: v.variation_type,
        name: v.name,
        value: v.value || null,
        is_available: v.is_available ?? true,
        display_order: v.display_order ?? 0,
      });
    });

    if (chosenPackSizeId) {
      const { data: packVariations } = await supabase
        .from('wholesale_pack_variations')
        .select('variation_type, name, value, is_available, display_order')
        .eq('pack_size_id', chosenPackSizeId)
        .order('display_order', { ascending: true });

      (packVariations || []).forEach((v) => {
        const key = `${v.variation_type}:${v.name}`;
        if (seenVariations.has(key)) return;
        seenVariations.add(key);
        variationRecords.push({
          product_id: retailProduct.id,
          variation_type: v.variation_type,
          name: v.name,
          value: v.value || null,
          is_available: v.is_available ?? true,
          display_order: v.display_order ?? 0,
        });
      });
    }

    if (variationRecords.length > 0) {
      const { error: variationsError } = await supabase
        .from('retail_product_variations')
        .insert(variationRecords);
      if (variationsError) {
        console.error('Failed to copy variations on import:', variationsError);
      }
    }

    // Distribute stock into retail_product_inventory by combination.
    let combinationKeys: string[] = [];
    if (chosenPackSizeId) {
      const { data: stockMatrix } = await supabase
        .from('wholesale_pack_stock_matrix')
        .select('combination_key, stock_quantity')
        .eq('pack_size_id', chosenPackSizeId)
        .gt('stock_quantity', 0);
      combinationKeys = [
        ...new Set((stockMatrix || []).map((s) => s.combination_key)),
      ];
    }

    const inventoryRecords =
      combinationKeys.length > 0
        ? combinationKeys.map((key) => ({
            product_id: retailProduct.id,
            combination_key: key,
            stock_quantity: Math.floor(totalUnits / combinationKeys.length),
            source_wholesale_order_item_id: null,
          }))
        : [
            {
              product_id: retailProduct.id,
              combination_key: 'default',
              stock_quantity: totalUnits,
              source_wholesale_order_item_id: null,
            },
          ];

    const { error: inventoryError } = await supabase
      .from('retail_product_inventory')
      .insert(inventoryRecords);
    if (inventoryError) {
      console.error('Failed to seed inventory on import:', inventoryError);
    }

    clearCache('retail:');
    clearCache('categories:');
    return this.getProductById(retailProduct.id, userId);
  }
}

/**
 * Short random alphanumeric suffix for building collision-resistant slugs/SKUs.
 */
function randomSuffix(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
