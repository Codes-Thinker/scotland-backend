import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage, ChatThread } from '@/database/entities/chat.entity';
import { Ride } from '@/database/entities/ride.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ride, ChatThread, ChatMessage])],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
