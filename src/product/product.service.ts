import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  private product = [
    {
      id: 1,
      name: 'Black T-Shirt',
      price: 15,
    },
    {
      id: 2,
      name: 'Blue Jeans',
      price: 30,
    },
  ];
  findAll() {
    return this.product;
  }
  findOne(id: number) {
    const product = this.product.find((product) => product.id === id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
  create(createProductDto: CreateProductDto) {
    const newProduct = {
      id: this.product.length + 1,
      name: createProductDto.name,
      price: createProductDto.price,
    };
    this.product.push(newProduct);
    return newProduct;
  }
  update(id: number, updateProductDto: UpdateProductDto) {
    const product = this.product.find((product) => product.id === id);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (updateProductDto.name !== undefined) {
      product.name = updateProductDto.name;
    }
    if (updateProductDto.price !== undefined) {
      product.price = updateProductDto.price;
    }
    return product;
  }
  remove(id: number) {
    const productIndex = this.product.findIndex((product) => product.id === id);

    if (productIndex === -1) {
      throw new NotFoundException('Product not found');
    }

    const deletedProduct = this.product.splice(productIndex, 1);

    return deletedProduct[0];
  }
}
