import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { cached, TTL } from '../../common/cache.util';

@Injectable()
export class PublicCategoriesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Returns the set of category IDs that currently have at least one publicly
   * visible (active) product in ANY of the three marketplaces (wholesale,
   * retail, social). Used to hide empty categories from shopper-facing menus
   * without touching `is_active` (so sellers can still list into them).
   */
  private async getCategoryIdsWithActiveProducts(): Promise<Set<string>> {
    // Cached: these are 3 full-table scans; without caching they run on every
    // homepage/shop load and were a major source of Supabase egress.
    const ids = await cached('categories:product-ids', TTL.long, async () => {
      const serviceClient = this.supabaseService.getServiceClient();
      const set = new Set<string>();
      const [wholesale, retail, social] = await Promise.all([
        serviceClient.from('active_wholesale_products').select('category_id'),
        serviceClient
          .from('retail_products')
          .select('category_id')
          .eq('status', 'active')
          .is('deleted_at', null),
        serviceClient
          .from('social_products')
          .select('category_id')
          .eq('status', 'active'),
      ]);
      [wholesale.data, retail.data, social.data].forEach((rows) => {
        (rows || []).forEach((row: any) => {
          if (row.category_id) set.add(row.category_id);
        });
      });
      return [...set];
    });
    return new Set(ids);
  }

  async getAllCategoriesWithSubcategories() {
   return cached('categories:all-with-subs', TTL.medium, async () => {
    const serviceClient = this.supabaseService.getServiceClient();

    // Fetch all active categories
    const { data: categories, error: catError } = await serviceClient
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (catError) {
      throw new BadRequestException(
        `Failed to fetch categories: ${catError.message}`,
      );
    }

    // Keep only categories that currently have products (in any section).
    const categoryIdsWithProducts = await this.getCategoryIdsWithActiveProducts();
    const visibleCategories = (categories || []).filter((cat: any) =>
      categoryIdsWithProducts.has(cat.id),
    );

    // Fetch all active subcategories
    const { data: subcategories, error: subError } = await serviceClient
      .from('subcategories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (subError) {
      throw new BadRequestException(
        `Failed to fetch subcategories: ${subError.message}`,
      );
    }

    // Group subcategories by category_id
    const subcategoriesMap = new Map<string, any[]>();
    (subcategories || []).forEach((sub: any) => {
      const categoryId = sub.category_id;
      if (!subcategoriesMap.has(categoryId)) {
        subcategoriesMap.set(categoryId, []);
      }
      subcategoriesMap.get(categoryId)!.push({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        imageUrl: sub.image_url,
      });
    });

    // Build response with nested subcategories
    return visibleCategories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.image_url,
      subcategories: subcategoriesMap.get(cat.id) || [],
    }));
   });
  }

  async getCategoryBySlug(slug: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data: category, error: catError } = await serviceClient
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (catError) {
      return null;
    }

    // Fetch subcategories for this category
    const { data: subcategories } = await serviceClient
      .from('subcategories')
      .select('*')
      .eq('category_id', category.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.image_url,
      subcategories: (subcategories || []).map((sub: any) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        imageUrl: sub.image_url,
      })),
    };
  }
}
