import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { ChatService, MessagePage, MessageView } from './chat.service';
import { ListMessagesQueryDto, SendMessageDto } from './dto/chat.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('rides/:id/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOkResponse({ description: 'Messages newest first; pass nextCursor to load older ones' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessagePage> {
    return this.chat.list(user, id, query.cursor, query.limit ?? 50);
  }

  @Post()
  @ApiConflictResponse({ description: 'No driver yet, or chat is closed' })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageView> {
    return this.chat.send(user, id, dto.body);
  }
}
