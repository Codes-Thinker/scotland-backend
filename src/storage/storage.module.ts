import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Configuration } from '@/config/configuration';
import { LocalObjectStorage } from './local-object-storage';
import { OBJECT_STORAGE } from './object-storage';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) =>
        new LocalObjectStorage(config.get('storage.dir', { infer: true })),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
