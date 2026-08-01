import { describe, expect, it } from 'vitest';
import { updateBackupSchema, upsertBackupSchema } from '../service.schema';

describe('updateBackupSchema', () => {
  it('does not apply create defaults for omitted fields on PATCH', () => {
    // Regression: upsertBackupSchema.partial() still applied .default(false) for
    // saveS3, so saving only dumpAll cleared Upload to S3.
    expect(upsertBackupSchema.partial().parse({ dumpAll: false })).toEqual({
      enabled: true,
      saveS3: false,
      retentionAmountLocal: 7,
      dumpAll: false,
    });

    expect(updateBackupSchema.parse({ dumpAll: false })).toEqual({ dumpAll: false });
  });

  it('accepts an explicit saveS3 toggle', () => {
    expect(updateBackupSchema.parse({ saveS3: true })).toEqual({ saveS3: true });
    expect(updateBackupSchema.parse({ saveS3: false })).toEqual({ saveS3: false });
  });
});
