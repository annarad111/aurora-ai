import { conversationListSchema, conversationSchema, renameConversationSchema } from '@aurora/shared';
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

/**
 * PATCH /api/conversations/:id?hotel=<id>   body: { "title": "…" }
 * The user's own title. Answers stored later keep it.
 */
export async function handleRenameConversation(request: Request, url: URL, conversationId: string, dependencies: AppDependencies): Promise<Response> {
  const hotelId = url.searchParams.get('hotel');
  if (!hotelId) return errorResponse(400, 'missing_hotel', 'Add ?hotel=<id>');
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'The request body must be JSON');
  }
  const parsed = renameConversationSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, 'invalid_request', parsed.error.issues.map((issue) => issue.message).join('; '));
  const renamed = await dependencies.toolContext.repository.renameConversation(hotelId, conversationId, parsed.data.title);
  if (!renamed) return errorResponse(404, 'unknown_conversation', 'No conversation with this id for this hotel');
  return jsonResponse({ id: conversationId, title: parsed.data.title });
}

/** DELETE /api/conversations/:id?hotel=<id>: the conversation and every stored answer, for good. */
export async function handleDeleteConversation(url: URL, conversationId: string, dependencies: AppDependencies): Promise<Response> {
  const hotelId = url.searchParams.get('hotel');
  if (!hotelId) return errorResponse(400, 'missing_hotel', 'Add ?hotel=<id>');
  const deleted = await dependencies.toolContext.repository.deleteConversation(hotelId, conversationId);
  if (!deleted) return errorResponse(404, 'unknown_conversation', 'No conversation with this id for this hotel');
  return new Response(null, { status: 204 });
}
