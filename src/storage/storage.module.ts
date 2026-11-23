import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Configuration } from '@/config/configuration';
import { LocalObjectStorage } from './local-object-storage';
import { S3ObjectStorage } from './s3-object-storage';
import { OBJECT_STORAGE } from './object-storage';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => {
        const storage = config.get('storage', { infer: true });
        if (storage.driver === 's3') {
          return S3ObjectStorage.create(storage.s3);
        }
        return new LocalObjectStorage(storage.dir);
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
