import { ObjectId } from 'mongodb';
import { toSetting, SETTINGS_COLLECTION } from './Settings';
import type { SettingDocument } from './Settings';

describe('Settings model', () => {
  const now = new Date();
  const objectId = new ObjectId();

  const fullDoc: SettingDocument = {
    _id: objectId,
    key: 'transfer_window_open',
    value: true,
    updatedAt: now,
  };

  describe('toSetting', () => {
    it('converts _id to string id', () => {
      expect(toSetting(fullDoc).id).toBe(objectId.toString());
    });

    it('maps key field', () => {
      expect(toSetting(fullDoc).key).toBe('transfer_window_open');
    });

    it('maps boolean value', () => {
      expect(toSetting(fullDoc).value).toBe(true);
    });

    it('maps object value', () => {
      const doc: SettingDocument = { ...fullDoc, value: { maxPicks: 6, season: 2025 } };
      const setting = toSetting(doc);
      expect(setting.value).toEqual({ maxPicks: 6, season: 2025 });
    });

    it('maps string value', () => {
      const doc: SettingDocument = { ...fullDoc, value: 'enabled' };
      expect(toSetting(doc).value).toBe('enabled');
    });

    it('maps numeric value', () => {
      const doc: SettingDocument = { ...fullDoc, value: 42 };
      expect(toSetting(doc).value).toBe(42);
    });

    it('maps updatedAt', () => {
      expect(toSetting(fullDoc).updatedAt).toBe(now);
    });
  });

  describe('SETTINGS_COLLECTION', () => {
    it('equals "settings"', () => {
      expect(SETTINGS_COLLECTION).toBe('settings');
    });
  });
});
