import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { cached, TTL } from '../../common/cache.util';

/** Marketplace a shopper-facing category menu belongs to. */
export type ProductScope = 'wholesale' | 'retail' | 'social';

export const PRODUCT_SCOPES: ProductScope[] = [
  'wholesale',
  'retail',
  'social',
];

@Injectable()
export class PublicCategoriesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Category ids that currently have at least one publicly visible product,
   * grouped by marketplace.
   *
   * Kept per-marketplace rather than as one union: the wholesale menu links to
   * /wholesale/products, so a category whose only products are retail or social
   * listings is a dead end there. Shoppers reported exactly that — picking such
   * a category and landing on a page with nothing of theirs in it.
   *
   * `is_active` is deliberately untouched, so sellers can still list into a
   * category that no shopper menu currently shows.
   */
  private async getCategoryIdsByScope(): Promise<
    Record<ProductScope, Set<string>>
  > {
    // Cached: these are three full-table scans that would otherwise run on
    // every homepage/shop load, and were a major source of Supabase egress.
    const grouped = await cached(
      'categories:product-ids-by-scope',
      TTL.long,
      async () => {
        const serviceClient = this.supabaseService.getServiceClient();
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

        const collect = (rows: any[] | null) => [
          ...new Set(
            (rows || [])
              .map((row: any) => row.category_id)
              .filter((id: unknown): id is string => Boolean(id)),
          ),
        ];

        return {
          wholesale: collect(wholesale.data),
          retail: collect(retail.data),
          social: collect(social.data),
        };
      },
    );

    return {
      wholesale: new Set(grouped.wholesale),
      retail: new Set(grouped.retail),
      social: new Set(grouped.social),
    };
  }

  /**
   * Which categories a given menu should show. Without a scope the union is
   * used, which suits a mixed surface such as global search.
   */
  private async getVisibleCategoryIds(
    scope?: ProductScope,
  ): Promise<Set<string>> {
    const byScope = await this.getCategoryIdsByScope();
    if (scope) return byScope[scope];
    return new Set([
      ...byScope.wholesale,
      ...byScope.retail,
      ...byScope.social,
    ]);
  }

  async getAllCategoriesWithSubcategories(scope?: ProductScope) {
   return cached(`categories:all-with-subs:${scope || 'any'}`, TTL.medium, async () => {
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

    // Keep only categories a shopper on this surface can actually browse.
    const visibleCategoryIds = await this.getVisibleCategoryIds(scope);
    const visibleCategories = (categories || []).filter((cat: any) =>
      visibleCategoryIds.has(cat.id),
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
