import { expect, request, test, type APIRequestContext } from '@playwright/test';

const CORE = 'http://localhost:3110';
const DISPLAY = 'http://localhost:3111';
const credentials = { username: 'e2e-admin', password: 'e2e-throwaway-password' };

async function adminApi() {
  const api = await request.newContext({ baseURL: `${CORE}/api/v1/` });
  const created = await api.post('auth/setup', { data: credentials });
  if (!created.ok()) await api.post('auth/login', { data: credentials });
  return api;
}

const json = async <T>(api: APIRequestContext, path: string) =>
  (await (await api.get(path)).json()) as T;

const roomNamed = async (api: APIRequestContext, name: string) => {
  const rooms = await json<{ id: string; name: string }[]>(api, 'rooms');
  return rooms.find((room) => room.name === name) as { id: string };
};

test('a paired tablet shows home, streams answers and cards, and survives changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const api = await adminApi();
  const salon = await roomNamed(api, 'Salon');
  const chambre = await roomNamed(api, 'Chambre');

  await test.step('pairing with the 6-digit code', async () => {
    await page.goto(DISPLAY);
    const code = await page.locator('.pairing-code').innerText();
    expect(code).toMatch(/^\d{6}$/);
    await api.post('pairing/confirm', {
      data: { code, roomId: salon.id, deviceName: 'Tablette e2e' },
    });
    await expect(page.locator('.clock')).toBeVisible();
    await expect(page.getByText('Salon', { exact: true })).toBeVisible();
  });

  await test.step('widgets change from the backoffice without a reload', async () => {
    const [server] = await json<{ id: string }[]>(api, 'mcp/servers');
    const tools = await json<{ id: string; name: string }[]>(
      api,
      `mcp/servers/${server?.id}/tools`,
    );
    const weather = tools.find((tool) => tool.name === 'get_weather');
    await api.patch(`rooms/${salon.id}`, {
      data: { config: { widgetTools: { weather: weather?.id } } },
    });
    await expect(page.getByText('Couvert')).toBeVisible();
  });

  await test.step('tapping wakes the screen, an answer streams with a card', async () => {
    await page.locator('.home').click();
    await page.getByLabel('Votre message').fill('Allume la lumière du salon');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByText("Ce qu'Ayko fait")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Éteindre' })).toBeVisible();
  });

  await test.step('a card action works and an unknown block stays readable', async () => {
    await page.getByRole('button', { name: 'Éteindre' }).click();
    await expect(page.getByText('Bloc inconnu : salon dans le noir')).toBeVisible();
  });

  await test.step('a sensitive tool asks Yes or No', async () => {
    await page.getByLabel('Votre message').fill('Verrouille la porte');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Oui' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page.getByText('verrouillée', { exact: false }).first()).toBeVisible();
  });

  await test.step('it goes home on command, then reconnects alone in its new room', async () => {
    const devices = await json<{ id: string; name: string }[]>(api, 'devices');
    const device = devices.find((item) => item.name === 'Tablette e2e');
    await api.post(`devices/${device?.id}/command`, { data: { command: 'go_home' } });
    await expect(page.locator('.clock')).toBeVisible();

    await api.patch(`devices/${device?.id}`, { data: { roomId: chambre.id } });
    await expect(page.getByText('Chambre', { exact: true })).toBeVisible();
    await expect(page.getByText('Reconnexion…')).toBeHidden();

    await api.patch(`devices/${device?.id}`, { data: { revoked: true } });
    await expect(page.locator('.pairing-code')).toBeVisible();
  });

  expect(errors).toEqual([]);
});

test('the Display server does not expose the admin API', async () => {
  const api = await request.newContext({ baseURL: DISPLAY });
  const response = await api.post('/api/v1/auth/login', { data: credentials });
  expect(response.status()).toBe(404);
  const health = await api.get('/health');
  expect(await health.json()).toMatchObject({ status: 'ok' });
});
