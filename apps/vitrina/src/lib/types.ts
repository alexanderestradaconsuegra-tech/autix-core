export interface Business {
  id: string;
  slug: string;
  name: string;
  phone: string;
  currency: string;
  logoUrl: string | null;
  welcomeMessage: string | null;
  isActive: boolean;
  acceptsMercadopago: boolean;
  googleReviewsUrl: string | null;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stock: number | null;
  isAvailable: boolean;
  sortOrder: number;
}

export interface CatalogData {
  business: Business;
  categories: Category[];
  products: Product[];
}
