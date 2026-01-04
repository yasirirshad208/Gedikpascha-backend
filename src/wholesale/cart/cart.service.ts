import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  AddToCartDto,
  UpdateCartItemDto,
  SyncCartDto,
  CartItemDto,
} from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getCart(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Get cart items with product details
    const { data: cartItems, error } = await serviceClient
      .from('wholesale_cart')
      .select(
        `
        *,
        product:wholesale_products(
          id,
          name,
          slug,
          wholesale_price,
          sale_percentage,
          status,
          stock_quantity,
          deleted_at,
          wholesale_brand:wholesale_brands(
            id,
            display_name,
            brand_name
          ),
          images:wholesale_product_images(
            image_url,
            display_order
          )
        ),
        pack_size:wholesale_product_pack_sizes(
          id,
          label,
          quantity,
          pack_price,
          unit_price,
          is_available,
          variations:wholesale_pack_variations(*)
        )
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Failed to fetch cart: ${error.message || 'Unknown error'}`,
      );
    }

    // Transform cart items
    const transformedItems = (cartItems || []).map((item) => {
      const product = item.product;
      const packSize = item.pack_size;

      // Get primary image
      const images = product?.images || [];
      const sortedImages = [...images].sort(
        (a, b) => a.display_order - b.display_order,
      );
      const primaryImage = sortedImages[0]?.image_url || null;

      // Calculate prices
      const currentPackPrice = packSize?.pack_price || 0;
      const currentUnitPrice = packSize?.unit_price || 0;
      const salePercentage = product?.sale_percentage || 0;
      const packQuantity = packSize?.quantity || 1;

      // Calculate total for this item
      const itemTotal = currentPackPrice * item.quantity;

      return {
        id: item.id,
        productId: item.product_id,
        packSizeId: item.pack_size_id,
        quantity: item.quantity,
        selectedVariations: item.selected_variations || {},
        unitPrice: item.unit_price,
        packPrice: item.pack_price,
        currentUnitPrice,
        currentPackPrice,
        itemTotal,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        product: product
          ? {
              id: product.id,
              name: product.name,
              slug: product.slug,
              wholesalePrice: product.wholesale_price,
              salePercentage: product.sale_percentage,
              status: product.status,
              stockQuantity: product.stock_quantity,
              isDeleted: !!product.deleted_at,
              image: primaryImage,
              brand: product.wholesale_brand
                ? {
                    id: product.wholesale_brand.id,
                    name: product.wholesale_brand.display_name,
                    slug: product.wholesale_brand.brand_name,
                  }
                : null,
            }
          : null,
        packSize: packSize
          ? {
              id: packSize.id,
              label: packSize.label,
              quantity: packSize.quantity,
              packPrice: packSize.pack_price,
              unitPrice: packSize.unit_price,
              isAvailable: packSize.is_available,
              variations: packSize.variations || [],
            }
          : null,
      };
    });

    // Filter out items with deleted/unavailable products
    const validItems = transformedItems.filter(
      (item) =>
        item.product &&
        !item.product.isDeleted &&
        item.product.status === 'active',
    );

    // Calculate totals
    const subtotal = validItems.reduce((sum, item) => sum + item.itemTotal, 0);
    const totalItems = validItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalPieces = validItems.reduce((sum, item) => {
      const packQty = item.packSize?.quantity || 1;
      return sum + item.quantity * packQty;
    }, 0);

    return {
      items: validItems,
      summary: {
        subtotal,
        totalItems,
        totalPieces,
        itemCount: validItems.length,
      },
    };
  }

  async addToCart(userId: string, addToCartDto: AddToCartDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify product exists and is active
    const { data: product, error: productError } = await serviceClient
      .from('wholesale_products')
      .select('id, status, deleted_at')
      .eq('id', addToCartDto.productId)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Product not found');
    }

    if (product.deleted_at || product.status !== 'active') {
      throw new BadRequestException('Product is not available');
    }

    // Verify pack size if provided
    if (addToCartDto.packSizeId) {
      const { data: packSize, error: packError } = await serviceClient
        .from('wholesale_product_pack_sizes')
        .select('id, is_available, pack_price, unit_price')
        .eq('id', addToCartDto.packSizeId)
        .eq('product_id', addToCartDto.productId)
        .single();

      if (packError || !packSize) {
        throw new NotFoundException('Pack size not found');
      }

      if (!packSize.is_available) {
        throw new BadRequestException('Pack size is not available');
      }

      // Set prices from pack size if not provided
      if (!addToCartDto.packPrice) {
        addToCartDto.packPrice = packSize.pack_price;
      }
      if (!addToCartDto.unitPrice) {
        addToCartDto.unitPrice = packSize.unit_price;
      }
    }

    // Check if item already exists in cart
    const { data: existingItem } = await serviceClient
      .from('wholesale_cart')
      .select('id, quantity, selected_variations')
      .eq('user_id', userId)
      .eq('product_id', addToCartDto.productId)
      .eq('pack_size_id', addToCartDto.packSizeId || null)
      .maybeSingle();

    if (existingItem) {
      // Update existing item
      const newQuantity = existingItem.quantity + addToCartDto.quantity;

      // Merge selected variations if provided
      let mergedVariations = existingItem.selected_variations || {};
      if (addToCartDto.selectedVariations) {
        Object.entries(addToCartDto.selectedVariations).forEach(
          ([key, qty]) => {
            mergedVariations[key] = (mergedVariations[key] || 0) + qty;
          },
        );
      }

      const { data: updatedItem, error: updateError } = await serviceClient
        .from('wholesale_cart')
        .update({
          quantity: newQuantity,
          selected_variations:
            Object.keys(mergedVariations).length > 0
              ? mergedVariations
              : null,
          unit_price: addToCartDto.unitPrice,
          pack_price: addToCartDto.packPrice,
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (updateError) {
        throw new BadRequestException(
          `Failed to update cart: ${updateError.message || 'Unknown error'}`,
        );
      }

      return this.getCart(userId);
    }

    // Insert new cart item
    const { data: newItem, error: insertError } = await serviceClient
      .from('wholesale_cart')
      .insert({
        user_id: userId,
        product_id: addToCartDto.productId,
        pack_size_id: addToCartDto.packSizeId || null,
        quantity: addToCartDto.quantity,
        selected_variations: addToCartDto.selectedVariations || null,
        unit_price: addToCartDto.unitPrice || null,
        pack_price: addToCartDto.packPrice || null,
      })
      .select()
      .single();

    if (insertError) {
      throw new BadRequestException(
        `Failed to add to cart: ${insertError.message || 'Unknown error'}`,
      );
    }

    return this.getCart(userId);
  }

  async updateCartItem(
    userId: string,
    cartItemId: string,
    updateCartItemDto: UpdateCartItemDto,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify cart item exists and belongs to user
    const { data: existingItem, error: findError } = await serviceClient
      .from('wholesale_cart')
      .select('id')
      .eq('id', cartItemId)
      .eq('user_id', userId)
      .single();

    if (findError || !existingItem) {
      throw new NotFoundException('Cart item not found');
    }

    // Build update object
    const updateData: any = {};
    if (updateCartItemDto.quantity !== undefined) {
      updateData.quantity = updateCartItemDto.quantity;
    }
    if (updateCartItemDto.selectedVariations !== undefined) {
      updateData.selected_variations =
        Object.keys(updateCartItemDto.selectedVariations).length > 0
          ? updateCartItemDto.selectedVariations
          : null;
    }

    const { error: updateError } = await serviceClient
      .from('wholesale_cart')
      .update(updateData)
      .eq('id', cartItemId);

    if (updateError) {
      throw new BadRequestException(
        `Failed to update cart item: ${updateError.message || 'Unknown error'}`,
      );
    }

    return this.getCart(userId);
  }

  async removeFromCart(
    userId: string,
    productId: string,
    packSizeId?: string,
  ) {
    const serviceClient = this.supabaseService.getServiceClient();

    let query = serviceClient
      .from('wholesale_cart')
      .delete()
      .eq('user_id', userId)
      .eq('product_id', productId);

    if (packSizeId) {
      query = query.eq('pack_size_id', packSizeId);
    } else {
      query = query.is('pack_size_id', null);
    }

    const { error } = await query;

    if (error) {
      throw new BadRequestException(
        `Failed to remove from cart: ${error.message || 'Unknown error'}`,
      );
    }

    return this.getCart(userId);
  }

  async removeCartItem(userId: string, cartItemId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { error } = await serviceClient
      .from('wholesale_cart')
      .delete()
      .eq('id', cartItemId)
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(
        `Failed to remove cart item: ${error.message || 'Unknown error'}`,
      );
    }

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { error } = await serviceClient
      .from('wholesale_cart')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(
        `Failed to clear cart: ${error.message || 'Unknown error'}`,
      );
    }

    return { items: [], summary: { subtotal: 0, totalItems: 0, totalPieces: 0, itemCount: 0 } };
  }

  async syncCart(userId: string, syncCartDto: SyncCartDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Process each item from guest cart
    for (const item of syncCartDto.items) {
      try {
        // Check if product exists and is active
        const { data: product } = await serviceClient
          .from('wholesale_products')
          .select('id, status, deleted_at')
          .eq('id', item.productId)
          .single();

        if (!product || product.deleted_at || product.status !== 'active') {
          continue; // Skip invalid products
        }

        // Check if pack size exists if provided
        if (item.packSizeId) {
          const { data: packSize } = await serviceClient
            .from('wholesale_product_pack_sizes')
            .select('id, is_available')
            .eq('id', item.packSizeId)
            .eq('product_id', item.productId)
            .single();

          if (!packSize || !packSize.is_available) {
            continue; // Skip invalid pack sizes
          }
        }

        // Check if item already exists
        const { data: existingItem } = await serviceClient
          .from('wholesale_cart')
          .select('id, quantity, selected_variations')
          .eq('user_id', userId)
          .eq('product_id', item.productId)
          .eq('pack_size_id', item.packSizeId || null)
          .maybeSingle();

        if (existingItem) {
          // Merge quantities - keep the higher quantity
          const newQuantity = Math.max(existingItem.quantity, item.quantity);

          // Merge selected variations
          let mergedVariations = existingItem.selected_variations || {};
          if (item.selectedVariations) {
            Object.entries(item.selectedVariations).forEach(([key, qty]) => {
              mergedVariations[key] = Math.max(
                mergedVariations[key] || 0,
                qty,
              );
            });
          }

          await serviceClient
            .from('wholesale_cart')
            .update({
              quantity: newQuantity,
              selected_variations:
                Object.keys(mergedVariations).length > 0
                  ? mergedVariations
                  : null,
            })
            .eq('id', existingItem.id);
        } else {
          // Insert new item
          await serviceClient.from('wholesale_cart').insert({
            user_id: userId,
            product_id: item.productId,
            pack_size_id: item.packSizeId || null,
            quantity: item.quantity,
            selected_variations: item.selectedVariations || null,
            unit_price: item.unitPrice || null,
            pack_price: item.packPrice || null,
          });
        }
      } catch {
        // Continue with next item if one fails
        console.error(`Failed to sync cart item: ${item.productId}`);
      }
    }

    return this.getCart(userId);
  }

  async getCartCount(userId: string): Promise<number> {
    const serviceClient = this.supabaseService.getServiceClient();

    const { count, error } = await serviceClient
      .from('wholesale_cart')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      return 0;
    }

    return count || 0;
  }
}
