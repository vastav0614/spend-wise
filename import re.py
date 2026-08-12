import re
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def parse_bank_message(message):
    # 1. Extract the Amount
    # Looks for a '$' followed by digits and optional decimal points
    amount_pattern = r"\$(\d+(?:\.\d{1,2})?)"
    amount_match = re.search(amount_pattern, message)
    
    # 2. Extract the Merchant/Description
    # This is tricky. This specific regex looks for text between "at " and " on"
    merchant_pattern = r"at\s+(.*?)\s+on"
    merchant_match = re.search(merchant_pattern, message)

    # 3. Determine Type (Income or Expense)
    # Simple keyword check
    if "spent" in message.lower() or "debited" in message.lower():
        trans_type = "expense"
    elif "received" in message.lower() or "credited" in message.lower():
        trans_type = "income"
    else:
        trans_type = "expense" # Default

    # 4. Return the extracted data
    if amount_match and merchant_match:
        return {
            "amount": float(amount_match.group(1)),
            "description": merchant_match.group(1),
            "type": trans_type
        }
    else:
        return None

# --- TESTING THE FUNCTION ---
sample_sms = "Alert: You spent $45.50 at WALMART GROCERY on 10/24/2023. Available Balance: $500."

parsed_data = parse_bank_message(sample_sms)

if parsed_data:
    print("✅ Successfully Parsed Transaction:")
    print(f"Description: {parsed_data['description']}")
    print(f"Amount:      ${parsed_data['amount']}")
    print(f"Type:        {parsed_data['type']}")
else:
    print("❌ Could not understand the message format.")