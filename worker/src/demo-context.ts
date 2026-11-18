import { DEMO_TODAY, generateDemoDataset } from '@aurora/demo-data';
import { InMemoryHotelDataRepository } from './db/in-memory-hotel-data-repository';
import type { ToolContext } from './tools/tool-context';

/** A tool context backed by the generated demo dataset, for tests and scripts. */
export function createDemoToolContext(): ToolContext {
  return {
    repository: new InMemoryHotelDataRepository(generateDemoDataset()),
    today: DEMO_TODAY,
  };
}
