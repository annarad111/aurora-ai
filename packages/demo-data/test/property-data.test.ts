import { listDatesInRange } from '@aurora/analytics';
import { propertyProfileSchema, roomSchema, roomStatusEventSchema } from '@aurora/shared';
import { describe, expect, it } from 'vitest';
import { generateDemoDataset } from '../src/generate-demo-dataset';
import { DEMO_HOTEL, DEMO_TODAY } from '../src/story';

const dataset = generateDemoDataset();

describe('the demo property', () => {
  it('has as many numbered rooms as the hotel, and room types that add up to them', () => {
    expect(dataset.rooms).toHaveLength(DEMO_HOTEL.roomCount);
    expect(new Set(dataset.rooms.map((room) => room.roomNumber)).size).toBe(DEMO_HOTEL.roomCount);
    const [profile] = dataset.propertyProfiles;
    expect(propertyProfileSchema.parse(profile).isDemoData).toBe(true);
    expect(profile!.roomTypes.reduce((sum, type) => sum + type.count, 0)).toBe(DEMO_HOTEL.roomCount);
    for (const type of profile!.roomTypes) {
      expect(dataset.rooms.filter((room) => room.roomTypeCode === type.code)).toHaveLength(type.count);
    }
    dataset.rooms.forEach((room) => roomSchema.parse(room));
  });

  it('puts maintenance only on rooms that exist, with valid nights', () => {
    const roomNumbers = new Set(dataset.rooms.map((room) => room.roomNumber));
    for (const event of dataset.roomStatusEvents) {
      roomStatusEventSchema.parse(event);
      expect(roomNumbers.has(event.roomNumber)).toBe(true);
      expect(event.firstNight <= event.lastNight).toBe(true);
    }
  });

  it('never has more rooms sold (or booked) plus rooms under maintenance than the hotel has', () => {
    for (const event of dataset.roomStatusEvents) {
      for (const night of listDatesInRange({ from: event.firstNight, to: event.lastNight })) {
        const unavailable = new Set(
          dataset.roomStatusEvents.filter((other) => other.firstNight <= night && other.lastNight >= night).map((other) => other.roomNumber),
        ).size;
        const sold =
          night <= DEMO_TODAY
            ? dataset.dailyStats.filter((row) => row.date === night).reduce((sum, row) => sum + row.roomsSold, 0)
            : dataset.onTheBooks
                .filter((row) => row.stayDate === night && row.snapshotDate === DEMO_TODAY)
                .reduce((sum, row) => sum + row.roomsOnTheBooks, 0);
        expect(sold + unavailable, `night ${night}`).toBeLessThanOrEqual(DEMO_HOTEL.roomCount);
      }
    }
  });
});
