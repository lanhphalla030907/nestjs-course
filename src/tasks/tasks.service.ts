// src/tasks/tasks.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';

export interface Task {
  id: number;
  title: string;
  description?: string;
  done: boolean;
}

@Injectable()
export class TasksService {
  private tasks: Task[] = [];
  private nextId = 1;

  findAll(): Task[] {
    return this.tasks;
  }

  findOne(id: number): Task {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  create(data: { title: string; description?: string }): Task {
    const task: Task = { id: this.nextId++, done: false, ...data };
    this.tasks.push(task);
    return task;
  }

  update(id: number, data: Partial<Pick<Task, 'title' | 'description' | 'done'>>): Task {
    const task = this.findOne(id);
    Object.assign(task, data);
    return task;
  }

  remove(id: number): { removed: true } {
    const index = this.tasks.findIndex((t) => t.id === id);
    if (index === -1) throw new NotFoundException(`Task ${id} not found`);
    this.tasks.splice(index, 1);
    return { removed: true };
  }
}