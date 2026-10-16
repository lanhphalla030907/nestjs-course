import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('dashboard')
  getDashboard(@Res() res: Response) {
    return res.redirect('/index.html');
  }

  @Get('app')
  getApp(@Res() res: Response) {
    return res.redirect('/index.html');
  }
}

