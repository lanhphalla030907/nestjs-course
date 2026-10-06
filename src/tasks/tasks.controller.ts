import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TaskQueryDto } from './dto/task-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuthUser } from '../auth/types/auth-user.type.js';
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly taskService: TasksService) {}
  @Post()
  create(
    @Req() req: Request & {user:AuthUser},
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.taskService.create(
      req.user.userId,
      createTaskDto.title,
      createTaskDto.description,
    );
  }
  @Get()
  findAll(
    @Req() req: Request & {user:AuthUser},
    @Query() query: TaskQueryDto
  ) {
    return this.taskService.findAll(
      req.user.userId,
      query.page,
      query.limit,
      query.completed,
      query.search,
    );
  }
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthUser },
) {
    return this.taskService.findOne(Number(id),req.user.userId);
  }
  @Patch(':id')
  update(@Param('id') id: string, 
  @Body() updateTaskDto: UpdateTaskDto,
  @Req() req: Request & { user: AuthUser },
   ) {
    return this.taskService.update(
      Number(id),
      updateTaskDto,
      req.user.userId,
    );
  }
  @Delete(':id')
  delete(
    @Param('id') id: string,
    @Req() req:Request & {user:AuthUser},
  ) {
    return this.taskService.remove(Number(id),req.user.userId);
  }
}
