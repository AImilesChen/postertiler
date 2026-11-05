// User-provided test candidates. Retrieve each Price from Stripe before checkout.
// Never infer environment, amount or currency from a price_ identifier.
export const TEST_CATALOG = Object.freeze({
  single: Object.freeze({ name: 'Cloud Single', price: 'price_1UYPKtLCedn0h1T7ayGEeRJU', amount: 199, currency: 'usd', credits: 1 }),
  pack5: Object.freeze({ name: 'Cloud Pack — 5 Exports', price: 'price_1UYPLJLCedn0h1T7kDdNNHDZ', amount: 599, currency: 'usd', credits: 5 }),
});
export const BILLING_VERSION = 'cloud-test-2026-11-05';
export function validTestPrice(price, plan) {
  return price?.id === plan.price && price.livemode === false && price.active === true &&
    price.type === 'one_time' && price.currency === plan.currency && price.unit_amount === plan.amount &&
    price.billing_scheme === 'per_unit' && !price.transform_quantity && !price.custom_unit_amount && !price.recurring;
}
