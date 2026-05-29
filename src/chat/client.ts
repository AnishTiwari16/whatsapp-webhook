import { CHAT_API_URL, DERMAGPT_API_KEY } from '../config.js';
import type {
  AiResponse,
  ChatPayload,
  ChatResponse,
  ProductItem,
  V2UploadResponse,
} from '../types.js';
import { parseNestedJson } from '../utils/json.js';

function normalizeProductList(payload: ChatPayload): ProductItem[] {
  const routineProducts = payload?.routine?.products;

  if (Array.isArray(routineProducts)) {
    return routineProducts;
  }

  if (Array.isArray(payload?.products)) {
    return payload.products;
  }

  return [];
}

export async function forwardMessageToChatService(
  messageText: string | undefined,
  from: string,
  uploadResponse?: V2UploadResponse
): Promise<AiResponse> {
  const payload: Record<string, unknown> = {
    message: typeof messageText === 'string' ? messageText : '',
  };

  if (uploadResponse?.file_urls?.length) {
    payload.file_urls = uploadResponse.file_urls;
  }

  if (uploadResponse?.image_category) {
    payload.image_category = uploadResponse.image_category;
  }
  payload.phone_number = from;

  const response = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': DERMAGPT_API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Chat endpoint failed (${CHAT_API_URL}): ${response.status} ${
        responseText || '<empty response>'
      }`
    );
  }

  if (!responseText.trim()) {
    throw new Error('Chat endpoint returned an empty response body');
  }
  let parsed: ChatResponse;
  try {
    parsed = JSON.parse(responseText) as ChatResponse;
  } catch (error) {
    throw new Error(
      `Chat endpoint returned invalid JSON: ${responseText.slice(0, 500)}`
    );
  }

  let responsePayload: unknown = parsed.response || parsed.message || '';
  responsePayload = parseNestedJson(responsePayload);

  if (typeof responsePayload === 'string') {
    return {
      text: responsePayload,
      products: [],
      directions: '',
      trigger_consultation: false
    };
  }

  const responseObject = responsePayload as ChatPayload;
  let responseTextValue = responseObject?.message || responseObject?.response || '';
  return {
    text: responseTextValue,
    products: normalizeProductList(responseObject),
    directions: responseObject?.routine?.directions || '',
    trigger_consultation: Boolean(responseObject?.triggers_consultation)
  };
}
