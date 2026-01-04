import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createProduct(createProductDto: CreateProductDto, userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify user has an approved brand
    const { data: brand, error: brandError } = await serviceClient
      .from('wholesale_brands')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();

    if (brandError) {
      throw new BadRequestException(
        `Failed to verify brand: ${brandError.message || 'Unknown error'}`,
      );
    }

    if (!brand) {
      throw new UnauthorizedException(
        'You must have an approved brand to create products.',
      );
    }

    // Check if slug already exists for this brand
    const { data: existingProduct, error: slugCheckError } = await serviceClient
      .from('wholesale_products')
      .select('id')
      .eq('wholesale_brand_id', brand.id)
      .eq('slug', createProductDto.slug)
      .maybeSingle();

    if (slugCheckError) {
      throw new BadRequestException(
        `Failed to check slug availability: ${slugCheckError.message || 'Unknown error'}`,
      );
    }

    if (existingProduct) {
      throw new BadRequestException(
        'A product with this slug already exists for your brand. Please use a different slug.',
      );
    }

    // Check if SKU already exists (if provided)
    if (createProductDto.sku) {
      const { data: existingSku, error: skuCheckError } = await serviceClient
        .from('wholesale_products')
        .select('id')
        .eq('sku', createProductDto.sku)
        .maybeSingle();

      if (skuCheckError) {
        throw new BadRequestException(
          `Failed to check SKU availability: ${skuCheckError.message || 'Unknown error'}`,
        );
      }

      if (existingSku) {
        throw new BadRequestException('A product with this SKU already exists.');
      }
    }

    // Verify category exists and is active
    const { data: category, error: categoryError } = await serviceClient
      .from('categories')
      .select('id, is_active')
      .eq('id', createProductDto.categoryId)
      .maybeSingle();

    if (categoryError) {
      throw new BadRequestException(
        `Failed to verify category: ${categoryError.message || 'Unknown error'}`,
      );
    }

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    if (!category.is_active) {
      throw new BadRequestException('Cannot create product with inactive category.');
    }

    // Verify subcategory if provided
    if (createProductDto.subcategoryId) {
      const { data: subcategory, error: subcategoryError } = await serviceClient
        .from('subcategories')
        .select('id, is_active')
        .eq('id', createProductDto.subcategoryId)
        .maybeSingle();

      if (subcategoryError) {
        throw new BadRequestException(
          `Failed to verify subcategory: ${subcategoryError.message || 'Unknown error'}`,
        );
      }

      if (!subcategory) {
        throw new NotFoundException('Subcategory not found.');
      }

      if (!subcategory.is_active) {
        throw new BadRequestException('Cannot create product with inactive subcategory.');
      }
    }

    // Prepare product data for insertion
    const productData: any = {
      wholesale_brand_id: brand.id,
      category_id: createProductDto.categoryId,
      subcategory_id: createProductDto.subcategoryId || null,
      name: createProductDto.name,
      slug: createProductDto.slug,
      sku: createProductDto.sku || null,
      description: createProductDto.description || null,
      short_description: createProductDto.shortDescription || null,
      wholesale_price: createProductDto.wholesalePrice,
      sale_percentage: createProductDto.salePercentage || 0,
      min_order_quantity: createProductDto.minOrderQuantity,
      min_order_amount: createProductDto.minOrderAmount || null,
      stock_quantity: createProductDto.stockQuantity,
      track_inventory: createProductDto.trackInventory,
      low_stock_threshold: createProductDto.lowStockThreshold || null,
      status: createProductDto.status || 'draft',
      is_featured: createProductDto.isFeatured || false,
      condition: createProductDto.condition || 'new',
      shipping_info: createProductDto.shippingInfo || null,
      is_shipping_free: createProductDto.isShippingFree || false,
      shipping_cost: createProductDto.shippingCost || null,
      estimated_delivery_days: createProductDto.estimatedDeliveryDays || null,
      product_details: createProductDto.productDetails || null,
      size_chart: createProductDto.sizeChart || null,
      meta_title: createProductDto.metaTitle || null,
      meta_description: createProductDto.metaDescription || null,
      meta_keywords: createProductDto.metaKeywords || null,
    };

    // Create product
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .insert(productData)
      .select()
      .single();

    if (productError) {
      if (productError.code === '23505' || productError.message?.includes('unique')) {
        throw new BadRequestException('Product slug or SKU already exists.');
      }
      throw new BadRequestException(
        `Failed to create product: ${productError.message || 'Unknown error'}`,
      );
    }

    // Create images if provided
    if (createProductDto.images && createProductDto.images.length > 0) {
      const imageRecords = createProductDto.images.map((img, index) => ({
        product_id: product.id,
        image_url: img.imageUrl,
        display_order: img.displayOrder !== undefined ? img.displayOrder : index,
        alt_text: img.altText || null,
        is_primary: img.isPrimary || index === 0,
      }));

      const { error: imagesError } = await serviceClient
        .from('wholesale_product_images')
        .insert(imageRecords);

      if (imagesError) {
        // Log error but don't fail product creation
        console.error('Failed to create product images:', imagesError);
      }
    }

    // Create variations if provided
    if (createProductDto.variations && createProductDto.variations.length > 0) {
      const variationRecords = createProductDto.variations.map((variation, index) => ({
        product_id: product.id,
        variation_type: variation.variationType,
        name: variation.name,
        value: variation.value || null,
        price_override: variation.priceOverride || null,
        stock_quantity: variation.stockQuantity || null,
        track_stock: variation.trackStock,
        is_available: variation.isAvailable,
        display_order: variation.displayOrder !== undefined ? variation.displayOrder : index,
      }));

      const { error: variationsError } = await serviceClient
        .from('wholesale_product_variations')
        .insert(variationRecords);

      if (variationsError) {
        console.error('Failed to create product variations:', variationsError);
      }
    }

    // Create pack sizes if provided
    if (createProductDto.packSizes && createProductDto.packSizes.length > 0) {
      for (let index = 0; index < createProductDto.packSizes.length; index++) {
        const pack = createProductDto.packSizes[index];

        // Insert pack size
        const { data: packSize, error: packSizeError } = await serviceClient
          .from('wholesale_product_pack_sizes')
          .insert({
            product_id: product.id,
            label: pack.label,
            quantity: pack.quantity,
            pack_price: pack.packPrice,
            unit_price: pack.unitPrice || pack.packPrice / pack.quantity,
            is_popular: pack.isPopular,
            is_best_value: pack.isBestValue,
            is_available: pack.isAvailable,
            display_order: pack.displayOrder !== undefined ? pack.displayOrder : index,
          })
          .select()
          .single();

        if (packSizeError) {
          console.error('Failed to create product pack size:', packSizeError);
          continue;
        }

        // Insert pack variations if provided
        if (pack.variations && pack.variations.length > 0) {
          const variationRecords = pack.variations.map((variation, vIndex) => ({
            pack_size_id: packSize.id,
            variation_type: variation.variationType,
            name: variation.name,
            value: variation.value || null,
            image_index: variation.imageIndex !== undefined ? variation.imageIndex : null,
            is_available: variation.isAvailable,
            display_order: variation.displayOrder !== undefined ? variation.displayOrder : vIndex,
          }));

          const { error: variationsError } = await serviceClient
            .from('wholesale_pack_variations')
            .insert(variationRecords);

          if (variationsError) {
            console.error('Failed to create pack variations:', variationsError);
          }
        }

        // Insert stock matrix if provided
        if (pack.stockMatrix && Object.keys(pack.stockMatrix).length > 0) {
          const stockMatrixRecords = Object.entries(pack.stockMatrix).map(([key, quantity]) => ({
            pack_size_id: packSize.id,
            combination_key: key,
            stock_quantity: quantity,
          }));

          const { error: stockMatrixError } = await serviceClient
            .from('wholesale_pack_stock_matrix')
            .insert(stockMatrixRecords);

          if (stockMatrixError) {
            console.error('Failed to create stock matrix:', stockMatrixError);
          }
        }
      }
    }

    // Fetch complete product with relations
    return this.getProductById(product.id, userId);
  }

  async getProductById(productId: string, userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get product with brand info
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .select(`
        *,
        wholesale_brands!inner(user_id, status)
      `)
      .eq('id', productId)
      .single();

    if (productError) {
      throw new NotFoundException('Product not found.');
    }

    // Verify user owns the brand
    if (product.wholesale_brands.user_id !== userId) {
      throw new UnauthorizedException('You do not have permission to access this product.');
    }

    // Get images
    const { data: images } = await serviceClient
      .from('wholesale_product_images')
      .select('*')
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    // Get variations
    const { data: variations } = await serviceClient
      .from('wholesale_product_variations')
      .select('*')
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    // Get pack sizes
    const { data: packSizes } = await serviceClient
      .from('wholesale_product_pack_sizes')
      .select('*')
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    // Get pack variations and stock matrix for each pack size
    const packSizeIds = (packSizes || []).map(p => p.id);
    let packVariations: any[] = [];
    let stockMatrix: any[] = [];

    if (packSizeIds.length > 0) {
      const { data: variations } = await serviceClient
        .from('wholesale_pack_variations')
        .select('*')
        .in('pack_size_id', packSizeIds)
        .order('display_order', { ascending: true });

      packVariations = variations || [];

      const { data: matrix } = await serviceClient
        .from('wholesale_pack_stock_matrix')
        .select('*')
        .in('pack_size_id', packSizeIds);

      stockMatrix = matrix || [];
    }

    // Map pack variations and stock matrix to pack sizes
    const packSizesWithDetails = (packSizes || []).map(pack => ({
      ...pack,
      variations: packVariations.filter(v => v.pack_size_id === pack.id),
      stockMatrix: stockMatrix
        .filter(s => s.pack_size_id === pack.id)
        .reduce((acc, item) => {
          acc[item.combination_key] = item.stock_quantity;
          return acc;
        }, {} as Record<string, number>),
    }));

    return {
      ...product,
      images: images || [],
      variations: variations || [],
      packSizes: packSizesWithDetails,
    };
  }

  async getMyProducts(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
    categoryId?: string,
    status?: string,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get user's brand
    const { data: brand, error: brandError } = await serviceClient
      .from('wholesale_brands')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (brandError || !brand) {
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

    const offset = (page - 1) * limit;

    // Build query for products count
    let countQuery = serviceClient
      .from('wholesale_products')
      .select('*', { count: 'exact', head: true })
      .eq('wholesale_brand_id', brand.id)
      .is('deleted_at', null);

    // Build query for products
    let productsQuery = serviceClient
      .from('wholesale_products')
      .select('*')
      .eq('wholesale_brand_id', brand.id)
      .is('deleted_at', null);

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      countQuery = countQuery.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
      productsQuery = productsQuery.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
    }

    // Apply category filter
    if (categoryId && categoryId !== 'all') {
      countQuery = countQuery.eq('category_id', categoryId);
      productsQuery = productsQuery.eq('category_id', categoryId);
    }

    // Apply status filter
    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status);
      productsQuery = productsQuery.eq('status', status);
    }

    // Get products count
    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new BadRequestException(
        `Failed to count products: ${countError.message || 'Unknown error'}`,
      );
    }

    // Get products
    const { data: products, error: productsError } = await productsQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (productsError) {
      throw new BadRequestException(
        `Failed to fetch products: ${productsError.message || 'Unknown error'}`,
      );
    }

    // Get images for all products in one query
    const productIds = (products || []).map(p => p.id);
    let productImages: any[] = [];
    
    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });
      
      productImages = images || [];
    }

    // Map images to products
    const productsWithImages = (products || []).map(product => ({
      ...product,
      images: productImages.filter(img => img.product_id === product.id),
    }));

    return {
      products: productsWithImages,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  async updateProduct(
    productId: string,
    updateProductDto: UpdateProductDto,
    userId: string,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify product exists and user owns it
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .select(`
        *,
        wholesale_brands!inner(user_id, status)
      `)
      .eq('id', productId)
      .single();

    if (productError) {
      throw new NotFoundException('Product not found.');
    }

    if (product.wholesale_brands.user_id !== userId) {
      throw new UnauthorizedException('You do not have permission to update this product.');
    }

    // Prepare update data
    const updateData: any = {};

    if (updateProductDto.name !== undefined) updateData.name = updateProductDto.name;
    if (updateProductDto.slug !== undefined) {
      // Check slug uniqueness
      const { data: existingProduct } = await serviceClient
        .from('wholesale_products')
        .select('id')
        .eq('wholesale_brand_id', product.wholesale_brand_id)
        .eq('slug', updateProductDto.slug)
        .neq('id', productId)
        .maybeSingle();

      if (existingProduct) {
        throw new BadRequestException('A product with this slug already exists for your brand.');
      }

      updateData.slug = updateProductDto.slug;
    }
    if (updateProductDto.sku !== undefined) {
      // Check SKU uniqueness
      if (updateProductDto.sku) {
        const { data: existingSku } = await serviceClient
          .from('wholesale_products')
          .select('id')
          .eq('sku', updateProductDto.sku)
          .neq('id', productId)
          .maybeSingle();

        if (existingSku) {
          throw new BadRequestException('A product with this SKU already exists.');
        }
      }
      updateData.sku = updateProductDto.sku || null;
    }
    if (updateProductDto.description !== undefined) updateData.description = updateProductDto.description || null;
    if (updateProductDto.shortDescription !== undefined) updateData.short_description = updateProductDto.shortDescription || null;
    if (updateProductDto.categoryId !== undefined) {
      // Verify category
      const { data: category } = await serviceClient
        .from('categories')
        .select('id, is_active')
        .eq('id', updateProductDto.categoryId)
        .maybeSingle();

      if (!category) {
        throw new NotFoundException('Category not found.');
      }
      if (!category.is_active) {
        throw new BadRequestException('Cannot use inactive category.');
      }
      updateData.category_id = updateProductDto.categoryId;
    }
    if (updateProductDto.subcategoryId !== undefined) {
      if (updateProductDto.subcategoryId) {
        const { data: subcategory } = await serviceClient
          .from('subcategories')
          .select('id, is_active')
          .eq('id', updateProductDto.subcategoryId)
          .maybeSingle();

        if (!subcategory) {
          throw new NotFoundException('Subcategory not found.');
        }
        if (!subcategory.is_active) {
          throw new BadRequestException('Cannot use inactive subcategory.');
        }
      }
      updateData.subcategory_id = updateProductDto.subcategoryId || null;
    }
    if (updateProductDto.wholesalePrice !== undefined) updateData.wholesale_price = updateProductDto.wholesalePrice;
    if (updateProductDto.salePercentage !== undefined) updateData.sale_percentage = updateProductDto.salePercentage || 0;
    if (updateProductDto.minOrderQuantity !== undefined) updateData.min_order_quantity = updateProductDto.minOrderQuantity;
    if (updateProductDto.minOrderAmount !== undefined) updateData.min_order_amount = updateProductDto.minOrderAmount || null;
    if (updateProductDto.stockQuantity !== undefined) updateData.stock_quantity = updateProductDto.stockQuantity;
    if (updateProductDto.trackInventory !== undefined) updateData.track_inventory = updateProductDto.trackInventory;
    if (updateProductDto.lowStockThreshold !== undefined) updateData.low_stock_threshold = updateProductDto.lowStockThreshold || null;
    if (updateProductDto.status !== undefined) updateData.status = updateProductDto.status;
    if (updateProductDto.isFeatured !== undefined) updateData.is_featured = updateProductDto.isFeatured;
    if (updateProductDto.condition !== undefined) updateData.condition = updateProductDto.condition;
    if (updateProductDto.shippingInfo !== undefined) updateData.shipping_info = updateProductDto.shippingInfo || null;
    if (updateProductDto.isShippingFree !== undefined) updateData.is_shipping_free = updateProductDto.isShippingFree;
    if (updateProductDto.shippingCost !== undefined) updateData.shipping_cost = updateProductDto.shippingCost || null;
    if (updateProductDto.estimatedDeliveryDays !== undefined) updateData.estimated_delivery_days = updateProductDto.estimatedDeliveryDays || null;
    if (updateProductDto.productDetails !== undefined) updateData.product_details = updateProductDto.productDetails || null;
    if (updateProductDto.sizeChart !== undefined) updateData.size_chart = updateProductDto.sizeChart || null;
    if (updateProductDto.metaTitle !== undefined) updateData.meta_title = updateProductDto.metaTitle || null;
    if (updateProductDto.metaDescription !== undefined) updateData.meta_description = updateProductDto.metaDescription || null;
    if (updateProductDto.metaKeywords !== undefined) updateData.meta_keywords = updateProductDto.metaKeywords || null;

    // Update product
    const { data: updatedProduct, error: updateError } = await serviceClient
      .from('wholesale_products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(
        `Failed to update product: ${updateError.message || 'Unknown error'}`,
      );
    }

    // Handle images update if provided
    if (updateProductDto.images !== undefined) {
      // Delete existing images
      await serviceClient
        .from('wholesale_product_images')
        .delete()
        .eq('product_id', productId);

      // Insert new images
      if (updateProductDto.images.length > 0) {
        const imageRecords = updateProductDto.images.map((image, index) => ({
          product_id: productId,
          image_url: image.imageUrl,
          alt_text: image.altText || null,
          display_order: image.displayOrder !== undefined ? image.displayOrder : index,
          is_primary: image.isPrimary ?? index === 0,
        }));

        const { error: imagesError } = await serviceClient
          .from('wholesale_product_images')
          .insert(imageRecords);

        if (imagesError) {
          console.error('Failed to update product images:', imagesError);
        }
      }
    }

    // Handle product-level variations update if provided
    if (updateProductDto.variations !== undefined) {
      // Delete existing variations
      await serviceClient
        .from('wholesale_product_variations')
        .delete()
        .eq('product_id', productId);

      // Insert new variations
      if (updateProductDto.variations.length > 0) {
        const variationRecords = updateProductDto.variations.map((variation, index) => ({
          product_id: productId,
          variation_type: variation.variationType,
          name: variation.name,
          value: variation.value || null,
          is_available: variation.isAvailable,
          display_order: variation.displayOrder !== undefined ? variation.displayOrder : index,
        }));

        const { error: variationsError } = await serviceClient
          .from('wholesale_product_variations')
          .insert(variationRecords);

        if (variationsError) {
          console.error('Failed to update product variations:', variationsError);
        }
      }
    }

    // Handle pack sizes update if provided
    if (updateProductDto.packSizes !== undefined) {
      // Get existing pack size IDs to delete their variations and stock matrix
      const { data: existingPackSizes } = await serviceClient
        .from('wholesale_product_pack_sizes')
        .select('id')
        .eq('product_id', productId);

      const existingPackSizeIds = (existingPackSizes || []).map(p => p.id);

      // Delete existing stock matrix entries for these pack sizes
      if (existingPackSizeIds.length > 0) {
        await serviceClient
          .from('wholesale_pack_stock_matrix')
          .delete()
          .in('pack_size_id', existingPackSizeIds);

        // Delete existing pack variations for these pack sizes
        await serviceClient
          .from('wholesale_pack_variations')
          .delete()
          .in('pack_size_id', existingPackSizeIds);
      }

      // Delete existing pack sizes
      await serviceClient
        .from('wholesale_product_pack_sizes')
        .delete()
        .eq('product_id', productId);

      // Insert new pack sizes with their variations and stock matrix
      if (updateProductDto.packSizes.length > 0) {
        for (let index = 0; index < updateProductDto.packSizes.length; index++) {
          const pack = updateProductDto.packSizes[index];

          // Insert pack size
          const { data: packSize, error: packSizeError } = await serviceClient
            .from('wholesale_product_pack_sizes')
            .insert({
              product_id: productId,
              label: pack.label,
              quantity: pack.quantity,
              pack_price: pack.packPrice,
              unit_price: pack.unitPrice || pack.packPrice / pack.quantity,
              is_popular: pack.isPopular,
              is_best_value: pack.isBestValue,
              is_available: pack.isAvailable,
              display_order: pack.displayOrder !== undefined ? pack.displayOrder : index,
            })
            .select()
            .single();

          if (packSizeError) {
            console.error('Failed to update product pack size:', packSizeError);
            continue;
          }

          // Insert pack variations if provided
          if (pack.variations && pack.variations.length > 0) {
            const variationRecords = pack.variations.map((variation, vIndex) => ({
              pack_size_id: packSize.id,
              variation_type: variation.variationType,
              name: variation.name,
              value: variation.value || null,
              image_index: variation.imageIndex !== undefined ? variation.imageIndex : null,
              is_available: variation.isAvailable,
              display_order: variation.displayOrder !== undefined ? variation.displayOrder : vIndex,
            }));

            const { error: variationsError } = await serviceClient
              .from('wholesale_pack_variations')
              .insert(variationRecords);

            if (variationsError) {
              console.error('Failed to update pack variations:', variationsError);
            }
          }

          // Insert stock matrix if provided
          if (pack.stockMatrix && Object.keys(pack.stockMatrix).length > 0) {
            const stockMatrixRecords = Object.entries(pack.stockMatrix).map(([key, quantity]) => ({
              pack_size_id: packSize.id,
              combination_key: key,
              stock_quantity: quantity,
            }));

            const { error: stockMatrixError } = await serviceClient
              .from('wholesale_pack_stock_matrix')
              .insert(stockMatrixRecords);

            if (stockMatrixError) {
              console.error('Failed to update stock matrix:', stockMatrixError);
            }
          }
        }
      }
    }

    return this.getProductById(productId, userId);
  }

  async deleteProduct(productId: string, userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify product exists and user owns it
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .select(`
        *,
        wholesale_brands!inner(user_id)
      `)
      .eq('id', productId)
      .single();

    if (productError) {
      throw new NotFoundException('Product not found.');
    }

    if (product.wholesale_brands.user_id !== userId) {
      throw new UnauthorizedException('You do not have permission to delete this product.');
    }

    // Soft delete
    const { error: deleteError } = await serviceClient
      .from('wholesale_products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', productId);

    if (deleteError) {
      throw new BadRequestException(
        `Failed to delete product: ${deleteError.message || 'Unknown error'}`,
      );
    }

    return { message: 'Product deleted successfully' };
  }

  // Public methods (no auth required) - use active_wholesale_products view
  async getPopularProducts(limit: number = 24) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get products ordered by total_sold DESC (view already includes brand_name)
    const { data: products, error: productsError } = await serviceClient
      .from('active_wholesale_products')
      .select('*')
      .order('total_sold', { ascending: false })
      .limit(limit);

    if (productsError) {
      throw new BadRequestException(
        `Failed to fetch popular products: ${productsError.message || 'Unknown error'}`,
      );
    }

    // Get images for all products
    const productIds = (products || []).map(p => p.id);
    let productImages: any[] = [];
    
    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });
      
      productImages = images || [];
    }

    // Map images to products and format response
    return (products || []).map(product => ({
      ...product,
      images: productImages.filter(img => img.product_id === product.id),
    }));
  }

  async getNewArrivals(limit: number = 24) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get products ordered by created_at DESC (view already includes brand_name)
    const { data: products, error: productsError } = await serviceClient
      .from('active_wholesale_products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (productsError) {
      throw new BadRequestException(
        `Failed to fetch new arrivals: ${productsError.message || 'Unknown error'}`,
      );
    }

    // Get images for all products
    const productIds = (products || []).map(p => p.id);
    let productImages: any[] = [];
    
    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });
      
      productImages = images || [];
    }

    // Map images to products and format response
    return (products || []).map(product => ({
      ...product,
      images: productImages.filter(img => img.product_id === product.id),
    }));
  }

  async getSaleProducts(limit: number = 24) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get products with sale_percentage > 0, ordered by sale_percentage DESC (view already includes brand_name)
    const { data: products, error: productsError } = await serviceClient
      .from('active_wholesale_products')
      .select('*')
      .gt('sale_percentage', 0)
      .order('sale_percentage', { ascending: false })
      .limit(limit);

    if (productsError) {
      throw new BadRequestException(
        `Failed to fetch sale products: ${productsError.message || 'Unknown error'}`,
      );
    }

    // Get images for all products
    const productIds = (products || []).map(p => p.id);
    let productImages: any[] = [];
    
    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });
      
      productImages = images || [];
    }

    // Map images to products and format response
    return (products || []).map(product => ({
      ...product,
      images: productImages.filter(img => img.product_id === product.id),
    }));
  }

  async getAllProducts(
    page: number = 1,
    limit: number = 24,
    search?: string,
    categoryId?: string,
    sortBy?: string,
    filter?: string,
    priceMin?: number,
    priceMax?: number,
    minOrder?: number,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();
    const offset = (page - 1) * limit;

    // Build query for products count
    let countQuery = serviceClient
      .from('active_wholesale_products')
      .select('*', { count: 'exact', head: true });

    // Build query for products
    let productsQuery = serviceClient
      .from('active_wholesale_products')
      .select('*');

    // Apply filter (popular, new-arrivals, sale)
    if (filter === 'popular') {
      // Popular: order by total_sold DESC
      productsQuery = productsQuery.order('total_sold', { ascending: false });
    } else if (filter === 'new-arrivals') {
      // New Arrivals: order by created_at DESC
      productsQuery = productsQuery.order('created_at', { ascending: false });
    } else if (filter === 'sale') {
      // Sale: only products with sale_percentage > 0, ordered by sale_percentage DESC
      countQuery = countQuery.gt('sale_percentage', 0);
      productsQuery = productsQuery.gt('sale_percentage', 0).order('sale_percentage', { ascending: false });
    }

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      countQuery = countQuery.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
      productsQuery = productsQuery.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
    }

    // Apply category filter
    if (categoryId && categoryId !== 'all') {
      countQuery = countQuery.eq('category_id', categoryId);
      productsQuery = productsQuery.eq('category_id', categoryId);
    }

    // Apply price range filter
    if (priceMin !== undefined && priceMin !== null) {
      countQuery = countQuery.gte('wholesale_price', priceMin);
      productsQuery = productsQuery.gte('wholesale_price', priceMin);
    }
    if (priceMax !== undefined && priceMax !== null) {
      countQuery = countQuery.lte('wholesale_price', priceMax);
      productsQuery = productsQuery.lte('wholesale_price', priceMax);
    }

    // Apply minimum order quantity filter
    if (minOrder !== undefined && minOrder !== null) {
      if (minOrder >= 24) {
        // 24+ means min_order_quantity >= 24
        countQuery = countQuery.gte('min_order_quantity', 24);
        productsQuery = productsQuery.gte('min_order_quantity', 24);
      } else {
        // Exact match for 1, 6, 12
        countQuery = countQuery.eq('min_order_quantity', minOrder);
        productsQuery = productsQuery.eq('min_order_quantity', minOrder);
      }
    }

    // Apply sorting (only if filter is not set, as filter determines the sort order)
    if (!filter) {
      if (sortBy === 'price-asc') {
        productsQuery = productsQuery.order('wholesale_price', { ascending: true });
      } else if (sortBy === 'price-desc') {
        productsQuery = productsQuery.order('wholesale_price', { ascending: false });
      } else if (sortBy === 'newest') {
        productsQuery = productsQuery.order('created_at', { ascending: false });
      } else if (sortBy === 'popular') {
        productsQuery = productsQuery.order('total_sold', { ascending: false });
      } else {
        // Default: order by created_at desc
        productsQuery = productsQuery.order('created_at', { ascending: false });
      }
    }

    // Get products count
    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new BadRequestException(
        `Failed to fetch products count: ${countError.message || 'Unknown error'}`,
      );
    }

    // Get products with pagination
    const { data: products, error: productsError } = await productsQuery
      .range(offset, offset + limit - 1);

    if (productsError) {
      throw new BadRequestException(
        `Failed to fetch products: ${productsError.message || 'Unknown error'}`,
      );
    }

    // Get images for all products
    const productIds = (products || []).map(p => p.id);
    let productImages: any[] = [];
    
    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('*')
        .in('product_id', productIds)
        .order('display_order', { ascending: true });
      
      productImages = images || [];
    }

    // Map images to products and format response
    const productsWithImages = (products || []).map(product => ({
      ...product,
      images: productImages.filter(img => img.product_id === product.id),
    }));

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      products: productsWithImages,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
      },
    };
  }

  async getSearchSuggestions(query: string, limit: number = 8) {
    const serviceClient = this.supabaseService.getServiceClient();
    const searchTerm = `%${query}%`;

    // Get matching products ordered by total_sold (most popular first)
    const { data: products, error: productsError } = await serviceClient
      .from('active_wholesale_products')
      .select('id, name, slug, brand_name, wholesale_price, total_sold')
      .or(`name.ilike.${searchTerm},brand_name.ilike.${searchTerm}`)
      .order('total_sold', { ascending: false })
      .limit(limit);

    if (productsError) {
      console.error('Error fetching search suggestions:', productsError);
      return { suggestions: [] };
    }

    // Get primary images for matching products
    const productIds = (products || []).map(p => p.id);
    let productImages: any[] = [];

    if (productIds.length > 0) {
      const { data: images } = await serviceClient
        .from('wholesale_product_images')
        .select('product_id, image_url')
        .in('product_id', productIds)
        .eq('is_primary', true);

      productImages = images || [];
    }

    // Get matching categories
    const { data: categories } = await serviceClient
      .from('categories')
      .select('id, name, slug')
      .ilike('name', searchTerm)
      .eq('is_active', true)
      .limit(3);

    // Get matching brands
    const { data: brands } = await serviceClient
      .from('wholesale_brands')
      .select('id, display_name, slug')
      .ilike('display_name', searchTerm)
      .eq('status', 'approved')
      .limit(3);

    // Map images to products
    const productSuggestions = (products || []).map(product => {
      const image = productImages.find(img => img.product_id === product.id);
      return {
        type: 'product' as const,
        id: product.id,
        name: product.name,
        slug: product.slug,
        brand: product.brand_name,
        price: product.wholesale_price,
        image: image?.image_url || null,
      };
    });

    const categorySuggestions = (categories || []).map(cat => ({
      type: 'category' as const,
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));

    const brandSuggestions = (brands || []).map(brand => ({
      type: 'brand' as const,
      id: brand.id,
      name: brand.display_name,
      slug: brand.slug,
    }));

    return {
      suggestions: [
        ...productSuggestions,
        ...categorySuggestions,
        ...brandSuggestions,
      ],
      query,
    };
  }

  async getProductBySlug(slug: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get product from active_wholesale_products view (only active products with approved brands)
    const { data: product, error: productError } = await serviceClient
      .from('active_wholesale_products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (productError) {
      throw new BadRequestException(
        `Failed to fetch product: ${productError.message || 'Unknown error'}`,
      );
    }

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    // Get images
    const { data: images } = await serviceClient
      .from('wholesale_product_images')
      .select('*')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    // Get variations
    const { data: variations } = await serviceClient
      .from('wholesale_product_variations')
      .select('*')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    // Get pack sizes
    const { data: packSizes } = await serviceClient
      .from('wholesale_product_pack_sizes')
      .select('*')
      .eq('product_id', product.id)
      .order('display_order', { ascending: true });

    // Get pack variations and stock matrix for each pack size
    const packSizeIds = (packSizes || []).map(p => p.id);
    let packVariations: any[] = [];
    let stockMatrix: any[] = [];

    if (packSizeIds.length > 0) {
      const { data: pvariations } = await serviceClient
        .from('wholesale_pack_variations')
        .select('*')
        .in('pack_size_id', packSizeIds)
        .order('display_order', { ascending: true });

      packVariations = pvariations || [];

      const { data: matrix } = await serviceClient
        .from('wholesale_pack_stock_matrix')
        .select('*')
        .in('pack_size_id', packSizeIds);

      stockMatrix = matrix || [];
    }

    // Map pack variations and stock matrix to pack sizes
    const packSizesWithDetails = (packSizes || []).map(pack => ({
      ...pack,
      variations: packVariations.filter(v => v.pack_size_id === pack.id),
      stockMatrix: stockMatrix
        .filter(s => s.pack_size_id === pack.id)
        .reduce((acc, item) => {
          acc[item.combination_key] = item.stock_quantity;
          return acc;
        }, {} as Record<string, number>),
    }));

    return {
      ...product,
      images: images || [],
      variations: variations || [],
      packSizes: packSizesWithDetails,
    };
  }
}

