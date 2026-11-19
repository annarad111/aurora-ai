import { conversationListSchema, conversationSchema } from '@aurora/shared';
import type { AppDependencies } from '../app';
import { errorResponse, jsonResponse } from '../http/json-response';

const RECENT_CONVERSATION_COUNT = 30;

/** GET /api/conversations?hotel=<id>: the sidebar's "Recent" list, newest first. */
export async function handleListConversations(url: URL, dependencies: AppDependencies): Promise<Response> {
  const hotelId = url.searchParams.get('hotel');
  if (!hotelId) return errorResponse(400, 'missing_hotel', 'Add ?hotel=<id>');
  const conversations = await dependencies.toolContext.repository.listConversations(hotelId, RECENT_CONVERSATION_COUNT);
  return jsonResponse(conversationListSchema.parse({ conversations }));
}

/** GET /api/conversations/:id: a conversation with every stored answer, to show it again as it was. */
export async function handleGetConversation(conversationId: string, dependencies: AppDependencies): Promise<Response> {
  const conversation = await dependencies.toolContext.repository.findConversation(conversationId);
  if (!conversation) return errorResponse(404, 'unknown_conversation', 'No conversation with this id');
  return jsonResponse(conversationSchema.parse(conversation));
}
