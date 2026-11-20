export type MarketplaceCartItem = {
  productId: string;
  name: string;
  imageUrl: string;
  pricePaise: number;
  size: string;
  quantity: number;
};

const STORAGE_KEY = "bootroom-marketplace-cart";
const EVENT_NAME = "bootroom:cart-updated";

export function readMarketplaceCart(): MarketplaceCartItem[] {
  if (typeof window === "undefined") return [];

  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item) =>
        item &&
        typeof item.productId === "string" &&
        typeof item.name === "string" &&
        typeof item.imageUrl === "string" &&
        Number.isSafeInteger(item.pricePaise) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 10 &&
        typeof item.size === "string"
    );
  } catch {
    return [];
  }
}

export function writeMarketplaceCart(items: MarketplaceCartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function addMarketplaceCartItem(item: MarketplaceCartItem) {
  const cart = readMarketplaceCart();
  const existing = cart.find(
    (entry) => entry.productId === item.productId && entry.size === item.size
  );

  if (existing) {
    if (existing.quantity >= 10) {
      return { ok: false, message: "Maximum quantity is 10 per item." };
    }
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }

  writeMarketplaceCart(cart);
  return { ok: true, message: "Added to your bag." };
}

export function marketplaceCartEventName() {
  return EVENT_NAME;
}
