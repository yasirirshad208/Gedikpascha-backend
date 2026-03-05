import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ClosetService } from './closet.service';
import { SocialClosetSearchDto } from '../common/dto/social-closet-search.dto';

@Controller('social/closet')
export class ClosetController {
  constructor(private readonly closetService: ClosetService) {}

  @Get('search')
  async search(@Query(new ValidationPipe({ transform: true })) query: SocialClosetSearchDto) {
    return this.closetService.searchCloset(query);
  }
}

