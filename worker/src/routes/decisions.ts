import {
  decisionActionPatchSchema,
  decisionActionSchema,
  decisionsSchema,
  newDecisionActionSchema,
  newSavedInsightSchema,
  savedInsightSchema,
} from '@aurora/shared';
import type { z } from 'zod';
import type { AppDependencies } from '../app';
import { createAction, DecisionError, deleteAction, listDecisions, removeInsight, saveInsight, updateAction } from '../decisions/decision-service';
import { errorResponse, jsonResponse } from '../http/json-response';

// Routes of insight to action. Every request names its hotel, and a record is
// only ever read or changed through that hotel.

const INSIGHT_PATH = /^\/api\/decisions\/insights\/([A-Za-z0-9-]{8,64})$/;
const ACTION_PATH = /^\/api\/decisions\/actions\/([A-Za-z0-9-]{8,64})$/;

async function readJson<Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.infer<Schema> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'The request body must be JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  return parsed.data;
}

async function requireKnownHotel(hotelId: string | null, dependencies: AppDependencies): Promise<Response | null> {
  if (!hotelId) return errorResponse(400, 'missing_hotel', 'Add ?hotel=<id>');
  return (await dependencies.toolContext.repository.findHotel(hotelId)) ? null : errorResponse(404, 'unknown_hotel', `No hotel with id "${hotelId}"`);
}

/** Handles /api/decisions…, or returns null when the path is not one of them. */
export async function handleDecisions(request: Request, url: URL, dependencies: AppDependencies): Promise<Response | null> {
  const { pathname } = url;
  const { toolContext } = dependencies;
  const now = new Date().toISOString();
  try {
    if (pathname === '/api/decisions') {
      if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Use GET');
      const hotelId = url.searchParams.get('hotel');
      const problem = await requireKnownHotel(hotelId, dependencies);
      if (problem) return problem;
      return jsonResponse(decisionsSchema.parse(await listDecisions(toolContext, hotelId!)));
    }

    if (pathname === '/api/decisions/insights') {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST');
      const newInsight = await readJson(request, newSavedInsightSchema);
      if (newInsight instanceof Response) return newInsight;
      const problem = await requireKnownHotel(newInsight.hotelId, dependencies);
      if (problem) return problem;
      const { insight, created } = await saveInsight(toolContext, newInsight, now);
      return jsonResponse(savedInsightSchema.parse(insight), created ? 201 : 200);
    }

    const insightMatch = INSIGHT_PATH.exec(pathname);
    if (insightMatch) {
      if (request.method !== 'DELETE') return errorResponse(405, 'method_not_allowed', 'Use DELETE');
      const hotelId = url.searchParams.get('hotel');
      const problem = await requireKnownHotel(hotelId, dependencies);
      if (problem) return problem;
      await removeInsight(toolContext, hotelId!, insightMatch[1]!);
      return new Response(null, { status: 204 });
    }

    if (pathname === '/api/decisions/actions') {
      if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST');
      const newAction = await readJson(request, newDecisionActionSchema);
      if (newAction instanceof Response) return newAction;
      const problem = await requireKnownHotel(newAction.hotelId, dependencies);
      if (problem) return problem;
      return jsonResponse(decisionActionSchema.parse(await createAction(toolContext, newAction, now)), 201);
    }

    const actionMatch = ACTION_PATH.exec(pathname);
    if (actionMatch) {
      const hotelId = url.searchParams.get('hotel');
      const problem = await requireKnownHotel(hotelId, dependencies);
      if (problem) return problem;
      if (request.method === 'PATCH') {
        const patch = await readJson(request, decisionActionPatchSchema);
        if (patch instanceof Response) return patch;
        return jsonResponse(decisionActionSchema.parse(await updateAction(toolContext, hotelId!, actionMatch[1]!, patch, now)));
      }
      if (request.method === 'DELETE') {
        await deleteAction(toolContext, hotelId!, actionMatch[1]!);
        return new Response(null, { status: 204 });
      }
      return errorResponse(405, 'method_not_allowed', 'Use PATCH or DELETE');
    }
    return null;
  } catch (error) {
    if (error instanceof DecisionError) return errorResponse(error.status, error.code, error.message);
    throw error;
  }
}
