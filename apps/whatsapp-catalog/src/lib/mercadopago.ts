import { MercadoPagoConfig, Preference } from 'mercadopago';

export interface MercadopagoLineItem {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
}

export async function createMercadopagoPreference(params: {
  accessToken: string;
  items: MercadopagoLineItem[];
  currency: string;
  externalReference: string;
  backUrls: { success: string; failure: string; pending: string };
}): Promise<{ initPoint: string; preferenceId: string }> {
  const client = new MercadoPagoConfig({ accessToken: params.accessToken });
  const preference = new Preference(client);

  const result = await preference.create({
    body: {
      items: params.items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: params.currency,
      })),
      external_reference: params.externalReference,
      back_urls: params.backUrls,
      auto_return: 'approved',
    },
  });

  if (!result.init_point || !result.id) {
    throw new Error('Mercado Pago no devolvió un link de pago.');
  }

  return { initPoint: result.init_point, preferenceId: result.id };
}
