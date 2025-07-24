
import { PrinterName, TimeSlot } from './types';

export const APP_TITLE = "EEC Lab Resources Management System";

export const PRINTER_NAMES_ARRAY: PrinterName[] = [
  PrinterName.PRINTER_1,
  PrinterName.PRINTER_2,
  PrinterName.PRINTER_3,
];

export const generatePrinterTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startTime = 8; // 8 AM
  const endTime = 16; // 4 PM (16:00)
  const interval = 30; // minutes

  for (let hour = startTime; hour < endTime; hour++) {
    for (let minute = 0; minute < 60; minute += interval) {
      const startHourStr = hour.toString().padStart(2, '0');
      const startMinuteStr = minute.toString().padStart(2, '0');
      
      const endMomentHour = minute + interval >= 60 ? hour + 1 : hour;
      const endMomentMinute = (minute + interval) % 60;
      const endHourStr = endMomentHour.toString().padStart(2, '0');
      const endMinuteStr = endMomentMinute.toString().padStart(2, '0');
      
      if (endMomentHour > endTime || (endMomentHour === endTime && endMomentMinute > 0) ) break;

      const slotId = `${startHourStr}:${startMinuteStr}-${endHourStr}:${endMinuteStr}`;
      slots.push({
        id: slotId,
        startTime: `${startHourStr}:${startMinuteStr}`,
        endTime: `${endHourStr}:${endMinuteStr}`,
      });
    }
  }
  return slots;
};

export const TIME_SLOTS_8_TO_4_30_MIN: TimeSlot[] = generatePrinterTimeSlots();
export const INITIAL_FILAMENT_PER_PRINTER = 1000; // grams

export const generateLabTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startTime = 8; // 8 AM
  const endTime = 17; // 5 PM (17:00) - Lab might be bookable longer
  const interval = 60; // minutes (1-hour slots)

  for (let hour = startTime; hour < endTime; hour++) {
    const startHourStr = hour.toString().padStart(2, '0');
    const startMinuteStr = "00";
    
    const endHourStr = (hour + 1).toString().padStart(2, '0');
    const endMinuteStr = "00";
    
    const slotId = `${startHourStr}:${startMinuteStr}-${endHourStr}:${endMinuteStr}`;
    slots.push({
      id: slotId,
      startTime: `${startHourStr}:${startMinuteStr}`,
      endTime: `${endHourStr}:${endMinuteStr}`,
    });
  }
  return slots;
};

export const LAB_TIME_SLOTS_1_HOUR: TimeSlot[] = generateLabTimeSlots();
