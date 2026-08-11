import type { Category } from '../types';

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Food: [
    'biryani', 'pizza', 'burger', 'coffee', 'tea', 'restaurant', 'dinner', 'lunch',
    'breakfast', 'zomato', 'swiggy', 'dominos', 'starbucks', 'kfc', 'mcdonalds',
    'groceries', 'grocery', 'supermarket', 'fruit', 'fruits', 'vegetable', 'vegetables',
    'milk', 'bread', 'snacks', 'food', 'cafe', 'bakery', 'dosa', 'roti', 'thali',
    'ice cream', 'juice', 'bar', 'pub', 'sweet', 'sweets', 'snack', 'coke', 'pepsi',
    'chai', 'hotel', 'dining', 'chicken', 'mutton', 'paneer', 'rice', 'meal', 'meals'
  ],
  Transport: [
    'uber', 'ola', 'rapido', 'cab', 'taxi', 'metro', 'bus', 'train', 'flight',
    'airline', 'indigo', 'petrol', 'diesel', 'fuel', 'gas station', 'toll', 'parking',
    'auto', 'rickshaw', 'commute', 'ticket', 'subway', 'railway', 'bike petrol',
    'car fuel', 'fastag', 'transit', 'uber pool', 'ola auto'
  ],
  Entertainment: [
    'movie', 'movies', 'cinema', 'netflix', 'spotify', 'prime', 'hotstar', 'concert',
    'game', 'gaming', 'playstation', 'xbox', 'steam', 'event', 'show', 'theater',
    'bowling', 'park', 'amusement', 'music', 'subscription', 'youtube', 'apple music',
    'pvr', 'inox', 'bookmyshow', 'outing', 'party'
  ],
  Shopping: [
    'amazon', 'flipkart', 'myntra', 'clothes', 'clothing', 'shoes', 'footwear',
    'dress', 'shirt', 'pants', 'jeans', 'tshirt', 'electronics', 'laptop', 'phone',
    'gadget', 'furniture', 'mall', 'retail', 'store', 'bag', 'watch', 'makeup',
    'beauty', 'cosmetics', 'zara', 'h&m', 'meesho', 'ajio', 'shopping', 'accessories'
  ],
  Utilities: [
    'electricity', 'water', 'wifi', 'internet', 'broadband', 'recharge', 'mobile bill',
    'phone bill', 'gas cylinder', 'lpg', 'dth', 'tv bill', 'maintenance', 'rent',
    'house rent', 'maid', 'cook', 'trash', 'waste', 'jio', 'airtel', 'vi', 'bescom',
    'tata play', 'utility', 'bills', 'electricity bill'
  ],
  Health: [
    'doctor', 'hospital', 'medicine', 'medicines', 'pharmacy', 'medical', 'clinic',
    'gym', 'fitness', 'workout', 'dentist', 'lab test', 'blood test', 'health',
    'checkup', 'tablets', 'apollo', '1mg', 'pharmeasy', 'cult fit', 'supplements',
    'protein', 'therapy', 'dental'
  ],
  EMI: [
    'emi', 'loan', 'mortgage', 'car loan', 'home loan', 'bike loan', 'installment',
    'credit card bill', 'finance', 'interest', 'bajaj', 'hdfc loan', 'sbi loan', 'personal loan'
  ],
  Other: []
};

/**
 * Predicts category from text query (e.g. notes or expense title).
 * Returns the matching Category or null if no confident match is found.
 */
export function predictCategoryFromText(text: string): Category | null {
  if (!text || !text.trim()) return null;

  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/[\s,._/-]+/);

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'Other') continue;

    // Check exact keyword match or word containment
    for (const keyword of keywords) {
      if (normalized.includes(keyword) || words.includes(keyword)) {
        return category as Category;
      }
    }
  }

  return null;
}
