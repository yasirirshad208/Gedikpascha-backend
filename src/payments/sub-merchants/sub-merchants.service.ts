import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { IyzicoService } from '../iyzico/iyzico.service';
import { IyzicoConfig } from '../iyzico/iyzico.config';
import { OnboardSubMerchantDto, SubMerchantBrandScope } from '../dto/sub-merchant.dto';

interface SubMerchantRow {
  id: string;
  brand_id: string | null;
  brand_scope: SubMerchantBrandScope;
  user_id: string | null;
  sub_merchant_external_id: string;
  sub_merchant_key: string | null;
  sub_merchant_type: string;
  legal_company_title: string | null;
  tax_office: string | null;
  tax_number: string | null;
  identity_number: string | null;
  iban: string;
  contact_name: string;
  contact_surname: string;
  email: string;
  gsm_number: string | null;
  address: string;
  currency: string;
  status: 'draft' | 'submitted' | 'active' | 'rejected' | 'suspended';
  provider_raw: unknown;
}

@Injectable()
export class SubMerchantsService {
  private readonly logger = new Logger(SubMerchantsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly iyzico: IyzicoService,
    private readonly config: IyzicoConfig,
  ) {}

  /**
   * Save (or overwrite) a draft sub-merchant for a brand or social seller.
   * The actual call to Iyzico happens on `submit()` (driven by admin approval).
   */
  async upsertDraft(userId: string, dto: OnboardSubMerchantDto) {
    const supabase = this.supabaseService.getServiceClient();
    this.assertTypeFields(dto);

    const brandId = dto.brandScope === 'social_user' ? null : dto.brandId;
    if (dto.brandScope !== 'social_user' && !brandId) {
      throw new BadRequestException('brandId is required for brand sub-merchants.');
    }

    if (brandId) {
      await this.assertBrandOwnership(dto.brandScope, brandId, userId);
    }

    const externalId =
      dto.brandScope === 'social_user' ? `gp-social-${userId}` : `gp-${dto.brandScope}-${brandId}`;

    // Try to find an existing row.
    const { data: existing } = await supabase
      .from('sub_merchants')
      .select('id, status, sub_merchant_key')
      .eq('sub_merchant_external_id', externalId)
      .maybeSingle();

    const payload = {
      brand_id: brandId,
      brand_scope: dto.brandScope,
      user_id: userId,
      sub_merchant_external_id: externalId,
      sub_merchant_type: dto.subMerchantType,
      legal_company_title: dto.legalCompanyTitle ?? null,
      tax_office: dto.taxOffice ?? null,
      tax_number: dto.taxNumber ?? null,
      identity_number: dto.identityNumber ?? null,
      iban: dto.iban,
      contact_name: dto.contactName,
      contact_surname: dto.contactSurname,
      email: dto.email,
      gsm_number: dto.gsmNumber ?? null,
      address: dto.address,
      currency: this.config.defaultCurrency,
      // Keep existing status / key if already submitted; otherwise mark draft.
      status: existing?.status && existing.sub_merchant_key ? existing.status : 'draft',
    };

    if (existing) {
      const { error } = await supabase.from('sub_merchants').update(payload).eq('id', existing.id);
      if (error) throw new InternalServerErrorException(error.message);
      return { id: existing.id, status: payload.status };
    }

    const { data, error } = await supabase
      .from('sub_merchants')
      .insert(payload)
      .select('id, status')
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Link the brand to its sub-merchant if applicable.
    if (brandId) {
      const brandTable =
        dto.brandScope === 'wholesale_brand' ? 'wholesale_brands' : 'retail_brands';
      await supabase
        .from(brandTable)
        .update({ sub_merchant_id: data!.id, payout_status: 'draft' })
        .eq('id', brandId);
    } else {
      await supabase
        .from('social_profiles')
        .update({ sub_merchant_id: data!.id, payout_status: 'draft' })
        .eq('user_id', userId);
    }

    return { id: data!.id, status: data!.status };
  }

