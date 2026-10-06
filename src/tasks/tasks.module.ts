import { Module } from '@nestjs/common';

import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],

  controllers: [TasksController],

  providers: [TasksService],
})
export class TasksModule {}