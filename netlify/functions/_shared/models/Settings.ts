// Settings model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Setting } from '../../../../shared/types';

export interface SettingDocument {
  _id: ObjectId;
  key: string;
  value: unknown;
  updatedAt: Date;
}

export function toSetting(doc: SettingDocument): Setting {
  return {
    id: doc._id.toString(),
    key: doc.key,
    value: doc.value,
    updatedAt: doc.updatedAt,
  };
}

export const SETTINGS_COLLECTION = 'settings';
