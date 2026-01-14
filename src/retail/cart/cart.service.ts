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
      .from('retail_cart')
      .select(
        `
        *,
        product:retail_products(
          id,
          name,
          slug,
          retail_price,
          compare_at_price,
          status,
          stock_quantity,
          deleted_at,
          retail_brand:retail_brands(
            id,
            display_name,
            brand_name
          ),
          images:retail_product_images(
            image_url,
            display_order
          ),
          variations:retail_product_variations(*),
          inventory:retail_product_inventory(*)
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

      // Get primary image
      const images = product?.images || [];
      const sortedImages = [...images].sort(
        (a, b) => a.display_order - b.display_order,
      );
      const primaryImage = sortedImages[0]?.image_url || null;

      // Calculate prices
      const currentUnitPrice = product?.retail_price || 0;
      
      // Get available stock for this combination
      const inventory = product?.inventory || [];
      const stockItem = inventory.find(
        (inv) => inv.combination_key === (item.combination_key || 'default')
      );
      const availableStock = stockItem?.stock_quantity || 0;

      // Calculate total for this item
      const itemTotal = currentUnitPrice * item.quantity;

      // Parse variation selections from combination_key
      const variationSelections = item.combination_key
        ? this.parseCombinationKey(item.combination_key)
        : {};

      return {
        id: item.id,
        productId: item.product_id,
        quantity: item.quantity,
        combinationKey: item.combination_key,
        variationSelections,
        unitPrice: item.unit_price,
        currentUnitPrice,
        itemTotal,
        availableStock,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        product: product
          ? {
              id: product.id,
              name: product.name,
              slug: product.slug,
              retailPrice: product.retail_price,
              salePrice: product.sale_price,
              status: product.status,
              stockQuantity: product.stock_quantity,
              isDeleted: !!product.deleted_at,
              image: primaryImage,
              brand: product.retail_brand
                ? {
                    id: product.retail_brand.id,
                    name: product.retail_brand.display_name,
                    slug: product.retail_brand.brand_name,
                  }
                : null,
              variations: product.variations || [],
            }
          : null,
      };
    });

    // Calculate summary
    const summary = {
      subtotal: transformedItems.reduce((sum, item) => sum + item.itemTotal, 0),
      totalItems: transformedItems.length,
      totalPieces: transformedItems.reduce((sum, item) => sum + item.quantity, 0),
      itemCount: transformedItems.length,
    };

    return {
      items: transformedItems,
      summary,
    };
  }

  async addToCart(userId: string, dto: AddToCartDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify product exists and is active
    const { data: product, error: productError } = await serviceClient
      .from('retail_products')
      .select('id, name, status, retail_price, compare_at_price, stock_quantity')
      .eq('id', dto.productId)
      .single();

    if (productError || !product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== 'active') {
      throw new BadRequestException('Product is not available for purchase');
    }

    // Check stock availability
    if (dto.combinationKey) {
      const { data: inventoryItem } = await serviceClient
        .from('retail_product_inventory')
        .select('stock_quantity')
        .eq('product_id', dto.productId)
        .eq('combination_key', dto.combinationKey)
        .single();

      if (!inventoryItem || inventoryItem.stock_quantity < dto.quantity) {
        throw new BadRequestException('Selected variation is out of stock');
      }
    } else if (product.stock_quantity < dto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Check if item already exists in cart
    const { data: existingItem } = await serviceClient
      .from('retail_cart')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('product_id', dto.productId)
      .eq('combination_key', dto.combinationKey || 'default')
      .single();

    if (existingItem) {
      // Update existing item quantity
      const newQuantity = existingItem.quantity + dto.quantity;

      const { data, error } = await serviceClient
        .from('retail_cart')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (error) {
        throw new BadRequestException(
          `Failed to update cart: ${error.message}`,
        );
      }

      return data;
    }

    // Add new item to cart
    const { data, error } = await serviceClient
      .from('retail_cart')
      .insert({
        user_id: userId,
        product_id: dto.productId,
        quantity: dto.quantity,
        combination_key: dto.combinationKey || null,
        unit_price: dto.unitPrice || product.retail_price,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to add to cart: ${error.message}`);
    }

    return data;
  }

  async updateCartItem(userId: string, cartItemId: string, dto: UpdateCartItemDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify cart item belongs to user
    const { data: cartItem, error: fetchError } = await serviceClient
      .from('retail_cart')
      .select('*, product:retail_products(stock_quantity)')
      .eq('id', cartItemId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    // Check stock availability
    if (cartItem.combination_key) {
      const { data: inventoryItem } = await serviceClient
        .from('retail_product_inventory')
        .select('stock_quantity')
        .eq('product_id', cartItem.product_id)
        .eq('combination_key', cartItem.combination_key)
        .single();

      if (!inventoryItem || inventoryItem.stock_quantity < dto.quantity) {
        throw new BadRequestException('Insufficient stock for selected variation');
      }
    } else if (cartItem.product.stock_quantity < dto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    // Update quantity
    const { data, error } = await serviceClient
      .from('retail_cart')
      .update({
        quantity: dto.quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cartItemId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update cart: ${error.message}`);
    }

    return data;
  }

  async removeFromCart(userId: string, cartItemId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { error } = await serviceClient
      .from('retail_cart')
      .delete()
      .eq('id', cartItemId)
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(
        `Failed to remove from cart: ${error.message}`,
      );
    }

    return { success: true, message: 'Item removed from cart' };
  }

  async clearCart(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { error } = await serviceClient
      .from('retail_cart')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new BadRequestException(`Failed to clear cart: ${error.message}`);
    }

    return { success: true, message: 'Cart cleared' };
  }

  async syncGuestCart(userId: string, dto: SyncCartDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Process each guest cart item
    for (const item of dto.items) {
      try {
        await this.addToCart(userId, {
          productId: item.productId,
          quantity: item.quantity,
          combinationKey: item.combinationKey,
          unitPrice: item.unitPrice,
        });
      } catch (error) {
        console.error(`Failed to sync cart item ${item.productId}:`, error);
        // Continue with next item even if one fails
      }
    }

    return this.getCart(userId);
  }

  private parseCombinationKey(combinationKey: string): Record<string, string> {
    const selections: Record<string, string> = {};
    
    if (!combinationKey || combinationKey === 'default') {
      return selections;
    }

    // Parse "color:Black|size:Small" into { color: "Black", size: "Small" }
    const parts = combinationKey.split('|');
    for (const part of parts) {
      const [type, value] = part.split(':');
      if (type && value) {
        selections[type] = value;
      }
    }

    return selections;
  }
}
