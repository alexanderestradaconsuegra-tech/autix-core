import 'server-only';

interface LemonSqueezyCheckoutResponse {
  data: {
    attributes: { url: string };
  };
}

/**
 * Crea un checkout de Lemon Squeezy para la licencia de por vida de
 * Vitrina ($7 USD, pago único). `businessId` viaja como custom data y
 * vuelve en el webhook (ver src/app/api/webhooks/lemonsqueezy/route.ts)
 * para saber qué negocio activar.
 */
export async function createLicenseCheckout(params: { businessId: string; email?: string }): Promise<string> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) {
    throw new Error('Lemon Squeezy no está configurado en el servidor.');
  }

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: { business_id: params.businessId },
            ...(params.email ? { email: params.email } : {}),
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: storeId } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Lemon Squeezy respondió ${response.status} al crear el checkout.`);
  }

  const data = (await response.json()) as LemonSqueezyCheckoutResponse;
  return data.data.attributes.url;
}
