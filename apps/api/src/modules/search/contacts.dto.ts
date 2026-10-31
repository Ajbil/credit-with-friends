import { ApiProperty } from '@nestjs/swagger';

export class ContactCardDto {
  @ApiProperty({ type: String, example: '0199e379-4302-7c2a-a332-9a2e80dabefe', description: 'The holder card to contact about.' }) cardId!: string;
}

export class ContactDataDto {
  @ApiProperty({ type: String, example: 'https://wa.me/919876543210?text=Hi%20Meera', description: 'WhatsApp chat link with an editable prefilled message.' }) whatsappUrl!: string;
}

export class ContactResponseDto {
  @ApiProperty({ type: Boolean, example: true }) success!: true;
  @ApiProperty({ type: ContactDataDto }) data!: ContactDataDto;
  @ApiProperty({ type: String, nullable: true, enum: [null], example: null }) error!: null;
}