  /**
   * Submit the draft to Iyzico. Idempotent: re-submitting an `active` row updates instead.
   * Called from admin brand-approval and from the seller's "retry" button.
   */
  async submit(subMerchantId: string): Promise<{
    status: SubMerchantRow['status'];
    subMerchantKey: string | null;
  }> {
    const supabase = this.supabaseService.getServiceClient();
    const { data, error } = await supabase
      .from('sub_merchants')
      .select('*')
      .eq('id', subMerchantId)
      .maybeSingle();

    if (error || !data) throw new NotFoundException('Sub-merchant not found.');
    const row = data as SubMerchantRow;

    const conversationId = `gp-submerchant-${row.id}-${Date.now()}`;
    const reqBase = {
      locale: this.iyzico.LOCALE.TR,
      conversationId,
      subMerchantType: row.sub_merchant_type as 'PERSONAL' | 'PRIVATE_COMPANY' | 'LIMITED_OR_JOINT_STOCK_COMPANY',
      address: row.address,
      contactName: row.contact_name,
      contactSurname: row.contact_surname,
      email: row.email,
      gsmNumber: row.gsm_number || undefined,
      name: row.legal_company_title || `${row.contact_name} ${row.contact_surname}`,
      iban: row.iban,
      identityNumber: row.identity_number || undefined,
      taxOffice: row.tax_office || undefined,
      taxNumber: row.tax_number || undefined,
      legalCompanyTitle: row.legal_company_title || undefined,
      currency: this.iyzico.CURRENCY[row.currency as 'TRY' | 'EUR' | 'USD' | 'GBP'] || this.iyzico.CURRENCY.TRY,
    };

    let providerResp;
    try {
      if (row.sub_merchant_key) {
        providerResp = await this.iyzico.updateSubMerchant({
          ...reqBase,
          subMerchantKey: row.sub_merchant_key,
        });
      } else {
        providerResp = await this.iyzico.createSubMerchant({
          ...reqBase,
          subMerchantExternalId: row.sub_merchant_external_id,
        });
      }
    } catch (err: unknown) {
      this.logger.error(`Sub-merchant submit failed for ${row.id}`, err as Error);
      await supabase
        .from('sub_merchants')
        .update({ status: 'rejected', provider_raw: { error: String(err) } })
        .eq('id', row.id);
      await this.setBrandPayoutStatus(row, 'onboarding_failed');
      throw new InternalServerErrorException('Iyzico sub-merchant call failed.');
    }

    const isOk = providerResp.status === 'success';
    const nextStatus: SubMerchantRow['status'] = isOk ? 'active' : 'rejected';
    const subMerchantKey = providerResp.subMerchantKey || row.sub_merchant_key || null;

    await supabase
      .from('sub_merchants')
      .update({
        status: nextStatus,
        sub_merchant_key: subMerchantKey,
        provider_raw: providerResp as unknown,
      })
      .eq('id', row.id);

    await this.setBrandPayoutStatus(row, isOk ? 'active' : 'onboarding_failed');

    return { status: nextStatus, subMerchantKey };
  }

  async getMine(userId: string) {
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from('sub_merchants')
      .select('id, brand_scope, brand_id, sub_merchant_type, status, sub_merchant_key, iban, legal_company_title, tax_number, contact_name, contact_surname, gsm_number, email')
      .eq('user_id', userId);
    return data || [];
  }

  async getById(id: string) {
    const supabase = this.supabaseService.getServiceClient();
    const { data, error } = await supabase
      .from('sub_merchants')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) throw new NotFoundException('Sub-merchant not found.');
    return data;
  }

  async findByBrand(brandScope: SubMerchantBrandScope, brandId?: string, userId?: string) {
    const supabase = this.supabaseService.getServiceClient();
    let q = supabase.from('sub_merchants').select('*').eq('brand_scope', brandScope);
    if (brandId) q = q.eq('brand_id', brandId);
    if (userId) q = q.eq('user_id', userId);
    const { data } = await q.maybeSingle();
    return data;
  }

  // -- Internals ------------------------------------------------------------

  private assertTypeFields(dto: OnboardSubMerchantDto): void {
    if (dto.subMerchantType === 'PERSONAL' && !dto.identityNumber) {
      throw new BadRequestException(
        'identityNumber (TC kimlik) is required for PERSONAL sub-merchants.',
      );
    }
    if (
      dto.subMerchantType !== 'PERSONAL' &&
      (!dto.taxNumber || !dto.taxOffice || !dto.legalCompanyTitle)
    ) {
      throw new BadRequestException(
        'legalCompanyTitle, taxOffice and taxNumber are required for company sub-merchants.',
      );
    }
  }

  private async assertBrandOwnership(
    scope: SubMerchantBrandScope,
    brandId: string,
    userId: string,
  ): Promise<void> {
    if (scope === 'social_user') return;
    const table = scope === 'wholesale_brand' ? 'wholesale_brands' : 'retail_brands';
    const supabase = this.supabaseService.getServiceClient();
    const { data } = await supabase
      .from(table)
      .select('id, user_id')
      .eq('id', brandId)
      .maybeSingle();
    if (!data) throw new NotFoundException('Brand not found.');
    if ((data as { user_id: string }).user_id !== userId) {
      throw new BadRequestException('You can only configure payouts for your own brand.');
    }
  }

  private async setBrandPayoutStatus(
    row: SubMerchantRow,
    payoutStatus: 'draft' | 'submitted' | 'active' | 'rejected' | 'suspended' | 'onboarding_failed',
  ): Promise<void> {
    const supabase = this.supabaseService.getServiceClient();
    if (row.brand_scope === 'social_user' && row.user_id) {
      await supabase
        .from('social_profiles')
        .update({ payout_status: payoutStatus, sub_merchant_id: row.id })
        .eq('user_id', row.user_id);
      return;
    }
    if (row.brand_id) {
      const table =
        row.brand_scope === 'wholesale_brand' ? 'wholesale_brands' : 'retail_brands';
      await supabase
        .from(table)
        .update({ payout_status: payoutStatus, sub_merchant_id: row.id })
        .eq('id', row.brand_id);
    }
  }
}
