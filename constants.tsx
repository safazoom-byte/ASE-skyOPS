
import React from 'react';
import { Skill } from './types';

// Standardized day names (0=Sunday) for roster logic and display
export const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export const DAYS_OF_WEEK_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export const AVAILABLE_SKILLS: Skill[] = [
  'Shift Leader', 'Operations', 'Ramp', 'Load Control', 'Lost and Found', 'Gate / Check-in'
];
