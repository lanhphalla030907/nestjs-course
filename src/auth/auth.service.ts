import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/resgister.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma:PrismaService,
        private readonly jwtService:JwtService,
    ){}

    async register(regsiterDto : RegisterDto){
        const{name,email,password} = regsiterDto;
        const existingUser = await this.prisma.user.findUnique({
            where : {email},
        });
        if(existingUser){
            throw new ConflictException('Email already exists');
        }
        const passwordHash= await bcrypt.hash(password,10);
        const user = await this.prisma.user.create({
            data : {
                name,email,passwordHash,
            }
        });
        return {
            message : "User register already",
            user : {
                id:user.id,
                name:user.name,
                email:user.email,
            },
        };
    }

    async login (loginDto: LoginDto){
        const {email,password} = loginDto;
        const user = await this.prisma.user.findUnique({
            where:{email},
        });
        if(!user){
            throw new UnauthorizedException("Ivalid email or password");
        }
        const passwordMatch = await bcrypt.compare(
            password,user.passwordHash
        );
        if(!passwordMatch){
            throw new UnauthorizedException('Invalid email or password');
        }
        const accessToken = await this.jwtService.signAsync({
            sub:user.id,  //sub mean subject's token
            email:user.email,
        });
        return {
            message : "login succesfully",
            accessToken,
            user : {
               id:user.id,
               name:user.name,
               email:user.email, 
            },
        };
    }
}
