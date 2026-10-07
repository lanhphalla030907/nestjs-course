// src/tasks/tasks.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTaskDto } from './dto/update-task.dto';
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}
  async findAll(
    userId: number,
    page = 1,
    limit = 10,
    completed?: boolean,
    search?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    const skip = (page - 1) * limit;
    const where: {
      userId: number;
      completed?: boolean;
      OR?: {
        title?: {
          contains: string;
          mode: 'insensitive';
        };
        description?: {
          contains: string;
          mode: 'insensitive';
        };
      }[];
    } = { userId }; //User 1 មិនអាចឃើញ Task របស់ User 2 ទេ
    if (completed !== undefined) {
      where.completed = completed;
    }
    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }
    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        skip,
        take: limit,
        where,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.task.count({
        where,
      }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: tasks,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
  async findOne(id: number, userId: number) {
    const result = await this.prisma.task.findUnique({
      where: {
        id,
        userId,
      },
    });
    if (!result) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return result;
  }
  async create(userId: number, title: string, description?: string) {
    return this.prisma.task.create({
      data: {
        userId,
        title,
        description,
      },
    });
  }
  async update(id: number, updateTaskDto: UpdateTaskDto, userId: number) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return this.prisma.task.update({
      where: {
        id,
      },
      data: updateTaskDto,
    });
  }
  async remove(id: number, userId: number) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        userId,
      },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return this.prisma.task.delete({
      where: {
        id,
      },
    });
  }
}
