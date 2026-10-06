import { Body, Controller, Post } from '@nestjs/common';
import { RegisterDto } from './dto/resgister.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
   constructor(private readonly authService : AuthService){}
   @Post('register')
   regsiter(@Body() regsiterDto : RegisterDto){
     return this.authService.register(regsiterDto);
   }
   @Post('login')
   login(@Body() loginDto : LoginDto){
    return this.authService.login(loginDto);
   }
}
