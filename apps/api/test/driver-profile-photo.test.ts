import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateDriverProfileUseCase } from '../src/modules/identity/application/useCases/createDriverProfile.usecase.js';
import type { DriverEntity, DriverRepositoryPort } from '../src/modules/identity/domain/index.js';
import { createDriverProfileRequestSchema } from '../src/modules/identity/interface/kyc.validation.js';
import { CloudinaryDriverPhotoAdapter } from '../src/modules/identity/infrastructure/cloudinaryDriverPhoto.adapter.js';

const photo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=';
const photoUrl = 'https://res.cloudinary.com/test/image/upload/driver-profiles/test.png';

describe('Driver personal profile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves personal details and photo, preserves the photo on later updates and supports removal', async () => {
    let saved: DriverEntity | null = null;
    const repo = {
      findByUserId: async () => saved,
      create: async (driver: DriverEntity) => {
        saved = driver;
        return driver;
      },
      update: async (driver: DriverEntity) => {
        saved = driver;
        return driver;
      },
    } as DriverRepositoryPort;
    const upload = vi.fn().mockResolvedValue(photoUrl);
    const useCase = new CreateDriverProfileUseCase({ driverRepo: repo, photoStorage: { upload } });
    const input = createDriverProfileRequestSchema.parse({
      name: 'Priya Sharma',
      gender: 'FEMALE',
      dateOfBirth: '1995-05-15',
      profilePhotoDataUrl: photo,
    });
    expect(await useCase.execute({ userId: 'user-1', ...input })).toMatchObject({
      name: 'Priya Sharma',
      gender: 'FEMALE',
      dateOfBirth: '1995-05-15',
      profilePhotoUrl: photoUrl,
    });
    expect(await useCase.execute({ userId: 'user-1', address: 'Siliguri' })).toMatchObject({
      profilePhotoUrl: photoUrl,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await useCase.execute({ userId: 'user-1', profilePhotoDataUrl: null })).toMatchObject({
      profilePhotoUrl: null,
    });
  });

  it('rejects device file paths, fake images and invalid dates at the API boundary', () => {
    for (const profilePhotoDataUrl of [
      'file:///phone/photo.jpg',
      'data:image/jpeg;base64,aGVsbG8=',
      'https://example.com/photo.jpg',
      `data:image/png;base64,${'A'.repeat(820001)}`,
    ]) {
      expect(createDriverProfileRequestSchema.safeParse({ profilePhotoDataUrl }).success).toBe(
        false,
      );
    }
    expect(createDriverProfileRequestSchema.safeParse({ dateOfBirth: '15/05/1995' }).success).toBe(
      false,
    );
    expect(createDriverProfileRequestSchema.safeParse({ dateOfBirth: '1995-02-30' }).success).toBe(
      false,
    );
  });

  it('keeps existing profile unchanged when photo upload fails', async () => {
    const update = vi.fn();
    const useCase = new CreateDriverProfileUseCase({
      driverRepo: {
        findByUserId: async () => ({ profilePhotoUrl: photoUrl }),
        update,
      } as unknown as DriverRepositoryPort,
      photoStorage: {
        upload: async () => {
          throw new Error('storage down');
        },
      },
    });
    await expect(
      useCase.execute({ userId: 'user-1', name: 'New name', profilePhotoDataUrl: photo }),
    ).rejects.toThrow('storage down');
    expect(update).not.toHaveBeenCalled();
  });

  it('uses a server signature for photo storage and propagates provider failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ secure_url: photoUrl }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new CloudinaryDriverPhotoAdapter({
      cloudName: 'test',
      apiKey: 'key',
      apiSecret: 'secret',
    });
    expect(await adapter.upload(photo)).toBe(photoUrl);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.cloudinary.com/v1_1/test/image/upload');
    const body = options.body as FormData;
    expect(body.get('file')).toBe(photo);
    expect(body.get('signature')).toBe(
      createHash('sha1')
        .update(`public_id=${body.get('public_id')}&timestamp=${body.get('timestamp')}secret`)
        .digest('hex'),
    );
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(adapter.upload(photo)).rejects.toThrow('Could not save your photo');
  });
});
