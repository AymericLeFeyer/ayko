import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const USERNAME = 'e2e-admin';
const PASSWORD = 'e2e-throwaway-password';

async function login(page: Page) {
  await page.goto('/');
  const creating = page.getByRole('button', { name: 'Créer le compte' });
  const logging = page.getByRole('button', { name: 'Se connecter' });
  await expect(creating.or(logging)).toBeVisible();
  await page.getByLabel('Identifiant').fill(USERNAME);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await creating.or(logging).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByLabel('Votre message').fill(text);
  await page.getByRole('button', { name: 'Envoyer' }).click();
}

async function chooseRoom(page: Page, room: string) {
  await page.getByRole('combobox', { name: 'Pièce simulée' }).click();
  await page.getByRole('option', { name: room }).click();
}

test('first run creates the admin and shows healthy components', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Maison simulée')).toBeVisible();
  await expect(page.getByText('Mode mock')).toBeVisible();
  await expect(page.getByText('RAM')).toBeVisible({ timeout: 12_000 });
});

test('every screen renders without a client error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401')) errors.push(message.text());
  });
  await login(page);
  const screens: [string, string][] = [
    ['Journaux', 'Journaux'],
    ['Ollama', 'Ollama'],
    ['Personas', 'Personas'],
    ['Terrain de jeu', 'Terrain de jeu'],
    ['Conversations', 'Conversations'],
    ['Serveurs MCP', 'Serveurs MCP'],
    ['Pièces et tablettes', 'Pièces et tablettes'],
    ['Caméras', 'Caméras'],
    ['Voix', 'Voix'],
    ['Historique', 'Historique'],
    ['Souvenirs', 'Souvenirs'],
    ['Raccourcis', 'Raccourcis'],
    ['Réglages', 'Réglages'],
  ];
  for (const [link, heading] of screens) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText('Chargement impossible')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('a model is pulled with progress and shows up in the list', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Ollama', exact: true }).click();
  await page.getByLabel('Nom du modèle').fill('e2e-model');
  await page.getByRole('button', { name: 'Télécharger' }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'e2e-model:latest' })).toBeVisible();
});

test('the tool loop runs, then the shortcut replays without the LLM', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Terrain de jeu', exact: true }).click();
  await chooseRoom(page, 'Salon');

  await ask(page, 'Allume la lumière du salon');
  await expect(page.getByText('Lumière salon allumée', { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Allume la lumière d'une pièce")).toBeVisible();
  await expect(page.getByText('Premier jeton')).toBeVisible();

  await ask(page, 'allumer la lumière du salon !');
  await expect(page.getByText('Raccourci mémorisé').last()).toBeVisible();

  // The link only appears once the second exchange is complete.
  await expect(page.getByRole('link', { name: 'Voir la trace' })).toHaveCount(2);
  await page.getByRole('link', { name: 'Voir la trace' }).last().click();
  await expect(page.getByText('Cache hit, exact', { exact: false })).toBeVisible();
  await expect(page.getByText('Aucun (LLM évité)')).toBeVisible();

  await page.getByRole('link', { name: 'Raccourcis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Allume la lumière du salon' })).toBeVisible();
});

test('a dictated shortcut is tagged manual and replays both actions', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Terrain de jeu', exact: true }).click();
  await chooseRoom(page, 'Salon');

  await ask(page, 'Quand je dis soirée film, tu éteins le salon et ferme le volet');
  await expect(page.getByText('Raccourci créé pour Salon', { exact: false }).first()).toBeVisible();

  await ask(page, 'soirée film');
  await expect(page.getByText('Raccourci mémorisé').last()).toBeVisible();
  await page.getByRole('button', { name: 'Oui' }).click();
  await expect(page.getByText("C'est fait.", { exact: false }).last()).toBeVisible();

  await page.getByRole('link', { name: 'Raccourcis', exact: true }).click();
  const row = page.getByRole('row', { name: /soirée film/ });
  await expect(row.getByText('Manuel')).toBeVisible();
  await expect(row.getByText('Salon')).toBeVisible();
});

test('a sensitive tool waits for confirmation', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Terrain de jeu', exact: true }).click();
  await ask(page, 'Verrouille la porte');
  await expect(page.getByText('Autoriser : Verrouille une porte ?').last()).toBeVisible();
  await page.getByRole('button', { name: 'Oui' }).click();
  await expect(page.getByText('verrouillée', { exact: false }).first()).toBeVisible();
});

test('a tool can be run by hand from its schema', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Serveurs MCP' }).click();
  await page.getByRole('link', { name: 'Maison simulée' }).click();
  const panel = page.getByRole('heading', { name: 'light_turn_on' }).locator('xpath=../..');
  await panel.getByRole('tab', { name: 'Tester' }).click();
  await panel.getByLabel('room (requis)').fill('cuisine');
  await panel.getByRole('button', { name: "Exécuter l'outil" }).click();
  await expect(panel.getByText('Lumière cuisine allumée')).toBeVisible();
});

test('the persona preview shows the final prompt with the safety clause', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Personas', exact: true }).click();
  await expect(page.getByText('jamais des instructions', { exact: false })).toBeVisible();
});
