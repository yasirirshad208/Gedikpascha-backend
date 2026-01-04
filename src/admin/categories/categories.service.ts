import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getAllCategories(includeInactive = false) {
    const serviceClient = this.supabaseService.getServiceClient();

    let query = serviceClient
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch categories: ${error.message}`);
    }

    return (data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.image_url,
      isActive: cat.is_active,
      displayOrder: cat.display_order,
      createdAt: cat.created_at,
      updatedAt: cat.updated_at,
    }));
  }

  async getCategoryById(categoryId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    const { data, error } = await serviceClient
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException('Category not found');
      }
      throw new BadRequestException(`Failed to fetch category: ${error.message}`);
    }

    // Fetch subcategories for this category
    const { data: subcategories, error: subError } = await serviceClient
      .from('subcategories')
      .select('*')
      .eq('category_id', categoryId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (subError) {
      console.error('Failed to fetch subcategories:', subError);
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.image_url,
      isActive: data.is_active,
      displayOrder: data.display_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      subcategories: (subcategories || []).map((sub: any) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        imageUrl: sub.image_url,
        isActive: sub.is_active,
        displayOrder: sub.display_order,
        createdAt: sub.created_at,
        updatedAt: sub.updated_at,
      })),
    };
  }

  async createCategory(createCategoryDto: CreateCategoryDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if slug already exists
    const { data: existingSlug } = await serviceClient
      .from('categories')
      .select('id')
      .eq('slug', createCategoryDto.slug)
      .maybeSingle();

    if (existingSlug) {
      throw new BadRequestException('A category with this slug already exists');
    }

    const { data, error } = await serviceClient
      .from('categories')
      .insert({
        name: createCategoryDto.name,
        slug: createCategoryDto.slug,
        description: createCategoryDto.description || null,
        image_url: createCategoryDto.imageUrl || null,
        is_active: createCategoryDto.isActive ?? true,
        display_order: createCategoryDto.displayOrder ?? 0,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create category: ${error.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.image_url,
      isActive: data.is_active,
      displayOrder: data.display_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updateCategory(categoryId: string, updateCategoryDto: UpdateCategoryDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if category exists
    const { data: existingCategory, error: fetchError } = await serviceClient
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .maybeSingle();

    if (fetchError || !existingCategory) {
      throw new NotFoundException('Category not found');
    }

    // Check if slug is being updated and already exists
    if (updateCategoryDto.slug) {
      const { data: existingSlug } = await serviceClient
        .from('categories')
        .select('id')
        .eq('slug', updateCategoryDto.slug)
        .neq('id', categoryId)
        .maybeSingle();

      if (existingSlug) {
        throw new BadRequestException('A category with this slug already exists');
      }
    }

    const updateData: any = {};
    if (updateCategoryDto.name !== undefined) updateData.name = updateCategoryDto.name;
    if (updateCategoryDto.slug !== undefined) updateData.slug = updateCategoryDto.slug;
    if (updateCategoryDto.description !== undefined) updateData.description = updateCategoryDto.description;
    if (updateCategoryDto.imageUrl !== undefined) updateData.image_url = updateCategoryDto.imageUrl;
    if (updateCategoryDto.isActive !== undefined) updateData.is_active = updateCategoryDto.isActive;
    if (updateCategoryDto.displayOrder !== undefined) updateData.display_order = updateCategoryDto.displayOrder;

    const { data, error } = await serviceClient
      .from('categories')
      .update(updateData)
      .eq('id', categoryId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update category: ${error.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.image_url,
      isActive: data.is_active,
      displayOrder: data.display_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async deleteCategory(categoryId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if category exists
    const { data: existingCategory, error: fetchError } = await serviceClient
      .from('categories')
      .select('id, name')
      .eq('id', categoryId)
      .maybeSingle();

    if (fetchError || !existingCategory) {
      throw new NotFoundException('Category not found');
    }

    // Check if category is being used by any products
    const { count: productCount } = await serviceClient
      .from('wholesale_products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);

    if (productCount && productCount > 0) {
      throw new BadRequestException(
        `Cannot delete category "${existingCategory.name}" because it is used by ${productCount} product(s). Please reassign or delete those products first.`
      );
    }

    const { error } = await serviceClient
      .from('categories')
      .delete()
      .eq('id', categoryId);

    if (error) {
      throw new BadRequestException(`Failed to delete category: ${error.message}`);
    }

    return { message: 'Category deleted successfully' };
  }

  // Subcategory methods
  async createSubcategory(createSubcategoryDto: CreateSubcategoryDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Verify category exists
    const { data: category, error: catError } = await serviceClient
      .from('categories')
      .select('id')
      .eq('id', createSubcategoryDto.categoryId)
      .maybeSingle();

    if (catError || !category) {
      throw new NotFoundException('Parent category not found');
    }

    // Check if slug already exists within the same category
    const { data: existingSlug } = await serviceClient
      .from('subcategories')
      .select('id')
      .eq('category_id', createSubcategoryDto.categoryId)
      .eq('slug', createSubcategoryDto.slug)
      .maybeSingle();

    if (existingSlug) {
      throw new BadRequestException('A subcategory with this slug already exists in this category');
    }

    const { data, error } = await serviceClient
      .from('subcategories')
      .insert({
        category_id: createSubcategoryDto.categoryId,
        name: createSubcategoryDto.name,
        slug: createSubcategoryDto.slug,
        description: createSubcategoryDto.description || null,
        image_url: createSubcategoryDto.imageUrl || null,
        is_active: createSubcategoryDto.isActive ?? true,
        display_order: createSubcategoryDto.displayOrder ?? 0,
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to create subcategory: ${error.message}`);
    }

    return {
      id: data.id,
      categoryId: data.category_id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.image_url,
      isActive: data.is_active,
      displayOrder: data.display_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getSubcategoriesByCategory(categoryId: string, includeInactive = false) {
    const serviceClient = this.supabaseService.getServiceClient();

    let query = serviceClient
      .from('subcategories')
      .select('*')
      .eq('category_id', categoryId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to fetch subcategories: ${error.message}`);
    }

    return (data || []).map((sub: any) => ({
      id: sub.id,
      categoryId: sub.category_id,
      name: sub.name,
      slug: sub.slug,
      description: sub.description,
      imageUrl: sub.image_url,
      isActive: sub.is_active,
      displayOrder: sub.display_order,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
    }));
  }

  async updateSubcategory(subcategoryId: string, updateSubcategoryDto: UpdateSubcategoryDto) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if subcategory exists
    const { data: existingSub, error: fetchError } = await serviceClient
      .from('subcategories')
      .select('id, category_id')
      .eq('id', subcategoryId)
      .maybeSingle();

    if (fetchError || !existingSub) {
      throw new NotFoundException('Subcategory not found');
    }

    // Check if slug is being updated and already exists in the same category
    if (updateSubcategoryDto.slug) {
      const { data: existingSlug } = await serviceClient
        .from('subcategories')
        .select('id')
        .eq('category_id', existingSub.category_id)
        .eq('slug', updateSubcategoryDto.slug)
        .neq('id', subcategoryId)
        .maybeSingle();

      if (existingSlug) {
        throw new BadRequestException('A subcategory with this slug already exists in this category');
      }
    }

    const updateData: any = {};
    if (updateSubcategoryDto.name !== undefined) updateData.name = updateSubcategoryDto.name;
    if (updateSubcategoryDto.slug !== undefined) updateData.slug = updateSubcategoryDto.slug;
    if (updateSubcategoryDto.description !== undefined) updateData.description = updateSubcategoryDto.description;
    if (updateSubcategoryDto.imageUrl !== undefined) updateData.image_url = updateSubcategoryDto.imageUrl;
    if (updateSubcategoryDto.isActive !== undefined) updateData.is_active = updateSubcategoryDto.isActive;
    if (updateSubcategoryDto.displayOrder !== undefined) updateData.display_order = updateSubcategoryDto.displayOrder;

    const { data, error } = await serviceClient
      .from('subcategories')
      .update(updateData)
      .eq('id', subcategoryId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to update subcategory: ${error.message}`);
    }

    return {
      id: data.id,
      categoryId: data.category_id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      imageUrl: data.image_url,
      isActive: data.is_active,
      displayOrder: data.display_order,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async deleteSubcategory(subcategoryId: string) {
    const serviceClient = this.supabaseService.getServiceClient();

    // Check if subcategory exists
    const { data: existingSub, error: fetchError } = await serviceClient
      .from('subcategories')
      .select('id, name')
      .eq('id', subcategoryId)
      .maybeSingle();

    if (fetchError || !existingSub) {
      throw new NotFoundException('Subcategory not found');
    }

    // Check if subcategory is being used by any products
    const { count: productCount } = await serviceClient
      .from('wholesale_products')
      .select('id', { count: 'exact', head: true })
      .eq('subcategory_id', subcategoryId);

    if (productCount && productCount > 0) {
      throw new BadRequestException(
        `Cannot delete subcategory "${existingSub.name}" because it is used by ${productCount} product(s). Please reassign or delete those products first.`
      );
    }

    const { error } = await serviceClient
      .from('subcategories')
      .delete()
      .eq('id', subcategoryId);

    if (error) {
      throw new BadRequestException(`Failed to delete subcategory: ${error.message}`);
    }

    return { message: 'Subcategory deleted successfully' };
  }
}
