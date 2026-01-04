import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class PublicCategoriesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getAllCategoriesWithSubcategories() {
    const serviceClient = this.supabaseService.getServiceClient();

    // Fetch all active categories
    const { data: categories, error: catError } = await serviceClient
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (catError) {
      throw new BadRequestException(`Failed to fetch categories: ${catError.message}`);
    }

    // Fetch all active subcategories
    const { data: subcategories, error: subError } = await serviceClient
      .from('subcategories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (subError) {
      throw new BadRequestException(`Failed to fetch subcategories: ${subError.message}`);
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
    return (categories || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.image_url,
      subcategories: subcategoriesMap.get(cat.id) || [],
    }));
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
