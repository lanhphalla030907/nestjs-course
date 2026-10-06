import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('product')
export class ProductController {
  constructor(
    private readonly productService: ProductService, //NestJS inject ProductsService មកឱ្យ Controller
  ) {}
  @Get()
  findAll() {
    return this.productService.findAll();
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(Number(id));
  }
  @Post()
  create(@Body() createProductDto: CreateProductDto ) {
    return this.productService.create(createProductDto);
  }
  @Patch(':id')
  update(
    @Param('id') id:string,
    @Body() updateProductDto : UpdateProductDto,
  ){
    return this.productService.update(
        Number(id),
        updateProductDto,
    )
  }
  @Delete(':id')
  delete(@Param('id') id:string){
   return this.productService.remove(Number(id));
  }
}
