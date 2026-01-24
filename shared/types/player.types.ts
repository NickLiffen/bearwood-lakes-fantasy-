// Player domain types

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlayerDTO {
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
}

export interface UpdatePlayerDTO {
  firstName?: string;
  lastName?: string;
  picture?: string;
  price?: number;
}
