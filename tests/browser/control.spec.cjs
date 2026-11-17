const {test, expect} = require('@playwright/test');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

test('run, stream steps, prevent overlap, and restore an operation after refresh', async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('Local service connected')).toBeVisible();
  await page.getByRole('button', {name: 'Check prerequisites', exact: true}).click();
  await expect(page.locator('#operation-step')).toHaveText('Checking Docker Linux engine');
  await expect(page.getByRole('button', {name: 'Install prerequisites', exact: true})).toBeDisabled();
  await page.reload();
  await expect(page.locator('#operation-title')).toHaveText('Check prerequisites');
  await expect(page.locator('#operation-status')).toHaveText('Succeeded');
  await expect(page.locator('#operation-log')).toContainText('Fixture operation finished');
});

test('selected scenario, failure result, and exact deletion confirmation', async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('Local service connected')).toBeVisible();
  await page.locator('#lab-scenario').selectOption('2');
  await page.getByRole('button', {name: 'Check scenarios', exact: true}).click();
  await expect(page.locator('#operation-status')).toHaveText('Failed');
  await expect(page.locator('#operation-meta')).toContainText('Scenario 2');
  await page.getByText('Cleanup and deletion', {exact: true}).click();
  await page.getByRole('button', {name: 'Delete selected scenarios', exact: true}).click();
  await expect(page.locator('#deletion-scope')).toContainText('namespace trouble-2');
  await page.getByRole('button', {name: 'Keep my lab', exact: true}).click();
  await expect(page.locator('#operation-title')).toHaveText('Check scenarios');
  await page.getByRole('button', {name: 'Delete selected scenarios', exact: true}).click();
  await page.getByRole('button', {name: 'Delete these resources', exact: true}).click();
  await expect(page.locator('#operation-status')).toHaveText('Succeeded');
  await expect(page.locator('#operation-title')).toHaveText('Delete scenarios');
});

test('guided lessons and learner journals remain usable', async ({page}) => {
  await page.goto('/');
  await page.locator('#grid .card').first().click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#notes').fill('My investigation evidence');
  await page.locator('#close').click();
  await page.reload();
  await page.locator('#grid .card').first().click();
  await expect(page.locator('#notes')).toHaveValue('My investigation evidence');
});

test('static file preserves guided lessons and explains disabled lab controls', async ({page}) => {
  await page.goto(pathToFileURL(path.resolve(__dirname, '../../dist/index.html')).href);
  await expect(page.getByText('Static lessons only', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Check prerequisites', exact: true})).toBeDisabled();
  await page.locator('#grid .card').first().click();
  await expect(page.locator('#modal')).toBeVisible();
});
