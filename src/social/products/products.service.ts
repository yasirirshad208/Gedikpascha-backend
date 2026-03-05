import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateSocialProductDto } from './dto/create-social-product.dto';
import { ImportRetailProductDto } from './dto/import-retail-product.dto';
import { UpdateSocialProductDto } from './dto/update-social-product.dto';

@Injectable()
export class SocialProductsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createProduct(userId: string, dto: CreateSocialProductDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const quantity = dto.quantity || 1;

    const { data: inserted, error } = await serviceClient
      .from('social_products')
      .insert({
        user_id: userId,
        title: dto.title,
        description: dto.description || null,
        price: dto.price,
        currency: dto.currency || 'TRY',
        category: dto.category || null,
        brand: dto.brand || null,
        size: dto.size || null,
        color: dto.color || null,
        condition: dto.condition || 'new',
        listing_type: dto.listingType || 'shop',
        source_type: 'manual',
        status: 'draft',
        is_published: false,
        quantity,
        available_quantity: quantity,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        snapshot_json: null,
      })
      .select('*')
      .single();

    if (error || !inserted) {
      throw new BadRequestException(`Failed to create product: ${error?.message || 'Unknown error'}`);
    }

    if (dto.imageUrls?.length) {
      const mediaRows = dto.imageUrls.map((url, index) => ({
        product_id: inserted.id,
        media_url: url,
        media_type: 'image',
        is_primary: index === 0,
        display_order: index,
      }));
      await serviceClient.from('social_product_media').insert(mediaRows);
    }

    return inserted;
  }

  async getMyProducts(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data, error } = await serviceClient
      .from('social_products')
      .select('*, social_product_media(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(`Failed to fetch products: ${error.message}`);
    }

    return data || [];
  }

  async getImportableRetail(userId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: orders, error: orderError } = await serviceClient
      .from('retail_orders')
      .select(
        'id, status, order_number, created_at, retail_order_items(id, product_id, product_name, product_slug, product_image, brand_name, quantity, unit_price, item_total, color_value, size_value, variation_details)',
      )
      .eq('user_id', userId)
      .in('status', ['delivered', 'completed'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (orderError) {
      throw new BadRequestException(`Failed to fetch retail orders: ${orderError.message}`);
    }

    const { data: links } = await serviceClient
      .from('social_retail_purchase_links')
      .select('retail_order_item_id, imported_quantity')
      .eq('user_id', userId)
      .eq('is_revoked', false);

    const importedByItem = new Map<string, number>();
    for (const link of links || []) {
      const current = importedByItem.get(link.retail_order_item_id) || 0;
      importedByItem.set(link.retail_order_item_id, current + Number(link.imported_quantity || 0));
    }

    const importableItems: any[] = [];
    for (const order of orders || []) {
      const items = (order as any).retail_order_items || [];
      for (const item of items) {
        const importedQty = importedByItem.get(item.id) || 0;
        const remainingQty = Math.max(0, Number(item.quantity || 0) - importedQty);
        if (remainingQty > 0) {
          importableItems.push({
            orderId: order.id,
            orderNumber: order.order_number,
            orderStatus: order.status,
            orderCreatedAt: order.created_at,
            orderItemId: item.id,
            productId: item.product_id,
            productName: item.product_name,
            productSlug: item.product_slug,
            productImage: item.product_image,
            brandName: item.brand_name,
            purchasedQuantity: item.quantity,
            importedQuantity: importedQty,
            remainingQuantity: remainingQty,
            unitPrice: item.unit_price,
            itemTotal: item.item_total,
            color: item.color_value,
            size: item.size_value,
            variationDetails: item.variation_details,
          });
        }
      }
    }

    return {
      items: importableItems,
      total: importableItems.length,
    };
  }

  async importRetailProduct(userId: string, dto: ImportRetailProductDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: orderItem, error: orderItemError } = await serviceClient
      .from('retail_order_items')
      .select('*')
      .eq('id', dto.retailOrderItemId)
      .single();

    if (orderItemError || !orderItem) {
      throw new NotFoundException('Retail order item not found');
    }

    const { data: order, error: orderError } = await serviceClient
      .from('retail_orders')
      .select('id, user_id, status')
      .eq('id', orderItem.order_id)
      .single();

    if (orderError || !order) {
      throw new NotFoundException('Retail order not found');
    }

    if (order.user_id !== userId) {
      throw new ForbiddenException('You can only import your own purchased items');
    }
    if (!['delivered', 'completed'].includes(order.status)) {
      throw new BadRequestException('Only delivered/completed retail orders can be imported');
    }

    const { data: existingLinks } = await serviceClient
      .from('social_retail_purchase_links')
      .select('imported_quantity')
      .eq('retail_order_item_id', orderItem.id)
      .eq('user_id', userId)
      .eq('is_revoked', false);

    const alreadyImported = (existingLinks || []).reduce((sum, link) => sum + Number(link.imported_quantity || 0), 0);
    const remaining = Number(orderItem.quantity || 0) - alreadyImported;
    if (dto.quantity > remaining) {
      throw new BadRequestException(`Import quantity exceeds remaining allowance (${remaining})`);
    }

    const resalePrice = dto.resalePrice ?? Number(orderItem.unit_price || 0);
    const snapshot = {
      retailOrderId: order.id,
      retailOrderItemId: orderItem.id,
      productName: orderItem.product_name,
      productSlug: orderItem.product_slug,
      productImage: orderItem.product_image,
      brandName: orderItem.brand_name,
      purchasedUnitPrice: orderItem.unit_price,
      purchasedQuantity: orderItem.quantity,
      variation: orderItem.variation_details,
      color: orderItem.color_value,
      size: orderItem.size_value,
    };

    const { data: product, error: productError } = await serviceClient
      .from('social_products')
      .insert({
        user_id: userId,
        title: orderItem.product_name,
        description: dto.description || null,
        price: resalePrice,
        currency: 'TRY',
        category: null,
        brand: orderItem.brand_name || null,
        size: orderItem.size_value || null,
        color: orderItem.color_value || null,
        condition: dto.condition || 'good',
        listing_type: 'closet',
        source_type: 'retail_import',
        status: 'draft',
        is_published: false,
        quantity: dto.quantity,
        available_quantity: dto.quantity,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        source_retail_order_id: order.id,
        source_retail_order_item_id: orderItem.id,
        reference_price: orderItem.unit_price,
        snapshot_json: snapshot,
      })
      .select('*')
      .single();

    if (productError || !product) {
      throw new BadRequestException(`Failed to import retail product: ${productError?.message || 'Unknown error'}`);
    }

    await serviceClient.from('social_retail_purchase_links').insert({
      user_id: userId,
      social_product_id: product.id,
      retail_order_id: order.id,
      retail_order_item_id: orderItem.id,
      imported_quantity: dto.quantity,
      immutable_snapshot: snapshot,
      is_revoked: false,
    });

    if (orderItem.product_image) {
      await serviceClient.from('social_product_media').insert({
        product_id: product.id,
        media_url: orderItem.product_image,
        media_type: 'image',
        is_primary: true,
        display_order: 0,
      });
    }

    return product;
  }

  async updateProduct(userId: string, productId: string, dto: UpdateSocialProductDto) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: existing } = await serviceClient
      .from('social_products')
      .select('id, user_id')
      .eq('id', productId)
      .single();

    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only update your own products');
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.brand !== undefined) updateData.brand = dto.brand;
    if (dto.size !== undefined) updateData.size = dto.size;
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.condition !== undefined) updateData.condition = dto.condition;
    if (dto.listingType !== undefined) updateData.listing_type = dto.listingType;
    if (dto.quantity !== undefined) {
      updateData.quantity = dto.quantity;
      updateData.available_quantity = dto.quantity;
    }
    if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
    if (dto.longitude !== undefined) updateData.longitude = dto.longitude;

    const { data: updated, error } = await serviceClient
      .from('social_products')
      .update(updateData)
      .eq('id', productId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new BadRequestException(`Failed to update product: ${error?.message || 'Unknown error'}`);
    }

    if (dto.imageUrls) {
      await serviceClient.from('social_product_media').delete().eq('product_id', productId);
      if (dto.imageUrls.length) {
        const mediaRows = dto.imageUrls.map((url, index) => ({
          product_id: productId,
          media_url: url,
          media_type: 'image',
          is_primary: index === 0,
          display_order: index,
        }));
        await serviceClient.from('social_product_media').insert(mediaRows);
      }
    }

    return updated;
  }

  async publishProduct(userId: string, productId: string) {
    return this.updatePublishState(userId, productId, true);
  }

  async markSold(userId: string, productId: string) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: existing } = await serviceClient
      .from('social_products')
      .select('id, user_id')
      .eq('id', productId)
      .single();

    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only mark your own products as sold');
    }

    const { data: updated, error } = await serviceClient
      .from('social_products')
      .update({
        status: 'sold',
        available_quantity: 0,
      })
      .eq('id', productId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new BadRequestException(`Failed to mark product as sold: ${error?.message || 'Unknown error'}`);
    }

    return updated;
  }

  private async updatePublishState(userId: string, productId: string, isPublished: boolean) {
    const serviceClient = this.supabaseService.getServiceClient();
    const { data: existing } = await serviceClient
      .from('social_products')
      .select('id, user_id')
      .eq('id', productId)
      .single();

    if (!existing) {
      throw new NotFoundException('Product not found');
    }
    if (existing.user_id !== userId) {
      throw new ForbiddenException('You can only publish your own products');
    }

    const status = isPublished ? 'active' : 'draft';
    const { data: updated, error } = await serviceClient
      .from('social_products')
      .update({
        is_published: isPublished,
        status,
      })
      .eq('id', productId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new BadRequestException(`Failed to update publish state: ${error?.message || 'Unknown error'}`);
    }

    return updated;
  }
}

