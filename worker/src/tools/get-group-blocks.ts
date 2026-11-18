import type { GroupBlocksOutput, PeriodToolInput } from '@aurora/shared';
import { requireHotel, type ToolContext } from './tool-context';

/** get_group_blocks: named group blocks (congresses, tours) with nights, rooms and status, for any period. */
export async function getGroupBlocks(input: PeriodToolInput, context: ToolContext): Promise<GroupBlocksOutput> {
  const hotel = await requireHotel(context, input.hotelId);
  return { period: input.period, blocks: await context.repository.listGroupBlocks(hotel.id, input.period) };
}
